// Plugin stand-in for grafana/grafana v13.2.3: public/app/core/components/OptionsUI/registry.tsx. Tests only.
// The ported module and SparklineCellOptionsEditor tests initialise Grafana's option editor registry with core's
// `getAllOptionEditors`, which Grafana provides at runtime. This re-exports the plugin's test helper with the same ids
// (src/pjan/testdata/editorRegistry.tsx; UPSTREAM.md, "Tests").
export { getAllOptionEditors } from '../../../pjan/testdata/editorRegistry';
