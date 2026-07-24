// TECHNIQUE LAB - the new, forward-only pattern creation path discussed in
// chat, kept completely separate from Design Center/BuildScreen so nothing
// existing is touched. Instead of painting colors and checking them
// afterward, you pick starting string colors and a real technique per row,
// and utils/patternSimulation.ts computes the guaranteed-buildable result.
//
// SCOPE OF THIS FIRST VERSION:
// - Only 'diagonal' and 'chevron' techniques (covers the real chevron
//   pattern that exposed the checker's limits). 'wrap' exists in the
//   simulator but has no UI here yet.
// - Rendering is plain colored squares, not the diamond weave - proving
//   the simulation is correct comes first; matching Design Center's visual
//   style is a separate follow-up once this path is validated.
// - No saving, no column add/remove, no build instructions yet - this is
//   the narrow slice: colors + technique in, simulated result out.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { PRESET_PALETTES } from '../constants/palettes';
import { simulatePattern, isPermutationOf, SimTechnique } from '../utils/patternSimulation';

const DEFAULT_STRING_COUNT = 6;

export default function TechniqueLabScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [startingColors, setStartingColors] = useState<string[]>(
    Array.from({ length: DEFAULT_STRING_COUNT }, (_, i) => PRESET_PALETTES[0].colors[i % PRESET_PALETTES[0].colors.length])
  );
  const [techniques, setTechniques] = useState<(SimTechnique | null)[]>([]);

  const simulatedRows = useMemo(() => simulatePattern(startingColors, techniques), [startingColors, techniques]);

  const allValid = useMemo(
    () => simulatedRows.every(r => isPermutationOf(r, startingColors)),
    [simulatedRows, startingColors]
  );

  function applyPreset(paletteColors: string[]) {
    setStartingColors(Array.from({ length: DEFAULT_STRING_COUNT }, (_, i) => paletteColors[i % paletteColors.length]));
  }

  function setStringColor(index: number, color: string) {
    setStartingColors(prev => prev.map((c, i) => (i === index ? color : c)));
  }

  function addDiagonalRow(direction: 'left' | 'right') {
    setTechniques(prev => [...prev, { type: 'diagonal', direction }]);
  }

  function addChevronRow(splitCol: number) {
    setTechniques(prev => [...prev, { type: 'chevron', splitCol }]);
  }

  function removeLastRow() {
    setTechniques(prev => prev.slice(0, -1));
  }

  function clearRows() {
    setTechniques([]);
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.heading}>Technique Lab (prototype)</Text>
      <Text style={s.subheading}>
        Pick starting string colors, then add rows by real technique. The result below is simulated
        forward - it can never be an impossible pattern, because nothing is painted directly.
      </Text>

      <Text style={s.sectionLabel}>Starting strings ({startingColors.length})</Text>
      <View style={s.stringsRow}>
        {startingColors.map((color, i) => (
          <View key={i} style={s.stringSwatchWrap}>
            <View style={[s.stringSwatch, { backgroundColor: color }]} />
            <Text style={s.stringIndex}>{i}</Text>
          </View>
        ))}
      </View>

      <Text style={s.sectionLabel}>Quick palettes</Text>
      <View style={s.paletteRow}>
        {PRESET_PALETTES.map(p => (
          <TouchableOpacity key={p.id} style={s.paletteBtn} onPress={() => applyPreset(p.colors)}>
            <View style={s.paletteSwatchRow}>
              {p.colors.slice(0, 4).map((c, i) => (
                <View key={i} style={[s.paletteSwatchDot, { backgroundColor: c }]} />
              ))}
            </View>
            <Text style={s.paletteLabel}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sectionLabel}>Tap a string above to recolor it individually</Text>
      <View style={s.recolorRow}>
        {startingColors.map((_, i) => (
          <View key={i} style={s.recolorGroup}>
            {(PRESET_PALETTES.find(p => p.id === 'galaxy')?.colors ?? []).map(c => (
              <TouchableOpacity key={c} style={[s.recolorDot, { backgroundColor: c }]} onPress={() => setStringColor(i, c)} />
            ))}
          </View>
        ))}
      </View>

      <Text style={s.sectionLabel}>Add a row</Text>
      <View style={s.techniqueBtnRow}>
        <TouchableOpacity style={s.techniqueBtn} onPress={() => addDiagonalRow('left')}>
          <Text style={s.techniqueBtnTxt}>Diagonal ←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.techniqueBtn} onPress={() => addDiagonalRow('right')}>
          <Text style={s.techniqueBtnTxt}>Diagonal →</Text>
        </TouchableOpacity>
        {startingColors.map((_, i) =>
          i === 0 || i === startingColors.length - 1 ? null : (
            <TouchableOpacity key={i} style={s.techniqueBtn} onPress={() => addChevronRow(i)}>
              <Text style={s.techniqueBtnTxt}>Chevron @{i}</Text>
            </TouchableOpacity>
          )
        )}
        <TouchableOpacity style={[s.techniqueBtn, s.removeBtn]} onPress={removeLastRow}>
          <Text style={[s.techniqueBtnTxt, s.removeBtnTxt]}>Undo last row</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.techniqueBtn, s.removeBtn]} onPress={clearRows}>
          <Text style={[s.techniqueBtnTxt, s.removeBtnTxt]}>Clear all rows</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.sectionLabel}>
        Simulated result ({simulatedRows.length} rows) - guarantee check:{' '}
        <Text style={allValid ? s.validTxt : s.invalidTxt}>
          {allValid ? 'every row is a valid string permutation' : 'GUARANTEE VIOLATED - this should never happen'}
        </Text>
      </Text>
      <View style={s.resultWrap}>
        {simulatedRows.map((row, ri) => (
          <View key={ri} style={s.resultRow}>
            <Text style={s.resultRowLabel}>{ri === 0 ? 'start' : `row ${ri}`}</Text>
            {row.map((color, ci) => (
              <View key={ci} style={[s.resultCell, { backgroundColor: color }]} />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen:  { flex: 1, backgroundColor: theme.background },
    content: { padding: 16, gap: 8 },

    heading:    { fontSize: 20, fontWeight: '800', color: theme.text },
    subheading: { fontSize: 13, color: theme.textSubtle, marginBottom: 8 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: theme.textMuted, marginTop: 14, marginBottom: 4 },

    stringsRow: { flexDirection: 'row', gap: 8 },
    stringSwatchWrap: { alignItems: 'center' },
    stringSwatch: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: theme.swatchBorder },
    stringIndex: { fontSize: 10, color: theme.textFaint, marginTop: 2 },

    paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    paletteBtn: { alignItems: 'center', padding: 6, borderRadius: 8, backgroundColor: theme.surfaceMuted },
    paletteSwatchRow: { flexDirection: 'row', gap: 2 },
    paletteSwatchDot: { width: 14, height: 14, borderRadius: 3 },
    paletteLabel: { fontSize: 10, color: theme.textMuted, marginTop: 4 },

    recolorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    recolorGroup: { flexDirection: 'row', gap: 2 },
    recolorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: theme.swatchBorder },

    techniqueBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    techniqueBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: theme.purple },
    techniqueBtnTxt: { fontSize: 12, fontWeight: '700', color: theme.textOnPurple },
    removeBtn: { backgroundColor: theme.surfaceMutedAlt },
    removeBtnTxt: { color: theme.textMuted },

    validTxt:   { color: theme.success, fontWeight: '700' },
    invalidTxt: { color: theme.danger, fontWeight: '700' },

    resultWrap: { gap: 4, marginTop: 4 },
    resultRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
    resultRowLabel: { fontSize: 11, color: theme.textFaint, width: 44 },
    resultCell: { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: theme.swatchBorder },
  });
}
