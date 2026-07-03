import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PatternConfig, defaultPatternName } from '../types/pattern';

const PURPLE = '#7c3aed';

function Stepper({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <View style={s.stepperCard}>
      <Text style={s.stepperLabel}>{label}</Text>
      <View style={s.stepperRow}>
        <TouchableOpacity
          style={[s.stepperBtn, value <= min && s.stepperBtnDisabled]}
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          <Text style={s.stepperBtnTxt}>-</Text>
        </TouchableOpacity>
        <Text style={s.stepperValue}>{value}</Text>
        <TouchableOpacity
          style={[s.stepperBtn, value >= max && s.stepperBtnDisabled]}
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          <Text style={s.stepperBtnTxt}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function NewPatternScreen({
  existingCount,
  onNext,
}: {
  existingCount: number;
  onNext: (config: PatternConfig) => void;
}) {
  const [name, setName]           = useState('');
  const [colorCount, setColorCount] = useState(4);
  const [cols, setCols]           = useState(40);
  const [rows, setRows]           = useState(6);

  function handleNext() {
    const finalName = name.trim().length > 0 ? name.trim() : defaultPatternName(existingCount);
    const now = Date.now();
    const config: PatternConfig = {
      id: String(now),
      name: finalName,
      type: 'bracelet',
      colorCount,
      palette: Array.from({ length: colorCount }, () => null),
      cols,
      rows,
      createdAt: now,
      updatedAt: now,
    };
    onNext(config);
  }

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.title}>Create a New Bracelet</Text>
      <Text style={s.subtitle}>Set up the basics. You can change any of this later.</Text>

      <View style={s.stepperCard}>
        <Text style={s.stepperLabel}>NAME</Text>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={defaultPatternName(existingCount)}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            backgroundColor: '#fff',
            paddingLeft: 10,
            paddingRight: 10,
            fontSize: 14,
            color: '#111',
            width: '100%',
          }}
        />
      </View>

      <View style={s.stepperStack}>
        <Stepper label="# Of Colors" value={colorCount} min={2} max={10} onChange={setColorCount} />
        <Stepper label="Length"      value={cols}        min={4} max={100} onChange={setCols} />
        <Stepper label="Width"       value={rows}        min={2} max={30}  onChange={setRows} />
      </View>

      <TouchableOpacity style={s.nextBtn} onPress={handleNext}>
        <Text style={s.nextBtnTxt}>Next</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:          { padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  title:              { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4 },
  subtitle:           { fontSize: 13, color: '#9ca3af', marginBottom: 24 },
  stepperStack:       { gap: 12, marginBottom: 28 },
  stepperCard:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, backgroundColor: '#fafafa', marginBottom: 12, gap: 12 },
  stepperLabel:       { fontSize: 13, fontWeight: '600', color: '#374151', minWidth: 100 },
  stepperRow:         { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' },
  stepperBtn:         { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  stepperBtnDisabled: { opacity: 0.35 },
  stepperBtnTxt:      { fontSize: 20, color: '#374151' },
  stepperValue:       { width: 44, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#111' },
  nextBtn:            { backgroundColor: PURPLE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  nextBtnTxt:         { color: '#fff', fontSize: 15, fontWeight: '700' },
});