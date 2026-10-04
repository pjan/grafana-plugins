# Changelog

## 1.0.0 (unreleased)

- Port of Grafana's core time series panel from grafana/grafana v13.2.3, meant as a drop-in replacement: same options, defaults, presets, migrations, rendering and interaction. The end-to-end suite compares it with the core panel (canvas bytes, every element and attribute, screenshots) in the light and the dark theme, after a live theme switch, and at pixel ratio 1 and 2; what has passed is recorded in `UPSTREAM.md` ("Test runs"). Panel suggestions are left off; long data shows core's message, and in the panel editor its actions without "Transform to wide time series format"; the Grafana Assistant tooltip button is pruned. Switching a core Time series panel to **Time series plus** in the panel editor keeps every option, the field config, the overrides and the colour scheme. See `UPSTREAM.md` for what was copied, changed, and left off.
- Scaffolded with `@grafana/create-plugin` 7.11.0 and set up as a workspace of this repository, with the build, test and licence configuration of the other plus plugins.
