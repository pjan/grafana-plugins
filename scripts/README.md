# Repository scripts

Two scripts keep the plugins' copies of grafana/grafana files in step (plan decision 2, option C: per-plugin copies, kept identical by a check and re-synced by one script). Several plugins copy the same upstream files (State timeline plus and Time series plus share GraphNG, the TimeSeries utils, the annotations and the tooltip); each plugin keeps its own copy, so each stays self-contained and its `UPSTREAM.md` lists everything it ships.

| File                        | What it does                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-upstream-copies.mjs` | Fails when two plugins' copies of the same upstream file differ outside marked changes, or their stand-ins at the same path differ without being listed. Runs in CI. |
| `resync-upstream.mjs`       | Moves every plugin's copies from one Grafana tag to another: re-copies unchanged copies, merges the others.                                                          |
| `upstream-copies.mjs`       | What both scripts count as a copy (imported by both).                                                                                                                |
| `*.test.mjs`                | Their tests (`node --test`).                                                                                                                                         |

From the repository root: `npm run check:upstream-copies`, `npm run test:scripts`, and `node scripts/resync-upstream.mjs --grafana <dir> <from> <to>`.

## What counts as a copy

In each plugin, the mirrored tree is `src/core/`, `src/features/`, `src/packages/` and `src/plugins/` (each plugin's `UPSTREAM.md`, "Layout"). Every file there must be one of:

- **a copy:** its first line is the provenance header `// Copied from grafana/grafana <tag>: <upstream path>. <licence>. Changes: <...>.` The upstream path must be the one the file's path mirrors (`src/packages/grafana-<pkg>/src/<path>` is `packages/grafana-<pkg>/src/<path>`, any other `src/<path>` is `public/app/<path>`);
- **a Jest snapshot** (`__snapshots__/*.snap`): a verbatim copy without a header (Jest needs its own header on line 1); its upstream path comes from its location;
- **a stand-in** (first line `// Plugin stand-in for ...`): plugin-authored, not a copy; compared with the other plugins' stand-ins at the same path (see "Stand-ins"), and left alone by `resync-upstream.mjs`.

Anything else in the mirrored tree, or a header that starts like a copy's but doesn't parse, is reported, so a typo can't take a file out of the check.

## `check-upstream-copies.mjs`

`node scripts/check-upstream-copies.mjs [--root <repository root>]`. Reads files only. Exits with 1 and lists every problem.

**Rules**, for each upstream file that two or more plugins copy:

1. **Headers:** the same tag and licence. The `Changes:` text may differ (see "Normalisation").
2. **Bodies** (everything after the header line; the whole file for a snapshot) are byte-identical, except in diff hunks explained by a marked change: the two copies are compared with `git diff --no-index --diff-algorithm=myers --unified=0`, and each differing hunk must contain, on one side, a line marked by that side's plugin in a copy that plugin lists as changed. Three or more copies are compared pairwise, so two unlisted copies must still be identical to each other.

And for each plugin:

3. **The list of changed copies** is the bullet list (`` - `src/...` ``) under the heading `## Copies with marked changes` in its `UPSTREAM.md`, up to the next heading of level 1 or 2. A plugin with copies needs this section, even when it lists nothing.
4. **The list is exact:** every copy with a line marked by the plugin is listed, every listed copy has one, and every listed path is a copy of that plugin.
5. **A mark** is the plugin id (`pjan-<name>-<type>`, as a whole word) inside a comment on that line: after `//` or `/*`, or on a `*` line of a block comment, as the plugins already mark their changes (`// pjan-stat-panel: was 1`, a `// pjan-...:` line above a changed block, `/** pjan-...: ... */`). The header line doesn't count, and neither does the id in code or strings. A copy marked with another plugin's id is reported (a copy taken from another plugin must be re-marked with its own id).

**What it protects:** an edit to a shared copy in one plugin only (a re-sync of one plugin, a stray Prettier run, a fix made in one place) fails CI unless the edit is a marked, listed change. Once a plugin hooks into a shared file (Time series plus's additions in `core/components/TimeSeries/utils.ts`), it lists the file; the other plugins' copies are still compared with it, outside the hunks with its marks.

### Stand-ins

For each path where two or more plugins have a stand-in (pjan, 2026-10-04: shared stand-ins are kept equal like copies):

6. **The unlisted stand-ins there are byte-identical,** the whole file including its first line: they form one shared version. No normalisation: stand-ins are plugin-authored and have no per-plugin `Changes:` text, so plugins that share one can write it identically; a stand-in that has to name its plugin (as State timeline plus's `internal.ts` does in an error message) is its own.
7. **A plugin lists its stand-in under `## Stand-ins of its own`** in its `UPSTREAM.md` (same bullet format, up to the next heading of level 1 or 2) **exactly when no other plugin's stand-in at that path has the same content.** So when two plugins keep different versions, each lists its own (one listing is not enough); with three plugins, two can share a version while the third lists its own. A listed stand-in identical to another plugin's fails ("share it instead"), and a listed path must be a stand-in of that plugin at a path another plugin also has. A plugin with stand-ins needs the section, even when it lists nothing.

Why "unique content" rather than "the plugin chooses": it makes the list exact both ways from the files alone (as for the marked copies), and it can't hide drift: if one of two shared stand-ins changes, both become unique, and the check fails until both plugins list them, or the change is made in both.

Today this covers `src/packages/grafana-data/internal.ts`: the `@grafana/data/internal` names each plugin's copied code needs (Stat plus `findNumericFieldMinMax`; State timeline plus and Time series plus `nullToUndefThreshold`, the join helpers and `convertFieldType`, with each plugin's id in an error message), so all three plugins list it. Time series plus shares three stand-ins with State timeline plus byte for byte (`core/app_events.ts`, `features/dashboard/services/TimeSrv.ts`, `packages/grafana-runtime/internal.ts`), and has wider versions of two (`packages/grafana-ui/internal.ts`, `packages/grafana-e2e-selectors/index.ts`), which both plugins list.

### Normalisation (deviation from the plan's "byte-identical")

The plan asked for byte-identical copies apart from listed files. The only difference between today's copies that isn't a code change is the header line: its `Changes:` text describes each plugin's own changes, and so differs for a hooked file by design, and for `public/app/plugins/panel/test-utils.ts` in wording (Stat plus: "none", State timeline plus: "imports only"; upstream has no import to rewrite, so "none" is accurate). So the check compares the header's tag and licence (and its upstream path, through the grouping), and not its `Changes:` text. No other normalisation is applied: the import rewrites are the same in every plugin (`resync-upstream.mjs` reproduces all 90 copies that `UPSTREAM.md` lists as "imports only" or "none" from upstream with one set of rewrites), so shared copies need none.

### Limits

- A hunk counts as explained as soon as it contains one marked line on a listed side: an unmarked edit right next to a marked change (no unchanged line between them) is in the same hunk and passes. An edit separated from the marked change by at least one unchanged line is its own hunk and fails.
- An unmarked removal in a listed copy fails: the hunk's side in that copy has no lines to carry a mark. Removals in a hooked file need a marked line where they were (for example `// pjan-<id>: removed <what>`). Existing removals in shared files (State timeline plus's pruned Assistant button in `TimeSeriesTooltip.tsx`, the dropped lint comments in `TimeSeries/utils.ts` and `AnnotationEditor.tsx`) are unmarked, so another plugin's copy must make the same removals (as the Time series plan does).
- A partial copy must be the same part in every plugin that has it (a different part is an unmarked removal); widen it in all plugins at once.
- A change every plugin needs in a shared file (such as State timeline plus's `StackDirection` constants in `uPlot/utils.ts`) is marked in each plugin with its own id; the comment lines then differ, each marked by its own plugin, and the code stays identical.
- A stand-in at a path where another plugin has a copy (not a stand-in) is not compared with it. Files only one plugin has are not compared with anything; upstream itself is not read (that is `resync-upstream.mjs`'s job).

## `resync-upstream.mjs`

`node scripts/resync-upstream.mjs --grafana <grafana/grafana git clone> [--dry-run] [--root <repository root>] <from-tag> <to-tag>`

**Upstream sources:** a local git clone of grafana/grafana with both tags fetched; the script reads each file with `git show <tag>:<path>` (no checkout needed, so a sparse or blobless clone works; a blobless clone fetches the blobs it reads). To add a tag to an existing clone: `git -C <dir> fetch origin tag <to-tag> --no-tags`. A missing tag stops the script before it writes anything (exit 2).

**For each copy** (as above, in every plugin):

1. The copy's header must be at `<from>` (else it is reported and left as is). The upstream file must exist at `<from>`, and at `<to>` (else "gone in `<to>`": removed or moved upstream, left as is for a person to decide).
2. Both upstream versions get the mechanical import rewrites every plugin applies (`UPSTREAM.md`, "Import rewrites"): `'app/<path>'` → `'<path>'`, `'@grafana/{ui,data,runtime}/internal'` → `'packages/grafana-{ui,data,runtime}/internal'`, `'@grafana/ui/unstable'` → `'packages/grafana-ui/unstable'` (tests included, as for `/internal`), and outside `*.test.ts(x)` files `'@grafana/e2e-selectors'` → `'packages/grafana-e2e-selectors'`.
   - `@grafana/ui/unstable` (added 2026-10-05, for Table plus: core Table imports `TableNG` from it) is shared with plugins at runtime, but Grafana declares it not for plugins. A plugin whose copies import it keeps a stand-in at `src/packages/grafana-ui/unstable.ts`, as for `/internal`; the check needs no change for that (a stand-in at a mirrored path, compared like the others). No current plugin's copies import `/unstable`, so the rewrite changes none of them. Only `@grafana/ui/unstable` is rewritten: `@grafana/data/unstable` and `@grafana/runtime/unstable` stay as they are until a plugin needs a stand-in for them.
3. **Unchanged copy** (its body is the rewritten `<from>` file): replaced by the rewritten `<to>` file.
4. **Changed copy** (anything else: marked hooks, unmarked removals, partial copies, other import changes): a 3-way merge, `git merge-file -p --diff3` with the copy as ours, the rewritten `<from>` file as base and the rewritten `<to>` file as theirs. Upstream changes away from the plugin's changes apply cleanly, and the plugin's changes stay. Where they overlap, the file gets conflict markers (with the base section) to resolve by hand.
5. The header's tag becomes `<to>`; the rest of the header (`Changes:`) stays.

It prints every changed copy with its result (updated, no change, or the number of conflicts), the unchanged copies it updated, and the errors. Exits with 1 on conflicts or errors. `--dry-run` writes nothing.

**After a re-sync:** review each merged copy around the upstream changes, resolve conflicts, then run `npm run check:upstream-copies` and the plugins' checks (`npm run typecheck`, `lint`, `test`, `build`) and parity tests, as each plugin's `UPSTREAM.md` ("Re-syncing to a newer tag") says.

**Not covered** (still by hand, per plugin's `UPSTREAM.md`): files the dependency closure gains or loses at the new tag; stand-ins and their names (`/internal` entry points); the `Changes:` texts and `UPSTREAM.md` tables; `package.json` and `docker-compose.yaml` versions. A newly added upstream import of a stand-in entry point gets the rewrite even where a plugin has no such stand-in yet; its typecheck then fails.

## Tests and negative controls

`npm run test:scripts` (`node --test 'scripts/*.test.mjs'`): 34 tests for the check, 13 for the re-sync. Each test builds its fixtures in a temporary directory: a repository of fake plugins and, for the re-sync, a fake grafana/grafana git repository with tags `v1` and `v2`. The scripts run without the user's or the system's git configuration (`GIT_CONFIG_GLOBAL=/dev/null`), as on CI; a global `merge.conflictStyle=diff3` once hid a missing `--diff3`.

Negative controls (2026-10-04; the `ui/unstable` row 2026-10-05): each behaviour below was broken on purpose in the script, and the named test failed; then the script was restored and all tests passed again.

| Broken on purpose                                                                        | Failing test(s)                                                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Header normalisation off (whole files compared, line 1 included)                         | headers may differ in their Changes: text only; a listed copy may differ in hunks with its own marked line          |
| Tag not compared / licence not compared                                                  | headers must name the same tag / … the same licence                                                                 |
| A listed copy may differ anywhere (marks ignored in hunks)                               | a marked hunk does not cover an unmarked change elsewhere; an unmarked removal …; the plugin id outside a comment … |
| Marks count in unlisted copies; marked but unlisted copies not reported                  | a marked change only counts in a copy listed under "## Copies with marked changes"                                  |
| Listed copies without marks not reported                                                 | a listed copy must have a marked line (and two more)                                                                |
| A listed path that isn't a copy not reported                                             | a listed path must be a copy in that plugin                                                                         |
| Missing section not reported                                                             | a plugin with copies needs the section in its UPSTREAM.md                                                           |
| Another plugin's marks not reported                                                      | a copy marked with another plugin's id fails                                                                        |
| Pure deletions accepted                                                                  | an unmarked removal in a listed copy fails                                                                          |
| The plugin id anywhere is a mark (not only in comments)                                  | the plugin id outside a comment is not a mark                                                                       |
| The header line counts as markable                                                       | a mark in the header line is not a mark                                                                             |
| Only pairs with the first copy compared                                                  | with three plugins, the two unlisted copies must still be identical                                                 |
| Jest snapshots not recognised                                                            | Jest snapshots are compared too, without a header                                                                   |
| Stand-ins reported as stray files / files that are neither not reported                  | 11 tests (all stand-in cases) / every file in the mirrored tree is a copy, …                                        |
| Malformed header skipped / header path not checked / packages mapped to `public/app`     | a malformed header fails …; the header's upstream path must be …; package copies map to …                           |
| The section doesn't end at the next heading                                              | 7 tests (every passing case: `## Files` bullets became listed paths)                                                |
| Re-sync: new upstream lines not rewritten                                                | 5 tests, from "re-copies an unchanged copy from the new tag …"                                                      |
| Re-sync: header tag not updated                                                          | 5 tests, from "re-copies an unchanged copy from the new tag …"                                                      |
| Re-sync: changed copies re-copied too (no merge)                                         | merges the upstream change into a changed copy and keeps its marked hook (and two more)                             |
| Re-sync: conflicts not reported / `--diff3` dropped                                      | leaves conflict markers where an upstream change overlaps a plugin change, and fails                                |
| Re-sync: Jest snapshots not re-synced                                                    | re-copies Jest snapshots without adding a header                                                                    |
| Re-sync: `@grafana/e2e-selectors` rewritten in tests too / `/internal` not rewritten     | rewrites @grafana/\*/internal everywhere, and @grafana/e2e-selectors outside tests only                             |
| Re-sync: `ui/unstable` not rewritten / not in tests / another `/unstable` rewritten      | rewrites @grafana/ui/unstable everywhere, tests included, and no other /unstable entry point                        |
| Re-sync: a file removed upstream emptied instead of reported                             | reports a file removed upstream, leaves it as is, and fails                                                         |
| Re-sync: header tag not checked against `<from>`                                         | leaves a copy whose header is at another tag as is, and fails                                                       |
| Re-sync: `--dry-run` writes                                                              | --dry-run reports and writes nothing                                                                                |
| Re-sync: missing tags not checked first                                                  | stops before writing anything when a tag is missing                                                                 |
| Unlisted stand-ins not compared                                                          | unlisted stand-ins that differ fail, with the lines (and four more)                                                 |
| Stand-ins compared without their first line                                              | their first line is compared too (no normalisation)                                                                 |
| The list of own stand-ins ignored                                                        | different stand-ins pass when each plugin lists its own (and four more)                                             |
| One listing enough for two different stand-ins                                           | each plugin with a different stand-in lists it, not just one of them                                                |
| A listed stand-in identical to another not reported                                      | a listed stand-in identical to another plugin's fails                                                               |
| Unlisted stand-ins only need a twin (two shared versions pass)                           | the unlisted stand-ins at a path form one shared version                                                            |
| A listed path that isn't a stand-in / a listed stand-in at an unshared path not reported | a listed path must be a stand-in in that plugin / a listed stand-in must be at a path another plugin also has       |
| Missing `## Stand-ins of its own` section not reported                                   | a plugin with stand-ins needs the section in its UPSTREAM.md                                                        |
| Re-sync: stand-ins treated as copies                                                     | leaves stand-ins as they are                                                                                        |

On the real plugins: a trailing space added to State timeline plus's `test-utils.ts` copy, and a `// pjan-stat-panel:` comment added to Stat plus's unlisted `presets.ts`, each made the check fail; so did taking `internal.ts` off Stat plus's `## Stand-ins of its own` (all restored).

## Run on the existing plugins (2026-10-04, before Time series plus has copies)

- **Check:** 118 copies (116 with a header, 2 Jest snapshots) in State timeline plus and Stat plus. One upstream file is copied into both, `public/app/plugins/panel/test-utils.ts`: identical bodies, headers differing only in `Changes:` ("none" and "imports only"). Stand-ins: 7 (6 in State timeline plus, 1 in Stat plus); one path in both, `src/packages/grafana-data/internal.ts`, with different exports, so both plugins list it under `## Stand-ins of its own` (added in the follow-up). The lists of changed copies were added to both `UPSTREAM.md` files: 9 copies in State timeline plus, 4 in Stat plus, exactly the copies with marked lines.
- **Re-sync, v13.2.3 → v13.2.3** against the v13.2.3 checkout: 90 copies classified as unchanged (re-copied, identical: every one `UPSTREAM.md` lists as "imports only" or "none", both snapshots included), 28 as changed (merged, no change: every one with a change beyond the import rewrites in `UPSTREAM.md`: marked hooks, partial copies, pruned code, dropped lint comments, public imports in place of relative or deep ones), 0 errors; `git status` showed no change to any plugin file. Only v13.2.3 was available, so a re-sync between two real tags has not been run; the fixtures cover it.
