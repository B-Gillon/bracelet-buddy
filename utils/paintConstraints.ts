// Answers "can this one cell be repainted this color" by re-running the
// whole-pattern feasibility check (patternFeasibility.ts) with that one
// cell's color changed, and nothing else touched.
//
// This IS the "smart rerouting" behavior discussed in chat, and it comes for
// free from how checkPatternFeasibility already works: it has never tracked
// one single committed arrangement of hidden strings - every call re-derives
// the best possible disjoint-path arrangement from scratch, given whatever
// colors are currently displayed. So proposing a new color at one cell and
// re-checking automatically finds any alternate arrangement elsewhere in the
// pattern that still supports it, without needing separate "reroute" logic.
//
// KNOWN LIMIT (same one from before, restated for this use): a color that
// doesn't appear ANYWHERE else in the pattern can only ever be judged
// against candidatePositions/color-match rules, not against a real,
// separately-tracked string inventory - because the data model doesn't
// track physical string count/identity independent of displayed color.
// That's still the underlying limitation the forward-simulation approach
// (RowTechniques-driven) would remove for good.

import { InstructionRow } from './knotInstructions';
import { checkPatternFeasibility } from './patternFeasibility';

function withColorAt(rows: InstructionRow[], rowIndex: number, position: number, color: string): InstructionRow[] {
  return rows.map((r, ri) =>
    ri !== rowIndex
      ? r
      : {
          ...r,
          knots: r.knots.map((k, ki) => (ki !== position ? k : { ...k, color })),
        }
  );
}

export function canSetColorAt(
  rows: InstructionRow[],
  rowIndex: number,
  position: number,
  proposedColor: string
): boolean {
  return checkPatternFeasibility(withColorAt(rows, rowIndex, position, proposedColor)).feasible;
}

export function allowedColorsAt(
  rows: InstructionRow[],
  rowIndex: number,
  position: number,
  palette: string[]
): string[] {
  return palette.filter(color => canSetColorAt(rows, rowIndex, position, color));
}
