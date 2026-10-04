// Copied from grafana/grafana v13.2.3: public/app/features/query/state/PanelQueryRunner.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: partial copy (getNextRequestId only; the request id counter is per bundle, so ids restart at Q100 in this plugin).
let counter = 100;

export function getNextRequestId() {
  return 'Q' + counter++;
}
