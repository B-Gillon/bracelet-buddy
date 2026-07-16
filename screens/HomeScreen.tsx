import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';

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

export default function HomeScreen({ onGoToProfile }: { onGoToProfile: () => void }) {
  const { user, loading, signIn, signUp } = useAuth();
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const inputStyle = useMemo(() => makeInputStyle(theme), [theme]);
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // Detect the one-time ?welcome=1 flag from the email confirmation
  // redirect, then immediately strip it from the URL so refreshing this
  // page (or navigating back to it later) doesn't show it again.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('welcome') === '1') {
      setShowWelcome(true);
      params.delete('welcome');
      const query = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}`
      );
    }
  }, []);

  async function handleSubmit() {
    setError(null);
    setInfo(null);

    if (!email.trim() || !password) {
      setError('Please fill in both email and password.');
      return;
    }
    if (mode === 'sign-up' && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const result =
      mode === 'sign-in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (mode === 'sign-up') {
      setInfo('Account created! Check your email to confirm, then sign in.');
      setMode('sign-in');
      setPassword('');
      setConfirmPassword('');
    }
  }

  function toggleMode() {
    setMode(m => (m === 'sign-in' ? 'sign-up' : 'sign-in'));
    setError(null);
    setInfo(null);
  }

  if (loading) {
    return (
      <View style={s.container}>
        <Text style={s.subtitle}>Loading...</Text>
      </View>
    );
  }

  if (user) {
    return (
      <View style={s.container}>
        {showWelcome && (
          <View style={s.welcomeBanner}>
            <Text style={s.welcomeBannerTxt}>
              🎉 Account confirmed! Welcome to Bracelet Buddy.
            </Text>
            <TouchableOpacity onPress={() => setShowWelcome(false)}>
              <Text style={s.welcomeBannerDismiss}>Got it</Text>
            </TouchableOpacity>
          </View>
        )}
        {showWelcome && (
          <TouchableOpacity style={s.profileNudge} onPress={onGoToProfile}>
            <Text style={s.profileNudgeTxt}>Want to set up your profile? (totally optional)</Text>
          </TouchableOpacity>
        )}
        {!showWelcome && <Text style={s.title}>Welcome back!</Text>}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.title}>Welcome to Bracelet Buddy</Text>
      <Text style={s.subtitle}>
        {mode === 'sign-in'
          ? 'Sign in to save patterns and build your bracelets.'
          : 'Create an account to save patterns and unlock the bracelet-building guide.'}
      </Text>

      <View style={s.formCard}>
        <Text style={s.fieldLabel}>EMAIL</Text>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />

        <Text style={[s.fieldLabel, { marginTop: 14 }]}>PASSWORD</Text>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
        />

        {mode === 'sign-up' && (
          <>
            <Text style={[s.fieldLabel, { marginTop: 14 }]}>CONFIRM PASSWORD</Text>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={inputStyle}
            />
          </>
        )}

        {error && <Text style={s.errorTxt}>{error}</Text>}
        {info && <Text style={s.infoTxt}>{info}</Text>}

        <TouchableOpacity
          style={[s.submitBtn, submitting && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={s.submitBtnTxt}>
            {submitting ? 'Please wait...' : mode === 'sign-in' ? 'Sign In' : 'Create Account'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.toggleModeBtn} onPress={toggleMode}>
          <Text style={s.toggleModeTxt}>
            {mode === 'sign-in'
              ? "Don't have an account? Create one"
              : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container:         { flex: 1, padding: 40, maxWidth: 480, width: '100%', alignSelf: 'center' },
    welcomeBanner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.purpleTint, borderWidth: 1, borderColor: theme.purple, borderRadius: 10, padding: 14, marginBottom: 20 },
    welcomeBannerTxt:  { fontSize: 13, fontWeight: '600', color: theme.purple, flex: 1, marginRight: 12 },
    welcomeBannerDismiss: { fontSize: 12, fontWeight: '700', color: theme.purple },
    profileNudge:      { alignItems: 'center', marginBottom: 20 },
    profileNudgeTxt:   { fontSize: 13, color: theme.purple, fontWeight: '600', textDecorationLine: 'underline' },
    title:             { fontSize: 24, fontWeight: '700', color: theme.text, marginBottom: 6, textAlign: 'center' },
    subtitle:          { fontSize: 13, color: theme.textFaint, marginBottom: 24, textAlign: 'center' },
    formCard:          { borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 20, backgroundColor: theme.surfaceMuted },
    fieldLabel:        { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: theme.purple, marginBottom: 6 },
    errorTxt:          { fontSize: 12, color: theme.danger, marginTop: 12 },
    infoTxt:           { fontSize: 12, color: theme.success, marginTop: 12 },
    submitBtn:         { backgroundColor: theme.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 18 },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnTxt:      { color: theme.textOnPurple, fontSize: 14, fontWeight: '700' },
    toggleModeBtn:     { marginTop: 14, alignItems: 'center' },
    toggleModeTxt:     { fontSize: 12, color: theme.purple, fontWeight: '600' },
  });
}
