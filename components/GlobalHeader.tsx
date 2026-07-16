import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';
import { getAvatarSource } from '../constants/avatars';

export type AppPage =
  | 'home'
  | 'patterns'
  | 'my-designs'
  | 'design-center'
  | 'build-center'
  | 'tutorials'
  | 'settings';

const NAV_ITEMS: { key: AppPage; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'my-designs', label: 'My Designs' },
  { key: 'design-center', label: 'Design Center' },
  { key: 'build-center', label: 'Build Center' },
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
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const [menuOpen, setMenuOpen] = useState(false);
  // Wraps the avatar button AND the dropdown itself, so a click on the
  // avatar (which toggles menuOpen via its own onPress) is never
  // misidentified as an "outside" click that immediately re-closes it.
  const menuRef = useRef<View>(null);

  // Web-only "click outside to close" - a real document listener rather
  // than a full-screen invisible overlay. The previous overlay approach
  // (position: fixed, lower z-index, sibling of the dropdown) could
  // intercept clicks meant for the dropdown's own Settings/Log Out
  // buttons instead of letting them through, which was the actual bug.
  // Native has no `document`, so this is a no-op there; there's currently
  // no native build shipping (see CLAUDE.md), so tapping an item is still
  // the only way to close the menu there for now.
  useEffect(() => {
    if (!menuOpen || typeof document === 'undefined') return;

    function handleOutsideClick(e: MouseEvent) {
      const node = menuRef.current as unknown as HTMLElement | null;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

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
          <View style={s.menuWrapper} ref={menuRef}>
            <TouchableOpacity style={s.avatarBtn} onPress={() => setMenuOpen(o => !o)}>
              <Image source={getAvatarSource(profile?.avatar_id)} style={s.avatarImage} />
            </TouchableOpacity>

            {menuOpen && (
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
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      rowGap: 8,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.headerBackground,
      // React Native Web gives every View an implicit position:relative +
      // zIndex:0, which makes it establish its own stacking context. That
      // means this bar and the page content rendered below it (App.tsx's
      // s.body, or BuildScreen's own content) are competing SIBLING
      // stacking contexts at the same explicit level (0) - ties go to
      // whichever is LATER in the DOM, which is always the page content,
      // not the header. The dropdown's own zIndex:50 (below) can't escape
      // that: it only ranks above things *inside* this same stacking
      // context, never above an entirely separate sibling context. This
      // explicit zIndex is what actually lets the header (dropdown
      // included) paint and hit-test above every page's content -
      // confirmed via elementFromPoint that clicks were landing on the
      // page body underneath the visually-on-top dropdown before this was
      // added.
      position: 'relative',
      zIndex: 100,
    },
    logo: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.purple,
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
      backgroundColor: theme.purpleTint,
    },
    navBtnTxt: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textMuted,
    },
    navBtnActiveTxt: {
      color: theme.purple,
    },
    authBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      backgroundColor: theme.purple,
      marginLeft: 6,
    },
    authBtnTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textOnPurple,
    },
    avatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      marginLeft: 8,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: theme.purple,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    dropdownEmailRow: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      marginBottom: 4,
    },
    dropdownEmailTxt: {
      fontSize: 12,
      color: theme.textFaint,
    },
    menuWrapper: {
      position: 'relative',
    },
    dropdownMenu: {
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: 6,
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
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
      color: theme.textMuted,
    },
  });
}
