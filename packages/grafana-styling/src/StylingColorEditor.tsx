import { css } from '@emotion/css';

import { type GrafanaTheme2, type StandardEditorProps } from '@grafana/data';
import { t } from '@grafana/i18n';
import { ColorPicker, Combobox, type ComboboxOption, useStyles2, useTheme2 } from '@grafana/ui';

import { type StylingColor, type StylingColorMode } from './stylingColor';
import { RELATIVE_SHADES, type RelativeShade } from './shades';

export interface StylingColorEditorSettings {
  /** The choices offered, in this order */
  modes: StylingColorMode[];
  /** Shown while the option is unset: what the panel draws then */
  placeholder: string;
}

const isShade = (key: string): key is RelativeShade => (RELATIVE_SHADES as readonly string[]).includes(key);

/** The choices of the select, for the modes an option offers. Their values are `toStylingColor`'s keys. */
export function getStylingColorOptions(modes: StylingColorMode[]): Array<ComboboxOption<string>> {
  const shadeGroup = t('pjan.styling.shade-group', 'Shade of the state color');
  const shades: Array<ComboboxOption<string>> = [
    {
      value: 'softer',
      label: t('pjan.styling.shade-softer', 'Softer'),
      description: t('pjan.styling.shade-softer-desc', 'The shade nearest the panel background'),
    },
    { value: 'soft', label: t('pjan.styling.shade-soft', 'Soft') },
    {
      value: 'base',
      label: t('pjan.styling.shade-base', 'Base'),
      description: t('pjan.styling.shade-base-desc', 'The middle shade'),
    },
    { value: 'strong', label: t('pjan.styling.shade-strong', 'Strong') },
    {
      value: 'stronger',
      label: t('pjan.styling.shade-stronger', 'Stronger'),
      description: t('pjan.styling.shade-stronger-desc', 'The shade farthest from the panel background'),
    },
  ];
  return modes.flatMap((mode): Array<ComboboxOption<string>> => {
    switch (mode) {
      case 'automatic':
        return [
          {
            value: 'automatic',
            label: t('pjan.styling.automatic', 'Automatic'),
            description: t(
              'pjan.styling.automatic-desc',
              'The first shade of the same hue that is readable on it (4.5:1, large text 3:1)'
            ),
          },
        ];
      case 'shade':
        return shades.map((option) => ({ ...option, group: shadeGroup }));
      case 'state':
        return [{ value: 'state', label: t('pjan.styling.current-state-color', 'Current state color') }];
      case 'value':
        return [
          {
            value: 'value',
            label: t('pjan.styling.value', 'Value'),
            description: t('pjan.styling.value-desc', 'The value’s color (thresholds, value mappings, color scheme)'),
          },
        ];
      case 'text':
        return [{ value: 'text', label: t('pjan.styling.same-as-text', 'Same as text') }];
      case 'none':
        return [{ value: 'none', label: t('pjan.styling.none', 'None') }];
      case 'fixed':
        return [{ value: 'fixed', label: t('pjan.styling.fixed-color', 'Fixed color') }];
    }
  });
}

/** The option value for a choice of the select (undefined: cleared). A fixed colour keeps the colour picked before. */
export function toStylingColor(key: string | undefined, previous: StylingColor | undefined): StylingColor | undefined {
  if (!key) {
    return undefined;
  }
  if (isShade(key)) {
    return { mode: 'shade', shade: key };
  }
  if (key === 'fixed') {
    return { mode: 'fixed', fixedColor: previous?.fixedColor };
  }
  return { mode: key as StylingColorMode };
}

/**
 * The editor of the styling's colour options: a select of the choices (a relative shade, automatic, the current
 * state colour, or a fixed colour), with Grafana's colour picker next to it for a fixed colour. Its placeholder says
 * what an unset option draws; clearing the select unsets the option, so no default value is saved.
 */
export const StylingColorEditor = ({
  value,
  onChange,
  item,
  id,
}: StandardEditorProps<StylingColor | undefined, StylingColorEditorSettings>) => {
  const styles = useStyles2(getStyles);
  const theme = useTheme2();
  const settings = item.settings;
  const selected = value?.mode === 'shade' ? (value.shade ?? null) : (value?.mode ?? null);

  return (
    <div className={styles.group}>
      <Combobox<string>
        id={id}
        options={getStylingColorOptions(settings?.modes ?? [])}
        value={selected}
        placeholder={settings?.placeholder}
        isClearable
        onChange={(option) => onChange(toStylingColor(option?.value, value))}
      />
      {value?.mode === 'fixed' && (
        <ColorPicker
          color={value.fixedColor ?? ''}
          onChange={(fixedColor) => onChange({ mode: 'fixed', fixedColor })}
          enableNamedColors
        >
          {({ ref, showColorPicker, hideColorPicker }) => (
            <button
              ref={ref}
              type="button"
              className={styles.swatch}
              style={{
                background: value.fixedColor ? theme.visualization.getColorByName(value.fixedColor) : undefined,
              }}
              aria-label={t('pjan.styling.choose-color', 'Choose color')}
              onClick={showColorPicker}
              onMouseLeave={hideColorPicker}
            />
          )}
        </ColorPicker>
      )}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  group: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  }),
  swatch: css({
    flexShrink: 0,
    width: theme.spacing(4),
    height: theme.spacing(4),
    padding: 0,
    cursor: 'pointer',
    border: `1px solid ${theme.components.input.borderColor}`,
    borderRadius: theme.shape.radius.default,
    background: theme.components.input.background,
    '&:hover': {
      borderColor: theme.components.input.borderHover,
    },
  }),
});
