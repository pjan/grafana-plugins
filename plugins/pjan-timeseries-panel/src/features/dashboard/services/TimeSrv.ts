// Plugin stand-in for grafana/grafana v13.2.3: public/app/features/dashboard/services/TimeSrv.ts. AGPL-3.0 (derived from code Copyright Grafana Labs).
// The copied actions code only calls `getTimeSrv().timeRange()` to read the dashboard time range (for Infinity
// proxy actions). TimeSrv is not available to plugins; the public template service resolves the same range through
// its built-in `${__from}` / `${__to}` variables (epoch milliseconds).
import { dateTime, type TimeRange } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';

export function getTimeSrv() {
  return {
    timeRange(): TimeRange {
      const templateSrv = getTemplateSrv();
      const from = dateTime(Number(templateSrv.replace('${__from}')));
      const to = dateTime(Number(templateSrv.replace('${__to}')));

      return { from, to, raw: { from, to } };
    },
  };
}
