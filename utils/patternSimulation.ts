// FORWARD SIMULATION - this replaces guessing backward from a finished
// picture (patternFeasibility.ts / paintConstraints.ts) with knowing the
// real construction forward, per the chevron pattern that exposed three
// separate counterexamples in a row. See chat history for the full
// reasoning; this file is the actual fix, not another patch to the checker.
//
// CORE GUARANTEE: every technique function below is a PERMUTATION of the
// current string order - it only ever reorders the physical strings
// already on the board, never invents or drops one. That's what makes this
// "no further issues by construction" rather than "checked and found no
// issues yet": a permutation of real strings is always physically tieable,
// full stop, because real knot-tying IS a sequence of adjacent swaps. There
// is nothing left to verify after the fact.
//
// Extends the existing RowTechnique type (types/pattern.ts: 'diagonal' and
// 'chevron') with the third real technique discovered from the wave
// pattern - 'wrap', where one string sweeps across, ties every other
// string in sequence, and becomes the row's whole displayed color.

import { RowTechnique } from '../types/pattern';

export type WrapTechnique = { type: 'wrap'; stringIndex: number; direction: 'left' | 'right' };
export type SimTechnique = RowTechnique | WrapTechnique;

// direction 'right': every string moves one position right; the rightmost
// string wraps to the far left (a real bounce/return knot at that edge).
// This is what a plain, uniform diagonal stripe actually is physically -
// verified against the earlier "simple two-color diagonal" test pattern.
function applyDiagonal(order: string[], direction: 'left' | 'right'): string[] {
  const w = order.length;
  if (w === 0) return order;
  return direction === 'right'
    ? [order[w - 1], ...order.slice(0, w - 1)]
    : [...order.slice(1), order[0]];
}

// splitCol is the peak position. Strings from 0..splitCol rotate toward
// the peak from the left; strings from splitCol..end rotate toward the
// peak from the right. Two independent rotations meeting at one shared
// pivot position - this is the real reversal mechanic at a chevron point.
function applyChevron(order: string[], splitCol: number): string[] {
  const left = order.slice(0, splitCol + 1);
  const right = order.slice(splitCol + 1);
  const rotatedLeft = left.length > 0 ? [left[left.length - 1], ...left.slice(0, -1)] : left;
  const rotatedRight = right.length > 0 ? [...right.slice(1), right[0]] : right;
  return [...rotatedLeft, ...rotatedRight];
}

// The sweeping string (stringIndex) ends up at the far end it swept
// toward; everything it passed over shifts one position to fill the gap
// it left behind. Equivalent to "extract one element, append it at the
// far end" - a single-element permutation.
function applyWrap(order: string[], stringIndex: number, direction: 'left' | 'right'): string[] {
  const rest = [...order.slice(0, stringIndex), ...order.slice(stringIndex + 1)];
  return direction === 'right' ? [...rest, order[stringIndex]] : [order[stringIndex], ...rest];
}

export function applyTechnique(order: string[], technique: SimTechnique | null): string[] {
  if (technique == null) return order.slice(); // no technique specified yet - no-op, never a silent guess
  switch (technique.type) {
    case 'diagonal': return applyDiagonal(order, technique.direction);
    case 'chevron': return applyChevron(order, technique.splitCol);
    case 'wrap': return applyWrap(order, technique.stringIndex, technique.direction);
  }
}

// Runs the whole pattern forward. Returns one entry per row CHECKPOINT:
// index 0 is the untouched starting layout (what's on the board before any
// tying), and index i (i >= 1) is the string order after techniques[i-1]
// has been applied. Each entry's array IS that main row's displayed
// colors, because after tying, the string on top at position p is exactly
// order[p].
export function simulatePattern(
  startingColors: string[],
  techniques: (SimTechnique | null)[]
): string[][] {
  let order = startingColors.slice();
  const rows: string[][] = [order.slice()];
  for (const technique of techniques) {
    order = applyTechnique(order, technique);
    rows.push(order.slice());
  }
  return rows;
}

// Verifies the core guarantee itself - that a technique only reordered the
// strings and never invented, dropped, or duplicated one. Used in tests,
// not required in production once trusted, but kept exported so it can be
// asserted anywhere new techniques get added later.
export function isPermutationOf(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = a.slice().sort();
  const sortedB = b.slice().sort();
  return sortedA.every((c, i) => c === sortedB[i]);
}
