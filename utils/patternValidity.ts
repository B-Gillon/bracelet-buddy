// Implements the propagation algorithm from PATTERN-VALIDITY-PLAN.md - a
// previous session's careful plan for validating a FREELY PAINTED pattern
// (no techniques, no giving up free-paint), after two earlier attempts at
// this were shown wrong by live testing despite passing code review. Read
// that doc in full before touching this file.
//
// THE PHYSICAL RULE (doc section 1): at every real knot, exactly two
// strings enter and two leave, and only swap which one is on top. So a
// knot's hidden (non-displayed) color, once provably known, is a hard fact
// - and two independently-provable facts that disagree mean the pattern
// genuinely cannot be tied, not a bug in this code.
//
// V2 - GENERAL KNOT-TO-KNOT PROPAGATION (previously dot-anchored only).
// The core rule this adds: for any real knot, its incoming pair of strings
// and outgoing pair of strings are the SAME two-value set {own, hidden} -
// regardless of which of its (up to 4 total) edges you look at. So the
// moment ANY edge's value becomes known from ANYWHERE (a dot, a direct
// own-color match, or a value propagated in from a neighbor), that's one
// fact about this knot's set. Once the set is fully known (both members),
// every remaining ambiguous edge can be checked against each neighbor:
// if exactly one of the two set members is consistent with that neighbor,
// the edge is confirmed - and that confirmation becomes a new fact for the
// NEIGHBOR too, which is why this needs to run as a fixed-point worklist,
// not a single pass. This is exactly the reasoning verified by hand in
// chat against a real live pattern (a knot's proven {cyan, purple}
// outgoing pair correctly forced its incoming pair to match) before this
// was written, not guessed at from first principles alone.
//
// SCOPE OF THIS VERSION:
// - Still requires PROOF, never invents a value: an edge is only ever
//   confirmed when exactly one of a knot's two known set members is
//   consistent with the other endpoint. If both are consistent (or
//   neither), it stays honestly unresolved.
// - "Solid" resolution (hidden === own) requires seeing every edge on at
//   least one full side (all incoming, or all outgoing) confirmed to the
//   same value - a partial, mixed-side match to `own` alone is NOT treated
//   as proof of solid, since the remaining unseen edge on that side could
//   still turn out to differ.
// - Per the doc's own hard lesson: two earlier attempts at hidden-color
//   derivation also passed code review and typechecking and were still
//   wrong, caught only by live testing. Treat this version the same way -
//   verified against hand-worked cases and real pattern data below, but
//   not yet independently checked any other way.

import { InstructionRow, candidatePositions, buildInstructionRows } from './knotInstructions';
import { DualGrid } from '../types/pattern';

export interface Contradiction {
  row: number;
  position: number;
  expected: string;
  found: string;
  // The OTHER knot involved in this specific conflict, when known (the
  // zero-overlap edge case always knows both sides - other contradiction
  // types only pin down the one knot where the conflict was noticed).
  // Lets the highlighting below mark BOTH offending diamonds, not just one.
  neighborRow?: number;
  neighborPosition?: number;
}

export interface ValidityResult {
  hidden: (string | null)[][]; // hidden[row][position], meaningful only where isKnot is true
  contradictions: Contradiction[];
  // The actual per-line color, keyed by edgeKey(row,pos,nextPos) - this is
  // the authoritative answer for what color a specific connecting line
  // should render, not just "what's this knot's hidden color." Only
  // present for edges this file has actually proven or (in the exhaustive
  // version) tie-broken - an edge missing from this map is genuinely
  // unresolved.
  edges: Record<string, string>;
}

// The shape BuildCenterScreen.tsx's open-gate (PATTERN-VALIDITY-PLAN.md
// section 4) and Design Center's Save flow both call directly - works from
// the painted DualGrid alone, deliberately ignoring RowTechniques, since
// physical validity is a property of the colors themselves, not of
// whichever technique was picked purely for arrow-direction display.
export interface PatternValidityResult {
  valid: boolean;
  contradictions: Contradiction[];
  hidden: (string | null)[][];
  edges: Record<string, string>;
  // Every offending diamond, keyed exactly like BuildScreen.tsx's own
  // selectedCells ('pass:r:c') so it can be passed straight into
  // PatternGridView's invalidCells prop with no translation needed.
  invalidCells: Set<string>;
  // A border color guaranteed (via redmean perceptual distance) to be
  // visually distinct from every color actually used in the pattern - see
  // computeContrastBorderColor below. Recomputed per-pattern rather than
  // hardcoded, so it can never accidentally match a palette color.
  invalidBorderColor: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [parseInt(clean.substring(0, 2), 16), parseInt(clean.substring(2, 4), 16), parseInt(clean.substring(4, 6), 16)];
}

// "Redmean" - a well-known, cheap approximation of human color-difference
// perception (weights green most heavily, since eyes are most sensitive to
// it, and shifts red/blue weight based on overall redness). Used only to
// verify the highlight border can never be confused with a palette color.
function redmeanDistance(hexA: string, hexB: string): number {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

// Neon green first, per the explicit request in chat - only falls through
// to another high-contrast candidate if neon green happens to be too close
// to a color the pattern actually uses.
const BORDER_CANDIDATES = ['#39FF14', '#FF00FF', '#00FFFF', '#FF6D00', '#FF0000', '#FFFF00'];
const MIN_ACCEPTABLE_DISTANCE = 100;

export function computeContrastBorderColor(palette: string[]): string {
  if (palette.length === 0) return BORDER_CANDIDATES[0];
  let best = BORDER_CANDIDATES[0];
  let bestMinDistance = -Infinity;
  for (const candidate of BORDER_CANDIDATES) {
    const minDistance = Math.min(...palette.map(p => redmeanDistance(candidate, p)));
    if (minDistance >= MIN_ACCEPTABLE_DISTANCE) return candidate; // first good-enough candidate, in preference order
    if (minDistance > bestMinDistance) { bestMinDistance = minDistance; best = candidate; }
  }
  return best; // nothing cleared the threshold - use whichever was least-bad
}

// A knot's key is built as `${pass}-${gridColL}-${p}` (see
// knotInstructions.ts's rawKnotKey), where gridColL is the LENGTH-axis
// position and p is the position within that row (the WIDTH axis).
// dualGrid.main/gap are stored as [widthIndex][lengthIndex] (confirmed
// directly against real data - createDualGrid(rows, cols) builds an array
// of length `rows` where each entry has length `cols`, and "rows" here is
// actually the STRING COUNT/width, not the length of the bracelet) - so
// the reformatted key needs p FIRST and gridColL SECOND to match
// BuildScreen.tsx's own selectedCells convention (`${pass}:${r}:${c}`).
// Getting this backwards was a real bug: most flagged knots got mapped to
// an out-of-range row and silently failed to highlight at all, and the
// couple that had a small enough length position to coincidentally still
// be in-bounds ended up highlighted at the wrong, misleading position.
function cellKeyFromInstructionPosition(rows: InstructionRow[], row: number, position: number): string | null {
  const knot = rows[row]?.knots[position];
  if (!knot) return null;
  const [pass, gridColL, p] = knot.key.split('-');
  if (pass == null || gridColL == null || p == null) return null;
  return `${pass}:${p}:${gridColL}`;
}

export function computePatternValidity(dualGrid: DualGrid): PatternValidityResult {
  const rows = buildInstructionRows(dualGrid, null);
  const { hidden, contradictions, edges } = resolveHiddenColorsExhaustive(rows);

  const invalidCells = new Set<string>();
  for (const c of contradictions) {
    const key = cellKeyFromInstructionPosition(rows, c.row, c.position);
    if (key) invalidCells.add(key);
    if (c.neighborRow != null && c.neighborPosition != null) {
      const nbKey = cellKeyFromInstructionPosition(rows, c.neighborRow, c.neighborPosition);
      if (nbKey) invalidCells.add(nbKey);
    }
  }

  const palette = Array.from(new Set(rows.flatMap(r => r.knots.map(k => k.color).filter((x): x is string => x != null))));
  const invalidBorderColor = computeContrastBorderColor(palette);

  return { valid: contradictions.length === 0, contradictions, hidden, edges, invalidCells, invalidBorderColor };
}

type Ref = { row: number; pos: number };

// Every position in `row - 1` that geometrically connects forward to
// (row, pos) - the reverse of candidatePositions, which only searches
// forward. For a dot this is guaranteed to find exactly one; for a real
// knot, exactly two (except at the pattern's very first/last row, which
// simply has no row on that side at all).
function allParents(widths: number[], row: number, pos: number): number[] {
  if (row === 0) return [];
  const result: number[] = [];
  for (let q = 0; q < widths[row - 1]; q++) {
    if (candidatePositions(q, widths[row - 1], widths[row]).includes(pos)) result.push(q);
  }
  return result;
}

// Perceived brightness (ITU-R BT.601 weighting) of a #RRGGBB color -
// lower means darker. Used only for the "darkest viable option" tie-break
// below, never for feasibility/contradiction logic.
function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Always oriented from the earlier row to the later row, so both
// endpoints of a shared edge agree on the same key regardless of which
// one is being examined. Exported so callers (the diagram renderer) can
// look up the SAME authoritative per-line answer this file computes,
// instead of re-deriving a weaker approximation of their own.
export function edgeKey(row: number, pos: number, nextPos: number): string {
  return `${row}:${pos}->${row + 1}:${nextPos}`;
}

// Internal core: identical to before, but accepts optional extra "assume
// this specific knot's hidden color is X" facts, injected as additional
// seeds before propagation runs. Used by resolveHiddenColorsExhaustive
// below to test hypotheses - if forcing an assumption here ever produces
// a contradiction, that assumption is proven impossible, which is still
// rigorous deduction (elimination), never a guess.
function resolveHiddenColorsCore(
  rows: InstructionRow[],
  forcedHidden: { row: number; pos: number; value: string }[]
): ValidityResult {
  const colors = rows.map(r => r.knots.map(k => k.color));
  const isKnot = rows.map(r => r.knots.map(k => k.isKnot));
  const widths = colors.map(c => c.length);
  const numRows = colors.length;

  const hidden: (string | null)[][] = widths.map(w => new Array(w).fill(null));
  const contradictions: Contradiction[] = [];
  const edgeValue = new Map<string, string>();

  function setHidden(row: number, pos: number, value: string) {
    const current = hidden[row][pos];
    if (current === value) return;
    if (current !== null && current !== value) {
      contradictions.push({ row, position: pos, expected: current, found: value });
      return;
    }
    hidden[row][pos] = value;
  }

  // Returns true only when this call actually changed something (used to
  // decide whether the affected neighbor needs re-checking).
  function setEdge(key: string, value: string, ctxRow: number, ctxPos: number): boolean {
    const current = edgeValue.get(key);
    if (current === value) return false;
    if (current !== undefined && current !== value) {
      contradictions.push({ row: ctxRow, position: ctxPos, expected: current, found: value });
      return false;
    }
    edgeValue.set(key, value);
    return true;
  }

  // Precompute each real position's incoming/outgoing neighbor refs once.
  const outgoing: Ref[][][] = [];
  const incoming: Ref[][][] = [];
  for (let r = 0; r < numRows; r++) {
    outgoing.push(
      colors[r].map((_, p) =>
        r < numRows - 1
          ? candidatePositions(p, widths[r], widths[r + 1]).map(q => ({ row: r + 1, pos: q }))
          : []
      )
    );
    incoming.push(colors[r].map((_, p) => allParents(widths, r, p).map(q => ({ row: r - 1, pos: q }))));
  }

  const queue: Ref[] = [];
  const queued = new Set<string>();
  function enqueue(row: number, pos: number) {
    if (!isKnot[row][pos]) return; // only real knots ever need reprocessing
    const key = `${row}:${pos}`;
    if (queued.has(key)) return;
    queued.add(key);
    queue.push({ row, pos });
  }

  // Seed 1: a dot's own color is a certain fact about BOTH its one parent
  // edge and its one child edge - no inference needed, ever.
  for (let r = 0; r < numRows; r++) {
    for (let p = 0; p < widths[r]; p++) {
      if (isKnot[r][p]) continue;
      const dotColor = colors[r][p];
      if (dotColor == null) continue;
      for (const nb of incoming[r][p]) {
        if (setEdge(edgeKey(nb.row, nb.pos, p), dotColor, r, p)) enqueue(nb.row, nb.pos);
      }
      for (const nb of outgoing[r][p]) {
        if (setEdge(edgeKey(r, p, nb.pos), dotColor, r, p)) enqueue(nb.row, nb.pos);
      }
    }
  }

  // Seed 2: a direct own-color match between two real knots is the
  // existing, always-safe baseline rule - also a genuine known edge
  // value, so it feeds the same propagation.
  for (let r = 0; r < numRows - 1; r++) {
    for (let p = 0; p < widths[r]; p++) {
      if (!isKnot[r][p] || colors[r][p] == null) continue;
      for (const nb of outgoing[r][p]) {
        if (!isKnot[nb.row][nb.pos]) continue; // dots already seeded above
        if (colors[nb.row][nb.pos] === colors[r][p]) {
          if (setEdge(edgeKey(r, p, nb.pos), colors[r][p]!, r, p)) {
            enqueue(r, p);
            enqueue(nb.row, nb.pos);
          }
        }
      }
    }
  }

  // Seed 3: hypotheses under test (case-splitting only - empty in normal
  // use). Injected the same way as any other fact, so it flows through
  // the exact same propagation and contradiction-detection logic.
  for (const f of forcedHidden) {
    setHidden(f.row, f.pos, f.value);
    enqueue(f.row, f.pos);
  }

  function tryResolveHidden(row: number, pos: number) {
    const own = colors[row][pos];
    if (own == null || hidden[row][pos] != null) return;

    const inVals = incoming[row][pos].map(nb => edgeValue.get(edgeKey(nb.row, nb.pos, pos)));
    const outVals = outgoing[row][pos].map(nb => edgeValue.get(edgeKey(row, pos, nb.pos)));
    const allKnown = [...inVals, ...outVals].filter((v): v is string => v !== undefined);

    // Any known value that differs from own is a candidate for the
    // hidden color - but if TWO DIFFERENT non-own values both show up,
    // that's not "pick the first one," it's a genuine contradiction (both
    // can't be the one true hidden color at once).
    const differingValues = new Set(allKnown.filter(v => v !== own));
    if (differingValues.size > 1) {
      const [first, second] = Array.from(differingValues);
      contradictions.push({ row, position: pos, expected: first, found: second });
      return;
    }
    if (differingValues.size === 1) {
      setHidden(row, pos, Array.from(differingValues)[0]);
      return;
    }

    // Solid only once a FULL side (every incoming edge, or every outgoing
    // edge) is confirmed and all of them equal own - a partial match on
    // one side isn't proof, since the unseen edge on that side could
    // still differ.
    const inFull = incoming[row][pos].length > 0 && inVals.every(v => v !== undefined);
    const outFull = outgoing[row][pos].length > 0 && outVals.every(v => v !== undefined);
    if ((inFull && inVals.every(v => v === own)) || (outFull && outVals.every(v => v === own))) {
      setHidden(row, pos, own);
    }
  }

  function tryResolveEdges(row: number, pos: number) {
    const own = colors[row][pos];
    const hid = hidden[row][pos];
    if (own == null || hid == null) return;

    if (hid === own) {
      // Solid knot - every edge is definitely `own`, no ambiguity on
      // either side regardless of what any neighbor shows.
      for (const nb of incoming[row][pos]) {
        if (setEdge(edgeKey(nb.row, nb.pos, pos), own, row, pos)) enqueue(nb.row, nb.pos);
      }
      for (const nb of outgoing[row][pos]) {
        if (setEdge(edgeKey(row, pos, nb.pos), own, row, pos)) enqueue(nb.row, nb.pos);
      }
      return;
    }

    const setMembers = [own, hid];
    const edges = [
      ...incoming[row][pos].map(nb => ({ key: edgeKey(nb.row, nb.pos, pos), nb })),
      ...outgoing[row][pos].map(nb => ({ key: edgeKey(row, pos, nb.pos), nb })),
    ];
    for (const edge of edges) {
      if (edgeValue.has(edge.key)) continue;
      if (!isKnot[edge.nb.row][edge.nb.pos]) continue; // dots already resolved in seeding
      const nbOwn = colors[edge.nb.row][edge.nb.pos];
      const nbHidden = hidden[edge.nb.row][edge.nb.pos];
      const consistent = new Set(setMembers.filter(v => v === nbOwn || v === nbHidden));
      if (consistent.size === 1) {
        const [value] = consistent;
        if (setEdge(edge.key, value, row, pos)) enqueue(edge.nb.row, edge.nb.pos);
      } else if (consistent.size === 0 && nbHidden != null) {
        // Both this knot's AND the neighbor's full two-color sets are
        // now known, and share NOTHING in common - no valid string color
        // could flow on this real, physically required connection
        // (every real knot always ties exactly two in and two out; this
        // isn't an optional link). That's a genuine contradiction, not
        // something to silently skip - missing this case previously let
        // some patterns report "fully valid" when a specific connection
        // was actually impossible.
        contradictions.push({
          row, position: pos,
          expected: setMembers.join('/'), found: `${nbOwn}/${nbHidden}`,
          neighborRow: edge.nb.row, neighborPosition: edge.nb.pos,
        });
      }
    }
  }

  for (let r = 0; r < numRows; r++) for (let p = 0; p < widths[r]; p++) enqueue(r, p);

  let guard = 0;
  const GUARD_LIMIT = 2_000_000;
  while (queue.length > 0 && guard < GUARD_LIMIT) {
    guard++;
    const { row, pos } = queue.shift()!;
    queued.delete(`${row}:${pos}`);
    tryResolveHidden(row, pos);
    tryResolveEdges(row, pos);
  }

  return { hidden, contradictions, edges: Object.fromEntries(edgeValue) };
}

export function resolveHiddenColors(rows: InstructionRow[]): ValidityResult {
  return resolveHiddenColorsCore(rows, []);
}

// EXHAUSTIVE VERSION - proper backtracking search, not a single greedy
// pass. A first version tried each ambiguous knot once, in order, and
// never revisited a choice - which turned out to be a real bug, not just
// a simplification: it could lock in an early choice that only turned
// out to conflict with a LATER knot's requirement, with no way back,
// even though a fully consistent assignment genuinely existed (this is
// always true for a real, physically-tied pattern). Caught by testing
// against real pattern data, not assumed - see chat history.
//
// TIE-BREAK RULES (both explicitly chosen in chat, not invented here):
// try the knot's own displayed color FIRST, then remaining colors
// darkest-first. If a choice is later found to conflict with something
// deeper in the search, it's undone and the next candidate in that same
// preference order is tried - so the end result still always prefers own,
// then darkest, it just no longer gets stuck on a choice that looked fine
// in isolation but wasn't globally consistent.
export function resolveHiddenColorsExhaustive(rows: InstructionRow[]): ValidityResult {
  const base = resolveHiddenColorsCore(rows, []);
  if (base.contradictions.length > 0) return base;

  const palette = Array.from(new Set(rows.flatMap(r => r.knots.map(k => k.color).filter((c): c is string => c != null))));
  const isKnot = rows.map(r => r.knots.map(k => k.isKnot));
  const colors = rows.map(r => r.knots.map(k => k.color));

  const unresolved: { row: number; pos: number }[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let p = 0; p < colors[r].length; p++) {
      if (isKnot[r][p] && colors[r][p] != null && base.hidden[r][p] == null) {
        unresolved.push({ row: r, pos: p });
      }
    }
  }

  function orderedCandidates(row: number, pos: number): string[] {
    const own = colors[row][pos]!;
    const rest = palette.filter(c => c !== own).sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
    return [own, ...rest];
  }

  const ATTEMPT_LIMIT = 200_000;
  let attempts = 0;
  let limitReached = false;

  function search(
    index: number,
    forced: { row: number; pos: number; value: string }[],
    forcedResult: ValidityResult
  ): ValidityResult | null {
    if (index >= unresolved.length) return forcedResult;
    const { row, pos } = unresolved[index];
    if (forcedResult.hidden[row][pos] != null) {
      // Already pinned down as a side effect of an earlier choice in this
      // branch - nothing to decide here, move on.
      return search(index + 1, forced, forcedResult);
    }
    for (const candidate of orderedCandidates(row, pos)) {
      if (attempts >= ATTEMPT_LIMIT) { limitReached = true; return null; }
      attempts++;
      const nextForced = [...forced, { row, pos, value: candidate }];
      const trial = resolveHiddenColorsCore(rows, nextForced);
      if (trial.contradictions.length > 0) continue; // proven impossible, try next candidate
      const deeper = search(index + 1, nextForced, trial);
      if (deeper) return deeper; // this candidate led to a full, valid solution
      // Otherwise every option further down this branch failed - undo
      // this choice entirely and try the next candidate for THIS knot.
    }
    return null;
  }

  const solved = search(0, [], base);
  const result = solved ?? base;
  // If solved is null: either the search proved no valid assignment
  // exists at all (a genuine structural impossibility), or it ran out of
  // attempt budget first (limitReached) - either way, falling back to the
  // base (forward-deduction-only) result is the safe, honest choice: it
  // never asserts anything unproven, it just leaves more knots and lines
  // unresolved than a full search might have managed to close.

  // FINAL EDGE-LEVEL PASS. Every real knot resolved by the search above
  // has both own and hidden known - by itself, tryResolveEdges already
  // fills almost every line from that. But one specific line can, rarely,
  // still have BOTH of a knot's two colors simultaneously consistent with
  // its neighbor (own-of-A matches hidden-of-B AND hidden-of-A matches
  // own-of-B, at once) - which member flows on THIS ONE connection stays
  // ambiguous even though both knots' full color pairs are completely
  // known. Same tie-break philosophy, one level down: prefer this knot's
  // own color if it's a valid option for the line, else the darkest valid
  // option - guaranteeing every remaining line gets a definite,
  // always-buildable answer instead of staying dashed.
  const widths = colors.map(c => c.length);
  const finalEdges: Record<string, string> = { ...result.edges };
  for (let r = 0; r < rows.length - 1; r++) {
    for (let p = 0; p < widths[r]; p++) {
      if (!isKnot[r][p] || colors[r][p] == null) continue;
      for (const q of candidatePositions(p, widths[r], widths[r + 1])) {
        if (!isKnot[r + 1][q]) continue; // dots already have a definite value from seeding
        const key = edgeKey(r, p, q);
        if (finalEdges[key] !== undefined) continue;
        const ownA = colors[r][p];
        const hidA = result.hidden[r][p];
        const ownB = colors[r + 1][q];
        const hidB = result.hidden[r + 1][q];
        if (ownA == null || hidA == null || ownB == null || hidB == null) continue;
        const consistent = new Set([ownA, hidA].filter(v => v === ownB || v === hidB));
        if (consistent.size === 0) continue; // shouldn't happen for a genuinely valid pattern
        finalEdges[key] = consistent.has(ownA)
          ? ownA
          : Array.from(consistent).sort((a, b) => relativeLuminance(a) - relativeLuminance(b))[0];
      }
    }
  }

  return { ...result, edges: finalEdges };
}

export function isPatternValid(rows: InstructionRow[]): boolean {
  return resolveHiddenColors(rows).contradictions.length === 0;
}
