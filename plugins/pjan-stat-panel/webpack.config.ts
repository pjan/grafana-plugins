import CopyWebpackPlugin from 'copy-webpack-plugin';
import fs from 'fs';
import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';
import { Compilation, type Compiler, type Configuration, type Module, type RuleSetRule, sources } from 'webpack';

import grafanaConfig, { type Env } from './.config/webpack/webpack.config';

const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt';
// The repository's shared workspace packages (packages/<name>): bundled from source, so they are not under node_modules.
const WORKSPACE_PACKAGES_DIR = path.resolve(__dirname, '../../packages');

/** The first directory of `file` below `dir`, if `file` is inside `dir`. */
function topDirBelow(dir: string, file: string): string | undefined {
  const relative = path.relative(dir, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  return path.join(dir, relative.split(path.sep)[0]);
}

/**
 * Writes dist/THIRD_PARTY_NOTICES.txt: name, version, licence and licence file(s) of every npm package with code in
 * the emitted chunks, including the repository's shared workspace packages (`packages/<name>`). It walks the modules of
 * every chunk, including the modules webpack concatenates into one (license-webpack-plugin 4.0.2 only sees the root
 * module of those, and missed most packages here).
 *
 * The build fails when a bundled file is neither the plugin's own, in a package under node_modules, nor in a workspace
 * package; when a workspace package has no licence; and when one package is bundled from two directories (two
 * copies, for example of the bundled @grafana/i18n, whose second copy would never be initialised by `module.ts`).
 */
class ThirdPartyNoticesPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap('ThirdPartyNoticesPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'ThirdPartyNoticesPlugin', stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          const packageDirs = new Set<string>();
          const workspacePackageDirs = new Set<string>();
          const visit = (module: Module) => {
            const inner = (module as Module & { modules?: Module[] }).modules;
            inner?.forEach(visit);
            const resource = (module as Module & { resource?: string }).resource;
            if (!resource) {
              return; // webpack's runtime and virtual modules
            }
            const match = resource.match(/^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)/);
            const workspacePackage = topDirBelow(WORKSPACE_PACKAGES_DIR, resource);
            if (match) {
              packageDirs.add(match[1]);
            } else if (workspacePackage) {
              workspacePackageDirs.add(workspacePackage);
              packageDirs.add(workspacePackage);
            } else if (!topDirBelow(__dirname, resource)) {
              throw new Error(`ThirdPartyNoticesPlugin: ${resource} is bundled but belongs to no package`);
            }
          };
          for (const chunk of compilation.chunks) {
            for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
              visit(module);
            }
          }

          // The scaffold's virtual node_modules/grafana-public-path.js is not a package.
          const packages = [...packageDirs].filter((dir) => fs.existsSync(path.join(dir, 'package.json')));
          const entries = packages.map((dir) => {
            const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
            const licenceFiles = fs
              .readdirSync(dir)
              .filter((file) => /^(licen[cs]e|copying|notice)/i.test(file))
              .sort();
            const texts = licenceFiles.map((file) => fs.readFileSync(path.join(dir, file), 'utf8').trim());
            const licence = typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license ?? pkg.licenses);
            if (workspacePackageDirs.has(dir) && (licenceFiles.length === 0 || typeof pkg.license !== 'string')) {
              throw new Error(
                `ThirdPartyNoticesPlugin: workspace package ${pkg.name} needs a LICENSE file and a license`
              );
            }
            return {
              name: pkg.name as string,
              dir,
              key: `${pkg.name}@${pkg.version}`,
              text: [
                `${pkg.name} ${pkg.version}`,
                `License: ${licence}`,
                ...(texts.length > 0 ? texts : ['(the package ships no licence file)']),
              ].join('\n\n'),
            };
          });
          const dirsByName = new Map<string, string[]>();
          entries.forEach(({ name, dir }) => dirsByName.set(name, [...(dirsByName.get(name) ?? []), dir]));
          const duplicates = [...dirsByName].filter(([, dirs]) => dirs.length > 1);
          if (duplicates.length > 0) {
            const list = duplicates.map(([name, dirs]) => `${name} (${dirs.join(', ')})`).join('; ');
            throw new Error(`ThirdPartyNoticesPlugin: packages bundled from more than one directory: ${list}`);
          }
          const unique = [...new Map(entries.map((entry) => [entry.key, entry])).values()].sort((a, b) =>
            a.key.localeCompare(b.key)
          );
          const separator = '\n\n' + '-'.repeat(80) + '\n\n';
          const header =
            'Third-party software bundled into this plugin (dist/*.js), with its licence.\n' +
            'Generated at build time by webpack.config.ts (ThirdPartyNoticesPlugin).';
          compilation.emitAsset(
            NOTICES_FILE,
            new sources.RawSource(header + separator + unique.map((entry) => entry.text).join(separator) + '\n')
          );
        }
      );
    });
  }
}

// Extends the scaffold's .config/webpack/webpack.config.ts (do not edit that file; `create-plugin update` owns it).
// package.json `build`/`dev` must use this file; src/pjan/buildConfig.test.ts checks that.
const config = async (env: Env): Promise<Configuration> => {
  const baseConfig = await grafanaConfig(env);

  // 1. The code copied from grafana/grafana uses the automatic JSX runtime (no `import React`), so the scaffold's
  //    swc-loader rule gets `jsc.transform.react.runtime = 'automatic'`. `react/jsx-runtime` is already a shared
  //    external in .config/bundler/externals.ts.
  const swcRule = baseConfig.module?.rules?.find(
    (rule): rule is RuleSetRule =>
      typeof rule === 'object' &&
      rule !== null &&
      typeof rule.use === 'object' &&
      !Array.isArray(rule.use) &&
      rule.use?.loader === 'swc-loader'
  );

  if (swcRule == null || typeof swcRule.use !== 'object' || Array.isArray(swcRule.use)) {
    throw new Error('webpack.config.ts: swc-loader rule not found in .config/webpack/webpack.config.ts');
  }

  const swcUse = swcRule.use as { loader: string; options: { jsc: Record<string, unknown> } };
  swcUse.options.jsc.transform = { react: { runtime: 'automatic' } };

  // 2. Licence notices in dist/: the AGPL-3.0 LICENSE is copied by the scaffold; add the Apache-2.0 licence of the
  //    helpers copied from @grafana/* packages, the provenance record, and Grafana's NOTICE.md.
  baseConfig.plugins = [
    ...(baseConfig.plugins ?? []),
    new CopyWebpackPlugin({
      patterns: [
        { from: '../LICENSE_APACHE2', to: '.' },
        { from: '../UPSTREAM.md', to: '.' },
        { from: '../NOTICE.md', to: '.' },
      ],
    }),
    // 3. Third-party notices for the npm packages bundled into the chunks.
    new ThirdPartyNoticesPlugin(),
  ];

  // 4. Keep licence comments of bundled code: the scaffold's Terser settings, with the comment condition spelled out
  //    and the extracted comments written next to each asset (module.js.LICENSE.txt) instead of a shared LICENSE.txt.
  if (env.production) {
    baseConfig.optimization = {
      ...baseConfig.optimization,
      minimizer: [
        new TerserPlugin({
          extractComments: {
            condition: /^\**!|@preserve|@license|@cc_on/i,
            filename: '[file].LICENSE.txt',
            banner: false,
          },
          terserOptions: {
            format: {
              // Same as .config: keep the [create-plugin] banner in module.js.
              comments: (_, { type, value }) => type === 'comment2' && value.trim().startsWith('[create-plugin]'),
            },
            compress: {
              drop_console: ['log', 'info'],
            },
          },
        }),
      ],
    };
  }

  // 5. Size limits for webpack's performance warnings. webpack's default (244 KiB) is meant for web pages. Stat ++
  //    bundles the copied panel and BigValue code, tinycolor2, @grafana/schema and @grafana/i18n (with its i18next
  //    helpers); everything else is shared by Grafana at runtime. module.js is about 60 KiB minified. Warn above
  //    150 KiB: room for the shared styling package and the opt-in additions, but a sudden large bundled dependency
  //    still shows.
  baseConfig.performance = {
    ...baseConfig.performance,
    maxAssetSize: 150 * 1024,
    maxEntrypointSize: 150 * 1024,
  };

  return baseConfig;
};

export default config;
