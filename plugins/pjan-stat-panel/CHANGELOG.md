# Changelog

## 1.0.0 (unreleased)

- Port of Grafana's core stat panel from grafana/grafana v13.2.3 (with the `BigValue` tile renderer of `@grafana/ui`), as a drop-in replacement: same options, defaults, presets, migrations, rendering and interaction, checked pixel by pixel against the core panel in the light and the dark theme, after a live theme switch, and at pixel ratio 1 and 2. Panel suggestions are left off. Switching a core Stat panel to **Stat ++** in the panel editor keeps every option and the colour scheme. See `UPSTREAM.md` for what was copied, changed, and left off.
