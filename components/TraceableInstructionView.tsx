import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { DualGrid } from '../types/pattern';
import { buildInstructionRows, candidatePositions } from '../utils/knotInstructions';
import { edgeKey } from '../utils/patternValidity';

// The "figure it out yourself" twin of BuildInstructionView - same knots,
// same positions, but every connecting line starts blank/dashed instead of
// computed. Tapping a marker cycles it through the pattern's own real
// colors, then back to blank, so you can manually test hidden-string
// possibilities the same way you'd reason about it on paper - the tool
// takes no position on which answer is right.
//
// A gap row's idle "bypass" positions (isKnot: false - see
// knotInstructions.ts) are a single string passing straight through, not
// a real tie - so they get exactly ONE marker, centered on the idle
// position itself, instead of two separate markers for its incoming and
// outgoing line (which would just be asking the same question twice).
// Real knot-to-knot connections keep one marker per line, at its midpoint,
// since those genuinely can differ from one line to the next.
//
// Geometry constants are a separate copy from BuildInstructionView's,
// deliberately - this stays a simpler, decoupled component (no arrows, no
// build-progress, no validity/highlighting, since showing the computed
// answer here would defeat the entire point of a manual puzzle).
//
// Tapping is done via a small TouchableOpacity marker rather than a press
// handler on the curve itself - PatternGridView.tsx already establishes
// that direct touch handling on a raw SVG shape isn't the reliable
// approach in this app's Expo Web setup (it uses manual hit-testing
// instead); a plain TouchableOpacity is the proven, already-used-
// everywhere-else interaction primitive.

const ROW_HEIGHT = 100;
const KNOT_SPACING = 60;
const KNOT_SIZE = 52;
const TOP_PAD = 24;
const SIDE_PAD = 30;
const UNGUESSED_COLOR = '#8a8a94';
const MARKER_SIZE = 26;

function knotX(pass: 'main' | 'gap', displayPos: number): number {
  return SIDE_PAD + (pass === 'gap' ? displayPos * KNOT_SPACING : displayPos * KNOT_SPACING + KNOT_SPACING / 2);
}

function idleKey(row: number, pos: number): string {
  return `idle:${row}:${pos}`;
}

export default function TraceableInstructionView({
  dualGrid,
  guesses,
  onSetGuess,
  palette,
  fitWidth,
}: {
  dualGrid: DualGrid;
  // Keyed by patternValidity.ts's edgeKey for real knot-to-knot lines, or
  // idleKey(row, pos) above for a gap row's idle bypass positions.
  guesses: Record<string, string>;
  onSetGuess: (key: string, color: string | null) => void;
  palette: string[];
  // When set, the whole diagram is scaled DOWN (never up) to fit exactly
  // within this width, with no horizontal scrolling needed - used on
  // narrow/mobile screens where scrolling a wide diagram sideways proved
  // hard to use. Omit this prop to get the normal full-size, scrollable
  // rendering (desktop side-by-side view).
  fitWidth?: number;
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const rows = useMemo(() => buildInstructionRows(dualGrid, null), [dualGrid]);

  const maxKnotCount = rows.reduce((m, r) => Math.max(m, r.knots.length), 0);
  const diagramWidth = SIDE_PAD * 2 + Math.max(0, maxKnotCount - 1) * KNOT_SPACING + KNOT_SPACING;
  const totalHeight = TOP_PAD * 2 + rows.length * ROW_HEIGHT;

  function cycle(current: string | undefined): string | null {
    if (current == null) return palette[0] ?? null;
    const idx = palette.indexOf(current);
    if (idx === -1 || idx === palette.length - 1) return null;
    return palette[idx + 1];
  }

  // Every connecting curve, plus which single key controls its color -
  // an idle knot's OWN key on either end if either end is idle (both its
  // lines share the one merged marker), otherwise this specific edge's
  // own key.
  const curves = useMemo(() => {
    const segs: { key: string; guessKey: string; d: string }[] = [];
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
          const guessKey = !knot.isKnot
            ? idleKey(i, knot.displayPos)
            : !target.isKnot
              ? idleKey(i + 1, targetPos)
              : edgeKey(i, knot.displayPos, targetPos);
          segs.push({
            key: edgeKey(i, knot.displayPos, targetPos),
            guessKey,
            d: `M ${x} ${y} C ${x} ${midY}, ${targetX} ${midY}, ${targetX} ${nextY}`,
          });
        }
      }
    }
    return segs;
  }, [rows]);

  // Markers: one per real knot-to-knot line (at its midpoint), plus
  // exactly one per idle bypass position (centered on the knot itself,
  // not on either of its two lines) - both sized and styled identically.
  const markers = useMemo(() => {
    const out: { key: string; guessKey: string; x: number; y: number }[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const row = rows[i];
      const nextRow = rows[i + 1];
      const y = TOP_PAD + i * ROW_HEIGHT + ROW_HEIGHT / 2;
      const nextY = TOP_PAD + (i + 1) * ROW_HEIGHT + ROW_HEIGHT / 2;
      for (const knot of row.knots) {
        if (knot.color == null) continue;
        const x = knotX(row.pass, knot.displayPos);
        const candidates = candidatePositions(knot.displayPos, row.knots.length, nextRow.knots.length);
        for (const targetPos of candidates) {
          const target = nextRow.knots[targetPos];
          const targetX = knotX(nextRow.pass, targetPos);
          if (!knot.isKnot) {
            out.push({ key: `marker-${idleKey(i, knot.displayPos)}`, guessKey: idleKey(i, knot.displayPos), x, y });
          } else if (!target.isKnot) {
            out.push({ key: `marker-${idleKey(i + 1, targetPos)}`, guessKey: idleKey(i + 1, targetPos), x: targetX, y: nextY });
          } else {
            const key = edgeKey(i, knot.displayPos, targetPos);
            out.push({ key: `marker-${key}`, guessKey: key, x: (x + targetX) / 2, y: (y + nextY) / 2 });
          }
        }
      }
    }
    // De-dupe: an idle position's marker gets added once from its
    // incoming line and once from its outgoing line above - collapse to
    // the single shared entry.
    const seen = new Set<string>();
    return out.filter(m => (seen.has(m.key) ? false : (seen.add(m.key), true)));
  }, [rows]);

  const scale = fitWidth ? Math.min(1, fitWidth / diagramWidth) : 1;

  return (
    <View style={s.outer}>
      <View
        style={{
          width: diagramWidth * scale,
          height: totalHeight * scale,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <View style={{ width: diagramWidth, height: totalHeight, transform: [{ scale }] }}>
          <Svg width={diagramWidth} height={totalHeight} style={StyleSheet.absoluteFill}>
            {curves.map(line => {
              const color = guesses[line.guessKey];
              return (
                <Path
                  key={line.key}
                  d={line.d}
                  stroke={color ?? UNGUESSED_COLOR}
                  strokeWidth={color ? 5 : 3}
                  strokeDasharray={color ? undefined : '7,6'}
                  fill="none"
                  strokeLinecap="round"
                />
              );
            })}
          </Svg>

          {markers.map(marker => {
            const color = guesses[marker.guessKey];
            return (
              <TouchableOpacity
                key={marker.key}
                onPress={() => onSetGuess(marker.guessKey, cycle(color))}
                style={[
                  s.marker,
                  {
                    left: marker.x - MARKER_SIZE / 2,
                    top: marker.y - MARKER_SIZE / 2,
                    backgroundColor: color ?? theme.surfaceMuted,
                    borderColor: color ? '#ffffff' : theme.border,
                  },
                ]}
              />
            );
          })}

          {rows.map((row, i) => {
            const y = TOP_PAD + i * ROW_HEIGHT + ROW_HEIGHT / 2;
            return row.knots.map(knot => {
              if (!knot.isKnot) return null; // idle positions are represented by their marker above, not a separate dot
              const x = knotX(row.pass, knot.displayPos);
              return (
                <View
                  key={knot.key}
                  pointerEvents="none"
                  style={[
                    s.knot,
                    { left: x - KNOT_SIZE / 2, top: y - KNOT_SIZE / 2, backgroundColor: knot.color ?? theme.border },
                  ]}
                />
              );
            });
          })}
        </View>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    outer: { alignItems: 'flex-start' },
    marker: {
      position: 'absolute',
      width: MARKER_SIZE,
      height: MARKER_SIZE,
      borderRadius: MARKER_SIZE / 2,
      borderWidth: 2,
    },
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
  });
}
