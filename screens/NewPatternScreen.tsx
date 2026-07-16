import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PatternConfig, DEFAULT_PATTERN_NAME } from '../types/pattern';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';
import { isPatternNameTaken } from '../utils/patterns';

// Styles object type inferred from makeStyles below - Stepper is only ever
// used inside this file, so it's simplest to just hand it the same styles
// object NewPatternScreen already built, rather than have it call
// useTheme()/makeStyles a second time.
type Styles = ReturnType<typeof makeStyles>;

function Stepper({ label, value, min, max, onChange, s }: {
  label: string; value: number; min: number; max: number; onChange: (n: number) => void; s: Styles;
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
  onNext,
}: {
  onNext: (config: PatternConfig) => void;
}) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const [name, setName]           = useState('');
  const [colorCount, setColorCount] = useState(4);
  const [cols, setCols]           = useState(40);
  const [rows, setRows]           = useState(6);
  const [nameStatus, setNameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'error'
  >('idle');

  // Only checks a name the person actually typed - the blank/default case
  // becomes "New Bracelet" at submit time, and duplicates of that are fine
  // pre-save since nothing's written to the database until the first Save.
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || !user) {
      setNameStatus('idle');
      return;
    }

    setNameStatus('checking');
    const timeout = setTimeout(async () => {
      const { taken, error } = await isPatternNameTaken(user.id, trimmed);
      setNameStatus(error ? 'error' : taken ? 'taken' : 'available');
    }, 500);

    return () => clearTimeout(timeout);
  }, [name, user]);

  function handleNext() {
    if (nameStatus === 'taken' || nameStatus === 'checking') return;
    const finalName = name.trim().length > 0 ? name.trim() : DEFAULT_PATTERN_NAME;
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
          placeholder={DEFAULT_PATTERN_NAME}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.surface,
            paddingLeft: 10,
            paddingRight: 10,
            fontSize: 14,
            color: theme.text,
            width: '100%',
          }}
        />
      </View>
      {nameStatus === 'checking' && (
        <Text style={s.nameCheckingTxt}>Checking availability...</Text>
      )}
      {nameStatus === 'taken' && (
        <Text style={s.nameTakenTxt}>You already have a bracelet with that name.</Text>
      )}

      <View style={s.stepperStack}>
        <Stepper label="# Of Colors" value={colorCount} min={2} max={10} onChange={setColorCount} s={s} />
        <Stepper label="Length"      value={cols}        min={4} max={100} onChange={setCols} s={s} />
        <Stepper label="Width"       value={rows}        min={2} max={30}  onChange={setRows} s={s} />
      </View>

      <TouchableOpacity
        style={[s.nextBtn, (nameStatus === 'taken' || nameStatus === 'checking') && s.nextBtnDisabled]}
        onPress={handleNext}
        disabled={nameStatus === 'taken' || nameStatus === 'checking'}
      >
        <Text style={s.nextBtnTxt}>Next</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container:          { padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
    title:              { fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: 4 },
    subtitle:           { fontSize: 13, color: theme.textFaint, marginBottom: 24 },
    nameCheckingTxt:    { fontSize: 11, color: theme.textFaint, marginTop: -6, marginBottom: 12 },
    nameTakenTxt:       { fontSize: 11, color: theme.danger, fontWeight: '600', marginTop: -6, marginBottom: 12 },
    stepperStack:       { gap: 12, marginBottom: 28 },
    stepperCard:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, backgroundColor: theme.surfaceMuted, marginBottom: 12, gap: 12 },
    stepperLabel:       { fontSize: 13, fontWeight: '600', color: theme.textMuted, minWidth: 100 },
    stepperRow:         { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.surface },
    stepperBtn:         { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceMutedAlt },
    stepperBtnDisabled: { opacity: 0.35 },
    stepperBtnTxt:      { fontSize: 20, color: theme.textMuted },
    stepperValue:       { width: 44, textAlign: 'center', fontSize: 16, fontWeight: '700', color: theme.text },
    nextBtn:            { backgroundColor: theme.purple, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    nextBtnDisabled:    { opacity: 0.5 },
    nextBtnTxt:         { color: theme.textOnPurple, fontSize: 15, fontWeight: '700' },
  });
}
