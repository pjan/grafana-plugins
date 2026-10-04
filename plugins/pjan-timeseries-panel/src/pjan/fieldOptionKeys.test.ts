import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { type FieldConfigOptionsRegistry, PanelPlugin } from '@grafana/data';

import { defaultGraphConfig, getGraphFieldConfig } from '../plugins/panel/timeseries/config';
import { plugin } from '../plugins/panel/timeseries/module';

import { fillEditorRegistry } from './testdata/editorRegistry';

fillEditorRegistry();

// `custom` is core's namespace: `GraphFieldConfig` (@grafana/schema) declares more keys than core's editors register
// (lineColor, fillColor, pointColor, ...), and the copied TimeSeries/utils.ts reads some of them raw. A field option of
// this plugin under one of those keys would be drawn by core's code as an unresolved value, so the plugin's own field
// options must not use them (its additions go under `custom.styling`, plan decision 3).

// The keys of `GraphFieldConfig` in the installed @grafana/schema, which package.json pins to the synced Grafana tag,
// read with the TypeScript compiler from the package's own type declarations (including the interfaces it extends).
function graphFieldConfigKeys(): string[] {
  const packageJson = require.resolve('@grafana/schema/package.json');
  const { version, types } = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  expect(version).toBe('13.2.3');
  const entry = path.join(path.dirname(packageJson), types);
  const program = ts.createProgram([entry], { skipLibCheck: true, noEmit: true });
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!;
  const symbol = checker.getExportsOfModule(moduleSymbol).find((s) => s.getName() === 'GraphFieldConfig')!;
  const declared = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const type = checker.getDeclaredTypeOfSymbol(declared);
  return checker
    .getPropertiesOfType(type)
    .map((property) => property.getName())
    .sort();
}

// The custom field option ids core Time series registers in grafana/grafana v13.2.3
// (public/app/plugins/panel/timeseries/config.ts), frozen here: every other custom field option of the plugin is its
// own. The last test checks the list against the copied config.ts, so a re-sync that changes core's options fails
// until the list is updated deliberately.
const CORE_CUSTOM_IDS_V13_2_3 = [
  'custom.drawStyle',
  'custom.lineInterpolation',
  'custom.barAlignment',
  'custom.barWidthFactor',
  'custom.lineWidth',
  'custom.fillOpacity',
  'custom.gradientMode',
  'custom.fillBelowTo',
  'custom.lineStyle',
  'custom.spanNulls',
  'custom.insertNulls',
  'custom.showPoints',
  'custom.showValues',
  'custom.pointSize',
  'custom.stacking',
  'custom.transform',
  'custom.axisPlacement',
  'custom.axisLabel',
  'custom.axisWidth',
  'custom.axisGridShow',
  'custom.axisColorMode',
  'custom.axisBorderShow',
  'custom.scaleDistribution',
  'custom.axisCenteredZero',
  'custom.axisSoftMin',
  'custom.axisSoftMax',
  'custom.hideFrom',
  'custom.thresholdsStyle',
] as const;

// The first path segment of each custom field option that core doesn't register: the plugin's own options.
function ownCustomKeys(registry: FieldConfigOptionsRegistry) {
  const core = new Set<string>(CORE_CUSTOM_IDS_V13_2_3);
  return registry
    .list()
    .filter((item) => item.isCustom && !core.has(item.id))
    .map((item) => item.path.split('.')[0]);
}

describe('field option keys', () => {
  const keys = graphFieldConfigKeys();

  it('reads GraphFieldConfig’s keys, including those core registers no editor for', () => {
    expect(keys).toEqual(
      expect.arrayContaining(['drawStyle', 'lineWidth', 'fillOpacity', 'thresholdsStyle', 'hideFrom', 'transform'])
    );
    expect(keys).toEqual(
      expect.arrayContaining(['lineColor', 'fillColor', 'pointColor', 'pointSymbol', 'barMaxWidth'])
    );
  });

  it('no field option of the plugin reuses a GraphFieldConfig key', () => {
    expect(ownCustomKeys(plugin.fieldConfigRegistry).filter((key) => keys.includes(key))).toEqual([]);
  });

  it('would catch one that does', () => {
    const withOwnOptions = new PanelPlugin(() => null).useFieldConfig({
      ...getGraphFieldConfig(defaultGraphConfig),
      useCustomConfig: (builder) => {
        getGraphFieldConfig(defaultGraphConfig).useCustomConfig!(builder);
        builder.addTextInput({ path: 'lineColor', name: 'Line color' });
        builder.addTextInput({ path: 'styling.lineColor', name: 'Line color' });
      },
    });

    expect(ownCustomKeys(withOwnOptions.fieldConfigRegistry)).toEqual(['lineColor', 'styling']);
    expect(ownCustomKeys(withOwnOptions.fieldConfigRegistry).filter((key) => keys.includes(key))).toEqual([
      'lineColor',
    ]);
  });

  it('the frozen list is the custom field options of the copied config.ts (v13.2.3)', () => {
    const header = fs
      .readFileSync(path.join(__dirname, '../plugins/panel/timeseries/config.ts'), 'utf8')
      .split('\n')[0];
    expect(header).toMatch(
      /^\/\/ Copied from grafana\/grafana v13\.2\.3: public\/app\/plugins\/panel\/timeseries\/config\.ts\./
    );
    const ids = new PanelPlugin(() => null)
      .useFieldConfig(getGraphFieldConfig(defaultGraphConfig))
      .fieldConfigRegistry.list()
      .filter((item) => item.isCustom)
      .map((item) => item.id);
    expect(ids.sort()).toEqual([...CORE_CUSTOM_IDS_V13_2_3].sort());
  });
});
