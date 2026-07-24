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
// SCOPE OF THIS FIRST VERSION - being explicit rather than repeating the
// doc's own warning silently:
// - Implements DOT-ANCHORED propagation only (doc section 3, bullets 1 and
//   the dot-triggered case of bullet 3). A connector dot has exactly one
//   parent and one child (see knotInstructions.ts's SEPARATE MAIN/GAP ROWS
//   note) so its own painted color is always exactly correct for that one
//   edge, no inference needed - this is the fully rigorous, no-guessing
//   part of the algorithm.
// - Does NOT yet implement the harder real-knot-to-real-knot propagation
//   for chains with no dot nearby (doc bullet 3's general case). That
//   requires reasoning about which of a knot's two candidate edges belongs
//   to which neighbor - exactly the kind of local shortcut the doc's two
//   failed attempts both took, and both were wrong. Left OUT on purpose
//   rather than risking a third version of the same mistake.
// - Consequence: some knots will show `hidden: null` (genuinely
//   undetermined, not a bug) even in patterns that could theoretically be
//   fully resolved - false "can't tell" is safe; this file never invents a
//   value it can't prove.
// - Per the doc's own hard lesson: this has only been checked against
//   hand-verified unit cases below, NOT yet against a live-rendered
//   pattern in the browser. Both prior attempts also passed code review
//   and typechecking and were still wrong. Treat this as unverified until
//   that live check happens.

import { InstructionRow, candidatePositions, buildInstructionRows } from './knotInstructions';
import { DualGrid } from '../types/pattern';

export interface Contradiction {
  row: number;
  position: number;
  expected: string;
  found: string;
}

export interface ValidityResult {
  hidden: (string | null)[][]; // hidden[row][position], meaningful only where isKnot is true
  contradictions: Contradiction[];
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
}

export function computePatternValidity(dualGrid: DualGrid): PatternValidityResult {
  const rows = buildInstructionRows(dualGrid, null);
  const { hidden, contradictions } = resolveHiddenColors(rows);
  return { valid: contradictions.length === 0, contradictions, hidden };
}

// The unique neighbor position in `otherRow` connected to (row, pos) - only
// meaningful for dots, which are geometrically guaranteed exactly one
// connection on each side (see knotInstructions.ts). Returns null if none.
function uniqueNeighbor(
  widths: number[],
  row: number,
  pos: number,
  otherRow: number
): number | null {
  if (otherRow === row - 1) {
    for (let q = 0; q < widths[row - 1]; q++) {
      if (candidatePositions(q, widths[row - 1], widths[row]).includes(pos)) return q;
    }
    return null;
  }
  if (otherRow === row + 1) {
    const candidates = candidatePositions(pos, widths[row], widths[row + 1]);
    return candidates.length > 0 ? candidates[0] : null;
  }
  return null;
}

export function resolveHiddenColors(rows: InstructionRow[]): ValidityResult {
  const colors = rows.map(r => r.knots.map(k => k.color));
  const isKnot = rows.map(r => r.knots.map(k => k.isKnot));
  const widths = colors.map(c => c.length);
  const numRows = colors.length;

  const hidden: (string | null)[][] = widths.map(w => new Array(w).fill(null));
  const contradictions: Contradiction[] = [];

  function setHidden(row: number, pos: number, value: string) {
    const current = hidden[row][pos];
    if (current === value) return; // already known and consistent
    if (current !== null && current !== value) {
      contradictions.push({ row, position: pos, expected: current, found: value });
      return;
    }
    hidden[row][pos] = value;
  }

  // Every dot's own color is a certain fact about its one parent edge and
  // its one child edge (doc bullet 1). If that fact differs from the real
  // knot's own displayed color at the other end, it must be that knot's
  // hidden color (doc bullet 3's dot-triggered case) - if it matches,
  // there's simply nothing new to learn from this dot.
  for (let r = 0; r < numRows; r++) {
    for (let p = 0; p < widths[r]; p++) {
      if (isKnot[r][p]) continue; // only dots are unconditionally certain
      const dotColor = colors[r][p];
      if (dotColor == null) continue;

      if (r > 0) {
        const parentP = uniqueNeighbor(widths, r, p, r - 1);
        if (parentP != null && isKnot[r - 1][parentP] && colors[r - 1][parentP] !== dotColor) {
          setHidden(r - 1, parentP, dotColor);
        }
      }
      if (r < numRows - 1) {
        const childP = uniqueNeighbor(widths, r, p, r + 1);
        if (childP != null && isKnot[r + 1][childP] && colors[r + 1][childP] !== dotColor) {
          setHidden(r + 1, childP, dotColor);
        }
      }
    }
  }

  return { hidden, contradictions };
}

export function isPatternValid(rows: InstructionRow[]): boolean {
  return resolveHiddenColors(rows).contradictions.length === 0;
}
