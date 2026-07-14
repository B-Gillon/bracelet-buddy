import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

// Placeholder card - not built yet, matches BuildScreen's original stub.
export default function PatternToolCard() {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={s.card}>
      <Text style={s.cardLabel}>PATTERN TOOL</Text>
      <Text style={s.comingSoonTxt}>Coming soon.</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card:          { flex: 1, minWidth: 200, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, gap: 8 },
    cardLabel:     { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: theme.textFaint },
    comingSoonTxt: { fontSize: 12, color: theme.textFaint, fontStyle: 'italic' },
  });
}
