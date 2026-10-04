// Tests for check-upstream-copies.mjs: each builds a small repository of fake plugins and runs the script on it.
// Run with `node --test scripts/` (scripts/README.md).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';

const SCRIPT = path.join(import.meta.dirname, 'check-upstream-copies.mjs');
const UPSTREAM_FILE = 'public/app/core/thing.ts';
const BODY = ['export const a = 1;', '', 'export function f() {', '  return a;', '}', ''].join('\n');

// The script runs without the user's or the system's git configuration, as on CI.
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const tempDirs = [];
afterEach(() => tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const header = ({
  tag = 'v13.2.3',
  file = UPSTREAM_FILE,
  licence = 'AGPL-3.0 (Copyright Grafana Labs)',
  changes = 'imports only.',
} = {}) => `// Copied from grafana/grafana ${tag}: ${file}. ${licence}. Changes: ${changes}\n`;

/** UPSTREAM.md with the sections the check reads, listing `changed` and `own` (paths relative to the plugin directory). */
const upstreamMd = (changed = [], own = []) =>
  [
    '# Upstream',
    '',
    '## Copies with marked changes',
    '',
    ...changed.map((file) => `- \`${file}\``),
    '',
    '## Stand-ins of its own',
    '',
    ...own.map((file) => `- \`${file}\`: why`),
    '',
    '## Files',
    '',
    '- `src/not/a/listed/copy.ts`',
    '',
  ].join('\n');

/** Writes `files` ({ 'plugins/x/src/...': content }) into a new temporary repository and returns its root. */
function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-upstream-copies-'));
  tempDirs.push(root);
  writeExtra(root, files);
  return root;
}

/** Adds `files` to the repository at `root`. */
function writeExtra(root, files) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
}

/** Two plugins with a copy of UPSTREAM_FILE each, and UPSTREAM.md listing `changedA`/`changedB` and `ownA`/`ownB`. */
function twoPlugins({
  a = header() + BODY,
  b = header() + BODY,
  changedA = [],
  changedB = [],
  ownA = [],
  ownB = [],
  extra = {},
} = {}) {
  return makeRepo({
    'plugins/pjan-a-panel/UPSTREAM.md': upstreamMd(changedA, ownA),
    'plugins/pjan-a-panel/src/core/thing.ts': a,
    'plugins/pjan-b-panel/UPSTREAM.md': upstreamMd(changedB, ownB),
    'plugins/pjan-b-panel/src/core/thing.ts': b,
    ...extra,
  });
}

function check(root) {
  const result = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8', env: ENV });
  return { status: result.status, output: result.stdout + result.stderr };
}

const LISTED = ['src/core/thing.ts'];
const hooked = (id) => BODY.replace('  return a;\n', `  // ${id}: doubled\n  return a * 2;\n`);

describe('check-upstream-copies', () => {
  test('identical copies in two plugins pass', () => {
    const { status, output } = check(twoPlugins());
    assert.equal(status, 0, output);
    assert.match(output, /Upstream files copied into two or more plugins: 1/);
    assert.match(output, /public\/app\/core\/thing\.ts \(pjan-a-panel, pjan-b-panel\): identical\n/);
  });

  test('headers may differ in their Changes: text only', () => {
    const { status, output } = check(twoPlugins({ b: header({ changes: 'none.' }) + BODY }));
    assert.equal(status, 0, output);
    assert.match(output, /identical; header "Changes:" texts differ/);
  });

  test('headers must name the same tag', () => {
    const { status, output } = check(twoPlugins({ b: header({ tag: 'v13.2.4' }) + BODY }));
    assert.equal(status, 1, output);
    assert.match(output, /header tag "v13\.2\.4" in plugins\/pjan-b-panel\/src\/core\/thing\.ts/);
  });

  test('headers must name the same licence', () => {
    const { status, output } = check(twoPlugins({ b: header({ licence: 'Apache-2.0' }) + BODY }));
    assert.equal(status, 1, output);
    assert.match(output, /header licence "Apache-2\.0"/);
  });

  test('copies that differ outside marked hunks fail, with the lines', () => {
    const { status, output } = check(twoPlugins({ b: header() + BODY.replace('a = 1', 'a = 2') }));
    assert.equal(status, 1, output);
    assert.match(output, /thing\.ts:2 and plugins\/pjan-b-panel\/src\/core\/thing\.ts:2 differ/);
    assert.match(output, /< export const a = 1;\n\s+> export const a = 2;/);
    assert.match(output, /public\/app\/core\/thing\.ts \(pjan-a-panel, pjan-b-panel\): DIFFER outside marked hunks/);
  });

  test('a listed copy may differ in hunks with its own marked line', () => {
    const root = twoPlugins({
      a: header({ changes: 'imports; a hook (marked).' }) + hooked('pjan-a-panel'),
      changedA: LISTED,
    });
    const { status, output } = check(root);
    assert.equal(status, 0, output);
    assert.match(output, /differ only in hunks marked by pjan-a-panel; header "Changes:" texts differ/);
  });

  test('a marked hunk does not cover an unmarked change elsewhere in the same copy', () => {
    const a = header() + hooked('pjan-a-panel').replace('a = 1', 'a = 3');
    const { status, output } = check(twoPlugins({ a, changedA: LISTED }));
    assert.equal(status, 1, output);
    assert.match(output, /< export const a = 3;/);
    assert.doesNotMatch(output, /doubled/);
  });

  test('a marked change only counts in a copy listed under "## Copies with marked changes"', () => {
    const { status, output } = check(twoPlugins({ a: header() + hooked('pjan-a-panel') }));
    assert.equal(status, 1, output);
    assert.match(
      output,
      /has lines marked pjan-a-panel, but plugins\/pjan-a-panel\/UPSTREAM\.md doesn't list src\/core\/thing\.ts/
    );
    assert.match(output, /differ, and neither side is a marked change/);
  });

  test('a listed copy must have a marked line', () => {
    const { status, output } = check(twoPlugins({ changedA: LISTED }));
    assert.equal(status, 1, output);
    assert.match(
      output,
      /listed under "## Copies with marked changes" in plugins\/pjan-a-panel\/UPSTREAM\.md, but has no line marked/
    );
  });

  test('a listed path must be a copy in that plugin', () => {
    const { status, output } = check(twoPlugins({ changedB: ['src/core/missing.ts'] }));
    assert.equal(status, 1, output);
    assert.match(output, /lists src\/core\/missing\.ts under "## Copies with marked changes", but it is not a copy/);
  });

  test('a plugin with copies needs the section in its UPSTREAM.md', () => {
    const root = twoPlugins();
    fs.writeFileSync(path.join(root, 'plugins/pjan-b-panel/UPSTREAM.md'), '# Upstream\n\n## Files\n');
    const { status, output } = check(root);
    assert.equal(status, 1, output);
    assert.match(output, /plugins\/pjan-b-panel\/UPSTREAM\.md: no "## Copies with marked changes" section/);
  });

  test("a copy marked with another plugin's id fails", () => {
    const { status, output } = check(twoPlugins({ a: header() + hooked('pjan-b-panel'), changedB: [] }));
    assert.equal(status, 1, output);
    assert.match(output, /plugins\/pjan-a-panel\/src\/core\/thing\.ts:5: marked pjan-b-panel, another plugin's id/);
  });

  test('an unmarked removal in a listed copy fails', () => {
    const a = header() + hooked('pjan-a-panel').replace('export const a = 1;\n', '');
    const { status, output } = check(twoPlugins({ a, changedA: LISTED }));
    assert.equal(status, 1, output);
    assert.match(
      output,
      /plugins\/pjan-a-panel\/src\/core\/thing\.ts \(no lines\) and plugins\/pjan-b-panel\/src\/core\/thing\.ts:2 differ/
    );
  });

  test('the plugin id outside a comment is not a mark', () => {
    const a = header() + BODY.replace('  return a;\n', "  return 'pjan-a-panel';\n");
    const { status, output } = check(twoPlugins({ a, changedA: LISTED }));
    assert.equal(status, 1, output);
    assert.match(output, /has no line marked pjan-a-panel/);
    assert.match(output, /< {3}return 'pjan-a-panel';/);
  });

  test('a mark in the header line is not a mark', () => {
    const a = header({ changes: 'a hook (pjan-a-panel: doubled).' }) + BODY.replace('return a;', 'return a * 2;');
    const { status, output } = check(twoPlugins({ a, changedA: LISTED }));
    assert.equal(status, 1, output);
    assert.match(output, /has no line marked pjan-a-panel/);
  });

  test('with three plugins, the two unlisted copies must still be identical', () => {
    const root = twoPlugins({
      a: header() + hooked('pjan-a-panel'),
      changedA: LISTED,
      extra: {
        'plugins/pjan-c-panel/UPSTREAM.md': upstreamMd(),
        'plugins/pjan-c-panel/src/core/thing.ts': header() + BODY.replace('a = 1', 'a = 2'),
      },
    });
    const { status, output } = check(root);
    assert.equal(status, 1, output);
    assert.match(
      output,
      /plugins\/pjan-b-panel\/src\/core\/thing\.ts:2 and plugins\/pjan-c-panel\/src\/core\/thing\.ts:2 differ/
    );
  });

  test('two listed copies may each differ in their own marked hunks', () => {
    const b =
      header() +
      BODY.replace('export const a = 1;\n', 'export const a = 1; // pjan-b-panel: exported\nexport { a as b };\n');
    const root = twoPlugins({ a: header() + hooked('pjan-a-panel'), b, changedA: LISTED, changedB: LISTED });
    const { status, output } = check(root);
    assert.equal(status, 0, output);
    assert.match(output, /differ only in hunks marked by pjan-a-panel, pjan-b-panel/);
  });

  test('Jest snapshots are compared too, without a header', () => {
    const snap = (value) => `// Jest Snapshot v1, https://goo.gl/fbAQLP\n\nexports[\`x 1\`] = \`${value}\`;\n`;
    const files = (b) => ({
      'plugins/pjan-a-panel/src/core/__snapshots__/thing.test.ts.snap': snap(1),
      'plugins/pjan-b-panel/src/core/__snapshots__/thing.test.ts.snap': snap(b),
    });
    const same = check(twoPlugins({ extra: files(1) }));
    assert.equal(same.status, 0, same.output);
    assert.match(same.output, /4 copies \(2 with a header, 2 Jest snapshots\)/);
    assert.match(
      same.output,
      /public\/app\/core\/__snapshots__\/thing\.test\.ts\.snap \(pjan-a-panel, pjan-b-panel\): identical/
    );
    const different = check(twoPlugins({ extra: files(2) }));
    assert.equal(different.status, 1, different.output);
    assert.match(different.output, /thing\.test\.ts\.snap:3 and .*thing\.test\.ts\.snap:3 differ/);
  });

  describe('stand-ins', () => {
    const STAND_IN = 'src/packages/grafana-data/internal.ts';
    const standIn = (name, firstLine = '// Plugin stand-in for `@grafana/data/internal` (grafana/grafana v13.2.3).') =>
      `${firstLine}\nexport const ${name} = 1;\n`;
    /** Plugins a and b (and c, if given) with stand-ins at STAND_IN; `own` names the plugins that list theirs. */
    const withStandIns = ({ a, b, c, own = [] }) =>
      twoPlugins({
        ownA: own.includes('a') ? [STAND_IN] : [],
        ownB: own.includes('b') ? [STAND_IN] : [],
        extra: {
          [`plugins/pjan-a-panel/${STAND_IN}`]: a,
          [`plugins/pjan-b-panel/${STAND_IN}`]: b,
          ...(c === undefined
            ? {}
            : {
                'plugins/pjan-c-panel/UPSTREAM.md': upstreamMd([], own.includes('c') ? [STAND_IN] : []),
                [`plugins/pjan-c-panel/${STAND_IN}`]: c,
              }),
        },
      });

    test('identical stand-ins at the same path pass, and are not compared as copies', () => {
      const { status, output } = check(withStandIns({ a: standIn('x'), b: standIn('x') }));
      assert.equal(status, 0, output);
      assert.match(output, /Upstream files copied into two or more plugins: 1\n/);
      assert.match(
        output,
        /Stand-ins: 2; at a path in two or more plugins: 1\n {2}src\/packages\/grafana-data\/internal\.ts \(pjan-a-panel, pjan-b-panel\)/
      );
    });

    test('unlisted stand-ins that differ fail, with the lines', () => {
      const { status, output } = check(withStandIns({ a: standIn('x'), b: standIn('y') }));
      assert.equal(status, 1, output);
      assert.match(
        output,
        /the stand-ins plugins\/pjan-a-panel\/src\/packages\/grafana-data\/internal\.ts and plugins\/pjan-b-panel\/src\/packages\/grafana-data\/internal\.ts differ, and neither is listed/
      );
      assert.match(output, /< export const x = 1;\n\s+> export const y = 1;/);
    });

    test('their first line is compared too (no normalisation)', () => {
      const b = standIn('x', '// Plugin stand-in for `@grafana/data/internal` (grafana/grafana v13.2.3, plugin b).');
      const { status, output } = check(withStandIns({ a: standIn('x'), b }));
      assert.equal(status, 1, output);
      assert.match(
        output,
        /> \/\/ Plugin stand-in for `@grafana\/data\/internal` \(grafana\/grafana v13\.2\.3, plugin b\)\./
      );
    });

    test('different stand-ins pass when each plugin lists its own', () => {
      const { status, output } = check(withStandIns({ a: standIn('x'), b: standIn('y'), own: ['a', 'b'] }));
      assert.equal(status, 0, output);
      assert.match(output, /internal\.ts \(pjan-a-panel \(its own\), pjan-b-panel \(its own\)\)/);
    });

    test('each plugin with a different stand-in lists it, not just one of them', () => {
      const { status, output } = check(withStandIns({ a: standIn('x'), b: standIn('y'), own: ['a'] }));
      assert.equal(status, 1, output);
      assert.match(
        output,
        /plugins\/pjan-b-panel\/src\/packages\/grafana-data\/internal\.ts: differs from every other plugin's stand-in at src\/packages\/grafana-data\/internal\.ts; make it identical, or list it/
      );
    });

    test("a listed stand-in identical to another plugin's fails", () => {
      const { status, output } = check(withStandIns({ a: standIn('x'), b: standIn('x'), own: ['a'] }));
      assert.equal(status, 1, output);
      assert.match(
        output,
        /plugins\/pjan-a-panel\/src\/packages\/grafana-data\/internal\.ts: listed under "## Stand-ins of its own", but identical to plugins\/pjan-b-panel/
      );
    });

    test('with three plugins, two may share a stand-in and the third keep its own', () => {
      const shared = check(withStandIns({ a: standIn('x'), b: standIn('x'), c: standIn('z'), own: ['c'] }));
      assert.equal(shared.status, 0, shared.output);
      const unlisted = check(withStandIns({ a: standIn('x'), b: standIn('x'), c: standIn('z') }));
      assert.equal(unlisted.status, 1, unlisted.output);
      assert.match(
        unlisted.output,
        /the stand-ins plugins\/pjan-a-panel\S+ and plugins\/pjan-c-panel\S+ differ, and neither is listed/
      );
    });

    test('the unlisted stand-ins at a path form one shared version', () => {
      const root = withStandIns({ a: standIn('x'), b: standIn('x'), c: standIn('z') });
      writeExtra(root, {
        'plugins/pjan-d-panel/UPSTREAM.md': upstreamMd(),
        [`plugins/pjan-d-panel/${STAND_IN}`]: standIn('z'),
      });
      const { status, output } = check(root);
      assert.equal(status, 1, output);
      assert.match(output, /the stand-ins plugins\/pjan-a-panel\S+ and plugins\/pjan-c-panel\S+ differ/);
    });

    test('a listed path must be a stand-in in that plugin', () => {
      const root = twoPlugins({ ownB: ['src/packages/grafana-ui/internal.ts'] });
      const { status, output } = check(root);
      assert.equal(status, 1, output);
      assert.match(
        output,
        /lists src\/packages\/grafana-ui\/internal\.ts under "## Stand-ins of its own", but it is not a stand-in in this plugin/
      );
    });

    test('a listed stand-in must be at a path another plugin also has', () => {
      const root = twoPlugins({ ownA: [STAND_IN], extra: { [`plugins/pjan-a-panel/${STAND_IN}`]: standIn('x') } });
      const { status, output } = check(root);
      assert.equal(status, 1, output);
      assert.match(
        output,
        /lists src\/packages\/grafana-data\/internal\.ts under "## Stand-ins of its own", but no other plugin has a stand-in there/
      );
    });

    test('a plugin with stand-ins needs the section in its UPSTREAM.md', () => {
      const root = twoPlugins({ extra: { [`plugins/pjan-a-panel/${STAND_IN}`]: standIn('x') } });
      fs.writeFileSync(
        path.join(root, 'plugins/pjan-a-panel/UPSTREAM.md'),
        upstreamMd().replace('## Stand-ins of its own', '## Other')
      );
      const { status, output } = check(root);
      assert.equal(status, 1, output);
      assert.match(output, /plugins\/pjan-a-panel\/UPSTREAM\.md: no "## Stand-ins of its own" section/);
    });
  });

  test('every file in the mirrored tree is a copy, a stand-in or a Jest snapshot', () => {
    const root = twoPlugins({ extra: { 'plugins/pjan-a-panel/src/features/own.ts': 'export const own = 1;\n' } });
    const { status, output } = check(root);
    assert.equal(status, 1, output);
    assert.match(output, /plugins\/pjan-a-panel\/src\/features\/own\.ts: in the mirrored tree, but neither a copy/);
  });

  test('a malformed header fails instead of hiding the copy from the check', () => {
    const root = twoPlugins({
      b: '// Copied from grafana/grafana v13.2.3 public/app/core/thing.ts. AGPL-3.0.\n' + BODY,
    });
    const { status, output } = check(root);
    assert.equal(status, 1, output);
    assert.match(
      output,
      /plugins\/pjan-b-panel\/src\/core\/thing\.ts: line 1 starts like a copy header but doesn't read/
    );
  });

  test("the header's upstream path must be the one the plugin path mirrors", () => {
    const root = twoPlugins({ b: header({ file: 'public/app/core/other.ts' }) + BODY });
    const { status, output } = check(root);
    assert.equal(status, 1, output);
    assert.match(
      output,
      /the header names public\/app\/core\/other\.ts, but this path mirrors public\/app\/core\/thing\.ts/
    );
  });

  test('package copies map to packages/grafana-<pkg>/src/<path>', () => {
    const file = 'packages/grafana-ui/src/utils/logger.ts';
    const copy = header({ file, licence: 'Apache-2.0 (Copyright Grafana Labs)' }) + BODY;
    const root = twoPlugins({
      extra: { [`plugins/pjan-a-panel/src/${file}`]: copy, [`plugins/pjan-b-panel/src/${file}`]: copy },
    });
    const { status, output } = check(root);
    assert.equal(status, 0, output);
    assert.match(output, /packages\/grafana-ui\/src\/utils\/logger\.ts \(pjan-a-panel, pjan-b-panel\): identical/);
  });

  test('the check writes nothing', () => {
    const root = twoPlugins({ b: header() + BODY.replace('a = 1', 'a = 2') });
    const before = fs
      .readdirSync(root, { recursive: true })
      .map((file) => [file, fs.statSync(path.join(root, file)).mtimeMs]);
    check(root);
    const after = fs
      .readdirSync(root, { recursive: true })
      .map((file) => [file, fs.statSync(path.join(root, file)).mtimeMs]);
    assert.deepEqual(after, before);
  });
});
