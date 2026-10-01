import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@grafana/plugin-e2e';

// provisioning/dashboards/parity.json (from scripts/generate-parity-dashboard.mjs) has one row per case: the core
// state timeline on the left and this plugin on the right, with the same query, field config and options.
// Each test checks that both panels draw exactly the same canvas pixels, in the light and the dark theme.
const DASHBOARD = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../provisioning/dashboards/parity.json'), 'utf8')
) as { uid: string; panels: Array<{ type: string; title: string }> };

const CORE = 'state-timeline';
const PLUGIN = 'pjan-statetimeline-panel';
const cases = DASHBOARD.panels
  .filter((panel) => panel.type === CORE)
  .map((panel) => panel.title.slice(0, -` [${CORE}]`.length));

// Both canvases must be at least this much painted, so that two charts without boxes (for example while the data is
// still loading, or with an invalid time range) cannot pass as identical.
const MIN_PAINTED = 0.05;

// Width, height, and a hash of the RGBA bytes (comparing the full byte arrays is too slow for the large cases).
const canvasFingerprint = (canvas: HTMLCanvasElement) => {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 0x811c9dc5;
  let painted = 0;
  for (let i = 0; i < data.length; i++) {
    hash = Math.imul(hash ^ data[i], 0x01000193);
    if (i % 4 === 3 && data[i] !== 0) {
      painted++;
    }
  }
  return { width: canvas.width, height: canvas.height, painted, hash: hash >>> 0 };
};

for (const theme of ['light', 'dark']) {
  test.describe(`parity with the core state timeline (${theme} theme)`, () => {
    for (const name of cases) {
      test(name, async ({ gotoDashboardPage }) => {
        const dashboardPage = await gotoDashboardPage({
          uid: DASHBOARD.uid,
          queryParams: new URLSearchParams({ theme }),
        });
        const canvasOf = async (type: string) => {
          const panel = dashboardPage.getPanelByTitle(`${name} [${type}]`).locator;
          // Panels below the fold only render once scrolled into view.
          await panel.scrollIntoViewIfNeeded();
          const canvas = panel.locator('canvas').first();
          await expect(canvas).toBeVisible();
          return canvas;
        };
        const core = await canvasOf(CORE);
        const plugin = await canvasOf(PLUGIN);

        // Poll until both panels have drawn (data arrives asynchronously) and their pixels match.
        await expect
          .poll(
            async () => {
              const [a, b] = [await core.evaluate(canvasFingerprint), await plugin.evaluate(canvasFingerprint)];
              const drawn = a.painted >= MIN_PAINTED * a.width * a.height;
              return drawn && JSON.stringify(a) === JSON.stringify(b) ? 'identical' : { core: a, plugin: b };
            },
            { timeout: 15_000 }
          )
          .toBe('identical');
      });
    }
  });
}
