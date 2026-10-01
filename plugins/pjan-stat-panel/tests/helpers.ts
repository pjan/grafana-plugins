import { type Page } from '@grafana/plugin-e2e';

export const CORE = 'stat';
export const PLUGIN = 'pjan-stat-panel';

// The content of a panel (what the panel plugin renders), by panel id
export const panelContent = (page: Page, id: number | string) =>
  page.locator(`[data-viz-panel-key="panel-${id}"] [data-testid="data-testid panel content"]`);

export interface SavedPanel {
  type: string;
  pluginVersion?: string;
  options: Record<string, unknown>;
  fieldConfig: { defaults: Record<string, unknown>; overrides: unknown[] };
}

// A panel of the open dashboard's save model, as Grafana writes it (classic or v2), by panel id; or the only panel.
export const savedPanel = (page: Page, id?: number) =>
  page.evaluate((panelId) => {
    type Scene = { getSaveModel?: () => Record<string, unknown> };
    const scene = (window as unknown as { __grafanaSceneContext?: Scene }).__grafanaSceneContext;
    if (!scene?.getSaveModel) {
      return undefined;
    }
    const model = scene.getSaveModel() as {
      panels?: Array<{ id: number; type: string; pluginVersion?: string; options: object; fieldConfig: object }>;
      elements?: Record<
        string,
        {
          spec: {
            id: number;
            vizConfig: { group: string; version?: string; spec: { options: object; fieldConfig: object } };
          };
        }
      >;
    };
    const v1 = model.panels?.find((p) => panelId === null || p.id === panelId);
    if (v1) {
      const { type, pluginVersion, options, fieldConfig } = v1;
      return JSON.parse(JSON.stringify({ type, pluginVersion, options, fieldConfig }));
    }
    const v2 = Object.values(model.elements ?? {}).find((e) => panelId === null || e.spec.id === panelId);
    return v2
      ? JSON.parse(
          JSON.stringify({
            type: v2.spec.vizConfig.group,
            pluginVersion: v2.spec.vizConfig.version,
            ...v2.spec.vizConfig.spec,
          })
        )
      : undefined;
  }, id ?? null) as Promise<SavedPanel | undefined>;
