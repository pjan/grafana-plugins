// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/timeseries/plugins/annotations/AnnotationAlertState.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports only.
import { css } from '@emotion/css';

import { type GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import alertDef from 'features/alerting/state/alertDef';

interface Props {
  alertState: string | undefined;
}

export const AnnotationAlertState = ({ alertState }: Props) => {
  const styles = useStyles2(getStyles);
  if (!alertState) {
    return null;
  }

  const stateModel = alertDef.getStateDisplayModel(alertState);
  return (
    <div className={styles.alertState}>
      <i className={stateModel.stateClass}>{stateModel.text}</i>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  alertState: css({
    paddingRight: theme.spacing(1),
    fontWeight: theme.typography.fontWeightMedium,
  }),
});
