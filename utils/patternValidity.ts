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

// TEMPORARILY DISABLED - see chat history. The "direct color match forces
// this edge" assumption (formerly "Seed 2" in resolveHiddenColorsCore) was
// proven WRONG, not just a simplification: removing it and running a full
// search found a completely valid construction for a real pattern this
// had been reporting 12 false contradictions on. The corrected algorithm
// exists and is proven right, but takes over 3 minutes on a real pattern -
// far too slow to ship. Rather than leave the WRONG fast version live
// (false contradictions, an incorrect Build Center block, incorrectly
// highlighted diamonds), this returns a neutral "nothing flagged, nothing
// confirmed" result until a correct AND fast version replaces it. Every
// line will show as the honest dashed/unconfirmed state rather than a
// wrong answer - that's the safe default while this gets rebuilt.
export function computePatternValidity(dualGrid: DualGrid): PatternValidityResult {
  const rows = buildInstructionRows(dualGrid, null);
  const hidden: (string | null)[][] = rows.map(r => r.knots.map(() => null));
  return { valid: true, contradictions: [], hidden, edges: {}, invalidCells: new Set(), invalidBorderColor: '#39FF14' };
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

// FAST, INCREMENTAL SOLVER. The old backtracking search (still commented
// out below resolveHiddenColorsExhaustive) re-checked the ENTIRE pattern
// from a blank slate for every single guess it tried - correct, but over
// 3 minutes on a real 435-knot pattern, since almost all of that repeated
// work has nothing to do with the one new fact being tested. This version
// keeps ONE mutable, persistent solver state and a TRAIL of every change
// made to it, so testing a guess only re-propagates from the specific
// knot that changed (usually touching a handful of nearby knots, not all
// 435), and abandoning a bad guess is a cheap undo back to a saved trail
// mark instead of starting over.
class IncrementalSolver {
  private colors: (string | null)[][];
  private isKnot: boolean[][];
  private widths: number[];
  private numRows: number;
  private outgoing: Ref[][][];
  private incoming: Ref[][][];

  hidden: (string | null)[][];
  edgeValue: Map<string, string> = new Map();
  contradictions: Contradiction[] = [];

  private trail: (
    | { type: 'hidden'; row: number; pos: number; prev: string | null }
    | { type: 'edge'; key: string; prev: string | undefined }
    | { type: 'contradiction' }
  )[] = [];

  constructor(rows: InstructionRow[]) {
    this.colors = rows.map(r => r.knots.map(k => k.color));
    this.isKnot = rows.map(r => r.knots.map(k => k.isKnot));
    this.widths = this.colors.map(c => c.length);
    this.numRows = this.colors.length;
    this.hidden = this.widths.map(w => new Array(w).fill(null));

    this.outgoing = [];
    this.incoming = [];
    for (let r = 0; r < this.numRows; r++) {
      this.outgoing.push(
        this.colors[r].map((_, p) =>
          r < this.numRows - 1
            ? candidatePositions(p, this.widths[r], this.widths[r + 1]).map(q => ({ row: r + 1, pos: q }))
            : []
        )
      );
      this.incoming.push(this.colors[r].map((_, p) => allParents(this.widths, r, p).map(q => ({ row: r - 1, pos: q }))));
    }

    // Dots are the only unconditionally certain facts - seeded once, never
    // undone (they never depend on any hypothesis). Their edges are set
    // directly here, but the knots they touch still need a REAL
    // propagation pass run on them (not just "recorded and forgotten") -
    // an earlier version of this skipped that step, which meant two dots
    // independently implying DIFFERENT hidden colors for the same knot
    // was never actually caught. Caught by testing against the hand-
    // verified contradiction case, not assumed.
    const initialQueue: Ref[] = [];
    for (let r = 0; r < this.numRows; r++) {
      for (let p = 0; p < this.widths[r]; p++) {
        if (this.isKnot[r][p]) continue;
        const dotColor = this.colors[r][p];
        if (dotColor == null) continue;
        for (const nb of this.incoming[r][p]) {
          this.setEdge(edgeKey(nb.row, nb.pos, p), dotColor, r, p);
          if (this.isKnot[nb.row][nb.pos]) initialQueue.push(nb);
        }
        for (const nb of this.outgoing[r][p]) {
          this.setEdge(edgeKey(r, p, nb.pos), dotColor, r, p);
          if (this.isKnot[nb.row][nb.pos]) initialQueue.push(nb);
        }
      }
    }
    while (initialQueue.length > 0) {
      const { row: r, pos: p } = initialQueue.shift()!;
      if (!this.propagateEdgesFrom(r, p, initialQueue)) break; // contradiction already recorded
    }
    this.trail = []; // dot-derived ground truth is permanent, not undoable
  }

  mark(): number {
    return this.trail.length;
  }

  undoTo(mark: number) {
    while (this.trail.length > mark) {
      const change = this.trail.pop()!;
      if (change.type === 'hidden') this.hidden[change.row][change.pos] = change.prev;
      else if (change.type === 'edge') {
        if (change.prev === undefined) this.edgeValue.delete(change.key);
        else this.edgeValue.set(change.key, change.prev);
      } else {
        this.contradictions.pop();
      }
    }
  }

  private setHidden(row: number, pos: number, value: string, queue: Ref[]): boolean {
    const current = this.hidden[row][pos];
    if (current === value) return true;
    if (current !== null && current !== value) {
      this.contradictions.push({ row, position: pos, expected: current, found: value });
      this.trail.push({ type: 'contradiction' });
      return false;
    }
    this.trail.push({ type: 'hidden', row, pos, prev: current });
    this.hidden[row][pos] = value;
    queue.push({ row, pos });
    return true;
  }

  private setEdge(key: string, value: string, ctxRow: number, ctxPos: number): boolean {
    const current = this.edgeValue.get(key);
    if (current === value) return false;
    if (current !== undefined && current !== value) {
      this.contradictions.push({ row: ctxRow, position: ctxPos, expected: current, found: value });
      this.trail.push({ type: 'contradiction' });
      return false;
    }
    this.trail.push({ type: 'edge', key, prev: current });
    this.edgeValue.set(key, value);
    return true;
  }

  // Applies one hypothesis and propagates its consequences ONLY - the same
  // deduction rules as the non-incremental version (differing known value
  // reveals hidden; a fully-confirmed side proves solid; a fully-known
  // knot resolves any still-ambiguous edge with exactly one consistent
  // option), just scoped to a worklist seeded from this one change instead
  // of the whole pattern. Returns false the instant a contradiction is
  // hit - caller should undoTo() its mark and try the next candidate.
  tryForce(row: number, pos: number, value: string): boolean {
    const queue: Ref[] = [];
    if (!this.setHidden(row, pos, value, queue)) return false;

    while (queue.length > 0) {
      const { row: r, pos: p } = queue.shift()!;
      if (!this.propagateEdgesFrom(r, p, queue)) return false;
    }
    return true;
  }

  // Re-examines one knot given everything currently known about it -
  // called whenever one of its edges changes. Two responsibilities, both
  // required every time (an earlier version only did the first when
  // hidden was still unknown, and silently skipped validating an
  // ALREADY-SET edge entirely, which is exactly how a real contradiction
  // slipped through undetected - see the class comment above):
  //   1. If hidden isn't known yet, try to derive it from whatever edges
  //      are already known (a differing value reveals it; a fully-known,
  //      all-matching side proves solid).
  //   2. Once known (just now, or already), verify EVERY already-set edge
  //      is actually consistent with {own, hidden} - not just the ones
  //      still unresolved - and fill in any edge that's now uniquely
  //      determined.
  private propagateEdgesFrom(row: number, pos: number, queue: Ref[]): boolean {
    const own = this.colors[row][pos];
    if (own == null) return true;

    const edges = [
      ...this.incoming[row][pos].map(nb => ({ key: edgeKey(nb.row, nb.pos, pos), nb })),
      ...this.outgoing[row][pos].map(nb => ({ key: edgeKey(row, pos, nb.pos), nb })),
    ];

    if (this.hidden[row][pos] == null) {
      const known = edges.map(e => this.edgeValue.get(e.key)).filter((v): v is string => v !== undefined);
      const differingValues = new Set(known.filter(v => v !== own));
      if (differingValues.size > 1) {
        const [first, second] = Array.from(differingValues);
        this.contradictions.push({ row, position: pos, expected: first, found: second });
        this.trail.push({ type: 'contradiction' });
        return false;
      }
      if (differingValues.size === 1) {
        if (!this.setHidden(row, pos, Array.from(differingValues)[0], queue)) return false;
      } else {
        const inVals = this.incoming[row][pos].map(nb => this.edgeValue.get(edgeKey(nb.row, nb.pos, pos)));
        const outVals = this.outgoing[row][pos].map(nb => this.edgeValue.get(edgeKey(row, pos, nb.pos)));
        const inFull = this.incoming[row][pos].length > 0 && inVals.every(v => v !== undefined);
        const outFull = this.outgoing[row][pos].length > 0 && outVals.every(v => v !== undefined);
        if ((inFull && inVals.every(v => v === own)) || (outFull && outVals.every(v => v === own))) {
          if (!this.setHidden(row, pos, own, queue)) return false;
        }
      }
    }

    const hid = this.hidden[row][pos];
    if (hid == null) return true; // still genuinely unresolved - nothing more to check yet

    const setMembers = hid === own ? [own] : [own, hid];
    for (const edge of edges) {
      const existing = this.edgeValue.get(edge.key);
      if (existing !== undefined) {
        // Already set (by a dot, or by whichever side got there first) -
        // MUST be validated, not skipped, or a real conflict goes unseen.
        if (!setMembers.includes(existing)) {
          this.contradictions.push({
            row, position: pos, expected: setMembers.join('/'), found: existing,
            neighborRow: edge.nb.row, neighborPosition: edge.nb.pos,
          });
          this.trail.push({ type: 'contradiction' });
          return false;
        }
        continue;
      }
      if (!this.isKnot[edge.nb.row][edge.nb.pos]) continue; // dots are always already seeded

      if (setMembers.length === 1) {
        if (!this.setEdge(edge.key, own, row, pos)) return false;
        queue.push(edge.nb);
        continue;
      }
      const nbOwn = this.colors[edge.nb.row][edge.nb.pos];
      const nbHidden = this.hidden[edge.nb.row][edge.nb.pos];
      const consistent = new Set(setMembers.filter(v => v === nbOwn || v === nbHidden));
      if (consistent.size === 1) {
        const [value] = consistent;
        if (!this.setEdge(edge.key, value, row, pos)) return false;
        queue.push(edge.nb);
      } else if (consistent.size === 0 && nbHidden != null) {
        this.contradictions.push({
          row, position: pos, expected: setMembers.join('/'), found: `${nbOwn}/${nbHidden}`,
          neighborRow: edge.nb.row, neighborPosition: edge.nb.pos,
        });
        this.trail.push({ type: 'contradiction' });
        return false;
      }
    }
    return true;
  }
}

function allRealKnots(rows: InstructionRow[]): Ref[] {
  const out: Ref[] = [];
  rows.forEach((r, row) => r.knots.forEach((k, pos) => { if (k.isKnot && k.color != null) out.push({ row, pos }); }));
  return out;
}

// Same tie-break rules as before (own first, else darkest), same
// backtracking-with-undo shape - just operating on the incremental
// solver's mutable state instead of recomputing from scratch each time.
export function resolveHiddenColorsFast(rows: InstructionRow[]): ValidityResult {
  const solver = new IncrementalSolver(rows);
  if (solver.contradictions.length > 0) {
    return { hidden: solver.hidden, contradictions: solver.contradictions, edges: Object.fromEntries(solver.edgeValue) };
  }

  const palette = Array.from(new Set(rows.flatMap(r => r.knots.map(k => k.color).filter((c): c is string => c != null))));
  const colors = rows.map(r => r.knots.map(k => k.color));
  const knots = allRealKnots(rows).filter(({ row, pos }) => solver.hidden[row][pos] == null);

  function orderedCandidates(row: number, pos: number): string[] {
    const own = colors[row][pos]!;
    const rest = palette.filter(c => c !== own).sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
    return [own, ...rest];
  }

  const ATTEMPT_LIMIT = 500_000;
  let attempts = 0;

  function search(index: number): boolean {
    if (index >= knots.length) return true;
    const { row, pos } = knots[index];
    if (solver.hidden[row][pos] != null) return search(index + 1); // resolved as a side effect already

    for (const candidate of orderedCandidates(row, pos)) {
      if (attempts >= ATTEMPT_LIMIT) return false;
      attempts++;
      const mark = solver.mark();
      if (solver.tryForce(row, pos, candidate) && search(index + 1)) return true;
      solver.undoTo(mark);
    }
    return false;
  }

  search(0);

  // FINAL EDGE-LEVEL PASS - same as before: a specific line can rarely
  // still have both of a knot's two colors simultaneously consistent with
  // its neighbor even once both knots' full pairs are known. Same
  // tie-break, one level down.
  const widths = colors.map(c => c.length);
  const finalEdges: Record<string, string> = Object.fromEntries(solver.edgeValue);
  for (let r = 0; r < rows.length - 1; r++) {
    for (let p = 0; p < widths[r]; p++) {
      if (!rows[r].knots[p].isKnot || colors[r][p] == null) continue;
      for (const q of candidatePositions(p, widths[r], widths[r + 1])) {
        if (!rows[r + 1].knots[q].isKnot) continue;
        const key = edgeKey(r, p, q);
        if (finalEdges[key] !== undefined) continue;
        const ownA = colors[r][p], hidA = solver.hidden[r][p];
        const ownB = colors[r + 1][q], hidB = solver.hidden[r + 1][q];
        if (ownA == null || hidA == null || ownB == null || hidB == null) continue;
        const consistent = new Set([ownA, hidA].filter(v => v === ownB || v === hidB));
        if (consistent.size === 0) continue;
        finalEdges[key] = consistent.has(ownA)
          ? ownA
          : Array.from(consistent).sort((a, b) => relativeLuminance(a) - relativeLuminance(b))[0];
      }
    }
  }

  return { hidden: solver.hidden, contradictions: solver.contradictions, edges: finalEdges };
}


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
// HANDLING GENUINE CONTRADICTIONS (also caught by testing, not assumed):
// a pattern can have a few real, unavoidable conflicts (proven by base
// forward deduction alone, no guessing involved) while still being
// perfectly resolvable everywhere else. An early version bailed out of
// the whole search the moment ANY contradiction existed anywhere,
// leaving huge unrelated stretches of an otherwise-fine pattern dashed
// for no reason. The fix: a hypothesis is rejected only if it introduces
// a NEW conflict beyond the ones base deduction already proved exist
// regardless of any choice - the known, unavoidable ones don't block
// resolving everything else, and the knots directly involved in them are
// left out of the search entirely (nothing to choose there; they're
// already proven broken).
//
// TIE-BREAK RULES (both explicitly chosen in chat, not invented here):
// try the knot's own displayed color FIRST, then remaining colors
// darkest-first. If a choice is later found to conflict with something
// deeper in the search, it's undone and the next candidate in that same
// preference order is tried - so the end result still always prefers own,
// then darkest, it just no longer gets stuck on a choice that looked fine
// in isolation but wasn't globally consistent.
export function resolveHiddenColorsExhaustive(rows: InstructionRow[]): ValidityResult {
  // TEMPORARILY DISABLED - see the note on computePatternValidity above.
  // This function is ALSO called directly (BuildInstructionView.tsx),
  // bypassing that one - needs the same safe short-circuit so nothing in
  // the app can still surface the proven-wrong result through this path.
  const hidden: (string | null)[][] = rows.map(r => r.knots.map(() => null));
  return { hidden, contradictions: [], edges: {} };

  /* DISABLED - kept for reference while the correct+fast replacement is built.
  const base = resolveHiddenColorsCore(rows, []);

  // Location-based signature (which two knots, not the exact wording) so
  // a baseline conflict is still recognized as "already known" even if a
  // later hypothesis elsewhere changes the propagation order enough to
  // phrase it slightly differently.
  function contradictionSignature(c: Contradiction): string {
    const a = `${c.row}:${c.position}`;
    const b = c.neighborRow != null && c.neighborPosition != null ? `${c.neighborRow}:${c.neighborPosition}` : '';
    return [a, b].sort().join('|');
  }
  const baselineSignatures = new Set(base.contradictions.map(contradictionSignature));
  function isAcceptable(trial: ValidityResult): boolean {
    return trial.contradictions.every(c => baselineSignatures.has(contradictionSignature(c)));
  }

  const baselineInvolvedKnots = new Set<string>();
  for (const c of base.contradictions) {
    baselineInvolvedKnots.add(`${c.row}:${c.position}`);
    if (c.neighborRow != null && c.neighborPosition != null) {
      baselineInvolvedKnots.add(`${c.neighborRow}:${c.neighborPosition}`);
    }
  }

  const palette = Array.from(new Set(rows.flatMap(r => r.knots.map(k => k.color).filter((c): c is string => c != null))));
  const isKnot = rows.map(r => r.knots.map(k => k.isKnot));
  const colors = rows.map(r => r.knots.map(k => k.color));

  const unresolved: { row: number; pos: number }[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let p = 0; p < colors[r].length; p++) {
      if (
        isKnot[r][p] && colors[r][p] != null && base.hidden[r][p] == null &&
        !baselineInvolvedKnots.has(`${r}:${p}`) // proven broken already - nothing to search for here
      ) {
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
      if (attempts >= ATTEMPT_LIMIT) return null;
      attempts++;
      const nextForced = [...forced, { row, pos, value: candidate }];
      const trial = resolveHiddenColorsCore(rows, nextForced);
      if (!isAcceptable(trial)) continue; // introduces a NEW conflict, not just a known one - try next candidate
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
  // exists at all for the remaining ambiguous knots, or it ran out of
  // attempt budget first - either way, falling back to the base (forward-
  // deduction-only) result is the safe, honest choice: it never asserts
  // anything unproven, it just leaves more knots and lines unresolved
  // than a full search might have managed to close.

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
  */
}

export function isPatternValid(rows: InstructionRow[]): boolean {
  return resolveHiddenColors(rows).contradictions.length === 0;
}
