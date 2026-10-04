import { type APIRequestContext, type Page } from '@grafana/plugin-e2e';

export interface SavedPanel {
  type: string;
  pluginVersion?: string;
  options: Record<string, unknown>;
  fieldConfig: {
    defaults: Record<string, unknown> & { custom?: Record<string, unknown> };
    overrides: Array<{ matcher: unknown; properties: Array<{ id: string; value: unknown }> }>;
  };
}

// A panel of the open dashboard's save model, as Grafana writes it (classic or v2), by panel id; or the only panel.
// (Stat plus's helper.)
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

// An API client logged in as the e2e admin, for creating and deleting the dashboards and annotations a test needs.
export const apiClient = async (
  playwright: { request: { newContext: (options: object) => Promise<APIRequestContext> } },
  { user, password }: { user?: string; password?: string }
) =>
  playwright.request.newContext({
    baseURL: process.env.GRAFANA_URL || 'http://localhost:3000',
    extraHTTPHeaders: { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` },
  });
