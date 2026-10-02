# @pjan/grafana-styling

Opt-in styling helpers shared by pjan's Grafana panel plugins (State timeline ++ and Stat ++). A private npm workspace: plugins depend on it as `"@pjan/grafana-styling": "*"` and bundle its TypeScript source; it is never built or published on its own. Apache-2.0 (`LICENSE`); the plugins that bundle it list it in their `THIRD_PARTY_NOTICES.txt`.

## What it holds

| File                            | What it does                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/stylingColor.ts`           | The colour-option model: `{ mode, shade?, fixedColor? }`, like Grafana's field colour, and `getStylingColor` (a complete option of an allowed mode, or unset)                                                            |
| `src/shades.ts`                 | The five shades of a hue (`super-light-*` … `dark-*`) ranked by contrast with the panel background in the active theme: softer, soft, base, strong, stronger                                                             |
| `src/colorNames.ts`             | The Grafana colour name behind a field's display colours (mappings, thresholds, fixed colour, booleans, classic palette)                                                                                                 |
| `src/canvasColors.ts`           | Colours as drawn (`rgb()` without spaces), contrast ratios, the minimum text contrast for a size and weight (`getMinTextContrast`, WCAG 2 AA), the text guard, best-contrast text (black and white, or given candidates) |
| `src/StylingColorEditor.tsx`    | The colour options' editor: a clearable `Combobox` of the allowed modes, with Grafana's `ColorPicker` for a fixed colour                                                                                                 |
| `src/ClearableSliderEditor.tsx` | A slider that can be cleared (Grafana's `addSliderInput` always holds a number)                                                                                                                                          |
| `src/testdata/`                 | Test helpers: Grafana's stock themes and the Atlas theme (`testdata/atlas-theme.json` is a copy of the Atlas theme plugin's file, atlas-theme-app 3.0.2), fields with Grafana's display processor                        |

Everything is exported from `src/index.ts`. Plugins' tests may import `@pjan/grafana-styling/src/testdata/themes`.

## Rules

- Only what more than one plugin needs, and only public `@grafana/*` APIs (`peerDependencies`; the plugin provides them).
- Plugin-authored code: no code copied from grafana/grafana. Grafana code conventions (TypeScript, function components, `useStyles2`, tests next to the code).

## Checks

The root scripts include this workspace: `npm run typecheck`, `npm run lint`, `npm test` (or `-w packages/grafana-styling`). A plugin's own `tsc` does not report errors inside this package, so its `typecheck` here is the one that counts.
