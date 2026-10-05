import { css } from '@emotion/css';

import { useRef } from 'react';

import { type GrafanaTheme2, type StandardEditorProps } from '@grafana/data';
import { t } from '@grafana/i18n';
import { IconButton, Slider, useStyles2 } from '@grafana/ui';

export interface ClearableSliderSettings {
  min: number;
  max: number;
  step: number;
  /**
   * Where the slider shows an unset option: what the panel draws then (`min` if not given). While unset, choosing this
   * value saves nothing (it is what unset draws), unless `unsetIsExact` is false.
   */
  unsetValue?: number;
  /**
   * Whether unset draws exactly `unsetValue` (default true). False when unset only looks like it here: it follows
   * something else (a colour's own opacity) or differs per screen (a width in device pixels), so the value it shows
   * is a value of its own. Then picking it (typing it, or clicking or dragging the slider onto it) saves it; only
   * leaving the unset slider's text box, which Grafana's Slider reports as a change, still saves nothing.
   */
  unsetIsExact?: boolean;
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
  const { min = 0, max = 100, step = 1, unsetValue = min, unsetIsExact = true } = item.settings ?? {};
  // While the text box loses focus (between the capture and the bubble phase of its blur event on this group)
  const leaving = useRef(false);
  return (
    <div className={styles.group}>
      <div
        className={styles.slider}
        onBlurCapture={unsetIsExact ? undefined : () => (leaving.current = true)}
        onBlur={unsetIsExact ? undefined : () => (leaving.current = false)}
      >
        <Slider
          min={min}
          max={max}
          step={step}
          value={value ?? unsetValue}
          onChange={(v) => {
            // Grafana's Slider reports its value again when its text input loses focus: tabbing through an unset
            // slider would save the value it only shows. Only a different value sets the option (with
            // `unsetIsExact: false`, any value but the one reported on leaving the text box).
            if (value === undefined && (unsetIsExact ? v === unsetValue : leaving.current)) {
              return;
            }
            onChange(v);
          }}
          // A click or a drag that ends on the value already shown changes nothing, so the Slider reports no change;
          // with `unsetIsExact: false` the end of it picks that value.
          onAfterChange={
            unsetIsExact
              ? undefined
              : (v) => {
                  if (value === undefined && !leaving.current && v !== undefined) {
                    onChange(v);
                  }
                }
          }
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
