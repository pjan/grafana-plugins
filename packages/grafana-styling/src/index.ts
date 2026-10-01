// Opt-in styling helpers shared by pjan's Grafana panel plugins (README.md).
export { getStylingColor, type StylingColor, type StylingColorMode } from './stylingColor';
export {
  getHueOfColorName,
  getRelativeShadeColor,
  getSoftestReadableShadeColor,
  rankHue,
  RELATIVE_SHADES,
  type RankedHue,
  type RelativeShade,
} from './shades';
export { getCandidateColorNames, getColorNameLookup } from './colorNames';
export {
  getBestContrastText,
  getReadableText,
  getTextContrast,
  MIN_TEXT_CONTRAST,
  toCanvasColor,
  toFillColor,
} from './canvasColors';
export { ClearableSliderEditor, type ClearableSliderSettings } from './ClearableSliderEditor';
export {
  getStylingColorOptions,
  StylingColorEditor,
  type StylingColorEditorSettings,
  toStylingColor,
} from './StylingColorEditor';
