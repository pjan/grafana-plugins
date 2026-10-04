// What counts as a copy of a grafana/grafana file in this repository, shared by check-upstream-copies.mjs and
// resync-upstream.mjs so that both scripts see the same copies (see scripts/README.md).
import fs from 'node:fs';
import path from 'node:path';

// The directories under a plugin's src/ that mirror grafana/grafana (each plugin's UPSTREAM.md, "Layout").
export const MIRRORED_DIRS = ['core', 'features', 'packages', 'plugins'];

// The one-line provenance header of every copied file (each plugin's UPSTREAM.md):
// `// Copied from grafana/grafana <tag>: <upstream path>. <licence>. Changes: <...>.`
const HEADER_PREFIX = '// Copied from grafana/grafana ';
const HEADER_PATTERN = /^\/\/ Copied from grafana\/grafana (\S+): (\S+)\. (.+?)\. Changes: (.*)$/;
// Plugin-authored replacements in the mirrored tree start with this instead; they are not copies.
const STAND_IN_PREFIX = '// Plugin stand-in for ';

/** The plugins of the repository: every directory under plugins/ with a src/ directory, named by its plugin id. */
export function listPlugins(root) {
  const pluginsDir = path.join(root, 'plugins');
  return fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginsDir, entry.name, 'src')))
    .map((entry) => ({ id: entry.name, dir: path.join(pluginsDir, entry.name) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The grafana/grafana path a mirrored file comes from: `src/packages/grafana-<pkg>/src/<path>` is
 * `packages/grafana-<pkg>/src/<path>`, any other `src/<path>` is `public/app/<path>`.
 */
export function upstreamPathFor(srcRelativePath) {
  return /^packages\/grafana-[^/]+\/src\//.test(srcRelativePath) ? srcRelativePath : `public/app/${srcRelativePath}`;
}

/** The header's fields, or undefined if the line isn't a well-formed copy header. */
export function parseHeader(line) {
  const match = HEADER_PATTERN.exec(line);
  return match ? { tag: match[1], upstreamPath: match[2], licence: match[3], changes: match[4] } : undefined;
}

/** Whether `line` carries a `pjan-<plugin-id>` mark in a comment (`//`, `/*`, or a `*` line of a block comment). */
export function isMarked(line, pluginId) {
  const id = pluginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(//|/\\*|^\\s*\\*).*(?<![\\w-])${id}(?![\\w-])`).test(line);
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

/**
 * Every copy of a grafana/grafana file in every plugin's mirrored tree, every stand-in there (`standIns`: first line
 * `// Plugin stand-in for ...`, plugin-authored; resync-upstream.mjs leaves them alone), and the files there that are
 * neither a copy, a stand-in, nor a Jest snapshot (`problems`).
 *
 * A copy is a file whose first line is the provenance header (`kind: 'copy'`, `body` is the rest of the file), or a
 * Jest snapshot under `__snapshots__/` (`kind: 'snapshot'`: verbatim, without a header, since Jest needs its own header
 * on line 1; `body` is the whole file).
 */
export function findCopies(root) {
  const copies = [];
  const standIns = [];
  const problems = [];
  for (const plugin of listPlugins(root)) {
    const srcDir = path.join(plugin.dir, 'src');
    for (const mirroredDir of MIRRORED_DIRS) {
      for (const absolute of listFiles(path.join(srcDir, mirroredDir))) {
        const srcRelative = path.relative(srcDir, absolute).split(path.sep).join('/');
        const file = path.relative(root, absolute).split(path.sep).join('/');
        const content = fs.readFileSync(absolute, 'utf8');
        const newline = content.indexOf('\n');
        const firstLine = newline === -1 ? content : content.slice(0, newline);
        const lines = content.split('\n');
        const base = { pluginId: plugin.id, pluginDir: plugin.dir, file, absolute, srcRelative, content, lines };

        if (srcRelative.includes('/__snapshots__/') && srcRelative.endsWith('.snap')) {
          copies.push({ ...base, kind: 'snapshot', upstreamPath: upstreamPathFor(srcRelative), body: content });
        } else if (firstLine.startsWith(HEADER_PREFIX)) {
          const header = parseHeader(firstLine);
          if (!header) {
            problems.push(
              `${file}: line 1 starts like a copy header but doesn't read "${HEADER_PREFIX}<tag>: <path>. <licence>. Changes: <...>."`
            );
          } else if (header.upstreamPath !== upstreamPathFor(srcRelative)) {
            problems.push(
              `${file}: the header names ${header.upstreamPath}, but this path mirrors ${upstreamPathFor(srcRelative)}`
            );
          } else {
            const body = newline === -1 ? '' : content.slice(newline + 1);
            copies.push({
              ...base,
              kind: 'copy',
              upstreamPath: header.upstreamPath,
              header,
              headerLine: firstLine,
              body,
            });
          }
        } else if (firstLine.startsWith(STAND_IN_PREFIX)) {
          standIns.push({ ...base, kind: 'stand-in' });
        } else {
          problems.push(
            `${file}: in the mirrored tree, but neither a copy ("${HEADER_PREFIX}..."), a stand-in ("${STAND_IN_PREFIX}...") nor a Jest snapshot`
          );
        }
      }
    }
  }
  return { copies, standIns, problems };
}
