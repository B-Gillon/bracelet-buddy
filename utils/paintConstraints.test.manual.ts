import { InstructionRow } from './knotInstructions';
import { canSetColorAt, allowedColorsAt } from './paintConstraints';
import { checkPatternFeasibility } from './patternFeasibility';

function row(colors: (string | null)[]): InstructionRow {
  return {
    index: 0, displayNumber: 0, pass: 'main',
    knots: colors.map((color, p) => ({ key: String(p), color, arrow: 'right', displayPos: p, isKnot: true })),
  };
}

// A clean, known-feasible baseline: main(2) -> gap-shaped(3) -> main(2).
// Row1 position 1 is deliberately ambiguous (color A, same as position 0),
// which is exactly the kind of cell where "rerouting" matters.
const baseline: InstructionRow[] = [
  row(['A', 'B']),
  row(['A', 'A', 'B']),
  row(['A', 'B']),
];

console.log('--- Baseline (should be feasible) ---');
console.log(checkPatternFeasibility(baseline));

// Repaint row1 position1 (currently 'A') to 'B'. Under the ORIGINAL fixed
// path assignment this cell wasn't on (it was slack capacity), so this is
// a fair test of "does a fresh global recheck still find 2 full paths".
console.log('--- Repaint row1 pos1: A -> B (should still be feasible) ---');
console.log(canSetColorAt(baseline, 1, 1, 'B'));

// Repaint row1 position1 to a color that appears NOWHERE else in the
// pattern. No real string can be proven to be this color anywhere, so no
// rerouting can save it - should be infeasible.
console.log('--- Repaint row1 pos1: A -> Green (never appears elsewhere, should be infeasible) ---');
console.log(canSetColorAt(baseline, 1, 1, 'Green'));

// Ask "what colors are actually allowed at this cell right now" from a
// small palette - should include A and B, exclude Green.
console.log('--- Allowed colors at row1 pos1 from [A, B, Green] ---');
console.log(allowedColorsAt(baseline, 1, 1, ['A', 'B', 'Green']));
