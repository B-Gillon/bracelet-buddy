import { DualGrid, RowTechnique, RowTechniques } from '../types/pattern';

// Turns a pattern's painted colors + per-row techniques into an ordered,
// knot-by-knot build sequence. See BUILD-CENTER-INSTRUCTIONS-PLAN.md for
// the original design reasoning.
//
// AXIS CONVENTION - easy to get backwards, so spelled out explicitly:
// NewPatternScreen maps "Length" to config.cols and "Width" to config.rows,
// and the grid is stored/rendered with length running horizontally (each
// PatternGrid row is one WIDTH-position, each column within it is one
// LENGTH-position). A real bracelet is physically tied one row at a time
// ALONG ITS LENGTH, so one "instructional row" here corresponds to a single
// LENGTH position (a grid column).
//
// REVERSAL CONVENTION - the other easy-to-get-backwards piece, fixed after
// a real bug report: picture physically rotating the on-screen pattern
// preview (length horizontal, width vertical) 90 degrees CLOCKWISE to turn
// it into build order (length running top-to-bottom, width running
// left-to-right within each row). A clockwise turn puts the pattern's
// BOTTOM edge (highest width-index) at the LEFT of each build row, and its
// TOP edge (width-index 0) at the RIGHT. So displayPos 0 (the leftmost knot
// drawn) must read from the grid's LAST width row, not its first.
//
// SEPARATE MAIN/GAP ROWS, AND WHICH ONE IS "FULL" - real diamond-lattice
// bracelets alternate between two interleaved rows as you go down the
// length: a "full" row where every strand is tied into a real knot, and a
// "reduced" row where the two edge strands don't have a partner yet (they
// just idle past, unchanged, until the next full row). Cross-checked
// against a real reference pattern (BraceletBook: Width 2 -> 4 strings ->
// full row = 2 knots = Width, reduced row = 1 knot = Width-1): this app's
// MAIN grid (width knots, every position a real tie) is the FULL row: it
// needs no special edge handling at all. This app's GAP grid (width+1
// diamonds) is the REDUCED row - but only width-1 of its positions are
// real knots. Its two edge diamonds are a rendering artifact, not real
// knots: buildCells() centers them exactly ON the pattern's boundary, so
// only half of each is ever visible - they exist to make the *color
// grid's* edges look finished, not to represent an independent tie. A
// real reduced-row edge strand is simply the same string continuing
// through from the full row before it to the full row after it, unchanged.
// So each gap row still carries all width+1 painted colors (nothing is
// discarded), but its first and last knot are flagged `isKnot: false` -
// the UI renders those as a colored connector arc (the idle string just
// passing by) instead of a knot circle with a direction arrow, since no
// tie actually happens there. Every gap column and every main column still
// gets its own instructional row, interleaved gap/main/gap/... down the
// full length.
//
// LEADING/TRAILING BOUNDARY COLUMNS - the same clipped-edge reasoning
// applies along the LENGTH axis too, not just width: gap column 0 and gap
// column lengthCount sit exactly on the pattern's left/right boundary
// (buildCells() centers every diamond in those columns exactly at x=0 or
// x=lengthCount*D), so EVERY diamond in those two columns is half-clipped,
// not just their width-edges. They represent the starting strand layout
// and the finishing tail, not a real tied row, so they're dropped from the
// instructional sequence entirely (not shown as their own row at all,
// including whatever middle knots they'd otherwise have). The sequence
// always starts and ends on a main row as a result - the first and last
// rows that consist entirely of real knots. They're also excluded as
// NEIGHBOR data below, not just from the rendered list - see the loop
// comment further down for why.
//
// CONTINUITY-BASED DIRECTION - a knot's tie direction is derived from
// whether its own color actually continues from the row tied just before
// it, not from a fixed "always split the row down the middle" assumption.
// Geometrically, every knot has exactly two possible "parent" knots in the
// previous row (the two diamonds it's nested between - see diamondGrid.ts).
// If this knot's color matches its LEFT parent (and not its right one),
// that color visibly moved rightward to get here, so the arrow points
// right; if it matches the right parent, the arrow points left. Real
// patterns often hold one direction for many rows in a row (a long
// diagonal run) and only flip where the colors actually show a reversal -
// this reproduces that instead of forcing a symmetric chevron on every
// single row. Knots where the color matches both parents (a solid run) or
// neither (a fresh color introduced this row) are genuinely undetermined
// from color alone, so they simply inherit whichever direction is
// determined nearby (the ambiguity doesn't matter visually either way -
// see BUILD-CENTER-INSTRUCTIONS-PLAN.md). The very first row has no real
// previous row to compare against (the leading boundary column doesn't
// count - see above), so it instead borrows the SAME comparison against
// the row right after it (which direction would this row's colors have
// "arrived from" if time ran backwards), then flips the result - a knot
// that looks like it's departing rightward when read forwards is the same
// physical motion as one arriving leftward when read backwards. This keeps
// the first row consistent with whatever direction the rest of the
// pattern is actually running, instead of an arbitrary centered chevron.
// Only a fully solid row with no usable neighbor data in either direction
// falls back to that chevron. A manual per-row technique override, if one
// is ever stored, still wins outright over auto-detection. (Edge connector
// knots still get a computed arrow like any other position - it's simply
// unused by the UI, since no real tie/direction happens there.)
//
// WHY THERE'S NO "SECOND STRING PER KNOT" HERE - a real tie physically has
// two strings entering and two leaving, but the color grid only ever
// records the one that ends up "on top" (this knot's own `color`). An
// earlier version of this file tried to derive that second, hidden string
// per knot - twice, via two different approaches (a forward union-find
// chain, then a neighbor-arrow-based comparison) - and both were proven
// wrong by a live conservation check: a knot's own resolved "hidden"
// value routinely disagreed with what its downstream connections actually
// carried. The root issue is real, not just a bug to patch - a knot's
// hidden color depends on its neighbor's hidden color, which depends on
// its neighbor's, all the way across the pattern; solving that properly
// is a global constraint problem, not something a local, pairwise
// comparison can get right, and a freeform painted pattern isn't even
// guaranteed to have a fully consistent solution at all. Given that, this
// derivation was deliberately dropped rather than shipped as a
// good-looking guess: every connecting line below is drawn only where a
// knot's own displayed color provably continues into a neighbor that
// shows the same color - never a fabricated second color. The one thing
// that IS reliably knowable without solving that whole problem is the
// COUNT of starting strings (every one of the first row's knots ties
// exactly 2 strings, so the total is just that row's own colors, each
// counted twice) - see BuildInstructionView.tsx's colorTally.

export type InstructionKnot = {
  key: string;
  color: string | null;
  arrow: 'left' | 'right';
  displayPos: number; // 0-based position, left to right, within this row's knot strip
  // False only for a gap row's two edge positions - see the SEPARATE
  // MAIN/GAP ROWS note above. The UI renders these as a colored connector
  // arc instead of a knot circle with a direction arrow.
  isKnot: boolean;
};

export type InstructionRow = {
  // Flat, gap-first position matching instructionRowIndexForCell - stable
  // across the boundary-column filtering below, so PatternThumbnail's
  // dimming (keyed on this same value) and buildProgress (which stores
  // these) never need to change when a pattern's length changes.
  index: number;
  // 1-based position within the FILTERED, rendered sequence - this is what
  // the UI shows as "Row N". Always starts at 1 with no gaps, since the
  // two boundary columns never appear in the rendered list at all.
  displayNumber: number;
  pass: 'main' | 'gap';
  knots: InstructionKnot[];
};

// Every gap column (0..lengthCount) becomes flat index gc*2; every main
// column (0..lengthCount-1) becomes flat index gc*2+1 - interleaving them
// gap, main, gap, main, ..., gap. The two boundary gap columns (0 and
// lengthCount) don't get their own rendered row (see LEADING/TRAILING
// BOUNDARY COLUMNS above), so their diamonds piggyback on whichever real
// row they visually sit beside - PatternThumbnail's "mark row done ->
// dim this diamond" lookup uses this same function, so marking the first
// or last real row done also dims the boundary column right next to it,
// instead of leaving it permanently un-dimmable.
export function instructionRowIndexForCell(pass: 'main' | 'gap', gc: number, lengthCount: number): number {
  if (lengthCount <= 0) return 0;
  if (pass === 'gap' && gc === 0) return 1; // piggyback on main column 0, the first rendered row
  if (pass === 'gap' && gc === lengthCount) return (lengthCount - 1) * 2 + 1; // piggyback on the last main column
  return pass === 'gap' ? gc * 2 : gc * 2 + 1;
}

// Fallback for rows with nothing to compare against (just the first row),
// and the shape a manual override falls back to as well - a chevron
// centered on the row's own knot count.
export function getDefaultRowTechnique(knotCount: number): RowTechnique {
  return { type: 'chevron', splitCol: Math.ceil(knotCount / 2) };
}

export function resolveRowTechnique(
  stored: RowTechnique | null | undefined,
  knotCount: number
): RowTechnique {
  return stored ?? getDefaultRowTechnique(knotCount);
}

function arrowForDisplayPos(technique: RowTechnique, displayPos: number): 'left' | 'right' {
  if (technique.type === 'diagonal') return technique.direction;
  return displayPos < technique.splitCol ? 'right' : 'left';
}

// Reads one grid column's colors in REVERSED (display) order - see the
// REVERSAL CONVENTION note above. gridRows[knotCount-1] (the grid's last
// row) becomes displayPos 0 (leftmost), gridRows[0] becomes displayPos
// knotCount-1 (rightmost).
function readColumnColors(
  gridRows: (string | null)[][],
  gridCol: number,
  knotCount: number
): (string | null)[] {
  const colors: (string | null)[] = [];
  for (let p = 0; p < knotCount; p++) {
    const gridRowIndex = knotCount - 1 - p;
    colors.push(gridRows[gridRowIndex]?.[gridCol] ?? null);
  }
  return colors;
}

// Determines this row's per-knot directions by tracing which way each
// knot's color actually continues from the previous tied row - see the
// CONTINUITY-BASED DIRECTION note above.
function computeArrows(
  colors: (string | null)[],
  neighborColors: (string | null)[] | null,
  fallbackTechnique: RowTechnique
): ('left' | 'right')[] {
  const n = colors.length;
  const arrows: ('left' | 'right' | null)[] = colors.map(() => null);

  if (neighborColors) {
    // Every knot in this row sits nested between exactly two knots in the
    // neighbor row - "neighborColors[p] & neighborColors[p+1]" when the
    // neighbor row is wider, "neighborColors[p-1] & neighborColors[p]"
    // when this row is wider. Both reduce to the same geometric statement:
    // the two parents straddling this position.
    const neighborIsWider = neighborColors.length > n;
    for (let p = 0; p < n; p++) {
      const color = colors[p];
      if (color == null) continue;
      const leftNeighbor = neighborIsWider ? neighborColors[p] ?? null : (p - 1 >= 0 ? neighborColors[p - 1] ?? null : null);
      const rightNeighbor = neighborIsWider ? neighborColors[p + 1] ?? null : neighborColors[p] ?? null;
      const leftMatch = leftNeighbor != null && leftNeighbor === color;
      const rightMatch = rightNeighbor != null && rightNeighbor === color;
      if (leftMatch && !rightMatch) arrows[p] = 'right';
      else if (rightMatch && !leftMatch) arrows[p] = 'left';
      // both-match (solid run) or neither-match (a fresh color) stays
      // undetermined here - filled in below from nearby knots, since color
      // alone can't tell direction in either case.
    }
  }

  // Forward-fill, then backward-fill any remaining gaps from the nearest
  // determined neighbor, so a row's direction only changes where the
  // colors actually show a real reversal, not knot-by-knot noise.
  let last: 'left' | 'right' | null = null;
  for (let p = 0; p < n; p++) {
    if (arrows[p] != null) last = arrows[p];
    else if (last != null) arrows[p] = last;
  }
  last = null;
  for (let p = n - 1; p >= 0; p--) {
    if (arrows[p] != null) last = arrows[p];
    else if (last != null) arrows[p] = last;
  }

  // Nothing determinable at all (a fully solid row, or no neighbor data
  // was passed in) - falls back to a centered chevron split.
  return arrows.map((a, p) => a ?? arrowForDisplayPos(fallbackTechnique, p));
}

// A knot "arriving via right" (matched its left neighbor) when compared
// against the row AFTER it is the same physical motion as "departing via
// right" when read in true chronological order - direction only flips
// because computeArrows always describes motion FROM the reference row TO
// the row being computed, and here the reference row is chronologically
// later, not earlier.
function flipArrows(arrows: ('left' | 'right')[]): ('left' | 'right')[] {
  return arrows.map(a => (a === 'left' ? 'right' : 'left'));
}

// Every knot sits nested between exactly two positions in the adjacent
// row (the two diamonds it's geometrically between - see diamondGrid.ts).
// Rather than picking just one of those two as "the" connection, this
// returns every candidate position that's actually in bounds - callers
// decide what to do with each one (draw a line, etc). Exported so every
// consumer shares the exact same geometry and can never quietly drift
// apart.
export function candidatePositions(sourcePos: number, sourceCount: number, targetCount: number): number[] {
  const sourceIsWider = sourceCount > targetCount;
  const candidates = sourceIsWider ? [sourcePos, sourcePos - 1] : [sourcePos, sourcePos + 1];
  return candidates.filter(p => p >= 0 && p < targetCount);
}

export function buildInstructionRows(
  dualGrid: DualGrid,
  rowTechniques: RowTechniques | null | undefined
): InstructionRow[] {
  const widthCount = dualGrid.main.length;
  const lengthCount = widthCount > 0 ? dualGrid.main[0].length : 0;
  const gapWidthCount = widthCount + 1;

  type RawRow = {
    index: number;
    pass: 'main' | 'gap';
    gridColL: number;
    colors: (string | null)[];
    techniqueSlot: number;
  };
  const raw: RawRow[] = [];
  for (let L = 0; L <= lengthCount; L++) {
    raw.push({
      index: instructionRowIndexForCell('gap', L, lengthCount),
      pass: 'gap',
      gridColL: L,
      colors: readColumnColors(dualGrid.gap, L, gapWidthCount),
      techniqueSlot: Math.min(L, lengthCount - 1),
    });
    if (L < lengthCount) {
      raw.push({
        index: instructionRowIndexForCell('main', L, lengthCount),
        pass: 'main',
        gridColL: L,
        colors: readColumnColors(dualGrid.main, L, widthCount),
        techniqueSlot: L,
      });
    }
  }

  // Arrow/continuity detection runs over the FULL, unfiltered sequence,
  // EXCEPT the two boundary columns themselves never count as neighbor
  // data (only raw[0] and raw[raw.length - 1] can ever be one - see
  // LEADING/TRAILING BOUNDARY COLUMNS above for why they're always
  // exactly the first and last raw entries). They're a rendering artifact
  // representing the starting strand layout and finishing tail, not a
  // real tied row - without this exclusion the very first row would
  // silently borrow the leading boundary column as its "previous" row
  // (it technically has real color data), when the documented intent has
  // always been for the first row to use forward look-ahead instead (see
  // CONTINUITY-BASED DIRECTION above).
  const rows: (InstructionRow & { isBoundaryColumn: boolean })[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const prevIsBoundary = i - 1 === 0;
    const nextIsBoundary = i + 1 === raw.length - 1;
    const prevColors = i > 0 && !prevIsBoundary ? raw[i - 1].colors : null;
    const nextColors = i < raw.length - 1 && !nextIsBoundary ? raw[i + 1].colors : null;
    const knotCount = r.colors.length;
    const stored = rowTechniques?.[r.techniqueSlot];
    const fallbackTechnique = resolveRowTechnique(stored, knotCount);

    // An explicit manual override (kept for backward-compat, though there's
    // no UI to set one anymore) always wins outright - otherwise, auto-
    // detect from actual color continuity, preferring the row before this
    // one and only borrowing the row after it (flipped - see flipArrows)
    // when there's nothing earlier to compare against at all.
    const arrows = stored
      ? r.colors.map((_, p) => arrowForDisplayPos(stored, p))
      : prevColors
        ? computeArrows(r.colors, prevColors, fallbackTechnique)
        : nextColors
          ? flipArrows(computeArrows(r.colors, nextColors, fallbackTechnique))
          : r.colors.map((_, p) => arrowForDisplayPos(fallbackTechnique, p));

    rows.push({
      index: r.index,
      displayNumber: 0, // assigned below, after filtering
      pass: r.pass,
      isBoundaryColumn: r.pass === 'gap' && (r.gridColL === 0 || r.gridColL === lengthCount),
      knots: r.colors.map((color, p) => ({
        key: `${r.pass}-${r.gridColL}-${p}`,
        color,
        arrow: arrows[p],
        displayPos: p,
        isKnot: r.pass === 'main' ? true : p !== 0 && p !== knotCount - 1,
      })),
    });
  }

  return rows
    .filter(r => !r.isBoundaryColumn)
    .map((r, i) => {
      const { isBoundaryColumn, ...row } = r;
      return { ...row, displayNumber: i + 1 };
    });
}
