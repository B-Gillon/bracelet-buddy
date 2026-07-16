import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import ModeIndicator from './build-cards/ModeIndicator';

// Raw web CSS (not an RN StyleSheet), computed from the theme like
// SettingsScreen/HomeScreen's makeInputStyle - so it isn't part of the
// StyleSheet-based plumbing below, but still tracks Light/Dark Mode.
function makeTitleInputStyle(theme: Theme): React.CSSProperties {
  return {
    fontSize: 18,
    fontWeight: 700,
    color: theme.text,
    border: 'none',
    background: 'transparent',
    padding: 0,
    minWidth: 160,
    maxWidth: 320,
  };
}

// The sticky top bar: pattern name (live-edited, with a debounced
// availability check owned by usePatternPersistence), orientation/zoom
// controls, ModeIndicator, and the Start Over/Undo/Redo/Clear/Save As New/
// Save/Delete action row. Extracted out of BuildScreen.tsx - everything it
// needs comes in as props rather than reaching into BuildScreen's state
// directly, same as GridEdgeControls/the build-cards.
export default function BuildScreenHeader({
  name,
  onNameChange,
  nameStatus,
  orientation,
  onToggleOrientation,
  onFitToWindow,
  zoom,
  atMinZoom,
  atMaxZoom,
  onStepZoomDown,
  onStepZoomUp,
  onStartOver,
  onUndo,
  onRedo,
  onClear,
  onSaveAsNew,
  onSave,
  isSavingCloud,
  onDeleteRequest,
  isDeleting,
}: {
  name: string;
  onNameChange: (name: string) => void;
  nameStatus: 'idle' | 'checking' | 'available' | 'taken' | 'error';
  orientation: 'horizontal' | 'vertical';
  onToggleOrientation: () => void;
  onFitToWindow: () => void;
  zoom: number;
  atMinZoom: boolean;
  atMaxZoom: boolean;
  onStepZoomDown: () => void;
  onStepZoomUp: () => void;
  onStartOver: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onSaveAsNew: () => void;
  onSave: () => void;
  isSavingCloud: boolean;
  onDeleteRequest: () => void;
  isDeleting: boolean;
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const titleInputStyle = useMemo(() => makeTitleInputStyle(theme), [theme]);

  const saveDisabled = isSavingCloud || nameStatus === 'taken' || nameStatus === 'checking';

  return (
    <View style={s.header}>
      <View style={s.headerTopRow}>
        <View style={s.titleRowLeft}>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            style={titleInputStyle}
          />

          {nameStatus === 'taken' && (
            <Text style={s.nameTakenTxt}>Name already used</Text>
          )}

          <TouchableOpacity
            style={[s.toolbarBtn, s.orientationBtn]}
            onPress={onToggleOrientation}
          >
            <Text style={s.toolbarBtnTxt}>
              {orientation === 'horizontal' ? 'Show Vertical' : 'Show Horizontal'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={onFitToWindow}
          >
            <Text style={s.toolbarBtnTxt}>Fit to Window</Text>
          </TouchableOpacity>

          <View style={s.zoomRow}>
            <TouchableOpacity
              style={[s.zoomBtn, atMinZoom && s.zoomBtnDisabled]}
              onPress={onStepZoomDown}
            >
              <Text style={s.zoomBtnTxt}>-</Text>
            </TouchableOpacity>
            <Text style={s.zoomLabel}>{Math.round(zoom * 100)}%</Text>
            <TouchableOpacity
              style={[s.zoomBtn, atMaxZoom && s.zoomBtnDisabled]}
              onPress={onStepZoomUp}
            >
              <Text style={s.zoomBtnTxt}>+</Text>
            </TouchableOpacity>
          </View>

          <ModeIndicator />
        </View>

        <View style={s.headerRightGroup}>
          <TouchableOpacity style={s.toolbarBtn} onPress={onStartOver}>
            <Text style={s.toolbarBtnTxt}>Start Over</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={onUndo}>
            <Text style={s.toolbarBtnTxt}>Undo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={onRedo}>
            <Text style={s.toolbarBtnTxt}>Redo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={onClear}>
            <Text style={s.toolbarBtnTxt}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={onSaveAsNew}>
            <Text style={s.toolbarBtnTxt}>Save As New</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.toolbarBtn, s.saveBtn, saveDisabled && s.toolbarBtnDisabled]}
            onPress={onSave}
            disabled={saveDisabled}
          >
            <Text style={s.saveBtnTxt}>{isSavingCloud ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.toolbarBtn, isDeleting && s.toolbarBtnDisabled]}
            onPress={onDeleteRequest}
            disabled={isDeleting}
          >
            <Text style={s.toolbarBtnTxt}>{isDeleting ? 'Deleting...' : 'Delete'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    header:             { backgroundColor: theme.surface, paddingHorizontal: 40, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
    headerTopRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    titleRowLeft:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    nameTakenTxt:       { fontSize: 11, fontWeight: '600', color: theme.danger },
    headerRightGroup:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
    toolbarBtn:         { borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surfaceMuted },
    orientationBtn:     { minWidth: 132, alignItems: 'center' },
    toolbarBtnDisabled: { opacity: 0.4 },
    toolbarBtnTxt:      { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    saveBtn:            { backgroundColor: theme.purple, borderColor: theme.purple },
    saveBtnTxt:         { fontSize: 12, fontWeight: '700', color: theme.textOnPurple },
    zoomRow:            { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 8, overflow: 'hidden' },
    zoomBtn:            { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceMutedAlt },
    zoomBtnDisabled:    { opacity: 0.35 },
    zoomBtnTxt:         { fontSize: 18, color: theme.textMuted },
    zoomLabel:          { width: 48, textAlign: 'center', fontSize: 12, fontWeight: '600', color: theme.textMuted },
  });
}
