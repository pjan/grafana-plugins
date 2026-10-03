# @pjan/grafana-styling

Opt-in styling helpers shared by pjan's Grafana panel plugins (State timeline plus and Stat plus). A private npm workspace: plugins depend on it as `"@pjan/grafana-styling": "*"` and bundle its TypeScript source; it is never built or published on its own. Apache-2.0 (`LICENSE`); the plugins that bundle it list it in their `THIRD_PARTY_NOTICES.txt`.

## What it holds

| File                            | What it does                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/stylingColor.ts`           | The colour-option model: `{ mode, shade?, fixedColor? }`, like Grafana's field colour, and `getStylingColor` (a complete option of an allowed mode, or unset)                                     |
| `src/shades.ts`                 | The five shades of a hue (`super-light-*` … `dark-*`) ranked by contrast with the panel background in the active theme: softer, soft, base, strong, stronger                                      |
| `src/colorNames.ts`             | The Grafana colour name behind a field's display colours (mappings, thresholds, fixed colour, booleans, classic palette)                                                                          |
| `src/canvasColors.ts`           | Colours as drawn (`rgb()` without spaces), contrast ratios, the minimum text contrast for a size and weight (`getMinTextContrast`, WCAG 2 AA), and Automatic text (`getAutomaticText`, below)     |
| `src/StylingColorEditor.tsx`    | The colour options' editor: a clearable `Combobox` of the allowed modes, with Grafana's `ColorPicker` for a fixed colour                                                                          |
| `src/ClearableSliderEditor.tsx` | A slider that can be cleared (Grafana's `addSliderInput` always holds a number)                                                                                                                   |
| `src/testdata/`                 | Test helpers: Grafana's stock themes and the Atlas theme (`testdata/atlas-theme.json` is a copy of the Atlas theme plugin's file, atlas-theme-app 4.0.1), fields with Grafana's display processor |

Everything is exported from `src/index.ts`. Plugins' tests may import `@pjan/grafana-styling/src/testdata/themes`.

## Colour rules for every plugin

These hold in every plus plugin (pjan, 2026-10-03):

- **Explicit colours are drawn as chosen.** A Fixed colour or a shade is never replaced for contrast. Fixed (Grafana's colour picker, named colours included) is the free choice: every colour option can be set on its own, with no restriction.
- **Automatic text** (the `automatic` mode, and the text a plugin draws when its text colour is unset and it owns that default) is `getAutomaticText`:
  - it starts from the colour the text is drawn on (or another start colour: a row's state colour for State timeline plus row names, the value's colour for Stat plus text without a background) and mixes it in 1 % steps towards the theme's two extremes, its page colour (`colors.background.canvas`) and `colors.text.maxContrast`;
  - the first colour that reaches the minimum contrast wins, on whichever side gets there first: 4.5:1 for normal text, 3:1 for large text (`getMinTextContrast`: at least 24 px, or 18.66 px at weight 700);
  - when no colour reaches 4.5:1, text that needs it falls back to 4.2:1 (`FALLBACK_TEXT_CONTRAST`); when even that fails, the extreme with the higher contrast.
- **A shade of a colour without a name** (hex, continuous schemes, a palette of hex colours) can't be resolved: fills and lines fall back to the colour itself, text to Automatic.
- Core's own colour modes are never changed: with nothing set, a plugin draws as Grafana does.

## Rules

- Only what more than one plugin needs, and only public `@grafana/*` APIs (`peerDependencies`; the plugin provides them).
- Plugin-authored code: no code copied from grafana/grafana. Grafana code conventions (TypeScript, function components, `useStyles2`, tests next to the code).

## Checks

The root scripts include this workspace: `npm run typecheck`, `npm run lint`, `npm test` (or `-w packages/grafana-styling`). A plugin's own `tsc` does not report errors inside this package, so its `typecheck` here is the one that counts.
