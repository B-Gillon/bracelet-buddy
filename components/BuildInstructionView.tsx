import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';
import { Theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { DualGrid, RowTechnique, RowTechniques, BuildProgress } from '../types/pattern';
import { buildInstructionRows, candidatePositions, InstructionKnot } from '../utils/knotInstructions';
import { resolveHiddenColors } from '../utils/patternValidity';

// The Build Center detail page's main instructional view - ONE continuous
// diagram for the whole pattern, matching how a real reference pattern
// diagram works: every knot lives in a single shared coordinate grid, and
// real colored strand lines are drawn between knots. A gap row's two edge
// positions aren't real knots (see knotInstructions.ts) - those render as
// a small dot with lines simply bending through them, rather than a knot
// circle, since no tie happens there. Row numbers + a done/undone toggle
// live in a fixed-width margin column on the left; the diagram itself
// scrolls horizontally on its own when a pattern is wide, while the whole
// thing scrolls vertically as part of the page like any other tall
// content, and is centered as a unit within its container.

const ROW_HEIGHT = 100;
const KNOT_SPACING = 60;
const KNOT_SIZE = 52;
const CONNECTOR_DOT_SIZE = 18;
const MARGIN_WIDTH = 84;
const TOP_PAD = 24;
const SIDE_PAD = 30;
const ARROW_LEN = 30;
const ARROW_HEAD_LEN = 13;
const ARROW_SHAFT_HALF_WIDTH = 5.5;
const ARROW_HEAD_HALF_WIDTH = 11;
// A neutral, unmistakably "not a real color" gray for the unconfirmed
// second strand on a knot - see the `lines` memo below for what this
// represents. Deliberately far from anything a real palette color would
// ever be, so it reads as "unknown" rather than blending in as a muted
// version of some actual strand color.
const UNCONFIRMED_COLOR = '#8a8a94';

// Gap rows place knot p at p*SPACING; main rows sit inset by half a step
// (nested between two gap neighbors), matching the same diamond-lattice
// offset the pattern grid itself already uses.
function knotX(pass: 'main' | 'gap', displayPos: number): number {
  return SIDE_PAD + (pass === 'gap' ? displayPos * KNOT_SPACING : displayPos * KNOT_SPACING + KNOT_SPACING / 2);
}

// A right-pointing block arrow (rectangular shaft + flared triangular
// head, like a "->" road-sign glyph) centered on the origin - callers
// position it with an SVG transform (translate to the knot's center, then
// rotate), which is what actually guarantees pixel-perfect centering:
// doing it this way instead of a text glyph inside a flexbox sidesteps
// font-metric quirks (glyph side-bearings, ascent/descent asymmetry) that
// made the old Unicode arrow look visually off-center inside its circle.
const ARROW_TIP_X = ARROW_LEN / 2;
const ARROW_TAIL_X = -ARROW_LEN / 2;
const ARROW_HEAD_BASE_X = ARROW_TIP_X - ARROW_HEAD_LEN;
const ARROW_POINTS = [
  `${ARROW_TAIL_X},${-ARROW_SHAFT_HALF_WIDTH}`,
  `${ARROW_HEAD_BASE_X},${-ARROW_SHAFT_HALF_WIDTH}`,
  `${ARROW_HEAD_BASE_X},${-ARROW_HEAD_HALF_WIDTH}`,
  `${ARROW_TIP_X},0`,
  `${ARROW_HEAD_BASE_X},${ARROW_HEAD_HALF_WIDTH}`,
  `${ARROW_HEAD_BASE_X},${ARROW_SHAFT_HALF_WIDTH}`,
  `${ARROW_TAIL_X},${ARROW_SHAFT_HALF_WIDTH}`,
].join(' ');

export default function BuildInstructionView({
  dualGrid,
  rowTechniques,
  buildProgress,
  onMarkRowDone,
  onUndoRowDone,
}: {
  dualGrid: DualGrid;
  rowTechniques: RowTechniques;
  buildProgress: BuildProgress;
  onMarkRowDone: (rowIndex: number) => void;
  onUndoRowDone: (rowIndex: number) => void;
  // Kept in the prop type (BuildCenterScreen still wires it up and persists
  // it) even though there's no UI control here that calls it - the per-row
  // technique still drives arrow direction, just always via its computed
  // default now that the manual override button is gone.
  onSetRowTechnique?: (rowIndex: number, technique: RowTechnique | null) => void;
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const rows = useMemo(
    () => buildInstructionRows(dualGrid, rowTechniques),
    [dualGrid, rowTechniques]
  );

  // TEMPORARY - for verifying patternValidity.ts against a real pattern
  // before trusting it, per PATTERN-VALIDITY-PLAN.md section 7's own
  // warning that code review alone isn't enough. Remove once verified.
  useMemo(() => {
    const result = resolveHiddenColors(rows);
    console.log('PATTERN VALIDITY DEBUG:', JSON.stringify(result));
  }, [rows]);

  const doneSet = useMemo(() => new Set(buildProgress), [buildProgress]);

  // A row can only be un-marked if it's the LATEST done row - otherwise
  // you could undo row 3 while row 8 is still marked done, which doesn't
  // make sense for a build sequence you work through in order.
  const maxDoneDisplayNumber = useMemo(() => {
    let max = -1;
    for (const row of rows) if (doneSet.has(row.index)) max = Math.max(max, row.displayNumber);
    return max;
  }, [rows, doneSet]);

  const maxKnotCount = rows.reduce((m, r) => Math.max(m, r.knots.length), 0);
  const diagramWidth = SIDE_PAD * 2 + Math.max(0, maxKnotCount - 1) * KNOT_SPACING + KNOT_SPACING;
  const totalHeight = TOP_PAD * 2 + rows.length * ROW_HEIGHT;

  // How many strings to start with, and how many of each color - the
  // "go cut these" shopping list. This is the one piece of the starting
  // layout that's reliably knowable without solving a full per-knot
  // conservation problem (see the WHY THERE'S NO "SECOND STRING PER KNOT"
  // note in knotInstructions.ts): row 1 is always a full/main row, so
  // every one of its knots ties exactly 2 strings - the total is just
  // that row's own displayed colors, each counted twice. This does NOT
  // claim those 2 strings are both that exact color (they often aren't -
  // a knot can tie one string of its own color and one of a different
  // color) - it's an aggregate estimate for a shopping list, not a
  // per-knot diagram claim, which is exactly the distinction that matters
  // here: a wrong-looking specific pair drawn on screen is a real bug, a
  // rounded-up total is just a useful approximation.
  const colorTally = useMemo(() => {
    if (rows.length === 0) return [];
    const order: string[] = [];
    const counts = new Map<string, number>();
    for (const knot of rows[0].knots) {
      if (knot.color == null) continue;
      if (!counts.has(knot.color)) order.push(knot.color);
      counts.set(knot.color, (counts.get(knot.color) ?? 0) + 2);
    }
    return order.map(color => ({ color, count: counts.get(color)! }));
  }, [rows]);

  const totalStartingStrings = useMemo(
    () => colorTally.reduce((sum, c) => sum + c.count, 0),
    [colorTally]
  );

  // Every connecting segment. A real knot always ties exactly 2 strings
  // in and 2 out, so it always draws a line to EVERY one of its geometric
  // candidates (see candidatePositions) - never fewer, regardless of
  // whether the color is confirmed. A dot has just one real connection
  // (see knotInstructions.ts's SEPARATE MAIN/GAP ROWS note) and always
  // draws in its own definite color, whichever end of the segment it's
  // on - that's never in question. For a real knot on both ends, the
  // color IS confirmed (drawn solid, in that real color) exactly when the
  // target's own displayed color matches the source's; when it doesn't,
  // a string still definitely connects them (the physical tie has no
  // "missing" strand), but which of the knot's two colors it actually
  // carries can't be derived from the painted grid alone - see the WHY
  // THERE'S NO "SECOND STRING PER KNOT" note in knotInstructions.ts for
  // why guessing that color was tried twice and reverted both times after
  // a live conservation check caught it disagreeing with itself. Rather
  // than either omit that connection (physically wrong - a real knot
  // can't have a missing strand) or invent a color for it (proven
  // unreliable), it's drawn as an honest "a string connects here, exact
  // color unconfirmed" segment - a thin dashed gray line - so the diagram
  // never shows fewer than 2 lines per real knot, and never asserts a
  // color it can't back up.
  const lines = useMemo(() => {
    const segs: { key: string; d: string; color: string; confirmed: boolean; done: boolean }[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const row = rows[i];
      const nextRow = rows[i + 1];
      const y = TOP_PAD + i * ROW_HEIGHT + ROW_HEIGHT / 2;
      const nextY = TOP_PAD + (i + 1) * ROW_HEIGHT + ROW_HEIGHT / 2;
      const midY = (y + nextY) / 2;
      for (const knot of row.knots) {
        if (knot.color == null) continue;
        const x = knotX(row.pass, knot.displayPos);
        const candidates = candidatePositions(knot.displayPos, row.knots.length, nextRow.knots.length);
        for (const targetPos of candidates) {
          const target = nextRow.knots[targetPos];
          const targetX = knotX(nextRow.pass, targetPos);
          let color: string;
          let confirmed: boolean;
          if (!target.isKnot) {
            color = target.color ?? knot.color;
            confirmed = true;
          } else if (!knot.isKnot) {
            color = knot.color;
            confirmed = true;
          } else if (target.color === knot.color) {
            color = knot.color;
            confirmed = true;
          } else {
            color = UNCONFIRMED_COLOR;
            confirmed = false;
          }
          segs.push({
            key: `${knot.key}->${target.key}`,
            // A smooth S-curve (vertical in/out, bowing between) rather
            // than a straight diagonal - the "no hard angles" strand look.
            d: `M ${x} ${y} C ${x} ${midY}, ${targetX} ${midY}, ${targetX} ${nextY}`,
            color,
            confirmed,
            done: doneSet.has(row.index) && doneSet.has(nextRow.index),
          });
        }
      }
    }
    return segs;
  }, [rows, doneSet]);

  // Arrow triangles for every real knot, drawn in their own SVG layer on
  // top of the knot circles - see the ARROW_POINTS comment above for why
  // this replaced the old text-glyph approach.
  const arrows = useMemo(() => {
    const out: { key: string; x: number; y: number; deg: number; done: boolean }[] = [];
    rows.forEach((row, i) => {
      const isDone = doneSet.has(row.index);
      const y = TOP_PAD + i * ROW_HEIGHT + ROW_HEIGHT / 2;
      for (const knot of row.knots as InstructionKnot[]) {
        if (!knot.isKnot) continue;
        const x = knotX(row.pass, knot.displayPos);
        out.push({ key: knot.key, x, y, deg: knot.arrow === 'right' ? 45 : 135, done: isDone });
      }
    });
    return out;
  }, [rows, doneSet]);

  return (
    <View style={s.outer}>
      {colorTally.length > 0 && (
        <View style={s.tallyRow}>
          <Text style={s.tallyLabel}>{totalStartingStrings} strings to start:</Text>
          {colorTally.map(({ color, count }) => (
            <View key={color} style={s.tallyChip}>
              <View style={[s.tallyDot, { backgroundColor: color }]} />
              <Text style={s.tallyCount}>x{count}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={s.legendRow}>
        <View style={s.legendDash} />
        <Text style={s.legendTxt}>dashed = a second string ties in here too, exact color not shown</Text>
      </View>

      <View style={s.container}>
        <View style={[s.marginCol, { height: totalHeight }]}>
          {rows.map((row, i) => {
            const isDone = doneSet.has(row.index);
            const canUndo = row.displayNumber === maxDoneDisplayNumber;
            const y = TOP_PAD + i * ROW_HEIGHT;
            return (
              <View key={row.index} style={[s.marginRow, { top: y, height: ROW_HEIGHT }]}>
                <Text style={[s.marginRowTxt, isDone && s.marginRowTxtDone]}>Row {row.displayNumber}</Text>
                <TouchableOpacity
                  style={[s.doneToggle, isDone && s.doneToggleOn, isDone && !canUndo && s.doneToggleLocked]}
                  disabled={isDone && !canUndo}
                  onPress={() => (isDone ? onUndoRowDone(row.index) : onMarkRowDone(row.index))}
                  {...({
                    title: isDone
                      ? canUndo
                        ? 'Mark row undone'
                        : "Finish undoing later rows first"
                      : 'Mark row done',
                  } as any)}
                >
                  {isDone && <Text style={s.doneToggleCheck}>✓</Text>}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator style={s.diagramScroll}>
          <View style={{ width: diagramWidth, height: totalHeight }}>
            <Svg width={diagramWidth} height={totalHeight} style={StyleSheet.absoluteFill}>
              {/* Confirmed lines drawn first, unconfirmed (dashed) on top -
                  keeps the dashes visible instead of getting buried under
                  a solid strand that happens to cross the same path. */}
              {lines.filter(l => l.confirmed).map(line => (
                <Path
                  key={line.key}
                  d={line.d}
                  stroke={line.color}
                  strokeWidth={5}
                  fill="none"
                  strokeLinecap="round"
                  opacity={line.done ? 0.3 : 1}
                />
              ))}
              {lines.filter(l => !l.confirmed).map(line => (
                <Path
                  key={line.key}
                  d={line.d}
                  stroke={line.color}
                  strokeWidth={3.5}
                  strokeDasharray="7,6"
                  fill="none"
                  strokeLinecap="round"
                  opacity={line.done ? 0.25 : 0.8}
                />
              ))}
            </Svg>

            {rows.map((row, i) => {
              const isDone = doneSet.has(row.index);
              const y = TOP_PAD + i * ROW_HEIGHT + ROW_HEIGHT / 2;
              return row.knots.map(knot => {
                const x = knotX(row.pass, knot.displayPos);
                if (!knot.isKnot) {
                  // Idle strand just passing through this row - a small
                  // dot, the line itself does the work of showing
                  // continuity.
                  return (
                    <View
                      key={knot.key}
                      style={[
                        s.connectorDot,
                        {
                          left: x - CONNECTOR_DOT_SIZE / 2,
                          top: y - CONNECTOR_DOT_SIZE / 2,
                          backgroundColor: knot.color ?? theme.border,
                          opacity: isDone ? 0.3 : 1,
                        },
                      ]}
                    />
                  );
                }
                return (
                  <View
                    key={knot.key}
                    style={[
                      s.knot,
                      {
                        left: x - KNOT_SIZE / 2,
                        top: y - KNOT_SIZE / 2,
                        backgroundColor: knot.color ?? theme.border,
                        opacity: isDone ? 0.3 : 1,
                      },
                    ]}
                  />
                );
              });
            })}

            {/* Arrow layer, on top of the knot circles - see the `arrows`
                memo above. Each triangle is drawn pointing right at the
                origin, then translated to its knot's exact center and
                rotated - translate+rotate is what makes the centering
                exact regardless of triangle size. */}
            <Svg width={diagramWidth} height={totalHeight} style={StyleSheet.absoluteFill}>
              {arrows.map(arrow => (
                <Polygon
                  key={arrow.key}
                  points={ARROW_POINTS}
                  transform={`translate(${arrow.x}, ${arrow.y}) rotate(${arrow.deg})`}
                  fill="#ffffff"
                  stroke="#000000"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  opacity={arrow.done ? 0.3 : 1}
                />
              ))}
            </Svg>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    outer: { width: '100%', alignItems: 'center' },
    container: { flexDirection: 'row' },

    tallyRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 20,
      paddingHorizontal: 16,
    },
    tallyLabel: { fontSize: 13, fontWeight: '700', color: theme.text },
    tallyChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    tallyDot: {
      width: 15,
      height: 15,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: '#ffffff',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 2,
      elevation: 3,
    },
    tallyCount: { fontSize: 13, fontWeight: '600', color: theme.textMuted },

    legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 },
    legendDash: {
      width: 22,
      height: 0,
      borderTopWidth: 2,
      borderStyle: 'dashed',
      borderColor: '#8a8a94',
    },
    legendTxt: { fontSize: 11, color: theme.textFaint, fontStyle: 'italic' },

    marginCol: { width: MARGIN_WIDTH, position: 'relative' },
    marginRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
    marginRowTxt: { fontSize: 13, fontWeight: '700', color: theme.textMuted },
    marginRowTxtDone: { color: theme.success },
    doneToggle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceMuted,
    },
    doneToggleOn: { borderColor: theme.success, backgroundColor: theme.success },
    doneToggleLocked: { opacity: 0.6 },
    doneToggleCheck: { fontSize: 13, fontWeight: '700', color: '#fff' },

    diagramScroll: { flexGrow: 0 },

    // A fixed white ring + dark halo shadow, rather than a theme- or
    // swatch-derived border - the same fix used for swatch selection
    // rings elsewhere in the app (see ColorsCard.tsx): a border color
    // computed from the theme or the swatch's own color can end up
    // matching a dark swatch almost exactly (a near-black knot against
    // this dark-mode background was essentially invisible before this),
    // and a fixed white ring reads clearly against any fill color.
    knot: {
      position: 'absolute',
      width: KNOT_SIZE,
      height: KNOT_SIZE,
      borderRadius: KNOT_SIZE / 2,
      borderWidth: 3,
      borderColor: '#ffffff',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 3,
      elevation: 4,
    },
    connectorDot: {
      position: 'absolute',
      width: CONNECTOR_DOT_SIZE,
      height: CONNECTOR_DOT_SIZE,
      borderRadius: CONNECTOR_DOT_SIZE / 2,
      borderWidth: 2,
      borderColor: '#ffffff',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 2,
      elevation: 3,
    },
  });
}
