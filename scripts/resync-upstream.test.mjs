// Tests for resync-upstream.mjs: each builds a fake grafana/grafana git repository with two tags (v1, v2) and a small
// repository of fake plugins with copies at v1, then runs the script. Run with `node --test 'scripts/*.test.mjs'`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';

const SCRIPT = path.join(import.meta.dirname, 'resync-upstream.mjs');
const CHECK_SCRIPT = path.join(import.meta.dirname, 'check-upstream-copies.mjs');

// The scripts and the fake repositories run without the user's or the system's git configuration (for example a
// global merge.conflictStyle), as on CI.
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const tempDirs = [];
afterEach(() => tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Writes `files` ({ path: content }) under `dir`; a `null` content removes the file. */
function writeFiles(dir, files) {
  for (const [file, content] of Object.entries(files)) {
    if (content === null) {
      fs.rmSync(path.join(dir, file));
      continue;
    }
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
}

function git(dir, ...args) {
  const config = [
    '-c',
    'user.name=test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'tag.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
  ];
  const result = spawnSync('git', ['-C', dir, ...config, ...args], { encoding: 'utf8', env: ENV });
  assert.equal(result.status, 0, result.stderr);
}

/** A git repository standing in for grafana/grafana, with the files of `versions[i]` committed and tagged `tags[i]`. */
function makeGrafana(versions, tags = ['v1', 'v2']) {
  const dir = tempDir('resync-upstream-grafana-');
  git(dir, 'init', '--quiet');
  versions.forEach((files, i) => {
    writeFiles(dir, files);
    git(dir, 'add', '--all');
    git(dir, 'commit', '--quiet', '--allow-empty', '-m', tags[i]);
    git(dir, 'tag', tags[i]);
  });
  return dir;
}

const header = (file, tag = 'v1', changes = 'imports only.') =>
  `// Copied from grafana/grafana ${tag}: ${file}. AGPL-3.0 (Copyright Grafana Labs). Changes: ${changes}\n`;
const upstreamMd = (changed = []) =>
  ['# Upstream', '', '## Copies with marked changes', '', ...changed.map((file) => `- \`${file}\``), ''].join('\n');

function makeRepo(files) {
  const root = tempDir('resync-upstream-repo-');
  writeFiles(root, files);
  return root;
}

function resync(grafana, root, ...args) {
  const result = spawnSync(process.execPath, [SCRIPT, '--grafana', grafana, '--root', root, ...args], {
    encoding: 'utf8',
    env: ENV,
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');

const UTILS = 'public/app/core/utils.ts';
const UTILS_V1 = [
  "import { a } from 'app/core/a';",
  '',
  'export const one = 1;',
  '',
  'export function two() {',
  '  return 2;',
  '}',
  '',
].join('\n');
// v2 changes the constant and adds an import that needs the `app/` rewrite.
const UTILS_V2 = UTILS_V1.replace(
  "import { a } from 'app/core/a';",
  "import { a } from 'app/core/a';\nimport { b } from 'app/core/b';"
).replace('one = 1', 'one = 10');
const UTILS_COPY_V1 = header(UTILS) + UTILS_V1.replace("'app/core/a'", "'core/a'");
const UTILS_COPY_V2 =
  header(UTILS, 'v2') + UTILS_V2.replace("'app/core/a'", "'core/a'").replace("'app/core/b'", "'core/b'");
// A plugin's marked hook in two(), away from the v2 change.
const hookedUtils = (tag) =>
  (tag === 'v1' ? UTILS_COPY_V1 : UTILS_COPY_V2)
    .replace('Changes: imports only.', 'Changes: imports; a hook (marked).')
    .replace('  return 2;\n', '  // pjan-a-panel: doubled\n  return 4;\n');

describe('resync-upstream', () => {
  test('re-copies an unchanged copy from the new tag, with the import rewrites and the new tag in its header', () => {
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1 }, { [UTILS]: UTILS_V2 }]);
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-a-panel/src/core/utils.ts': UTILS_COPY_V1,
    });
    const { status, output } = resync(grafana, root, 'v1', 'v2');
    assert.equal(status, 0, output);
    assert.equal(read(root, 'plugins/pjan-a-panel/src/core/utils.ts'), UTILS_COPY_V2);
    assert.match(output, /1 unchanged copies re-copied \(1 updated\), 0 changed copies merged/);
  });

  test('the same unchanged copy in two plugins comes out identical in both', () => {
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1 }, { [UTILS]: UTILS_V2 }]);
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-a-panel/src/core/utils.ts': UTILS_COPY_V1,
      'plugins/pjan-b-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-b-panel/src/core/utils.ts': UTILS_COPY_V1.replace('Changes: imports only.', 'Changes: none.'),
    });
    assert.equal(resync(grafana, root, 'v1', 'v2').status, 0);
    assert.equal(read(root, 'plugins/pjan-a-panel/src/core/utils.ts'), UTILS_COPY_V2);
    assert.equal(
      read(root, 'plugins/pjan-b-panel/src/core/utils.ts'),
      UTILS_COPY_V2.replace('Changes: imports only.', 'Changes: none.')
    );
    const check = spawnSync(process.execPath, [CHECK_SCRIPT, '--root', root], { encoding: 'utf8', env: ENV });
    assert.equal(check.status, 0, check.stdout + check.stderr);
  });

  test('merges the upstream change into a changed copy and keeps its marked hook', () => {
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1 }, { [UTILS]: UTILS_V2 }]);
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(['src/core/utils.ts']),
      'plugins/pjan-a-panel/src/core/utils.ts': hookedUtils('v1'),
      'plugins/pjan-b-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-b-panel/src/core/utils.ts': UTILS_COPY_V1,
    });
    const { status, output } = resync(grafana, root, 'v1', 'v2');
    assert.equal(status, 0, output);
    assert.equal(read(root, 'plugins/pjan-a-panel/src/core/utils.ts'), hookedUtils('v2'));
    assert.match(output, /1 changed copies merged \(1 updated, 0 with conflicts\)/);
    assert.match(output, /- plugins\/pjan-a-panel\/src\/core\/utils\.ts: updated/);
    const check = spawnSync(process.execPath, [CHECK_SCRIPT, '--root', root], { encoding: 'utf8', env: ENV });
    assert.equal(check.status, 0, check.stdout + check.stderr);
  });

  test('leaves conflict markers where an upstream change overlaps a plugin change, and fails', () => {
    const v2 = UTILS_V1.replace('  return 2;', '  return 3;');
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1 }, { [UTILS]: v2 }]);
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(['src/core/utils.ts']),
      'plugins/pjan-a-panel/src/core/utils.ts': hookedUtils('v1'),
    });
    const { status, output } = resync(grafana, root, 'v1', 'v2');
    assert.equal(status, 1, output);
    assert.match(output, /- plugins\/pjan-a-panel\/src\/core\/utils\.ts: 1 conflict\(s\), marked in the file/);
    const merged = read(root, 'plugins/pjan-a-panel/src/core/utils.ts');
    assert.match(merged, /^\/\/ Copied from grafana\/grafana v2: /);
    assert.match(
      merged,
      /<<<<<<< plugins\/pjan-a-panel\/src\/core\/utils\.ts\n {2}\/\/ pjan-a-panel: doubled\n {2}return 4;\n\|\|\|\|\|\|\| grafana\/grafana v1\n {2}return 2;\n=======\n {2}return 3;\n>>>>>>> grafana\/grafana v2\n/
    );
  });

  test('leaves stand-ins as they are', () => {
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1 }, { [UTILS]: UTILS_V2 }]);
    const standIn = '// Plugin stand-in for grafana/grafana v1: public/app/core/utils.ts.\nexport const one = 1;\n';
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-a-panel/src/core/utils.ts': standIn,
    });
    const { status, output } = resync(grafana, root, 'v1', 'v2');
    assert.equal(status, 0, output);
    assert.match(output, /0 copies: /);
    assert.equal(read(root, 'plugins/pjan-a-panel/src/core/utils.ts'), standIn);
  });

  test('re-copies Jest snapshots without adding a header', () => {
    const snapPath = 'public/app/core/__snapshots__/utils.test.ts.snap';
    const snap = (value) => `// Jest Snapshot v1, https://goo.gl/fbAQLP\n\nexports[\`x 1\`] = \`${value}\`;\n`;
    const grafana = makeGrafana([{ [snapPath]: snap(1) }, { [snapPath]: snap(2) }]);
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-a-panel/src/core/__snapshots__/utils.test.ts.snap': snap(1),
    });
    assert.equal(resync(grafana, root, 'v1', 'v2').status, 0);
    assert.equal(read(root, 'plugins/pjan-a-panel/src/core/__snapshots__/utils.test.ts.snap'), snap(2));
  });

  test('rewrites @grafana/*/internal everywhere, and @grafana/e2e-selectors outside tests only', () => {
    const source = (internal) =>
      `import { x } from '@grafana/ui/internal';\nimport { y } from "@grafana/data/internal";\nimport { selectors } from '@grafana/e2e-selectors';\nexport const v = ${internal};\n`;
    const files = (v) => ({ 'public/app/core/thing.tsx': source(v), 'public/app/core/thing.test.tsx': source(v) });
    const grafana = makeGrafana([files(1), files(2)]);
    const rewritten = (v, inTest) =>
      source(v)
        .replace("'@grafana/ui/internal'", "'packages/grafana-ui/internal'")
        .replace('"@grafana/data/internal"', '"packages/grafana-data/internal"')
        .replace("'@grafana/e2e-selectors'", inTest ? "'@grafana/e2e-selectors'" : "'packages/grafana-e2e-selectors'");
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-a-panel/src/core/thing.tsx': header('public/app/core/thing.tsx') + rewritten(1, false),
      'plugins/pjan-a-panel/src/core/thing.test.tsx': header('public/app/core/thing.test.tsx') + rewritten(1, true),
    });
    const { status, output } = resync(grafana, root, 'v1', 'v2');
    assert.equal(status, 0, output);
    assert.match(output, /2 unchanged copies re-copied \(2 updated\), 0 changed copies merged/);
    assert.equal(
      read(root, 'plugins/pjan-a-panel/src/core/thing.tsx'),
      header('public/app/core/thing.tsx', 'v2') + rewritten(2, false)
    );
    assert.equal(
      read(root, 'plugins/pjan-a-panel/src/core/thing.test.tsx'),
      header('public/app/core/thing.test.tsx', 'v2') + rewritten(2, true)
    );
  });

  test('reports a file removed upstream, leaves it as is, and fails', () => {
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1, 'public/app/core/keep.ts': 'x\n' }, { [UTILS]: null }]);
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-a-panel/src/core/utils.ts': UTILS_COPY_V1,
    });
    const { status, output } = resync(grafana, root, 'v1', 'v2');
    assert.equal(status, 1, output);
    assert.match(
      output,
      /plugins\/pjan-a-panel\/src\/core\/utils\.ts: public\/app\/core\/utils\.ts is gone in v2 \(removed or moved\); left as is/
    );
    assert.equal(read(root, 'plugins/pjan-a-panel/src/core/utils.ts'), UTILS_COPY_V1);
  });

  test('leaves a copy whose header is at another tag as is, and fails', () => {
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1 }, { [UTILS]: UTILS_V2 }]);
    const copy = UTILS_COPY_V1.replace('grafana/grafana v1:', 'grafana/grafana v0:');
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-a-panel/src/core/utils.ts': copy,
    });
    const { status, output } = resync(grafana, root, 'v1', 'v2');
    assert.equal(status, 1, output);
    assert.match(output, /its header is at v0, not v1; left as is/);
    assert.equal(read(root, 'plugins/pjan-a-panel/src/core/utils.ts'), copy);
  });

  test('--dry-run reports and writes nothing', () => {
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1 }, { [UTILS]: UTILS_V2 }]);
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-a-panel/src/core/utils.ts': UTILS_COPY_V1,
    });
    const { status, output } = resync(grafana, root, '--dry-run', 'v1', 'v2');
    assert.equal(status, 0, output);
    assert.match(output, /\(dry run: nothing written\)/);
    assert.match(output, /1 unchanged copies re-copied \(1 updated\)/);
    assert.equal(read(root, 'plugins/pjan-a-panel/src/core/utils.ts'), UTILS_COPY_V1);
  });

  test('from a tag to the same tag changes nothing', () => {
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1 }, { [UTILS]: UTILS_V2 }]);
    const files = {
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(['src/core/utils.ts']),
      'plugins/pjan-a-panel/src/core/utils.ts': hookedUtils('v1'),
      'plugins/pjan-b-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-b-panel/src/core/utils.ts': UTILS_COPY_V1,
    };
    const root = makeRepo(files);
    const { status, output } = resync(grafana, root, 'v1', 'v1');
    assert.equal(status, 0, output);
    assert.match(
      output,
      /2 copies: 1 unchanged copies re-copied \(0 updated\), 1 changed copies merged \(0 updated, 0 with conflicts\), 0 errors/
    );
    for (const [file, content] of Object.entries(files)) {
      assert.equal(read(root, file), content);
    }
  });

  test('stops before writing anything when a tag is missing', () => {
    const grafana = makeGrafana([{ [UTILS]: UTILS_V1 }, { [UTILS]: UTILS_V2 }]);
    const root = makeRepo({
      'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(),
      'plugins/pjan-a-panel/src/core/utils.ts': UTILS_COPY_V1,
    });
    const { status, output } = resync(grafana, root, 'v1', 'v3');
    assert.equal(status, 2, output);
    assert.match(output, /has no tag v3 \(fetch it first\)/);
    assert.equal(read(root, 'plugins/pjan-a-panel/src/core/utils.ts'), UTILS_COPY_V1);
  });
});
