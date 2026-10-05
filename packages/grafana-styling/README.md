# @pjan/grafana-styling

Opt-in styling helpers shared by pjan's Grafana panel plugins (State timeline plus, Stat plus and Time series plus). A private npm workspace: plugins depend on it as `"@pjan/grafana-styling": "*"` and bundle its TypeScript source; it is never built or published on its own. Apache-2.0 (`LICENSE`); the plugins that bundle it list it in their `THIRD_PARTY_NOTICES.txt`.

## What it holds

| File                            | What it does                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/stylingColor.ts`           | The colour-option model: `{ mode, shade?, fixedColor? }`, like Grafana's field colour, and `getStylingColor` (a complete option of an allowed mode, or unset)                                                                                                                                          |
| `src/shades.ts`                 | The five shades of a hue (`super-light-*` … `dark-*`) ranked by contrast with the panel background in the active theme: softer, soft, base, strong, stronger; the nearest theme hue of a colour without a name (`getNearestHue`, `getShadeColor`)                                                      |
| `src/colorNames.ts`             | The Grafana colour name behind a field's display colours (mappings, thresholds, fixed colour, booleans, classic palette)                                                                                                                                                                               |
| `src/canvasColors.ts`           | Colours as drawn (`rgb()` without spaces), contrast ratios, the minimum text contrast for a size and weight (`getMinTextContrast`, WCAG 2 AA), and Automatic text (`getAutomaticText`, below)                                                                                                          |
| `src/StylingColorEditor.tsx`    | The colour options' editor: a clearable `Combobox` of the allowed modes, with Grafana's `ColorPicker` for a fixed colour                                                                                                                                                                               |
| `src/ClearableSliderEditor.tsx` | A slider that can be cleared (Grafana's `addSliderInput` always holds a number)                                                                                                                                                                                                                        |
| `src/testdata/`                 | Test helpers: Grafana's stock themes and the Atlas theme (`testdata/atlas-theme.json` is a copy of the Atlas theme plugin's file, unchanged since atlas-theme-app 4.0.1; `atlasTheme.ts` builds the theme as its 4.1.0 `module.js` does, extra hues included), fields with Grafana's display processor |

Everything is exported from `src/index.ts`. Plugins' tests may import `@pjan/grafana-styling/src/testdata/themes`.

## Colour rules for every plugin

These hold in every plus plugin (pjan, 2026-10-03):

- **Explicit colours are drawn as chosen.** A Fixed colour or a shade is never replaced for contrast. Fixed (Grafana's colour picker, named colours included) is the free choice: every colour option can be set on its own, with no restriction.
- **Automatic text** (the `automatic` mode, and the text a plugin draws when its text colour is unset and it owns that default) is `getAutomaticText`:
  - it starts from the colour the text is drawn on (or another start colour: a row's state colour for State timeline plus row names, the value's colour for Stat plus text without a background) and mixes it in 1 % steps towards the theme's two extremes, its page colour (`colors.background.canvas`) and `colors.text.maxContrast`;
  - the first colour that reaches the minimum contrast wins, on whichever side gets there first: 4.5:1 for normal text, 3:1 for large text (`getMinTextContrast`: at least 24 px, or 18.66 px at weight 700);
  - when no colour reaches 4.5:1, text that needs it falls back to 4.2:1 (`FALLBACK_TEXT_CONTRAST`); when even that fails, the extreme with the higher contrast.
- **Shades** are the five named shades of a hue, ranked by contrast with the panel background (`rankHue`): softer, soft, base, strong, stronger. A colour with a Grafana name (a hue's shade name the theme ranks) takes its name's hue. **A colour without a name** (hex, rgb(), continuous schemes, a palette of hex colours, a CSS name such as `lime` in a theme without that hue) takes the named shades of its nearest theme hue (pjan, 2026-10-03), so it matches the other plugins and the colour picker; "base" is the hue's base name, not the colour (a lime 600 series gets lime 400 in Atlas light). The rule (`getNearestHue`), in OKLCH, over the theme's hues (`theme.visualization.hues`):
  - hues whose shades all have a chroma below 0.04 are gray hues, and shades below 0.04 don't take part in hue matching (nor do hues without a readable shade);
  - a colour below 0.04 takes the theme's (first) gray hue, or none when the theme has no gray hue (Grafana's stock themes);
  - otherwise the hue whose nearest shade is within 15° of the colour's hue angle wins, if the second-nearest hue is at least 5° further away;
  - a colour no hue wins keeps its colour: fills and lines fall back to the colour itself, text to Automatic. So do Grafana's special names `transparent`, `text` and `panel-bg`.
  - Alpha is ignored: a translucent colour takes the hue of its channels, and a fully transparent colour without a name (`rgba(0,0,0,0)`) reads as black, so it takes the gray hue where there is one.
  - In numbers (from a separate implementation of the rule, the tests' oracle): all 21 Atlas palette colours take their own hue family in both modes; of the 46 hex colours of Grafana's classic palette, 28 (light) and 24 (dark) get a hue.
- Core's own colour modes are never changed: with nothing set, a plugin draws as Grafana does.

## Rules

- Only what more than one plugin needs, and only public `@grafana/*` APIs (`peerDependencies`; the plugin provides them).
- Plugin-authored code: no code copied from grafana/grafana. Grafana code conventions (TypeScript, function components, `useStyles2`, tests next to the code).

## Checks

The root scripts include this workspace: `npm run typecheck`, `npm run lint`, `npm test` (or `-w packages/grafana-styling`). A plugin's own `tsc` does not report errors inside this package, so its `typecheck` here is the one that counts.
