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
