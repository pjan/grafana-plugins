import fs from 'fs';
import path from 'path';

// The code copied from grafana/grafana uses the automatic JSX runtime (no `import React`). Only the plugin's own
// webpack.config.ts turns that on for the build; `npx @grafana/create-plugin update` rewrites the package.json scripts
// to .config/webpack/webpack.config.ts, and the panel then fails in the browser with "React is not defined".
// (Jest has its own setting in jest.config.js: if that reverts, the component tests fail on their own.)
const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('build configuration', () => {
  const { scripts } = JSON.parse(read('package.json'));

  it.each(['build', 'dev'])('the %s script uses the plugin webpack.config.ts', (name) => {
    expect(scripts[name]).toMatch(/(^|\s)-c \.\/webpack\.config\.ts(\s|$)/);
  });

  it('webpack.config.ts switches swc to the automatic JSX runtime', () => {
    expect(read('webpack.config.ts')).toMatch(/runtime: 'automatic'/);
  });

  it('tsconfig.json type-checks with the automatic JSX runtime', () => {
    expect(read('tsconfig.json')).toMatch(/"jsx":\s*"react-jsx"/);
  });
});

// Guard against the port quietly rendering Grafana's own table instead of the copy (plan "Architecture"): the plugin's
// externals (`/^@grafana\/ui/i`, .config/bundler/externals.ts) would turn a stray `@grafana/ui/unstable` import into a
// runtime dependency on Grafana's TableNG, and an `/internal` one into a module Grafana doesn't share with plugins.
// eslint.config.mjs bans those imports in src/; this checks what the build actually asks Grafana for, including imports
// from bundled packages. It needs a build: the repository's checks run Jest before `npm run build`, so in `npm test` on a
// fresh checkout this test is skipped and says so. After the build, `npm run test:dist` (CI and the release workflow)
// runs it with PJAN_REQUIRE_DIST=1, which makes a missing dist/module.js a failure, not a skip.
describe('built module.js', () => {
  const builtModule = path.join(root, 'dist/module.js');
  const built = fs.existsSync(builtModule);
  const required = process.env.PJAN_REQUIRE_DIST === '1';
  const itIfBuilt = built || required ? it : it.skip;

  itIfBuilt(
    `asks Grafana for no @grafana/ui/unstable and no /internal entry point${built ? '' : ' (no dist/module.js)'}`,
    () => {
      expect(fs.existsSync(builtModule)).toBe(true);
      const amd = /^define\((\[[^\]]*\])/m.exec(fs.readFileSync(builtModule, 'utf8'));
      expect(amd).not.toBeNull();
      const dependencies: string[] = JSON.parse(amd![1]);
      expect(dependencies).toContain('@grafana/ui');
      expect(dependencies.filter((name) => /^@grafana\/ui\/unstable(\/|$)|\/internal(\/|$)/.test(name))).toEqual([]);
    }
  );
});
