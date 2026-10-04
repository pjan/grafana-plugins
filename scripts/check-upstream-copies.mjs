#!/usr/bin/env node
// Checks that the plugins' copies of the same grafana/grafana file stay identical (scripts/README.md).
//
// Usage: node scripts/check-upstream-copies.mjs [--root <repository root>]
//
// Copies of one upstream file in two or more plugins must be byte-identical, apart from the "Changes:" text of their
// header line. A copy that its plugin's UPSTREAM.md lists under "## Copies with marked changes" may differ from the
// other copies, but only in diff hunks that contain a line marked `pjan-<plugin-id>` (in a comment) by that plugin.
// Stand-ins at the same path in two or more plugins must be byte-identical, except those whose plugin lists them under
// "## Stand-ins of its own" (exactly the ones no other plugin has the same content for).
// Exits with 1 and lists every problem otherwise. Reads files only; never writes.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { findCopies, isMarked, listPlugins } from './upstream-copies.mjs';

const CHANGED_SECTION = '## Copies with marked changes';
const OWN_STAND_INS_SECTION = '## Stand-ins of its own';
const SHOWN_LINES = 6;

const { values } = parseArgs({ options: { root: { type: 'string' } } });
const root = path.resolve(values.root ?? path.join(import.meta.dirname, '..'));

/**
 * The paths (`src/...`, relative to the plugin directory) listed in the plugin's UPSTREAM.md under `heading`, up to the
 * next heading of level 1 or 2; undefined without that section.
 */
function readList(pluginDir, heading) {
  const file = path.join(pluginDir, 'UPSTREAM.md');
  if (!fs.existsSync(file)) {
    return undefined;
  }
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === heading);
  if (start === -1) {
    return undefined;
  }
  const paths = new Set();
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) {
      break;
    }
    const match = /^- `(src\/[^`]+)`/.exec(line);
    if (match) {
      paths.add(match[1]);
    }
  }
  return paths;
}

/** 1-based line numbers of a `@@ -start,count +start,count @@` side (count 0: no lines on this side). */
function hunkLines(start, count) {
  const n = count === undefined ? 1 : Number(count);
  return Array.from({ length: n }, (_, i) => Number(start) + i);
}

/** The minimal differing hunks between two files, as line numbers on each side (git diff, Myers, no context). */
function diffHunks(fileA, fileB) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'core.autocrlf=false',
      'diff',
      '--no-index',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '--diff-algorithm=myers',
      '--unified=0',
      '--',
      fileA,
      fileB,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git diff --no-index ${fileA} ${fileB} failed: ${result.error ?? result.stderr}`);
  }
  const hunks = [];
  for (const line of result.stdout.split('\n')) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match) {
      hunks.push({ a: hunkLines(match[1], match[2]), b: hunkLines(match[3], match[4]) });
    }
  }
  return hunks;
}

function describeLines(copy, lineNumbers, sign) {
  const shown = lineNumbers.slice(0, SHOWN_LINES).map((n) => `      ${sign} ${copy.lines[n - 1]}`);
  const more = lineNumbers.length > SHOWN_LINES ? [`      ${sign} … (${lineNumbers.length - SHOWN_LINES} more)`] : [];
  return [...shown, ...more];
}

function describeRange(copy, lineNumbers) {
  if (lineNumbers.length === 0) {
    return `${copy.file} (no lines)`;
  }
  const first = lineNumbers[0];
  const last = lineNumbers[lineNumbers.length - 1];
  return first === last ? `${copy.file}:${first}` : `${copy.file}:${first}-${last}`;
}

const plugins = listPlugins(root);
const { copies, standIns, problems } = findCopies(root);
const changedLists = new Map(plugins.map((plugin) => [plugin.id, readList(plugin.dir, CHANGED_SECTION)]));
const ownStandInLists = new Map(plugins.map((plugin) => [plugin.id, readList(plugin.dir, OWN_STAND_INS_SECTION)]));
const pluginPath = (copy) => `src/${copy.srcRelative}`;
const isListed = (copy) => changedLists.get(copy.pluginId)?.has(pluginPath(copy)) ?? false;
// Lines that may carry marks: the body (a copy's header line describes its changes and may name the plugin).
const markableLines = (copy) =>
  copy.lines.map((line, i) => ({ line, n: i + 1 })).filter(({ n }) => copy.kind === 'snapshot' || n > 1);

// 1. Each plugin: its list of copies with marked changes matches the marks in its copies.
for (const plugin of plugins) {
  const own = copies.filter((copy) => copy.pluginId === plugin.id);
  const listed = changedLists.get(plugin.id);
  if (own.length > 0 && listed === undefined) {
    problems.push(
      `plugins/${plugin.id}/UPSTREAM.md: no "${CHANGED_SECTION}" section (a plugin with copies needs one, even if it lists none)`
    );
  }
  for (const listedPath of listed ?? []) {
    if (!own.some((copy) => pluginPath(copy) === listedPath)) {
      problems.push(
        `plugins/${plugin.id}/UPSTREAM.md lists ${listedPath} under "${CHANGED_SECTION}", but it is not a copy in this plugin`
      );
    }
  }
  for (const copy of own) {
    const lines = markableLines(copy);
    const marked = lines.some(({ line }) => isMarked(line, plugin.id));
    if (marked && !isListed(copy)) {
      problems.push(
        `${copy.file}: has lines marked ${plugin.id}, but plugins/${plugin.id}/UPSTREAM.md doesn't list ${pluginPath(copy)} under "${CHANGED_SECTION}"`
      );
    }
    if (!marked && isListed(copy)) {
      problems.push(
        `${copy.file}: listed under "${CHANGED_SECTION}" in plugins/${plugin.id}/UPSTREAM.md, but has no line marked ${plugin.id}`
      );
    }
    for (const other of plugins.filter((p) => p.id !== plugin.id)) {
      const foreign = lines.find(({ line }) => isMarked(line, other.id));
      if (foreign) {
        problems.push(
          `${copy.file}:${foreign.n}: marked ${other.id}, another plugin's id (each plugin marks its changes with its own id)`
        );
      }
    }
  }
}

// 2. Each upstream file copied into two or more plugins: the same header, and the same body outside marked hunks.
const groups = new Map();
for (const copy of copies) {
  groups.set(copy.upstreamPath, [...(groups.get(copy.upstreamPath) ?? []), copy]);
}
const shared = [...groups].filter(([, group]) => group.length > 1).sort(([a], [b]) => a.localeCompare(b));
const summary = [];
for (const [upstreamPath, group] of shared) {
  const [first, ...rest] = group;
  for (const copy of rest.filter((c) => c.kind === 'copy')) {
    for (const field of ['tag', 'licence']) {
      if (copy.header[field] !== first.header[field]) {
        problems.push(
          `${upstreamPath}: header ${field} "${copy.header[field]}" in ${copy.file}, "${first.header[field]}" in ${first.file}`
        );
      }
    }
  }

  const markedBy = new Set();
  let unmarkedDifference = false;
  let headersDiffer = false;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      headersDiffer ||= a.kind === 'copy' && a.headerLine !== b.headerLine;
      if (a.body === b.body) {
        continue;
      }
      for (const hunk of diffHunks(a.absolute, b.absolute)) {
        // Line 1 of a copy is its header (compared above); only body lines count here.
        const aLines = a.kind === 'copy' ? hunk.a.filter((n) => n > 1) : hunk.a;
        const bLines = b.kind === 'copy' ? hunk.b.filter((n) => n > 1) : hunk.b;
        if (aLines.length === 0 && bLines.length === 0) {
          continue;
        }
        const aMarked = isListed(a) && aLines.some((n) => isMarked(a.lines[n - 1], a.pluginId));
        const bMarked = isListed(b) && bLines.some((n) => isMarked(b.lines[n - 1], b.pluginId));
        if (aMarked) {
          markedBy.add(a.pluginId);
        }
        if (bMarked) {
          markedBy.add(b.pluginId);
        }
        if (!aMarked && !bMarked) {
          unmarkedDifference = true;
          problems.push(
            [
              `${upstreamPath}: ${describeRange(a, aLines)} and ${describeRange(b, bLines)} differ, and neither side is a marked change of a copy listed under "${CHANGED_SECTION}":`,
              ...describeLines(a, aLines, '<'),
              ...describeLines(b, bLines, '>'),
            ].join('\n')
          );
        }
      }
    }
  }
  const owners = group.map((copy) => copy.pluginId).join(', ');
  const bodies = unmarkedDifference
    ? 'DIFFER outside marked hunks (see below)'
    : markedBy.size > 0
      ? `differ only in hunks marked by ${[...markedBy].sort().join(', ')}`
      : 'identical';
  summary.push(`  ${upstreamPath} (${owners}): ${bodies}${headersDiffer ? '; header "Changes:" texts differ' : ''}`);
}

// 3. Stand-ins: at a path where two or more plugins have one, a stand-in its plugin doesn't list under
//    "## Stand-ins of its own" must be byte-identical to the other unlisted ones (one shared version), and a listed one
//    must be its own (no other plugin's stand-in there has the same content). So exactly the stand-ins with unique
//    content at a shared path are listed, each by its own plugin.
const standInGroups = new Map();
for (const standIn of standIns) {
  standInGroups.set(standIn.srcRelative, [...(standInGroups.get(standIn.srcRelative) ?? []), standIn]);
}
const isOwn = (standIn) => ownStandInLists.get(standIn.pluginId)?.has(pluginPath(standIn)) ?? false;
for (const plugin of plugins) {
  const own = standIns.filter((standIn) => standIn.pluginId === plugin.id);
  const listed = ownStandInLists.get(plugin.id);
  if (own.length > 0 && listed === undefined) {
    problems.push(
      `plugins/${plugin.id}/UPSTREAM.md: no "${OWN_STAND_INS_SECTION}" section (a plugin with stand-ins needs one, even if it lists none)`
    );
  }
  for (const listedPath of listed ?? []) {
    const standIn = own.find((s) => pluginPath(s) === listedPath);
    if (!standIn) {
      problems.push(
        `plugins/${plugin.id}/UPSTREAM.md lists ${listedPath} under "${OWN_STAND_INS_SECTION}", but it is not a stand-in in this plugin`
      );
    } else if (standInGroups.get(standIn.srcRelative).length < 2) {
      problems.push(
        `plugins/${plugin.id}/UPSTREAM.md lists ${listedPath} under "${OWN_STAND_INS_SECTION}", but no other plugin has a stand-in there`
      );
    }
  }
}
const standInSummary = [];
for (const [srcRelative, group] of [...standInGroups].sort(([a], [b]) => a.localeCompare(b))) {
  if (group.length < 2) {
    continue;
  }
  for (const standIn of group) {
    const twins = group.filter((other) => other !== standIn && other.content === standIn.content);
    if (isOwn(standIn) && twins.length > 0) {
      problems.push(
        `${standIn.file}: listed under "${OWN_STAND_INS_SECTION}", but identical to ${twins.map((t) => t.file).join(', ')} (share it instead: remove it from the list)`
      );
    }
    if (!isOwn(standIn) && twins.length === 0 && group.filter((other) => !isOwn(other)).length === 1) {
      problems.push(
        `${standIn.file}: differs from every other plugin's stand-in at src/${srcRelative}; make it identical, or list it under "${OWN_STAND_INS_SECTION}" in plugins/${standIn.pluginId}/UPSTREAM.md`
      );
    }
  }
  const unlisted = group.filter((standIn) => !isOwn(standIn));
  for (const standIn of unlisted.slice(1)) {
    if (standIn.content !== unlisted[0].content) {
      problems.push(
        [
          `src/${srcRelative}: the stand-ins ${unlisted[0].file} and ${standIn.file} differ, and neither is listed under "${OWN_STAND_INS_SECTION}":`,
          ...diffHunks(unlisted[0].absolute, standIn.absolute).flatMap((hunk) => [
            ...describeLines(unlisted[0], hunk.a, '<'),
            ...describeLines(standIn, hunk.b, '>'),
          ]),
        ].join('\n')
      );
    }
  }
  const owners = group.map((standIn) => standIn.pluginId + (isOwn(standIn) ? ' (its own)' : '')).join(', ');
  standInSummary.push(`  src/${srcRelative} (${owners})`);
}

const headerCopies = copies.filter((copy) => copy.kind === 'copy').length;
console.log(
  `check-upstream-copies: ${plugins.length} plugins, ${copies.length} copies (${headerCopies} with a header, ${copies.length - headerCopies} Jest snapshots)`
);
console.log(`Upstream files copied into two or more plugins: ${shared.length}`);
summary.forEach((line) => console.log(line));
console.log(`Stand-ins: ${standIns.length}; at a path in two or more plugins: ${standInSummary.length}`);
standInSummary.forEach((line) => console.log(line));
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  problems.forEach((problem) => console.error(`- ${problem}`));
  process.exit(1);
}
console.log('OK');
