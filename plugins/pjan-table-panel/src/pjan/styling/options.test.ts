import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import userEvent from '@testing-library/user-event';
import { omit } from 'lodash';

import {
  applyFieldOverrides,
  type FieldConfigSource,
  FieldMatcherID,
  FieldType,
  getPanelOptionsWithDefaults,
  PanelOptionsEditorBuilder,
  type PanelPlugin,
  type StandardEditorsRegistryItem,
  toDataFrame,
} from '@grafana/data';
import { config } from '@grafana/runtime';
import {
  ClearableSliderEditor,
  type ClearableSliderSettings,
  getStylingColorOptions,
  StylingColorEditor,
} from '@pjan/grafana-styling';
import { LIGHT } from '@pjan/grafana-styling/src/testdata/themes';

import { plugin } from '../../plugins/panel/table/module';
import { fillEditorRegistry } from '../testdata/editorRegistry';

import {
  BACKGROUND_COLOR_MODES,
  getFieldStyling,
  getTableLook,
  PILL_FILL_COLOR_MODES,
  PILL_LINE_COLOR_MODES,
  TEXT_COLOR_MODES,
  unsetPillCornerRadius,
} from './options';

fillEditorRegistry();

const TEXT = 'custom.styling.textColor';
const BG = 'custom.styling.backgroundColor';
const FILL = 'custom.styling.fillColor';
const LINE = 'custom.styling.lineColor';
const WIDTH = 'custom.styling.lineWidth';
const RADIUS = 'custom.styling.cornerRadius';
const ALL = [BG, TEXT, FILL, LINE, WIDTH, RADIUS];
const SLIDERS = [WIDTH, RADIUS];
const PILL = [FILL, LINE, WIDTH, RADIUS];
const AUTOMATIC = { mode: 'automatic' };
const SOFT = { mode: 'shade', shade: 'soft' };
const FIXED_RED = { mode: 'fixed', fixedColor: 'red' };

const item = (id: string) => plugin.fieldConfigRegistry.get(id);

describe('the field options as registered', () => {
  it('sit in "Cell options" right after Cell type, in order, then core’s Cell value inspect', () => {
    const ids = plugin.fieldConfigRegistry.list().map((i) => i.id);
    const at = ids.indexOf('custom.cellOptions');
    expect(ids.slice(at, at + 8)).toEqual(['custom.cellOptions', ...ALL, 'custom.inspect']);
    for (const id of ALL) {
      expect(item(id).category).toEqual(['Cell options']);
    }
    expect(ALL.map((id) => item(id).name)).toEqual([
      'Background color',
      'Text color',
      'Pill fill color',
      'Pill line color',
      'Pill line width',
      'Pill corner radius',
    ]);
  });

  it.each([
    [BG, 'styling.backgroundColor'],
    [TEXT, 'styling.textColor'],
    [FILL, 'styling.fillColor'],
    [LINE, 'styling.lineColor'],
    [WIDTH, 'styling.lineWidth'],
    [RADIUS, 'styling.cornerRadius'],
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

  it.each([FILL, LINE])('%s: the five shades and Fixed (State timeline plus’s Fill and Line color)', (id) => {
    expect(item(id).editor).toBe(StylingColorEditor);
    expect(item(id).override).toBe(StylingColorEditor);
    expect(item(id).settings.modes).toBe(id === FILL ? PILL_FILL_COLOR_MODES : PILL_LINE_COLOR_MODES);
    expect(getStylingColorOptions(item(id).settings.modes, item(id).settings.shadeGroup).map((o) => o.value)).toEqual([
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

  it.each([FILL, LINE])('%s: shades grouped as of the pill color', (id) => {
    expect(item(id).settings.shadeGroup).toBe('Shade of the pill color');
  });

  it('while unset, the clearable editors say what is drawn', () => {
    expect(item(BG).settings.placeholder).toBe('As Grafana');
    // as Stat plus's Text color ("Automatic on a background"): Automatic on a fill the plugin draws
    expect(item(TEXT).settings.placeholder).toBe(
      'Automatic on a Background or Pill fill color or the Pill look, otherwise as Grafana'
    );
    expect(item(FILL).settings.placeholder).toBe('As Grafana');
    // as State timeline plus's Line color ("State color"): the line's colour when a width draws one
    expect(item(LINE).settings.placeholder).toBe('Pill color');
  });

  it('Pill line width and Pill corner radius: clearable sliders, their unset values values of their own', () => {
    for (const id of SLIDERS) {
      expect(item(id).editor).toBe(ClearableSliderEditor);
      expect(item(id).override).toBe(ClearableSliderEditor);
    }
    // unset draws no line unless a line color or the look asks for one: 1 there is a value of its own
    expect(item(WIDTH).settings).toEqual({ min: 1, max: 3, step: 1, unsetValue: 1, unsetIsExact: false });
    // unset is the theme's default radius (Grafana's themes: 6px), which a theme can change
    expect(config.theme2.shape.radius.default).toBe('6px');
    expect(item(RADIUS).settings).toEqual({ min: 0, max: 12, step: 1, unsetValue: 6, unsetIsExact: false });
  });

  it('the unset corner radius is read from the theme, within the slider’s range', () => {
    expect(unsetPillCornerRadius('6px')).toBe(6);
    expect(unsetPillCornerRadius('4px')).toBe(4);
    expect(unsetPillCornerRadius('20px')).toBe(12);
    expect(unsetPillCornerRadius('none')).toBe(0);
  });

  it.each(SLIDERS)('%s: tabbing through the unset slider saves nothing; a picked value is saved', async (id) => {
    const onChange = jest.fn();
    const settings = item(id).settings as ClearableSliderSettings;
    const props = {
      onChange,
      item: { id, name: item(id).name, settings } as StandardEditorsRegistryItem<
        number | undefined,
        ClearableSliderSettings
      >,
      context: { data: [] },
    };
    // (createElement: this file is .ts)
    const { rerender } = render(createElement(ClearableSliderEditor, { value: undefined, ...props }));
    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    // typing the value the unset slider shows saves it (unsetIsExact: false)
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), String(settings.unsetValue));
    expect(onChange).toHaveBeenLastCalledWith(settings.unsetValue);
    rerender(createElement(ClearableSliderEditor, { value: 3, ...props }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear value' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('Text color doesn’t promise 4.2:1 on gradients, and points to basic mode', () => {
    const description = item(TEXT).description!;
    expect(description).toMatch(/at least 4\.2:1 where a shade reaches it/);
    expect(description).toMatch(/as low as about 3\.2:1 \(use basic mode where the text must be readable\)/);
  });

  it.each(ALL)(
    '%s: no default value, no cell-type showIf (review M3), applies to every field as core’s cell options',
    (id) => {
      const value = SLIDERS.includes(id) ? 3 : SOFT;
      expect(item(id).defaultValue).toBeUndefined();
      expect(item(id).showIf).toBeUndefined();
      expect(item(id).shouldApply({ type: FieldType.time } as never)).toBe(true);
      expect(item(id).shouldApply({ type: FieldType.string } as never)).toBe(true);
      expect(item(id).shouldApply({ type: FieldType.number } as never)).toBe(true);
      expect(item(id).process(value, {} as never, item(id).settings)).toEqual(value);
      expect(item(id).process(undefined, {} as never, item(id).settings)).toBeUndefined();
    }
  );

  it.each(PILL)('%s says it applies to Pill cells only, and ends with "Not set: …"', (id) => {
    const description = item(id).description!;
    expect(description).toMatch(/pills of Pill cells/);
    expect(description).toMatch(/other cell types are not changed/);
    expect(description).toMatch(/Not set: [^.]*$/);
  });

  it('Pill fill color, line color and line width say what the Pill look sets, and what unset text does', () => {
    expect(item(FILL).description).toMatch(/Text color not set is Automatic on it/);
    expect(item(FILL).description).toMatch(/Not set: the Pill look’s Softer shade; otherwise as Grafana/);
    expect(item(LINE).description).toMatch(/On a transparent pill it replaces Grafana’s border/);
    expect(item(LINE).description).toMatch(/Not set: the Pill look’s Base shade; otherwise no line/);
    expect(item(WIDTH).description).toMatch(/Not set: 1 px with a Pill line color or the Pill look; otherwise no line/);
    expect(item(WIDTH).description).toMatch(/in pixels \(1–3\)/);
    expect(item(RADIUS).description).toMatch(/Not set: as Grafana, the theme’s default radius$/);
  });

  it('Text color says which cell types it applies to, and ends with "Not set: …"', () => {
    const description = item(TEXT).description!;
    for (const type of ['Colored background', 'Apply to entire row', 'Pill', 'Colored text']) {
      expect(description).toContain(type);
    }
    expect(description).toMatch(/other cell types are not changed/);
    expect(description).toMatch(
      /Not set: Automatic on a Background color, on a Pill fill color and with the Pill look; otherwise as Grafana, [^.]*$/
    );
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

  it('the pill options: set values kept; each cleared leaves the others; all cleared leave no `styling`', () => {
    const styling = { fillColor: SOFT, lineColor: FIXED_RED, lineWidth: 2, cornerRadius: 4 };
    expect(load({ defaults: { custom: { styling } }, overrides: [] }).defaults.custom.styling).toEqual(styling);
    let custom: object = { minWidth: 70, styling };
    const keys = Object.keys(styling);
    for (const [k, key] of keys.entries()) {
      custom = omit(custom, `styling.${key}`);
      if (k < keys.length - 1) {
        const loaded = load({ defaults: { custom }, overrides: [] }).defaults.custom;
        expect(loaded.styling).toEqual(omit(styling, keys.slice(0, k + 1)));
      }
    }
    const none = load({ defaults: { custom }, overrides: [] }).defaults.custom;
    expect(none).not.toHaveProperty('styling');
    expect(none).toHaveProperty('minWidth', 70);
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

  it('pill options by override: kept as `custom.styling.<key>`, styling their field only', () => {
    const properties = [
      { id: FILL, value: SOFT },
      { id: LINE, value: FIXED_RED },
      { id: WIDTH, value: 2 },
      { id: RADIUS, value: 4 },
    ];
    expect(load(onB(properties)).overrides[0].properties).toEqual(properties);
    expect(process(onB(properties, { styling: { cornerRadius: 8 } }))).toEqual([
      { cornerRadius: 8 },
      { cornerRadius: 8 },
      { fillColor: SOFT, lineColor: FIXED_RED, lineWidth: 2, cornerRadius: 4 },
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

describe('the panel option Look (options.styling.look)', () => {
  const panelItems = () => {
    const builder = new PanelOptionsEditorBuilder();
    plugin.getPanelOptionsSupplier()(builder as never, { data: [] });
    return builder.getItems();
  };
  const look = () => panelItems().find((i) => i.id === 'styling.look')!;

  it('sits in core’s "Table" category after core’s last option, Page size (as State timeline plus’s Look)', () => {
    const ids = panelItems().map((i) => i.id);
    expect(ids.slice(-3)).toEqual(['enablePagination', 'pageSize', 'styling.look']);
    expect(look().category).toEqual(['Table']);
    expect(look().path).toBe('styling.look');
    expect(look().name).toBe('Look');
  });

  it('is State timeline plus’s radio: Grafana and Pill, no default value', () => {
    expect(look().editor).toBe(panelItems().find((i) => i.id === 'cellHeight')!.editor); // the radio
    expect(look().settings.options).toEqual([
      { value: 'grafana', label: 'Grafana' },
      { value: 'pill', label: 'Pill' },
    ]);
    expect(look().defaultValue).toBeUndefined();
    expect(look().showIf).toBeUndefined();
  });

  it('says it is for Pill cells, what Pill sets, that a look only sets options left unset, and "Not set: …"', () => {
    const description = look().description!;
    expect(description).toMatch(/^Pill cells only\./);
    expect(description).toMatch(/the softest shade of each pill’s color as fill, a 1 px line in its base shade/);
    expect(description).toMatch(/A look only sets the pill options left unset/);
    expect(description).toMatch(/It sets no corner radius/);
    expect(description).toMatch(/Not set: as Grafana$/);
  });

  const loadOptions = (options: Record<string, unknown>, isAfterPluginChange = false) =>
    getPanelOptionsWithDefaults({
      plugin: plugin as unknown as PanelPlugin,
      currentOptions: options,
      currentFieldConfig: { defaults: {}, overrides: [] },
      isAfterPluginChange,
    }).options;

  it('a new panel saves no `styling`; a set look is kept', () => {
    expect(loadOptions({}, true)).not.toHaveProperty('styling');
    expect(loadOptions({ styling: { look: 'pill' } }).styling).toEqual({ look: 'pill' });
  });

  it('getTableLook reads it, undefined when not set', () => {
    expect(getTableLook({ styling: { look: 'pill' } })).toBe('pill');
    expect(getTableLook({ styling: { look: 'grafana' } })).toBe('grafana');
    expect(getTableLook({})).toBeUndefined();
    expect(getTableLook(undefined)).toBeUndefined();
  });
});
