import { expect, test } from '@grafana/plugin-e2e';

import { casesOf, compareCase, openDashboard, readDashboard, THEMES } from './parity';

// Every case of provisioning/dashboards/parity.json against parity-swapped.json, in four theme states at pixel ratio 1
// and 2 (see tests/parity.ts for what is compared). The annotation cases are in tests/parityAnnotations.spec.ts.
const DASHBOARDS = [readDashboard('parity.json'), readDashboard('parity-swapped.json')] as const;
const cases = casesOf(DASHBOARDS);

// One test per theme and pixel ratio (each loads the two dashboards once), one step per case.
for (const scale of [1, 2]) {
  for (const theme of THEMES) {
    test.describe(`parity with core time series (${theme.name}, pixel ratio ${scale})`, () => {
      test.use({ deviceScaleFactor: scale });

      test(`${cases.length} cases, each panel compared with the other dashboard's at its position`, async ({
        page,
        context,
      }) => {
        // 97 cases on two pages: about 9 minutes alone on a quiet machine, over an hour with four running on a loaded one
        test.setTimeout(2 * 60 * 60_000);
        const pages = [page, await context.newPage()];
        for (let d = 0; d < pages.length; d++) {
          await openDashboard(pages[d], DASHBOARDS[d].uid, cases, d, theme);
        }

        for (const c of cases) {
          await test.step(c.title, async () => {
            expect.soft(await compareCase(pages, c), c.title).toBe('identical');
          });
        }
      });
    });
  }
}
