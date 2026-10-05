import { expect, test } from '@grafana/plugin-e2e';

import { casesOf, compareCase, open, readDashboard, THEMES } from './parity';

// Table plus with nothing set looks exactly like core's table: every case of the generated parity dashboards, in four
// theme states and at pixel ratio 1 and 2 (see tests/parity.ts for what is compared and how). Run with --workers=1.
const DASHBOARDS = [readDashboard('parity.json'), readDashboard('parity-swapped.json')] as const;
const cases = casesOf(DASHBOARDS);
// PARITY_KEEP_IDS=1: compare generated ids as they are (the negative control of the id mapping, UPSTREAM.md "Tests")
const normaliseIds = !process.env.PARITY_KEEP_IDS;

// One test per theme and pixel ratio (each loads the two dashboards once), one step per case.
for (const scale of [1, 2]) {
  for (const theme of THEMES) {
    test.describe(`parity with core table (${theme.name}, pixel ratio ${scale})`, () => {
      test.use({ deviceScaleFactor: scale, viewport: { width: 1280, height: 900 } });

      test(`${cases.length} cases, each panel compared with the other dashboard's at its position`, async ({
        page,
        context,
      }) => {
        test.setTimeout(60 * 60_000);
        const pages = [page, await context.newPage()];
        for (let d = 0; d < pages.length; d++) {
          await open(pages[d], DASHBOARDS[d].uid, cases, d, theme);
        }

        for (const c of cases) {
          await test.step(c.title, async () => {
            expect.soft(await compareCase(pages, c, normaliseIds), c.title).toBe('identical');
          });
        }
      });
    });
  }
}
