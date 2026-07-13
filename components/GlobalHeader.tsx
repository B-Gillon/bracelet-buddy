import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { getAvatarSource } from '../constants/avatars';

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
  const { user, loading, signOut } = useAuth();
  const { profile } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);

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

        {!loading && !user && (
          <TouchableOpacity style={s.authBtn} onPress={() => onNavigate('home')}>
            <Text style={s.authBtnTxt}>Sign In</Text>
          </TouchableOpacity>
        )}

        {!loading && user && (
          <View style={s.menuWrapper}>
            <TouchableOpacity style={s.avatarBtn} onPress={() => setMenuOpen(o => !o)}>
              <Image source={getAvatarSource(profile?.avatar_id)} style={s.avatarImage} />
            </TouchableOpacity>

            {menuOpen && (
              <>
                {/* Invisible full-screen layer so clicking anywhere outside
                    the menu closes it. */}
                <TouchableOpacity
                  style={s.menuOverlay}
                  activeOpacity={1}
                  onPress={() => setMenuOpen(false)}
                />
                <View style={s.dropdownMenu}>
                  <View style={s.dropdownEmailRow}>
                    <Text style={s.dropdownEmailTxt} numberOfLines={1}>
                      {user.email}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={s.dropdownItem}
                    onPress={() => {
                      setMenuOpen(false);
                      onNavigate('settings');
                    }}
                  >
                    <Text style={s.dropdownItemTxt}>Settings</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.dropdownItem}
                    onPress={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                  >
                    <Text style={s.dropdownItemTxt}>Log Out</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
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
    backgroundColor: '#e0f2fe',
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
  authBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: PURPLE,
    marginLeft: 6,
  },
  authBtnTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: PURPLE,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  dropdownEmailRow: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 4,
  },
  dropdownEmailTxt: {
    fontSize: 12,
    color: '#9ca3af',
  },
  menuWrapper: {
    position: 'relative',
  },
  menuOverlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 6,
    minWidth: 140,
    zIndex: 50,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dropdownItemTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
});
