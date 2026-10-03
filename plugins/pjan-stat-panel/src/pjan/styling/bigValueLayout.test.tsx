// The Color mode Custom hooks in the copied BigValueLayout (src/packages/grafana-ui/src/components/BigValue/).
import { type ReactElement } from 'react';

import { FieldType } from '@grafana/data';
import { PercentChangeColorMode } from '@grafana/schema';
import { getAutomaticText, getMinTextContrast, getTextContrast } from '@pjan/grafana-styling';
import tinycolor from 'tinycolor2';
import { LIGHT, THEMES } from '@pjan/grafana-styling/src/testdata/themes';

import { buildLayout } from 'packages/grafana-ui/src/components/BigValue/BigValueLayout';
import {
  BigValueColorMode,
  BigValueGraphMode,
  BigValueTextMode,
  type Props,
} from 'packages/grafana-ui/src/components/BigValue/BigValueTypes';

import { CUSTOM_BIG_VALUE_COLOR_MODE, type StatStyling } from './options';
import { getTileStyling } from './tileStyling';

const DARK = THEMES['Grafana dark'];
const color = (name: string, theme = LIGHT) => theme.visualization.getColorByName(name);

const props = (overrides: Partial<Props>): Props => ({
  width: 300,
  height: 150,
  theme: LIGHT,
  value: { text: '42', numeric: 42, color: color('green'), title: 'Requests', percentChange: 12 },
  sparkline: { y: { name: 'y', type: FieldType.number, values: [1, 3, 2, 4], config: {} } },
  colorMode: BigValueColorMode.Value,
  graphMode: BigValueGraphMode.Area,
  textMode: BigValueTextMode.ValueAndName,
  count: 2,
  ...overrides,
});

const custom = (styling: StatStyling, overrides: Partial<Props> = {}, theme = LIGHT) => {
  const p = props({ theme, ...overrides });
  return props({
    ...p,
    colorMode: CUSTOM_BIG_VALUE_COLOR_MODE,
    pjanStyling: getTileStyling(theme, p.value.color!, 'green', styling),
  });
};

// Everything the layout draws with: tile, value, name, percent change and the sparkline's config
function drawn(p: Props) {
  const layout = buildLayout(p);
  const valueStyles = layout.getValueStyles();
  const chart = layout.renderChart() as ReactElement<{ children: ReactElement<{ config: unknown }> }> | null;
  return {
    layout,
    panel: layout.getPanelStyles(),
    value: valueStyles,
    title: layout.getTitleStyles(),
    percent: layout.getPercentChangeStyles(12, PercentChangeColorMode.Standard, valueStyles),
    sparkline: chart?.props.children.props.config,
  };
}

describe('Color mode Custom in BigValueLayout', () => {
  it('with nothing set draws exactly as core’s Value mode', () => {
    const { layout: _a, ...valueMode } = drawn(props({ colorMode: BigValueColorMode.Value }));
    const { layout: _b, ...customMode } = drawn(custom({}));
    expect(customMode).toEqual(valueMode);
  });

  it('draws a chosen text colour on every element, whatever its contrast', () => {
    // Text Value on the light panel background: green is ~3.0:1, below 4.5:1 for the name
    const d = drawn(custom({ textColor: { mode: 'value' } }));
    expect(getMinTextContrast(d.layout.titleFontSize, 400)).toBe(4.5);
    expect(getTextContrast(LIGHT, color('green'), LIGHT.colors.background.primary)).toBeLessThan(4.5);
    expect(d.value.color).toBe(color('green'));
    expect(d.title.color).toBe(color('green'));
    expect(d.panel.background).toBe('transparent');
  });

  it('Automatic measures each element at its own size and weight', () => {
    const d = drawn(custom({ backgroundColor: { mode: 'value' }, textColor: { mode: 'automatic' } }));
    const background = LIGHT.colors.background.primary;
    const at = (size: number, weight: number) =>
      getAutomaticText(LIGHT, color('green'), getMinTextContrast(size, weight), { background });
    expect(d.value.color).toBe(at(d.layout.valueFontSize, 500));
    expect(d.title.color).toBe(at(d.layout.titleFontSize, 400));
  });

  it('percent change follows the text colour on a background, and keeps its own mode without one', () => {
    const onBackground = drawn(custom({ backgroundColor: { mode: 'fixed', fixedColor: 'black' } }));
    expect(onBackground.panel.background).toBe(color('black'));
    // not set on a background: Automatic on black, each element at its own size (percent change is small text)
    const background = LIGHT.colors.background.primary;
    expect(onBackground.value.color).toBe(
      getAutomaticText(LIGHT, color('black'), getMinTextContrast(onBackground.layout.valueFontSize, 500), {
        background,
      })
    );
    expect(onBackground.percent.containerStyles.color).toBe(
      getAutomaticText(LIGHT, color('black'), 4.5, { background })
    );

    const withoutBackground = drawn(custom({ textColor: { mode: 'fixed', fixedColor: 'purple' } }));
    expect(withoutBackground.percent.containerStyles.color).toBe(color('green')); // Standard, rising
  });

  it('the sparkline gets its colours and width; "Same as text" uses the value’s colour as drawn', () => {
    const d = drawn(
      custom(
        {
          backgroundColor: { mode: 'value' },
          textColor: { mode: 'automatic' },
          sparklineColor: { mode: 'text' },
          sparklineLineOpacity: 45,
          sparklineFillOpacity: 18,
          sparklineLineWidth: 2,
        },
        {},
        DARK
      )
    );
    const text = tinycolor(d.value.color as string);
    expect(d.sparkline).toEqual({
      custom: {
        drawStyle: 'line',
        lineWidth: 2,
        lineColor: text.clone().setAlpha(0.45).toRgbString(),
        fillColor: text.clone().setAlpha(0.18).toRgbString(),
      },
    });
  });

  it('Automatic on a value with a unit suffix uses the suffix’s size', () => {
    // A 30+ px value needs 3:1; its "%" is drawn at 0.6×, below 24 px, where 4.5:1 is needed
    const tile = (suffix: string | undefined) =>
      drawn(
        custom(
          { backgroundColor: { mode: 'value' }, textColor: { mode: 'automatic' } },
          {
            textMode: BigValueTextMode.Value,
            sparkline: undefined,
            // a value of about 30 px
            width: 120,
            height: 50,
            value: { text: '42', numeric: 42, color: color('green'), suffix, percentChange: undefined },
          }
        )
      );
    const background = LIGHT.colors.background.primary;
    const plain = tile(undefined);
    expect(plain.layout.valueFontSize).toBeGreaterThanOrEqual(24);
    expect(plain.value.color).toBe(getAutomaticText(LIGHT, color('green'), 3, { background }));
    const withSuffix = tile('%');
    expect(withSuffix.layout.valueFontSize * 0.6).toBeLessThan(24);
    expect(withSuffix.value.color).toBe(getAutomaticText(LIGHT, color('green'), 4.5, { background }));
  });
});
