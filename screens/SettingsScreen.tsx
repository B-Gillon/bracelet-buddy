import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useTheme, ThemePreference } from '../context/ThemeContext';
import { Theme } from '../constants/theme';
import { updateProfile, isUsernameTaken } from '../utils/profiles';
import { AVATAR_OPTIONS, DEFAULT_AVATAR_ID } from '../constants/avatars';

function makeInputStyle(theme: Theme): React.CSSProperties {
  return {
    boxSizing: 'border-box',
    height: 40,
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.surface,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 14,
    color: theme.text,
    width: '100%',
  };
}

function makeReadOnlyInputStyle(theme: Theme): React.CSSProperties {
  return {
    ...makeInputStyle(theme),
    backgroundColor: theme.surfaceMutedAlt,
    color: theme.textFaint,
  };
}

const APPEARANCE_OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: loadingProfile, refreshProfile, setProfile } = useProfile();
  const { theme, preference, setPreference } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const inputStyle = useMemo(() => makeInputStyle(theme), [theme]);
  const readOnlyInputStyle = useMemo(() => makeReadOnlyInputStyle(theme), [theme]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'error'
  >('idle');

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? '');
      setLastName(profile.last_name ?? '');
      setUsername(profile.username ?? '');
      setCountry(profile.country ?? '');
      setAvatarId(profile.avatar_id ?? DEFAULT_AVATAR_ID);
    }
  }, [profile]);

  useEffect(() => {
    const trimmed = username.trim();

    // Nothing to check if it's blank (optional field - blank never
    // collides with anyone else's blank field, since we save it as null,
    // not an empty string) or unchanged from what's already saved.
    if (!trimmed || trimmed === (profile?.username ?? '')) {
      setUsernameStatus('idle');
      return;
    }
    if (!user) return;

    setUsernameStatus('checking');
    const timeout = setTimeout(async () => {
      const { taken, error: checkError } = await isUsernameTaken(trimmed, user.id);
      setUsernameStatus(checkError ? 'error' : taken ? 'taken' : 'available');
    }, 500);

    return () => clearTimeout(timeout);
  }, [username, profile, user]);

  async function handleSave() {
    if (!user) return;
    setError(null);
    setInfo(null);

    if (usernameStatus === 'taken') {
      setError('That username is already taken - try another one.');
      return;
    }

    setSaving(true);

    const { error: saveError } = await updateProfile(user.id, {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      username: username.trim() || null,
      country: country.trim() || null,
      avatar_id: avatarId,
    });

    setSaving(false);

    if (saveError) {
      // Postgres's raw unique-violation message is not kid-friendly -
      // translate the one case we expect (a taken username) into
      // something clearer.
      if (saveError.toLowerCase().includes('username')) {
        setError('That username is already taken - try another one.');
      } else {
        setError(saveError);
      }
      return;
    }

    if (profile) {
      setProfile({
        ...profile,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        username: username.trim() || null,
        country: country.trim() || null,
        avatar_id: avatarId,
      });
    } else {
      refreshProfile();
    }

    setInfo('Profile saved!');
  }

  if (authLoading || !user) {
    return (
      <View style={s.container}>
        <Text style={s.subtitle}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.title}>Your Profile</Text>
      <Text style={s.subtitle}>
        Everything here is optional - fill in as much or as little as you like.
      </Text>

      <View style={s.formCard}>
        <Text style={s.fieldLabel}>APPEARANCE</Text>
        <View style={s.appearanceRow}>
          {APPEARANCE_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.key}
              style={[s.appearanceBtn, preference === option.key && s.appearanceBtnActive]}
              onPress={() => setPreference(option.key)}
            >
              <Text style={[s.appearanceBtnTxt, preference === option.key && s.appearanceBtnActiveTxt]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.appearanceHint}>
          "System" follows your device's Light/Dark setting automatically.
        </Text>
      </View>

      {loadingProfile ? (
        <Text style={s.subtitle}>Loading your profile...</Text>
      ) : (
        <View style={s.formCard}>
          <Text style={s.fieldLabel}>AVATAR</Text>
          <View style={s.avatarRow}>
            {AVATAR_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.id}
                onPress={() => setAvatarId(option.id)}
                style={[
                  s.avatarSwatch,
                  avatarId === option.id && s.avatarSwatchSelected,
                ]}
              >
                <Image source={option.source} style={s.avatarImage} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.fieldLabel, { marginTop: 20 }]}>FIRST NAME</Text>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            style={inputStyle}
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>LAST NAME</Text>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            style={inputStyle}
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>USERNAME</Text>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={inputStyle}
          />
          {usernameStatus === 'checking' && (
            <Text style={s.usernameCheckingTxt}>Checking availability...</Text>
          )}
          {usernameStatus === 'available' && (
            <Text style={s.usernameAvailableTxt}>✓ Username available</Text>
          )}
          {usernameStatus === 'taken' && (
            <Text style={s.usernameTakenTxt}>✗ That username is already taken</Text>
          )}

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>EMAIL</Text>
          <input type="text" value={user.email ?? ''} readOnly style={readOnlyInputStyle} />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>COUNTRY</Text>
          <input
            type="text"
            value={country}
            onChange={e => setCountry(e.target.value)}
            style={inputStyle}
          />

          {error && <Text style={s.errorTxt}>{error}</Text>}
          {info && <Text style={s.infoTxt}>{info}</Text>}

          <TouchableOpacity
            style={[s.submitBtn, (saving || usernameStatus === 'checking') && s.submitBtnDisabled]}
            onPress={handleSave}
            disabled={saving || usernameStatus === 'checking'}
          >
            <Text style={s.submitBtnTxt}>{saving ? 'Saving...' : 'Save Profile'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container:         { flex: 1, padding: 40, maxWidth: 480, width: '100%', alignSelf: 'center' },
    title:             { fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: 6, textAlign: 'center' },
    subtitle:          { fontSize: 13, color: theme.textFaint, marginBottom: 24, textAlign: 'center' },
    formCard:          { borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 20, backgroundColor: theme.surfaceMuted, marginBottom: 20 },
    fieldLabel:        { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: theme.purple, marginBottom: 8 },
    appearanceRow:     { flexDirection: 'row', borderWidth: 1, borderColor: theme.border, borderRadius: 10, overflow: 'hidden' },
    appearanceBtn:     { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: theme.surface },
    appearanceBtnActive: { backgroundColor: theme.purpleTint },
    appearanceBtnTxt:  { fontSize: 13, fontWeight: '600', color: theme.textMuted },
    appearanceBtnActiveTxt: { color: theme.purple },
    appearanceHint:    { fontSize: 11, color: theme.textFaint, marginTop: 8 },
    avatarRow:         { flexDirection: 'row', gap: 12 },
    avatarSwatch:      { width: 56, height: 56, borderRadius: 28, padding: 3, borderWidth: 2, borderColor: 'transparent' },
    avatarSwatchSelected: { borderColor: theme.purple },
    avatarImage:       { width: '100%', height: '100%', borderRadius: 24 },
    usernameCheckingTxt:  { fontSize: 11, color: theme.textFaint, marginTop: 6 },
    usernameAvailableTxt: { fontSize: 11, color: theme.success, marginTop: 6, fontWeight: '600' },
    usernameTakenTxt:     { fontSize: 11, color: theme.danger, marginTop: 6, fontWeight: '600' },
    errorTxt:          { fontSize: 12, color: theme.danger, marginTop: 14 },
    infoTxt:           { fontSize: 12, color: theme.success, marginTop: 14 },
    submitBtn:         { backgroundColor: theme.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 20 },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnTxt:      { color: theme.textOnPurple, fontSize: 14, fontWeight: '700' },
  });
}
