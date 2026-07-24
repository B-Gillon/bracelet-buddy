import { simulatePattern, isPermutationOf, SimTechnique } from './patternSimulation';

const PURPLE = '#8e2de2';
const BORDER = '#0d0221';
const CYAN = '#00c6ff';

// The real starting strings from the chevron pattern's actual row 1 data:
// 5 purple, 1 border string.
const startingColors = [PURPLE, PURPLE, PURPLE, PURPLE, PURPLE, BORDER];

// Diagonal-left for a while (border drifts one direction, matching the
// real data's early rows), then diagonal-right (matching the real data's
// direction flip partway through) - built entirely from real techniques,
// nothing painted or guessed.
const techniques: (SimTechnique | null)[] = [
  { type: 'diagonal', direction: 'left' },
  { type: 'diagonal', direction: 'left' },
  { type: 'diagonal', direction: 'left' },
  { type: 'diagonal', direction: 'left' },
  { type: 'diagonal', direction: 'left' },
  { type: 'diagonal', direction: 'right' },
  { type: 'diagonal', direction: 'right' },
  { type: 'diagonal', direction: 'right' },
  { type: 'diagonal', direction: 'right' },
  { type: 'diagonal', direction: 'right' },
];

const rows = simulatePattern(startingColors, techniques);

console.log('--- Simulated rows (each IS the displayed main-row colors) ---');
rows.forEach((r, i) => console.log(`row ${i}:`, r));

console.log('--- Permutation guarantee check (every row vs starting colors) ---');
const allValid = rows.every(r => isPermutationOf(r, startingColors));
console.log('every row is a valid permutation of the starting strings:', allValid);

// Now a case that would have needed the 'wrap' technique - the earlier
// wave pattern's whole-row-solid-color rows.
console.log('--- Wrap technique demo ---');
const wrapRows = simulatePattern(
  ['Pink', 'Cyan'],
  [{ type: 'wrap', stringIndex: 0, direction: 'right' }, { type: 'wrap', stringIndex: 0, direction: 'right' }]
);
wrapRows.forEach((r, i) => console.log(`row ${i}:`, r));
console.log('every row is a valid permutation:', wrapRows.every(r => isPermutationOf(r, ['Pink', 'Cyan'])));

// A chevron demo, tiny and easy to verify by hand: 4 strings, peak at
// column 1, one application.
console.log('--- Chevron technique demo ---');
const chevronRows = simulatePattern(
  ['A', 'B', 'C', 'D'],
  [{ type: 'chevron', splitCol: 1 }]
);
chevronRows.forEach((r, i) => console.log(`row ${i}:`, r));
console.log('every row is a valid permutation:', chevronRows.every(r => isPermutationOf(r, ['A', 'B', 'C', 'D'])));
