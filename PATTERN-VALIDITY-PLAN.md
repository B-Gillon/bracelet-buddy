# Pattern Physical-Validity Checking: Design Plan

Status: **implemented and shipped.** `utils/patternValidity.ts` (`computePatternValidity`) is the real, working algorithm - its own top-of-file comment is now the authoritative, detailed account of the design (superseding sections 1-3 below, which are the original pre-build plan and are kept only for history). **Read section 9 first** for where things actually landed, including a real hand-verified case where a pattern turned out to be genuinely, provably unbuildable - not a bug. Written up as its own doc (separate from `BUILD-CENTER-INSTRUCTIONS-PLAN.md`) specifically so a fresh chat session can pick this up without wading through the two failed attempts and the long back-and-forth that produced this plan - read this doc fully before touching the algorithm again.

## 1. The physical rule this all rests on

At every real knot, exactly two strings enter and two leave. They don't change identity or invent a new color - the two incoming strings simply swap which one ends up "on top" (displayed). So the *set* of two colors at a knot is identical whether you look at what entered or what left it. The color grid only ever records one of the two (whichever's on top), never both - the second, non-displayed string is what this doc calls a knot's **hidden color**.

Consequence: if you can prove a knot's two inputs are two specific colors (say, both pink), its two outputs are *forced* to be those same two colors (both pink) - not "probably," not "usually," always. And if two independent deductions ever imply two *different* colors for what should be the same physical string, that's not a bug in the derivation - it means the pattern as painted has no valid physical threading at all (freeform painting doesn't guarantee one exists).

## 2. Two failed approaches - read this before trying a third local heuristic

Both of these shipped, were verified live in Chrome with a DOM/SVG-based conservation-checking script, and were found to be wrong - not edge-case wrong, routinely wrong (roughly 300 of ~430 knots checked in the test pattern "My First Bracelet!"). Don't re-attempt either.

**Attempt 1 - forward union-find, anchored at dots.** For each knot, compared its own color to its two candidate children; the non-matching child's *own displayed color* was taken as this knot's hidden color, or if both knots were ambiguous, they were unioned as "the same unknown," resolved only when a chain happened to terminate at a connector dot. Failed because the chains almost never reached an anchor in practice (a single forward pass isn't enough - see Attempt 3's explanation for why "a neighbor's own displayed color" isn't reliable here anyway).

**Attempt 2 - neighbor-arrow-based, using the already-computed continuity arrow.** Derived hidden color as a byproduct of the same left/right neighbor comparison used for arrow direction. Passed typechecking and looked plausible, but a live conservation check found it disagreed with itself throughout the pattern (e.g. two independently-computed hidden values for the same physical edge came out as two different colors).

**Root cause common to both:** hidden color was being defined as "whatever the other candidate happens to display" - but a neighbor's own displayed color is decided by *that neighbor's own tie*, which has nothing to do with what's physically flowing on this specific edge unless you've *already* proven that connection is the neighbor's matching (not hidden) one. Any approach that infers a hidden color from a single local comparison, without cross-checking it against everything already known elsewhere in the pattern, will produce exactly this kind of self-contradiction. **The real problem is a propagation problem, not a comparison problem.**

**Current shipped state (safe, but incomplete):** every real knot always draws exactly 2 lines (never fewer - see Build Center's existing conservation requirement), colored solid when the two knots' own displayed colors directly match, and dashed neutral gray otherwise. This never fabricates a wrong color, but it also doesn't propagate certainty between knots, so it can show contradictions like: knot A confidently shows two solid pink outputs (implying both its own inputs were pink), while one of A's two children shows a solid pink + solid cyan output pair - which is impossible if that child's own two inputs really were both pink. This plan replaces the dashed fallback with real propagated colors wherever they're provably determinable, and treats genuine irresolvable contradictions as a hard "this pattern can't be built" signal instead of quietly rendering something wrong.

## 3. The propagation algorithm

Certain anchors, propagated outward to a fixed point:

- **Connector dots are always 100% certain.** A dot has exactly one parent (see `knotInstructions.ts`'s SEPARATE MAIN/GAP ROWS note), so its own painted color is *always* exactly what that one parent contributed on that specific edge - no inference needed, ever.
- **A knot whose two known inputs are equal is fully resolved** ("solid" knot - both its outputs are that same color, forced).
- **Once a knot's full two-color set is known** (its own displayed color is always known trivially from the paint; its hidden color becomes known via either rule above, or via a dot revealing it directly when the dot's color differs from the knot's own - meaning the dot must be carrying the knot's *hidden* string, not its matching one), propagate that hidden color forward along the knot's non-matching candidate edge.
- **Check for contradiction at every propagation step:** if an edge/knot already has a deduced value and a new deduction disagrees, record the specific contradiction (which knot(s), which edge) rather than overwriting silently.
- **Iterate to a fixed point** (a worklist/BFS over the pattern graph, not a single forward pass) - new information can come from either direction (a dot three rows later can retroactively resolve something earlier), so this can't be a single top-to-bottom sweep like the arrow-direction computation is.
- Some genuinely ambiguous edges may remain unresolved even after full propagation for unusual patterns (e.g. an isolated solid-color block far from any dot or contradiction) - that's fine and expected; only *contradictions* mean "impossible," an unresolved-but-not-contradictory edge just means "we can't prove which color it is, but it's not provably wrong either."

This needs to be built as a single shared utility (likely a new function in `utils/knotInstructions.ts`, or a new `utils/patternValidity.ts` if that reads cleaner - the next session's call), consumed by both places below. **Test it against `resolveHiddenColors`-style unit data by hand first**, and separately verify live in Chrome using the same DOM/SVG extraction + conservation-check-script technique used earlier in this project, *before* wiring it into any UI - both prior attempts looked plausible from code review alone and were wrong.

## 4. Where this plugs in

**Build Center's diagram (`BuildInstructionView.tsx`):** every line uses the propagated color when resolved; the dashed/gray fallback only appears for the rare genuinely-unresolved (not contradictory) edge, if any remain after full propagation.

**Design Center's Save flow (`BuildScreen.tsx` + wherever Save is wired):** run the same check when Save is clicked - **not** in real time as diamonds are painted (a partially-painted pattern isn't a contradiction, it's just unfinished, and checking on every stroke would false-positive constantly on incomplete regions). Decided behavior:
- The pattern **always saves**, valid or not - never block Save, so no work is ever lost.
- If invalid, show a popup saying the pattern is invalid.
- The specific offending diamond(s) get a strong, unmissable, **non-animated-and-animated** treatment: a pulsing/flashing opacity or scale animation (standard React Native `Animated`, no blockers there) *plus* a static border in a color that's dynamically computed to be maximally different from every color currently in the pattern's palette (don't hardcode a border color - compute it against the live palette so it can never accidentally match a color the pattern actually uses). Both together, not one or the other - flashing alone can be missed, is unavailable to anyone with reduced-motion needs, and doesn't show up in a static screenshot.

**Build Center's open-gate (`BuildCenterScreen.tsx`):** re-run the same check live every time a pattern is opened there - **decided: no new database column**, always recompute, never store an `is_valid` flag. These pattern sizes make re-running this cheap; storing a flag would risk going stale and isn't worth the schema change (schema changes need explicit sign-off per this project's conventions - avoided entirely by choosing to just recompute). If invalid, refuse to show the instructional diagram; show an explanatory message pointing back to Design Center instead.

## 5. Decisions already made - don't re-ask these

- Validation trigger is **Save only** - not real-time per-diamond, not any other trigger.
- Save **always succeeds** regardless of validity.
- Build Center **hard-blocks** opening an invalid pattern (no partial/read-only view of an invalid pattern's instructions).
- **No schema change** - validity is always recomputed live from `dualGrid`, never stored.
- Invalid-knot highlighting is **flash + non-palette border, together**, not a choice between them.

## 6. Open questions the next session should raise before coding (not yet decided)

- Exact popup/modal copy and whether it reuses the existing modal pattern in `components/BuildScreenModals.tsx` or needs a new one.
- The precise method for computing "a border color guaranteed different from every palette color" (e.g. max-distance search in some color space vs. a small rotating set of high-contrast candidates checked against the palette) - needs a concrete, simple algorithm, not just the requirement.
- Exact Build Center "can't open, pattern is invalid" screen copy/layout.
- Whether contradiction highlighting should show *all* offending knots at once, or just enough to explain the *first* contradiction found - a badly-designed pattern could have many.

## 7. Process notes from this session (avoid repeating mistakes)

- **File sync bug:** the Windows-side file tools (`Write`/`Edit`) and the Linux-mounted bash view of the same repo can desync - an edit can look correct via `Read` but appear truncated (often with trailing null bytes, or just stale/old content) via `bash`/`tsc`, producing spurious parse errors that aren't real syntax problems. Workaround: rewrite the full file via a bash heredoc (`cat > <path> << 'EOF' ... EOF`) whenever this is suspected (mismatched `wc -l` line counts between `Read` and `bash`, or `tsc` errors that don't correspond to anything actually wrong in the visible code), then re-run `npx tsc --noEmit -p tsconfig.json` to confirm clean.
- **Verify live, not just by code review.** Both failed attempts passed TypeScript and looked correct on inspection. The only thing that actually caught the bugs was a Chrome DOM/SVG extraction script that pulled every knot's position/color and every line's endpoints, then programmatically compared incoming vs. outgoing color sets per knot. Build (or reuse) that same verification script against this new propagation algorithm before considering it done, and specifically test against "My First Bracelet!" (`#000001`, 40x6, 4 colors: pink `#FF007F`, cyan `#00F5FF`, purple `#9B00FF`, black `#0B0C10`) since that's the pattern this whole plan was debugged against.
- This project's `CLAUDE.md` requires full-file overwrites (never partial diffs) for existing files, and explicit sign-off before architecture/schema decisions - both were followed in reaching the decisions in section 5 above.

## 8. Files this will likely touch

- `utils/knotInstructions.ts` (or a new `utils/patternValidity.ts`) - the shared propagation algorithm.
- `components/BuildInstructionView.tsx` - consume resolved colors instead of the current confirmed/dashed local check.
- `screens/BuildScreen.tsx` (Design Center's pattern editor) - run the check on Save, trigger the invalid-pattern popup.
- `components/BuildScreenModals.tsx` - likely home for the new "pattern is invalid" popup.
- `components/PatternGridView.tsx` - diamond flash + non-palette-border highlighting.
- `screens/BuildCenterScreen.tsx` - the open-gate and its "can't open, pattern is invalid" message.

## 9. Implementation status (post-build) - read this first

All of sections 4/5/8 got built as described - `BuildInstructionView.tsx`, `BuildScreen.tsx`'s Save flow, `BuildCenterScreen.tsx`'s open-gate, and `PatternGridView.tsx`'s flash+border highlighting are all wired up and done. Section 6's open questions were resolved during implementation (e.g. the border-color algorithm is `computeContrastBorderColor` at the bottom of `patternValidity.ts`, using a redmean perceptual-distance threshold against the live palette).

**The algorithm actually shipped** ended up more involved than section 3's original plan, because section 3's single-pass propagation-to-fixed-point wasn't enough on its own - some real patterns have knots that pure propagation can never reach (see PHASE 2 in the file's own header comment). The final architecture, in `utils/patternValidity.ts`:

- **Phase 1** is exactly section 3's idea: pure ground-truth (dots only) + elimination, propagated to a fixed point via a worklist. Zero guessing, 100% trustworthy, returns immediately on any contradiction found here.
- **Phase 2** (only runs if Phase 1 is clean) had to become a real, complete backtracking search - not just "fill remaining gaps once" - after two simpler approaches were proven unsound against real pattern data (details in the file's own comments). It resolves identity-ties and color-patch guesses via genuine trial/recurse/rollback backtracking, with three performance layers added on top once real patterns exposed how slow naive backtracking gets: region decomposition (solve independent uncertain areas separately via union-find), frontier-based guess ordering, and MRV/forward-checking (test-drive a bounded window of candidate knots' viable colors before committing, branch on whichever is most constrained). All of this is extensively commented in the file itself under "PERF NOTE, PART 1" through "PART 5" - read those before changing the search.

**Verified against three real patterns** pulled from Supabase ("My First/Second/Third Bracelet!"):
- Pattern 1: fully resolves, valid, 960/960 edges - no dashed/unresolved lines should remain.
- Pattern 2: correctly caught as invalid via Phase 1 alone (65 contradictions), fast (~5ms).
- Pattern 3: correctly reported invalid, but slow (~8-10s) - Phase 2's own backtracking has to burn through its internal step cap to reach that verdict, which is not the same as a real proof. **To resolve the ambiguity, the pattern's actual constraint graph was extracted and fed into Google OR-Tools' CP-SAT solver (a real, complete, independent constraint solver) as a one-off investigation - it proved the pattern's 445-node uncertain region is genuinely, provably unsatisfiable in 65 milliseconds.** So the "invalid" verdict is confirmed correct, not a timeout artifact, for this specific pattern.
- **Accepted, known limitation (explicit decision, not an oversight):** Phase 2's step cap (`MAX_SEARCH_STEPS` in `patternValidity.ts`) means "invalid because we ran out of search budget" and "invalid because it's actually provably impossible" currently look the same from the outside - hitting the cap has been correct on every real pattern tested so far, but a hypothetical pattern that's genuinely valid yet extremely hard to find the one solution for could in theory time out and get misreported as invalid. Explicitly decided to ship as-is rather than build a full arc-consistency solver in TypeScript to close this gap - revisit only if a real pattern actually surfaces this.
- **Not yet done:** live re-verification in Chrome that "My First Bracelet!" renders with zero dashed/gray lines in Build Center's diagram, and that Build Center correctly hard-blocks opening "My Third Bracelet!" (per section 4/5's decided behavior) rather than hitting some unhandled state given the ~8-10s validity check.
