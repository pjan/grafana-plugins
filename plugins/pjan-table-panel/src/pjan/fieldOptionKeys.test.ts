import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { type FieldConfigOptionsRegistry, PanelPlugin } from '@grafana/data';

import { plugin } from '../plugins/panel/table/module';

import { fillEditorRegistry } from './testdata/editorRegistry';

fillEditorRegistry();

// `custom` is core's namespace: `TableFieldOptions` (@grafana/schema) declares keys core's editors don't register
// (displayMode, hideHeader, sortable, ...), and the copied table code reads some of them raw. A field option of this
// plugin under one of those keys would be read by core's code as its own, so the plugin's own field options must not
// use them (its additions go under `custom.styling`, plan decision 6).

// The keys of `TableFieldOptions` in the installed @grafana/schema, which package.json pins to the synced Grafana tag,
// read with the TypeScript compiler from the package's own type declarations (including the interfaces it extends).
function tableFieldOptionsKeys(): string[] {
  const packageJson = require.resolve('@grafana/schema/package.json');
  const { version, types } = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  expect(version).toBe('13.2.3');
  const entry = path.join(path.dirname(packageJson), types);
  const program = ts.createProgram([entry], { skipLibCheck: true, noEmit: true });
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!;
  const symbol = checker.getExportsOfModule(moduleSymbol).find((s) => s.getName() === 'TableFieldOptions')!;
  const declared = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const type = checker.getDeclaredTypeOfSymbol(declared);
  return checker
    .getPropertiesOfType(type)
    .map((property) => property.getName())
    .sort();
}

// The custom field option ids core Table registers in grafana/grafana v13.2.3 (public/app/plugins/panel/table/module.tsx
// and public/app/features/panel/table/addTableCustomConfig.ts), frozen here: every other custom field option of the
// plugin is its own. The last test checks the list against the copied module, so a re-sync that changes core's options
// fails until the list is updated deliberately.
const CORE_CUSTOM_IDS_V13_2_3 = [
  'custom.minWidth',
  'custom.width',
  'custom.align',
  'custom.wrapText',
  'custom.wrapHeaderText',
  'custom.filterable',
  'custom.hideFrom.viz',
  'custom.footer.reducers',
  'custom.cellOptions',
  'custom.inspect',
  'custom.tooltip.field',
  'custom.tooltip.placement',
  'custom.styleField',
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
  const keys = tableFieldOptionsKeys();

  it('reads TableFieldOptions’ keys, including those core registers no editor for', () => {
    expect(keys).toEqual(expect.arrayContaining(['align', 'cellOptions', 'footer', 'hideFrom', 'width', 'wrapText']));
    expect(keys).toEqual(expect.arrayContaining(['displayMode', 'hideHeader', 'sortable']));
    expect(keys).not.toContain('styling');
  });

  it('the plugin has no field options of its own yet (parity port)', () => {
    expect(ownCustomKeys(plugin.fieldConfigRegistry)).toEqual([]);
  });

  it('no field option of the plugin reuses a TableFieldOptions key', () => {
    expect(ownCustomKeys(plugin.fieldConfigRegistry).filter((key) => keys.includes(key))).toEqual([]);
  });

  it('would catch one that does', () => {
    const withOwnOptions = new PanelPlugin(() => null).useFieldConfig({
      useCustomConfig: (builder) => {
        builder.addBooleanSwitch({ path: 'sortable', name: 'Sortable' });
        builder.addTextInput({ path: 'styling.textColor', name: 'Text color' });
      },
    });

    expect([...new Set(ownCustomKeys(withOwnOptions.fieldConfigRegistry))].sort()).toEqual(['sortable', 'styling']);
    expect(ownCustomKeys(withOwnOptions.fieldConfigRegistry).filter((key) => keys.includes(key))).toEqual(['sortable']);
  });

  it('the frozen list is the custom field options of the copied module (v13.2.3)', () => {
    for (const file of ['../plugins/panel/table/module.tsx', '../features/panel/table/addTableCustomConfig.ts']) {
      const header = fs.readFileSync(path.join(__dirname, file), 'utf8').split('\n')[0];
      expect(header).toMatch(/^\/\/ Copied from grafana\/grafana v13\.2\.3: /);
    }
    const ids = plugin.fieldConfigRegistry
      .list()
      .filter((item) => item.isCustom)
      .map((item) => item.id);
    expect(ids.sort()).toEqual([...CORE_CUSTOM_IDS_V13_2_3].sort());
  });
});
