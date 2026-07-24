// Manual smoke test - not wired into a test runner, just run directly with
// ts-node/tsc to sanity-check the algorithm before it touches real app code.

import { InstructionRow } from './knotInstructions';
import { checkPatternFeasibility } from './patternFeasibility';

function row(colors: (string | null)[]): InstructionRow {
  return {
    index: 0,
    displayNumber: 0,
    pass: 'main',
    knots: colors.map((color, p) => ({
      key: String(p), color, arrow: 'right', displayPos: p, isKnot: true,
    })),
  };
}

// A gap row: first and last positions are idle edges (isKnot: false),
// everything in between is a real tie.
function gapRow(colors: (string | null)[]): InstructionRow {
  const last = colors.length - 1;
  return {
    index: 0,
    displayNumber: 0,
    pass: 'gap',
    knots: colors.map((color, p) => ({
      key: String(p), color, arrow: 'right', displayPos: p,
      isKnot: p !== 0 && p !== last,
    })),
  };
}

// Case 1: simple, obviously feasible 2-row pattern.
const feasibleCase: InstructionRow[] = [
  row(['Black', 'Red']),
  row(['Black', 'Red']),
];

// Case 2: the cascade scenario. Row0->Row1 looks fine in isolation (Red
// matches row1 position 2). Row1->Row2 looks fine in isolation too, if you
// only ask "does SOME row1 position reach row2" (yes, position 1 does).
// But row0's Red string is FORCED into row1 position 2 (its only match),
// and row1 position 2 is a dead end into row2 - a fact only visible once
// you look two rows ahead, not from either transition alone.
const cascadeCase: InstructionRow[] = [
  row(['Black', 'Red']),
  row(['Black', 'Black', 'Red']),
  row(['Red', 'Black']),
];

// Case 3: gap-row idle edges with MISMATCHED colors on purpose. Main width
// 2, gap width 3. Gap position 0 and 2 are idle edges - their colors here
// deliberately don't match their main-row partner, to prove this no longer
// gets flagged as infeasible now that idle edges bypass the color check.
const gapIdleMismatchCase: InstructionRow[] = [
  row(['Black', 'Red']),
  gapRow(['Green', 'Black', 'Blue']), // positions 0 and 2 are idle edges - Green/Blue don't match Black/Red on purpose
  row(['Black', 'Red']),
];

// Case 4: a "wave" pattern - every row solid, colors change row to row
// (this is what actually failed in the screenshot). Should now be feasible.
const wavePatternCase: InstructionRow[] = [
  row(['Pink', 'Pink']),
  gapRow(['Cyan', 'Cyan', 'Cyan']),
  row(['Purple', 'Purple']),
  gapRow(['Gold', 'Gold', 'Gold']),
  row(['Green', 'Green']),
];

console.log('--- Feasible case ---');
console.log(checkPatternFeasibility(feasibleCase));

console.log('--- Cascade (should be infeasible) ---');
console.log(checkPatternFeasibility(cascadeCase));

console.log('--- Gap-row idle-edge mismatch (should now be feasible) ---');
console.log(checkPatternFeasibility(gapIdleMismatchCase));

console.log('--- Wave pattern, all solid rows (should now be feasible) ---');
console.log(checkPatternFeasibility(wavePatternCase));
