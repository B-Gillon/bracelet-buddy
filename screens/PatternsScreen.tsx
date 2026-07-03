import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PatternsScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>Patterns</Text>
      <Text style={s.subtitle}>A browsable library of pattern styles is coming soon.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 40, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 8, textAlign: 'center' },
  subtitle:  { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
});
