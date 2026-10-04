// Plugin stand-in for grafana/grafana v13.2.3: public/app/features/dashboard/services/DashboardSrv.ts. AGPL-3.0 (derived from code Copyright Grafana Labs).
// The copied suggestions.ts only calls `getDashboardSrv().getCurrent()?.getPanelById(panelId)`, to offer the "Transform
// to wide time series format" button on long data. Core's DashboardSrv (the current DashboardModel) is not available
// to plugins, so there is never a current dashboard: the panel shows core's message for long data without the button
// (plan decision 5).
import { type DataTransformerConfig } from '@grafana/data';

interface CurrentDashboard {
  getPanelById(id: number): { transformations?: DataTransformerConfig[] } | null;
}

export function getDashboardSrv() {
  return {
    getCurrent(): CurrentDashboard | undefined {
      return undefined;
    },
  };
}
