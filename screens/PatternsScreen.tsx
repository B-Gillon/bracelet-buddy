import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';

export default function PatternsScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={s.container}>
      <Text style={s.title}>Patterns</Text>
      <Text style={s.subtitle}>A browsable library of pattern styles is coming soon.</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: 40, alignItems: 'center', justifyContent: 'center' },
    title:     { fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: 8, textAlign: 'center' },
    subtitle:  { fontSize: 14, color: theme.textFaint, textAlign: 'center' },
  });
}
