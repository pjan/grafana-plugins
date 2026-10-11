import { omit } from 'lodash';

import {
  applyFieldOverrides,
  type FieldConfigSource,
  FieldMatcherID,
  FieldType,
  getPanelOptionsWithDefaults,
  type PanelPlugin,
  toDataFrame,
} from '@grafana/data';
import { getStylingColorOptions, StylingColorEditor } from '@pjan/grafana-styling';
import { LIGHT } from '@pjan/grafana-styling/src/testdata/themes';

import { plugin } from '../../plugins/panel/table/module';
import { fillEditorRegistry } from '../testdata/editorRegistry';

import { BACKGROUND_COLOR_MODES, getFieldStyling, TEXT_COLOR_MODES } from './options';

fillEditorRegistry();

const TEXT = 'custom.styling.textColor';
const BG = 'custom.styling.backgroundColor';
const AUTOMATIC = { mode: 'automatic' };
const SOFT = { mode: 'shade', shade: 'soft' };
const FIXED_RED = { mode: 'fixed', fixedColor: 'red' };

const item = (id: string) => plugin.fieldConfigRegistry.get(id);

describe('the field options as registered', () => {
  it('sit in "Cell options" right after Cell type, Background color first, then core’s Cell value inspect', () => {
    const ids = plugin.fieldConfigRegistry.list().map((i) => i.id);
    const at = ids.indexOf('custom.cellOptions');
    expect(ids.slice(at, at + 4)).toEqual(['custom.cellOptions', BG, TEXT, 'custom.inspect']);
    for (const id of [BG, TEXT]) {
      expect(item(id).category).toEqual(['Cell options']);
    }
    expect(item(BG).name).toBe('Background color');
    expect(item(TEXT).name).toBe('Text color');
  });

  it.each([
    [BG, 'styling.backgroundColor'],
    [TEXT, 'styling.textColor'],
  ])('%s: stored at custom.%s with that override id, in the field defaults and the overrides', (id, path) => {
    expect(item(id).path).toBe(path);
    expect(item(id).id).toBe(id);
    expect(item(id).isCustom).toBe(true);
    expect(item(id).hideFromDefaults).toBeFalsy();
    expect(item(id).hideFromOverrides).toBeFalsy();
  });

  it('Text color: the shared editor with Automatic, Value, the five shades and Fixed', () => {
    expect(item(TEXT).editor).toBe(StylingColorEditor);
    expect(item(TEXT).override).toBe(StylingColorEditor);
    expect(item(TEXT).settings.modes).toBe(TEXT_COLOR_MODES);
    expect(
      getStylingColorOptions(item(TEXT).settings.modes, item(TEXT).settings.shadeGroup).map((o) => o.value)
    ).toEqual(['automatic', 'value', 'softer', 'soft', 'base', 'strong', 'stronger', 'fixed']);
  });

  it('Background color: the five shades and Fixed (Value is core’s fill; no None)', () => {
    expect(item(BG).editor).toBe(StylingColorEditor);
    expect(item(BG).override).toBe(StylingColorEditor);
    expect(item(BG).settings.modes).toBe(BACKGROUND_COLOR_MODES);
    expect(getStylingColorOptions(item(BG).settings.modes, item(BG).settings.shadeGroup).map((o) => o.value)).toEqual([
      'softer',
      'soft',
      'base',
      'strong',
      'stronger',
      'fixed',
    ]);
  });

  it.each([BG, TEXT])('%s: shades grouped as of the value color', (id) => {
    expect(item(id).settings.shadeGroup).toBe('Shade of the value color');
  });

  it('while unset, the clearable editors say what is drawn: "As Grafana", and for Text color Automatic on a fill', () => {
    expect(item(BG).settings.placeholder).toBe('As Grafana');
    // as Stat plus's Text color ("Automatic on a background")
    expect(item(TEXT).settings.placeholder).toBe('Automatic on a Background color, otherwise as Grafana');
  });

  it('Text color doesn’t promise 4.2:1 on gradients, and points to basic mode', () => {
    const description = item(TEXT).description!;
    expect(description).toMatch(/at least 4\.2:1 where a shade reaches it/);
    expect(description).toMatch(/as low as about 3\.2:1 \(use basic mode where the text must be readable\)/);
  });

  it.each([BG, TEXT])(
    '%s: no default value, no cell-type showIf (review M3), applies to every field as core’s cell options',
    (id) => {
      expect(item(id).defaultValue).toBeUndefined();
      expect(item(id).showIf).toBeUndefined();
      expect(item(id).shouldApply({ type: FieldType.time } as never)).toBe(true);
      expect(item(id).shouldApply({ type: FieldType.string } as never)).toBe(true);
      expect(item(id).shouldApply({ type: FieldType.number } as never)).toBe(true);
      expect(item(id).process(SOFT, {} as never, item(id).settings)).toEqual(SOFT);
      expect(item(id).process(undefined, {} as never, item(id).settings)).toBeUndefined();
    }
  );

  it('Text color says which cell types it applies to, and ends with "Not set: …"', () => {
    const description = item(TEXT).description!;
    for (const type of ['Colored background', 'Apply to entire row', 'Pill', 'Colored text']) {
      expect(description).toContain(type);
    }
    expect(description).toMatch(/other cell types are not changed/);
    expect(description).toMatch(/Not set: Automatic on a Background color; otherwise as Grafana, [^.]*$/);
  });

  it('Background color says it fills Colored background cells only, how gradient mode works, and ends with "Not set: …"', () => {
    const description = item(BG).description!;
    expect(description).toMatch(/Colored background cells \(with Apply to entire row: the row’s\)/);
    expect(description).toMatch(/other cell types are not changed/);
    expect(description).toMatch(/In gradient mode a shade keeps the gradient, built from the shaded color/);
    expect(description).toMatch(/Fixed applies to basic mode only and is ignored in gradient mode/);
    expect(description).toMatch(/continuous color scheme/);
    expect(description).toMatch(/Text color not set is Automatic on it/);
    expect(description).toMatch(/Not set: as Grafana, [^.]*$/);
  });
});

describe('the field options as saved', () => {
  const load = (fieldConfig: FieldConfigSource, isAfterPluginChange = false) =>
    getPanelOptionsWithDefaults({
      plugin: plugin as unknown as PanelPlugin,
      currentOptions: {},
      currentFieldConfig: fieldConfig,
      isAfterPluginChange,
    }).fieldConfig;

  const process = (fieldConfig: FieldConfigSource) =>
    applyFieldOverrides({
      data: [
        toDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [1] },
            { name: 'a', type: FieldType.string, values: ['x'] },
            { name: 'b', type: FieldType.string, values: ['y'] },
          ],
        }),
      ],
      fieldConfig: load(fieldConfig),
      fieldConfigRegistry: plugin.fieldConfigRegistry,
      replaceVariables: (v) => v,
      theme: LIGHT,
    })[0].fields.map((field) => field.config.custom?.styling);

  const onB = (properties: Array<{ id: string; value?: unknown }>, defaults = {}): FieldConfigSource => ({
    defaults: { custom: defaults },
    overrides: [{ matcher: { id: FieldMatcherID.byName, options: 'b' }, properties }],
  });

  it('a new panel saves no `styling` (no defaults)', () => {
    expect(load({ defaults: {}, overrides: [] }, true).defaults.custom).not.toHaveProperty('styling');
  });

  it('set values are kept when the panel loads', () => {
    const styling = { textColor: AUTOMATIC, backgroundColor: SOFT };
    expect(load({ defaults: { custom: { styling } }, overrides: [] }).defaults.custom.styling).toEqual(styling);
  });

  it('a cleared value leaves no key and no empty `styling` object', () => {
    // Clearing in the editor: `omit(defaults.custom, path)` (updateDefaultFieldConfigValue in Grafana 13.2.3
    // PanelEditor/utils.ts) leaves `styling: {}`; the panel then applies the field config with its defaults
    const cleared = load({
      defaults: { custom: omit({ minWidth: 70, styling: { textColor: AUTOMATIC } }, 'styling.textColor') },
      overrides: [],
    }).defaults.custom;
    expect(cleared).not.toHaveProperty('styling');
    expect(cleared).toHaveProperty('minWidth', 70);
  });

  it('a cleared Background color leaves Text color alone, and both cleared leave no `styling`', () => {
    const both = { styling: { textColor: AUTOMATIC, backgroundColor: SOFT } };
    const one = load({ defaults: { custom: omit(both, 'styling.backgroundColor') }, overrides: [] });
    expect(one.defaults.custom.styling).toEqual({ textColor: AUTOMATIC });
    const none = load({
      defaults: { custom: omit(omit(both, 'styling.backgroundColor'), 'styling.textColor') },
      overrides: [],
    });
    expect(none.defaults.custom).not.toHaveProperty('styling');
  });

  it('drops keys it doesn’t know under `styling`', () => {
    const custom = load({ defaults: { custom: { styling: { nope: 1 } } }, overrides: [] }).defaults.custom;
    expect(custom).not.toHaveProperty('styling');
  });

  it('an override is kept as `custom.styling.<key>`', () => {
    const fieldConfig = load(
      onB([
        { id: TEXT, value: FIXED_RED },
        { id: BG, value: SOFT },
      ])
    );
    expect(fieldConfig.overrides[0].properties).toEqual([
      { id: TEXT, value: FIXED_RED },
      { id: BG, value: SOFT },
    ]);
  });

  it('an override styles its field only, over the defaults', () => {
    expect(
      process(
        onB([
          { id: TEXT, value: FIXED_RED },
          { id: BG, value: SOFT },
        ])
      )
    ).toEqual([undefined, undefined, { textColor: FIXED_RED, backgroundColor: SOFT }]);
    const defaults = { styling: { textColor: AUTOMATIC } };
    expect(process(onB([{ id: TEXT, value: FIXED_RED }], defaults))).toEqual([
      { textColor: AUTOMATIC },
      { textColor: AUTOMATIC },
      { textColor: FIXED_RED },
    ]);
  });

  it('an override property without a value (cleared in the editor) unsets it for its field, defaults included', () => {
    // The override-cleared caveat (README): Grafana unsets the property for the matched fields
    expect(process(onB([{ id: TEXT }]))).toEqual([undefined, undefined, undefined]);
    const styling = process(onB([{ id: TEXT }], { styling: { textColor: AUTOMATIC } }));
    expect(styling[1]).toEqual({ textColor: AUTOMATIC });
    expect(styling[2]?.textColor).toBeUndefined();
  });
});

describe('getFieldStyling', () => {
  it('is one frozen empty object while nothing is set, so memoised columns keep their identity', () => {
    const none = getFieldStyling(undefined);
    expect(getFieldStyling({})).toBe(none);
    expect(getFieldStyling({ cellOptions: { type: 'auto' } })).toBe(none);
    expect(Object.isFrozen(none)).toBe(true);
    const styling = { textColor: AUTOMATIC };
    expect(getFieldStyling({ styling })).toBe(styling);
  });
});
