import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';

export default function DesignCenterScreen({
  onStartFromScratch,
}: {
  onStartFromScratch: () => void;
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={s.container}>
      <Text style={s.title}>Design Center</Text>
      <Text style={s.subtitle}>How do you want to start your bracelet?</Text>

      <View style={s.cardGrid}>
        <TouchableOpacity style={s.card} onPress={onStartFromScratch}>
          <Text style={s.cardEmoji}>✏️</Text>
          <Text style={s.cardTitle}>Start from Scratch</Text>
          <Text style={s.cardDesc}>Build a pattern node by node with the grid editor.</Text>
        </TouchableOpacity>

        <View style={[s.card, s.cardDisabled]}>
          <Text style={s.cardEmoji}>📐</Text>
          <Text style={s.cardTitle}>Start with Template</Text>
          <Text style={s.cardDesc}>Pick a ready-made pattern to customize.</Text>
          <Text style={s.comingSoon}>Coming Soon</Text>
        </View>

        <View style={[s.card, s.cardDisabled]}>
          <Text style={s.cardEmoji}>📷</Text>
          <Text style={s.cardTitle}>Upload a Picture</Text>
          <Text style={s.cardDesc}>Turn a photo of a bracelet into a pattern.</Text>
          <Text style={s.comingSoon}>Coming Soon</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container:    { flex: 1, padding: 40, maxWidth: 900, width: '100%', alignSelf: 'center' },
    title:        { fontSize: 26, fontWeight: '700', color: theme.text, marginBottom: 4 },
    subtitle:     { fontSize: 14, color: theme.textFaint, marginBottom: 28 },
    cardGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    card:         { flexBasis: 240, flexGrow: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 20, backgroundColor: theme.surfaceMuted, gap: 6 },
    cardDisabled: { opacity: 0.6 },
    cardEmoji:    { fontSize: 28, marginBottom: 4 },
    cardTitle:    { fontSize: 16, fontWeight: '700', color: theme.text },
    cardDesc:     { fontSize: 12, color: theme.textSubtle },
    comingSoon:   { fontSize: 11, fontWeight: '700', color: theme.purple, marginTop: 6 },
  });
}
