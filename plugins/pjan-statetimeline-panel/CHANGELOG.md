# Changelog

## 1.0.0 (unreleased)

- Per-row annotations (opt-in, off by default): "Show on matching rows" in the Annotations options draws an annotation on the timeline row whose key (display name, a label, or the per-row "Annotation key" override) matches an annotation field (`tags` when not set). Points get a marker at the top of the row and a dashed line over the row, regions a bar along it; clustering works per row; Ctrl/Cmd-click on a row adds an annotation tagged with the row key. Annotations of rows not drawn (other pages, hidden rows) are left out. Unmatched annotations, and all of them with the option off, are drawn as in the core panel; a panel that doesn't use the option saves no setting for it.
- Port of Grafana's core state-timeline panel from grafana/grafana v13.2.3, as a drop-in replacement: same options, defaults, migrations, rendering, and interaction. See `UPSTREAM.md` for what was copied, changed, and pruned.
