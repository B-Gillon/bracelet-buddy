# Build Center - Step-by-Step Instructions: Design Plan

Status: proposed, not yet built. This is the plan for turning a saved pattern's Build Center detail page from the current "Coming Soon" placeholder into real, knot-by-knot build instructions.

## 1. Screen layout

- **Top:** the existing pattern preview (`PatternThumbnail`, `fitWidth`) stays as-is, full pattern, no scrolling. New behavior: diamonds belonging to rows already marked done are greyed out/desaturated, updating live as rows are marked.
- **Below:** a new, larger horizontal "Instruction View" showing one row at a time (or a scrollable stack of rows), each knot rendered with its color and a direction arrow, plus a "Mark Row Done" control per row.

## 2. The core problem: knot direction isn't in the data today

`main`/`gap` diamond grids are a freeform paint canvas - any diamond, any color, no encoding of which direction a knot ties or how a strand physically moves between rows. Direction can't be reliably *inferred* from color alone: patterns with repeated colors (nearly all of them) have row transitions where multiple genuinely different tie sequences produce an identical picture (e.g. a Pink/Blue/Pink/Blue row shifted either left or right by one both land on Blue/Pink/Blue/Pink). No algorithm can distinguish those from color data alone, because the distinguishing information was never recorded.

**Resolution:** store direction as real, explicit data instead of reconstructing it. Since diamond colors are already fixed by what the user painted (that's ground truth, not something we're deriving), any technique choice used to resolve an ambiguous row still produces a bracelet with the correct colors when followed - satisfying "if it looks right when it's done, that's a win" without needing to nail one single "true" physical tie history.

## 3. Data model additions

**Row granularity:** one instructional "row" = one main grid row + its adjoining gap grid row (one full chevron "V", matching how the reference image numbers rows 1-4).

**New field - row technique** (per pattern, one entry per instructional row):
```
type RowTechnique =
  | { type: 'diagonal'; direction: 'left' | 'right' }
  | { type: 'chevron'; splitCol: number };
```
- Defaults automatically to `{ type: 'chevron', splitCol: <center column> }` for every row - no setup required for the common case.
- Stored explicitly (not inferred) so direction is always deterministic once set.
- Proposed storage: new `patterns.row_techniques jsonb null` column. Null/missing entries fall back to the computed centered-chevron default at render time, so existing saved patterns don't need a backfill migration.

**New field - build progress:**
- A *set* of completed row indices (not a single "furthest row reached" counter) - supports marking or unmarking any specific row, including undoing a mistaken mark that wasn't the most recent one.
- Proposed storage: new `patterns.build_progress jsonb null` column -> array of completed row indices.

## 4. Arrow / knot rendering

Every individual knot gets its own arrow, matching the reference image. Arrows are **derived at render time**, not stored per-knot: given a row's technique (`diagonal`+direction, or `chevron`+splitCol) and a knot's column position, the arrow direction follows mechanically. This also means flipping a row's technique updates every arrow in that row at once, rather than needing per-knot edits.

## 5. Row technique override

Each row in the Instruction View gets a small control to switch its technique if the auto-default doesn't match what was actually painted (e.g. flip chevron -> diagonal, or move the split column). Edits persist to `row_techniques`, so a correction is permanent - never re-guessed on a later visit.

## 6. Mark Row Done / Undo

- A control per row to mark it complete, adding that row's index to `build_progress`.
- Marking is independently toggleable per row - undoing any previously-marked row (not just the latest) just removes its index from the set.

## 7. Mini preview behavior

Top `PatternThumbnail` dims/greys diamonds belonging to any row index present in `build_progress`, recomputed whenever progress changes.

## 8. Save / Resume

**Proposed (please confirm):** auto-save, consistent with how the rest of the app already treats in-progress state - debounced local caching plus best-effort cloud sync of `row_techniques` and `build_progress`, no separate manual "Save" button needed. This mirrors the existing `build_started_at` idempotent-write pattern and the general "local save always succeeds, cloud sync is best-effort" philosophy already used for pattern edits. If you'd rather have an explicit Save action instead of automatic, flag it and I'll adjust.

## 9. Explicitly out of scope for now

- Mixed technique *within* a single row (more than one split point) - not supported; matches the two techniques described (diagonal, chevron).
- Manufacturer/purchasable colors (already deferred earlier in this project).
- Any change to how patterns are painted/designed - colors stay exactly as they are today; this only adds a parallel instructional layer.

## 10. Rough build order

1. Schema: `row_techniques` + `build_progress` columns, plus the centered-chevron default-computation helper.
2. Instruction View rendering: per-row knot list with derived arrows.
3. Row technique override control.
4. Mark Row Done / Undo, wired to `build_progress`.
5. Mini preview greying-out based on `build_progress`.
6. Save/Resume wiring.