# State timeline (pjan)

Grafana's state timeline, as a separate panel plugin. With nothing configured, it looks and behaves like the core **State timeline** panel of Grafana 13.2.3: same options, defaults, rendering, tooltip, legend, annotations, shared crosshair, and drag to zoom. It starts from Grafana's own code. Additions are opt-in (off by default): this version has one, [annotations on matching rows](#annotations-on-matching-rows).

## Using it

- **Convert an existing state timeline:** change the panel's `type` from `state-timeline` to `pjan-statetimeline-panel` in the dashboard JSON (lossless), or pick **State timeline (pjan)** in the panel editor (options, field config and overrides carry over).
- **Go back:** change `type` back to `state-timeline`.
- **Annotations:** shown as in the core panel. Users who may add annotations can Ctrl/Cmd-click or Ctrl/Cmd-drag on empty plot space to add one, and edit or delete it from its tooltip.

## Annotations on matching rows

Draws an annotation on the timeline row it belongs to (a deploy on the `web` row) instead of across all rows. The events are the dashboard's annotations: any annotation query, with its colour and its "Show in" panel filter. Off by default.

- **Options** (panel options, group **Annotations**, after core's options; shown once the panel has annotations):
  - **Show on matching rows**: turns it on.
  - **Annotation field**: the annotation field compared with the rows, `tags` when not set. Lists the fields the panel's annotations have, such as `tags`, `title`, `text`, `type` (the annotation query's name), or a field added by a transformation.
  - **Row key**: what each row is matched by: its **Display name** (as on the y axis; used when not set) or the value of one of its **Label**s (pick the label name). A row without the label has no key and matches nothing.
  - **Annotation key** (field override, group Annotations): replaces the row key of the rows the override applies to, for rows whose name differs from the annotations' value. Add it with an override such as "Fields with name".
- **Matching:** an annotation matches a row when its field equals the row's key. For a list field such as `tags`, any value of the list can match. An annotation that matches several rows is drawn on each of them; one that matches no row is drawn as before, full height (or in its multi-row lane, and clustered, as the core options say).
  - **Rows not drawn:** with pagination ("Page size"), an annotation that matches a row on another page is not drawn on the current page at all (not full height either); it shows on its row's page. The same holds for a row hidden with "Hide in area" (`hideFrom.viz`).
  - **Multi-row lanes:** with "Enable multi-row annotations", each annotation query keeps its lane below the plot even when all its annotations are on rows, so that lane can be empty.
- **On a row:** a point annotation is a marker at the top of the row, pointing down, with a dashed line over that row only; a region is a bar along the top of the row, with dashed lines at its start and end. Markers have Grafana's annotation tooltip (edit, delete). "Enable annotation clustering" clusters close annotations per row, and "Hide lines and areas" hides the lines.
  - **Pinned tooltips:** clicking a marker pins its tooltip, and any click elsewhere unpins it, so one tooltip is pinned at a time. While one is pinned, hovering a marker of the other kind (a row marker while a full-height one is pinned, or the other way round) can still open a second, unpinned tooltip.
- **Adding an annotation on a row:** with **Annotation field** `tags` (or not set), Ctrl/Cmd-click on empty plot space of the row, Ctrl/Cmd-drag from it (the row where the drag starts counts), or "Add annotation" in the tooltip of a value on the row opens the annotation editor with the row's key as a tag; the saved annotation then shows on that row. A click between rows, on a row without a key, or with another annotation field adds core's untagged, full-height annotation. Changing the page or the rows while the editor is open cancels it.
- **Prometheus:** the annotation query puts the values of its **Tag keys** labels into `tags` (for tag keys `job`, an annotation for `job="web"` gets the tag `web`), so a row whose name or chosen label is `web` matches with the default field. Alternatively, set the query's **Title** format to `{{job}}` and match on `title`.

Limits in Grafana 13.2.3 (not worked around by this plugin):

- **Annotation transformations on classic dashboards:** a transformation set to "Apply transformation to: Annotation data" loses that setting when Grafana converts a dashboard stored as classic JSON (for example a provisioned file) on load (`transformPanelTransformations` in `apps/dashboard/pkg/migration/conversion/v1_to_v2alpha1.go`), and then runs on the query results instead. Saving such a dashboard from the UI stores it without the setting. Dashboards saved in the new (v2) format keep it.
- **Tooltip links:** a dashboard author can't add data links or actions to annotation tooltips: the panel's links and overrides don't apply to annotations, and annotation queries have no link settings.
- **Data source columns:** an annotation query's "Field mapping" carries only Grafana's annotation fields (time, end time, title, text, tags, id, and a few more); any other column of the query reaches the panel only when mapped into title, text or tags.

## Differences from the core panel

- **No Grafana Assistant button** in the tooltip (not available to plugins).
- **No panel suggestions** in the visualization picker, so it doesn't show a second card next to the core state timeline.
- **Labels are in English only.** The plugin ships no translations.
- **No grouped-label filter buttons in the tooltip.** Core shows them only with Grafana's `grafana.filterablePanels` feature flag (off by default); this plugin doesn't read that flag, so they stay off.

## Source code

https://github.com/pjan/grafana-plugins (`plugins/pjan-statetimeline-panel`)

## Licence

AGPL-3.0, because it is derived from Grafana's core state-timeline panel. Code copied from Grafana's Apache-2.0 packages keeps that licence (`LICENSE_APACHE2`). Notices for bundled third-party packages are in `THIRD_PARTY_NOTICES.txt`.
