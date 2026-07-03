import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>Welcome to Bracelet Buddy</Text>
      <Text style={s.subtitle}>This is your home page — coming soon.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 40, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 8, textAlign: 'center' },
  subtitle:  { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
});
