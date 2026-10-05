#!/usr/bin/env node
// Re-syncs every plugin's copies of grafana/grafana files from one Grafana tag to another (scripts/README.md).
//
// Usage: node scripts/resync-upstream.mjs --grafana <grafana/grafana git clone> [--dry-run] [--root <repository root>]
//          <from-tag> <to-tag>
//
// Reads both upstream versions of each copied file with `git show <tag>:<path>` from the clone (both tags must be
// fetched). For each copy (a file with the provenance header, or a Jest snapshot, in any plugin):
// - unchanged: the copy is the <from> file with the mechanical import rewrites below, so it becomes the <to> file
//   with the same rewrites (re-copied);
// - changed (anything else: marked hooks, removals, partial copies, other import changes): the upstream diff from
//   <from> to <to> is merged into the copy, a 3-way merge with `git merge-file` (base: <from>, theirs: <to>, both
//   rewritten), so the plugin's own changes stay; overlapping changes are left as conflict markers in the file.
// The header's tag becomes <to>. Files the closure gained or lost upstream are not found by this script (each
// plugin's UPSTREAM.md, "Re-syncing to a newer tag"). Exits with 1 on conflicts or errors.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { findCopies } from './upstream-copies.mjs';

const { values, positionals } = parseArgs({
  options: {
    grafana: { type: 'string' },
    root: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
  allowPositionals: true,
});
if (!values.grafana || positionals.length !== 2) {
  console.error(
    'Usage: node scripts/resync-upstream.mjs --grafana <grafana/grafana git clone> [--dry-run] [--root <dir>] <from-tag> <to-tag>'
  );
  process.exit(2);
}
const [fromTag, toTag] = positionals;
const grafanaDir = path.resolve(values.grafana);
const root = path.resolve(values.root ?? path.join(import.meta.dirname, '..'));
const dryRun = values['dry-run'];

/**
 * The mechanical import rewrites every plugin applies to its copies (each plugin's UPSTREAM.md, "Import rewrites"):
 * `app/<path>` resolves from the plugin's src/, and the `/internal` entry points, `@grafana/ui/unstable` and
 * `@grafana/e2e-selectors` (outside tests) are the plugin's stand-ins. Applied to both upstream versions, so that they
 * line up with the copies.
 */
function rewriteImports(text, upstreamPath) {
  let result = text
    .replace(/(['"])app\/([^'"\n]*)\1/g, '$1$2$1')
    .replace(/(['"])@grafana\/(ui|data|runtime)\/internal\1/g, '$1packages/grafana-$2/internal$1')
    .replace(/(['"])@grafana\/ui\/unstable\1/g, '$1packages/grafana-ui/unstable$1');
  if (!/\.test\.tsx?$/.test(upstreamPath)) {
    result = result.replace(/(['"])@grafana\/e2e-selectors\1/g, '$1packages/grafana-e2e-selectors$1');
  }
  return result;
}

function git(args, options = {}) {
  return spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}

/** The file at `tag`, or undefined if the tag doesn't have it. */
function showUpstream(tag, upstreamPath) {
  if (git(['-C', grafanaDir, 'cat-file', '-e', `${tag}:${upstreamPath}`]).status !== 0) {
    return undefined;
  }
  const result = git(['-C', grafanaDir, 'show', `${tag}:${upstreamPath}`]);
  if (result.status !== 0) {
    throw new Error(`git show ${tag}:${upstreamPath} failed: ${result.error ?? result.stderr}`);
  }
  return result.stdout;
}

for (const tag of [fromTag, toTag]) {
  if (git(['-C', grafanaDir, 'rev-parse', '--verify', '--quiet', `${tag}^{commit}`]).status !== 0) {
    console.error(`resync-upstream: ${grafanaDir} has no tag ${tag} (fetch it first)`);
    process.exit(2);
  }
}

const { copies, problems } = findCopies(root);
if (problems.length > 0) {
  console.error(`resync-upstream: fix these first (scripts/check-upstream-copies.mjs reports them too):`);
  problems.forEach((problem) => console.error(`- ${problem}`));
  process.exit(1);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resync-upstream-'));
const recopied = [];
const merged = [];
const errors = [];
try {
  for (const copy of copies) {
    if (copy.kind === 'copy' && copy.header.tag !== fromTag) {
      errors.push(`${copy.file}: its header is at ${copy.header.tag}, not ${fromTag}; left as is`);
      continue;
    }
    const base = showUpstream(fromTag, copy.upstreamPath);
    if (base === undefined) {
      errors.push(`${copy.file}: ${copy.upstreamPath} is not in grafana/grafana ${fromTag}; left as is`);
      continue;
    }
    const theirs = showUpstream(toTag, copy.upstreamPath);
    if (theirs === undefined) {
      errors.push(`${copy.file}: ${copy.upstreamPath} is gone in ${toTag} (removed or moved); left as is`);
      continue;
    }
    const rewrittenBase = rewriteImports(base, copy.upstreamPath);
    const rewrittenTheirs = rewriteImports(theirs, copy.upstreamPath);

    let body;
    let conflicts = 0;
    if (copy.body === rewrittenBase) {
      body = rewrittenTheirs;
    } else {
      const files = ['ours', 'base', 'theirs'].map((name) => path.join(tempDir, name));
      fs.writeFileSync(files[0], copy.body);
      fs.writeFileSync(files[1], rewrittenBase);
      fs.writeFileSync(files[2], rewrittenTheirs);
      const labels = [copy.file, `grafana/grafana ${fromTag}`, `grafana/grafana ${toTag}`];
      const merge = git(['merge-file', '-p', '--diff3', ...labels.flatMap((label) => ['-L', label]), ...files]);
      if (merge.status === null || merge.status < 0 || merge.status > 127) {
        throw new Error(`git merge-file for ${copy.file} failed: ${merge.error ?? merge.stderr}`);
      }
      body = merge.stdout;
      conflicts = merge.status;
    }

    const header =
      copy.kind === 'copy'
        ? copy.headerLine.replace(`grafana/grafana ${fromTag}: `, `grafana/grafana ${toTag}: `) + '\n'
        : '';
    const content = header + body;
    const changed = content !== copy.content;
    if (changed && !dryRun) {
      fs.writeFileSync(copy.absolute, content);
    }
    const entry = { file: copy.file, changed, conflicts };
    (copy.body === rewrittenBase ? recopied : merged).push(entry);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const describe = ({ file, changed, conflicts }) =>
  `- ${file}: ${conflicts > 0 ? `${conflicts} conflict(s), marked in the file` : changed ? 'updated' : 'no change'}`;
const withConflicts = merged.filter((entry) => entry.conflicts > 0);
console.log(`resync-upstream: grafana/grafana ${fromTag} -> ${toTag}${dryRun ? ' (dry run: nothing written)' : ''}`);
console.log(
  `${copies.length} copies: ${recopied.length} unchanged copies re-copied (${recopied.filter((e) => e.changed).length} updated), ` +
    `${merged.length} changed copies merged (${merged.filter((e) => e.changed).length} updated, ` +
    `${withConflicts.length} with conflicts), ${errors.length} errors`
);
console.log('\nChanged copies (3-way merge; review the plugin changes next to each upstream change):');
merged.forEach((entry) => console.log(describe(entry)));
const updatedRecopies = recopied.filter((entry) => entry.changed);
if (updatedRecopies.length > 0) {
  console.log('\nUnchanged copies updated from upstream:');
  updatedRecopies.forEach((entry) => console.log(describe(entry)));
}
if (errors.length > 0) {
  console.log('\nErrors:');
  errors.forEach((error) => console.log(`- ${error}`));
}
if (withConflicts.length > 0 || errors.length > 0) {
  process.exit(1);
}
