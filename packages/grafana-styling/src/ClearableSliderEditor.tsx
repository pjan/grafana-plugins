import { css } from '@emotion/css';

import { type GrafanaTheme2, type StandardEditorProps } from '@grafana/data';
import { t } from '@grafana/i18n';
import { IconButton, Slider, useStyles2 } from '@grafana/ui';

export interface ClearableSliderSettings {
  min: number;
  max: number;
  step: number;
  /**
   * Where the slider shows an unset option: what the panel draws then (`min` if not given). While unset, choosing this
   * value saves nothing (it is what unset draws).
   */
  unsetValue?: number;
}

/**
 * A slider that can be cleared. Grafana's slider editor (`addSliderInput`) always holds a number, so an option set
 * with it can't go back to unset; this one has a clear button that unsets it, so no value needs to be saved.
 */
export const ClearableSliderEditor = ({
  value,
  onChange,
  item,
}: StandardEditorProps<number | undefined, ClearableSliderSettings>) => {
  const styles = useStyles2(getStyles);
  const { min = 0, max = 100, step = 1, unsetValue = min } = item.settings ?? {};
  return (
    <div className={styles.group}>
      <div className={styles.slider}>
        <Slider
          min={min}
          max={max}
          step={step}
          value={value ?? unsetValue}
          onChange={(v) => {
            // Grafana's Slider reports its value again when its text input loses focus: tabbing through an unset
            // slider would save the value it only shows. Only a different value sets the option.
            if (value === undefined && v === unsetValue) {
              return;
            }
            onChange(v);
          }}
          ariaLabelForHandle={item.name}
          marks={{ [min]: min, [max]: max }}
        />
      </div>
      {value !== undefined && (
        <IconButton
          name="times"
          tooltip={t('pjan.styling.clear-value', 'Clear value')}
          onClick={() => onChange(undefined)}
        />
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
  slider: css({
    flexGrow: 1,
  }),
});
