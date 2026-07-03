import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MyDesignsScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>My Designs</Text>
      <Text style={s.subtitle}>Your saved bracelets will show up here once accounts are built.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 40, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 8, textAlign: 'center' },
  subtitle:  { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
});
