import { expect, test, type Page } from '@grafana/plugin-e2e';

import { CORE, drawn, panelContent, panelOf, PLUGIN, readDashboard } from './parity';

// A few values computed by hand, so the end-to-end tests don't only check the plugin against core (its own oracle):
// both panels must draw them. Computed in plain arithmetic, replicating Grafana 13.2.3's rules (UPSTREAM.md, "Tests"):
// - text on a coloured background (getTextColorForAlphaBackground, packages/grafana-ui/src/utils/colors.ts): tinycolor
//   brightness (299 R + 587 G + 114 B) / 1000 above 180 gives rgb(32, 34, 38), else rgb(247, 248, 250).
//   #fade2a: (299 * 250 + 587 * 222 + 114 * 42) / 1000 = 209.852 > 180, dark text; WCAG 2 contrast 11.79:1.
//   #1f60c4: (299 * 31 + 587 * 96 + 114 * 196) / 1000 = 87.965, light text; contrast 5.60:1.
// - the gradient (TableNG/utils.ts getCellColorInlineStylesFactory): linear-gradient(120deg, <start>, <colour>), the
//   start being tinycolor(colour).darken(10 * f).spin(5), f = 1 in dark mode and -0.7 in light mode (so lightened by
//   7 %). #1f60c4 is hsl(216.4°, 72.7 %, 44.5 %): dark: l 34.5 %, h 221.4° = rgb(24, 64, 152); light: l 51.5 %,
//   h 221.4° = rgb(41, 97, 221). #fade2a, hsl(51.9°, 95.4 %, 57.3 %): dark rgb(235, 224, 6), light rgb(251, 242, 77).
// - the footer: 10 + 20 + 30 + 41 = 101 ms; the mean 101 / 4 = 25.25 ms.
const PARITY = readDashboard('parity.json');

const FILLS = 'colours: hex fills, basic and gradient (hand-computed values)';
const FOOTER = 'footer: sum and mean of a known column (hand-computed values)';

const EXPECTED = {
  // value 20 (#fade2a) and 80 (#1f60c4)
  basic: {
    20: { background: 'rgb(250, 222, 42)', color: 'rgb(32, 34, 38)', contrast: 11.79 },
    80: { background: 'rgb(31, 96, 196)', color: 'rgb(247, 248, 250)', contrast: 5.6 },
  },
  gradient: {
    dark: {
      20: 'linear-gradient(120deg, rgb(235, 224, 6), rgb(250, 222, 42))',
      80: 'linear-gradient(120deg, rgb(24, 64, 152), rgb(31, 96, 196))',
    },
    light: {
      20: 'linear-gradient(120deg, rgb(251, 242, 77), rgb(250, 222, 42))',
      80: 'linear-gradient(120deg, rgb(41, 97, 221), rgb(31, 96, 196))',
    },
  },
};

// WCAG 2 contrast of two rgb() colours
const contrast = (a: string, b: string) => {
  const luminance = (rgb: string) => {
    const [r, g, bl] = rgb
      .match(/\d+/g)!
      .slice(0, 3)
      .map((c) => {
        const v = Number(c) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

/** The inline styles of the cells of a column, by their text. */
const cellStyles = (page: Page, id: number, column: number) =>
  panelContent(page, id).evaluate(
    (root, col) =>
      Array.from(root.querySelectorAll('[role="row"]'))
        .map((row) => row.querySelectorAll<HTMLElement>('[role="gridcell"]')[col])
        .filter(Boolean)
        .map((cell) => ({
          text: cell.innerText.trim(),
          background: cell.style.background,
          color: cell.style.color,
          computedBackground: getComputedStyle(cell).backgroundColor,
        })),
    column
  );

for (const theme of ['light', 'dark'] as const) {
  test(`hand-computed cell colours and gradients (${theme})`, async ({ page }) => {
    await page.goto(`/d/${PARITY.uid}?orgId=1&theme=${theme}`);
    for (const type of [CORE, PLUGIN]) {
      const { id } = panelOf(PARITY, FILLS, type);
      await drawn(page, id);
      const basic = await cellStyles(page, id, 1);
      const gradient = await cellStyles(page, id, 2);
      for (const value of [20, 80] as const) {
        const cell = basic.find((c) => c.text === String(value))!;
        const expected = EXPECTED.basic[value];
        expect(cell.computedBackground, `${type} basic ${value}`).toBe(expected.background);
        expect(cell.color, `${type} basic ${value}`).toBe(expected.color);
        expect(contrast(cell.computedBackground, cell.color)).toBe(expected.contrast);
        const gradientCell = gradient.find((c) => c.text === String(value))!;
        expect(gradientCell.background, `${type} gradient ${value}`).toContain(EXPECTED.gradient[theme][value]);
        expect(gradientCell.color).toBe(expected.color);
      }
    }
  });
}

test('hand-computed footer: sum and mean with the unit', async ({ page }) => {
  await page.goto(`/d/${PARITY.uid}?orgId=1`);
  for (const type of [CORE, PLUGIN]) {
    const { id } = panelOf(PARITY, FOOTER, type);
    await drawn(page, id);
    const footer = panelContent(page, id).getByTestId('data-testid tableng footer value');
    await expect(footer).toHaveText(['101 ms', '25.3 ms']);
    await expect(panelContent(page, id).getByTestId('data-testid tableng footer reducer-label')).toHaveText([
      'Total',
      'Mean',
    ]);
  }
});
