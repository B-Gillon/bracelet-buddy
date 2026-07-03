import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PRESET_PALETTES } from '../constants/palettes';

const PURPLE = '#7c3aed';

export default function ColorPickerScreen({
  palette,
  colorCount,
  onStart,
  onBack,
}: {
  palette: (string | null)[];
  colorCount: number;
  onStart: (palette: (string | null)[], colorCount: number) => void;
  onBack: () => void;
}) {
  const [localPalette, setLocalPalette] = useState<(string | null)[]>([...palette]);
  const [localColorCount, setLocalColorCount] = useState(colorCount);
  const colorInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleSwatchClick(i: number) {
    colorInputRefs.current[i]?.click();
  }

  function handleColorChange(i: number, color: string) {
    setLocalPalette(prev => {
      const updated = [...prev];
      updated[i] = color;
      return updated;
    });
  }

  function applyPreset(colors: string[]) {
    const newCount = colors.length;
    setLocalColorCount(newCount);
    setLocalPalette(colors.map(c => c));
  }

  return (
    <ScrollView contentContainerStyle={s.container}>

      <View style={s.headerRow}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Choose Your Colors</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={s.label}>YOUR COLORS</Text>
      <Text style={s.hint}>Tap a circle to pick a color.</Text>
      <View style={s.swatchRow}>
        {localPalette.slice(0, localColorCount).map((c, i) => (
          <View key={i}>
            <input
              type="color"
              ref={el => { colorInputRefs.current[i] = el; }}
              value={c ?? '#ffffff'}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
              onChange={e => handleColorChange(i, e.target.value)}
            />
            <TouchableOpacity
              style={[
                s.swatch,
                {
                  backgroundColor: c ?? 'transparent',
                  borderColor: c ? c : '#d1d5db',
                  borderWidth: 2,
                }
              ]}
              onPress={() => handleSwatchClick(i)}
            />
          </View>
        ))}
      </View>

      <View style={s.sectionDivider} />

      <Text style={s.label}>FAVORITES</Text>
      <View style={s.favoritesBox}>
        <Text style={s.emptyTxt}>No favorites saved yet.</Text>
      </View>

      <View style={s.sectionDivider} />

      <Text style={s.label}>PRESETS</Text>
      <View style={s.presetGrid}>
        {PRESET_PALETTES.map(preset => (
          <TouchableOpacity
            key={preset.id}
            style={s.presetCard}
            onPress={() => applyPreset(preset.colors)}
          >
            <Text style={s.presetName}>{preset.name}</Text>
            <View style={s.presetSwatches}>
              {preset.colors.map((c, i) => (
                <View key={i} style={[s.presetSwatch, { backgroundColor: c }]} />
              ))}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.startBtn} onPress={() => onStart(localPalette, localColorCount)}>
        <Text style={s.startBtnTxt}>Start</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:      { padding: 16, maxWidth: 600, width: '100%', alignSelf: 'center' },
  headerRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title:          { fontSize: 20, fontWeight: '700', color: '#111' },
  backTxt:        { fontSize: 13, color: PURPLE, fontWeight: '600', width: 60 },
  label:          { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: PURPLE, marginBottom: 8 },
  hint:           { fontSize: 12, color: '#9ca3af', marginBottom: 12 },
  swatchRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  swatch:         { width: 52, height: 52, borderRadius: 26 },
  sectionDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 20 },
  favoritesBox:   { borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed', borderRadius: 10, padding: 20, backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center', minHeight: 80 },
  emptyTxt:       { fontSize: 12, color: '#d1d5db' },
  presetGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  presetCard:     { width: '31%', paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 8, gap: 8 },
  presetName:     { fontSize: 12, color: '#374151', fontWeight: '600' },
  presetSwatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  presetSwatch:   { width: 20, height: 20, borderRadius: 10 },
  startBtn:       { backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  startBtnTxt:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});