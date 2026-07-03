import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const PURPLE = '#7c3aed';

export type AppPage =
  | 'home'
  | 'patterns'
  | 'my-designs'
  | 'design-center'
  | 'tutorials'
  | 'settings';

const NAV_ITEMS: { key: AppPage; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'my-designs', label: 'My Designs' },
  { key: 'design-center', label: 'Design Center' },
  { key: 'tutorials', label: 'Tutorials' },
  { key: 'settings', label: 'Settings' },
];

export default function GlobalHeader({
  active,
  onNavigate,
}: {
  active: AppPage | null;
  onNavigate: (page: AppPage) => void;
}) {
  return (
    <View style={s.bar}>
      <TouchableOpacity onPress={() => onNavigate('home')}>
        <Text style={s.logo}>Bracelet Buddy</Text>
      </TouchableOpacity>

      <View style={s.nav}>
        {NAV_ITEMS.map(item => (
          <TouchableOpacity
            key={item.key}
            style={[s.navBtn, active === item.key && s.navBtnActive]}
            onPress={() => onNavigate(item.key)}
          >
            <Text style={[s.navBtnTxt, active === item.key && s.navBtnActiveTxt]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  logo: {
    fontSize: 18,
    fontWeight: '800',
    color: PURPLE,
  },
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  navBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  navBtnActive: {
    backgroundColor: '#f3f0ff',
  },
  navBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  navBtnActiveTxt: {
    color: PURPLE,
  },
});
