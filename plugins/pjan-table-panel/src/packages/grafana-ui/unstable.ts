// Plugin stand-in for `@grafana/ui/unstable` (grafana/grafana v13.2.3: packages/grafana-ui/src/unstable.ts).
// Grafana shares `@grafana/ui/unstable` with plugins at runtime, but declares it not for plugins, and importing it would
// render Grafana's own TableNG instead of this plugin's copy (UPSTREAM.md, "Import rewrites"). The copied panel imports
// this module instead: only the name it uses, from the copy.
export { TableNG } from './src/components/Table/TableNG/TableNG';
