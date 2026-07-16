import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

// The four small, self-contained modals from BuildScreen.tsx: Start Over
// confirm, Account Required, Save As New, and Saved (which offers to send
// you into Build Center). Bundled into one file since each is tiny on its
// own; they share one stylesheet.

function makeSaveAsNewInputStyle(theme: Theme): React.CSSProperties {
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
    marginTop: 4,
    marginBottom: 4,
  };
}

export function StartOverConfirmModal({
  visible, onCancel, onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Start Over?</Text>
          <Text style={s.modalText}>
            This will discard your current pattern and take you back to the beginning. This can't be undone.
          </Text>
          <View style={s.modalButtonsRow}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={onCancel}>
              <Text style={s.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalConfirmBtn} onPress={onConfirm}>
              <Text style={s.modalConfirmTxt}>Start Over</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DeletePatternModal({
  visible, onCancel, onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Delete This Bracelet?</Text>
          <Text style={s.modalText}>
            Are you sure you want to permanently delete this pattern?
          </Text>
          <View style={s.modalButtonsRow}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={onCancel}>
              <Text style={s.modalCancelTxt}>No, Do Not Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalConfirmBtn} onPress={onConfirm}>
              <Text style={s.modalConfirmTxt}>Yes, Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function AccountRequiredModal({
  visible, onCancel, onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Create an Account to Save</Text>
          <Text style={s.modalText}>
            You need an account to save your pattern. It only takes a minute, and you can keep designing here in the meantime.
          </Text>
          <View style={s.modalButtonsRow}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={onCancel}>
              <Text style={s.modalCancelTxt}>Not Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalConfirmAccentBtn} onPress={onConfirm}>
              <Text style={s.modalConfirmTxt}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function SaveAsNewModal({
  visible, name, nameStatus, onChangeName, onCancel, onConfirm,
}: {
  visible: boolean;
  name: string;
  nameStatus: 'idle' | 'checking' | 'available' | 'taken' | 'error';
  onChangeName: (name: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const saveAsNewInputStyle = useMemo(() => makeSaveAsNewInputStyle(theme), [theme]);
  const blocked = nameStatus === 'taken' || nameStatus === 'checking';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Save As New Pattern</Text>
          <Text style={s.modalText}>
            This creates a brand new copy - your original pattern won't be changed.
          </Text>
          <input
            type="text"
            value={name}
            onChange={e => onChangeName(e.target.value)}
            style={saveAsNewInputStyle}
          />
          {nameStatus === 'checking' && (
            <Text style={s.nameCheckingTxt}>Checking availability...</Text>
          )}
          {nameStatus === 'taken' && (
            <Text style={s.nameTakenTxt}>You already have a bracelet with that name.</Text>
          )}
          <View style={s.modalButtonsRow}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={onCancel}>
              <Text style={s.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modalConfirmAccentBtn, blocked && s.modalConfirmDisabled]}
              onPress={onConfirm}
              disabled={blocked}
            >
              <Text style={s.modalConfirmTxt}>Save Copy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function SavedModal({
  visible, cloudSaveError, onNotNow, onBuildIt,
}: {
  visible: boolean;
  cloudSaveError: string | null;
  onNotNow: () => void;
  // Navigates straight to that pattern's Build Center page now - this used
  // to just flip to a "Coming Soon" panel in-place, back when Build Center
  // didn't exist yet as a real destination.
  onBuildIt: () => void;
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNotNow}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>
            {cloudSaveError ? 'Saved on This Device' : 'Saved!'}
          </Text>
          <Text style={s.modalText}>
            {cloudSaveError
              ? "We'll sync it online once you're connected again. Want to build this bracelet now?"
              : 'Want to build this bracelet now?'}
          </Text>
          <View style={s.modalButtonsRow}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={onNotNow}>
              <Text style={s.modalCancelTxt}>Not Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalConfirmAccentBtn} onPress={onBuildIt}>
              <Text style={s.modalConfirmTxt}>Yes, Build It!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    // See MyDesignsScreen.tsx's modalOverlay comment - React Native's
    // <Modal> doesn't establish its own stacking context, so without an
    // explicit zIndex here, page content elsewhere (which all get an
    // implicit zIndex:0 from react-native-web) can paint and hit-test
    // above these modals instead of the other way around.
    modalOverlay:    { flex: 1, backgroundColor: theme.overlay, alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', zIndex: 1000 },
    modalCard:       { backgroundColor: theme.surface, borderRadius: 14, padding: 24, maxWidth: 360, width: '100%', gap: 10 },
    modalTitle:      { fontSize: 18, fontWeight: '700', color: theme.text },
    modalText:       { fontSize: 13, color: theme.textSubtle, lineHeight: 19, marginBottom: 8 },
    modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    modalCancelBtn:  { borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.surfaceMuted },
    modalCancelTxt:  { fontSize: 13, fontWeight: '600', color: theme.textMuted },
    modalConfirmBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.danger },
    modalConfirmAccentBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.purple },
    modalConfirmDisabled: { opacity: 0.5 },
    modalConfirmTxt: { fontSize: 13, fontWeight: '700', color: theme.textOnPurple },
    nameCheckingTxt: { fontSize: 11, color: theme.textFaint, marginTop: -2 },
    nameTakenTxt:    { fontSize: 11, fontWeight: '600', color: theme.danger, marginTop: -2 },
  });
}
