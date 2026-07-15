import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

// The -/+ pair used identically 4x in BuildScreen (top/bottom rows, left/
// right columns) - only the callbacks, tooltip text, and layout axis differ.
export default function GridEdgeControls({
  onDecrease,
  onIncrease,
  decreaseTitle,
  increaseTitle,
  axis,
}: {
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseTitle: string;
  increaseTitle: string;
  axis: 'row' | 'column'; // 'row' = horizontal pair (top/bottom edges), 'column' = vertical pair (left/right edges)
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={axis === 'row' ? s.rowControls : s.colControls}>
      <TouchableOpacity style={s.edgeBtn} onPress={onDecrease} {...({ title: decreaseTitle } as any)}>
        <Text style={s.edgeBtnTxt}>-</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.edgeBtn} onPress={onIncrease} {...({ title: increaseTitle } as any)}>
        <Text style={s.edgeBtnTxt}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    rowControls: { flexDirection: 'row', gap: 6, marginVertical: 20 },
    colControls: { flexDirection: 'column', gap: 6, marginHorizontal: 20, flexShrink: 0 },
    edgeBtn: {
      width: 28, height: 28, borderRadius: 6,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceMuted,
      alignItems: 'center', justifyContent: 'center',
    },
    edgeBtnTxt: { fontSize: 14, fontWeight: '700', color: theme.textMuted },
  });
}
