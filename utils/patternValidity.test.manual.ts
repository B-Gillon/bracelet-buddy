import { InstructionRow } from './knotInstructions';
import { resolveHiddenColors } from './patternValidity';

function mainRow(colors: (string | null)[]): InstructionRow {
  return {
    index: 0, displayNumber: 0, pass: 'main',
    knots: colors.map((color, p) => ({ key: String(p), color, arrow: 'right', displayPos: p, isKnot: true })),
  };
}

function gapRow(colors: (string | null)[]): InstructionRow {
  const last = colors.length - 1;
  return {
    index: 0, displayNumber: 0, pass: 'gap',
    knots: colors.map((color, p) => ({
      key: String(p), color, arrow: 'right', displayPos: p, isKnot: p !== 0 && p !== last,
    })),
  };
}

// Case 1: dot differs from its parent's own color - hand-verified expected
// result: dot at gap-row position 0 (color Blue) is the idle continuation
// of main-row position 0 (own color Red). They differ, so main-row
// position 0's HIDDEN color must be Blue. No contradiction.
console.log('--- Case 1: dot reveals parent hidden color ---');
const case1: InstructionRow[] = [
  mainRow(['Red', 'Green']),
  gapRow(['Blue', 'Green', 'Green']),
];
console.log(JSON.stringify(resolveHiddenColors(case1)));
console.log('expected: hidden[0][0] = "Blue", no contradictions');

// Case 2: dot matches parent's own color exactly - nothing new learned,
// hidden should remain null (NOT assumed to be anything).
console.log('--- Case 2: dot matches parent own color (no new info) ---');
const case2: InstructionRow[] = [
  mainRow(['Red', 'Green']),
  gapRow(['Red', 'Green', 'Green']),
];
console.log(JSON.stringify(resolveHiddenColors(case2)));
console.log('expected: hidden[0][0] = null, no contradictions');

// Case 3: contradiction. A narrow (2-string) pattern where the SAME real
// knot gets two independently-provable hidden-color facts that disagree -
// hand-verified below, not guessed:
//   Row0 (gap, w3): [Pink, Yellow, Cyan] - dots at 0 and 2, real knot at 1.
//   Row1 (main, w2): [Yellow, Blue] - both real knots.
//   Row2 (gap, w3): [Purple, Blue, Green] - dots at 0 and 2, real knot at 1.
// Row0's dot0 (Pink) is main-row position0's parent connection - Pink !=
// Yellow (position0's own color), so position0's hidden should be Pink.
// Row2's dot0 (Purple) is ALSO main-row position0's connection (from the
// other side) - Purple != Yellow too, so it claims hidden should be
// Purple. Pink != Purple: genuine contradiction at row1, position0.
// Symmetrically, row0's dot2 (Cyan) and row2's dot2 (Green) both make
// conflicting claims about main-row position1's hidden color too.
// Expected: hidden[1] = ['Pink', 'Cyan'] (first value each position saw),
// contradictions = [
//   { row: 1, position: 0, expected: 'Pink', found: 'Purple' },
//   { row: 1, position: 1, expected: 'Cyan', found: 'Green' },
// ]
console.log('--- Case 3: contradiction (same knot gets two disagreeing dot-derived facts) ---');
const case3: InstructionRow[] = [
  gapRow(['Pink', 'Yellow', 'Cyan']),
  mainRow(['Yellow', 'Blue']),
  gapRow(['Purple', 'Blue', 'Green']),
];
console.log(JSON.stringify(resolveHiddenColors(case3)));
