import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Theme } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useBuildEditor } from '../../context/BuildEditorContext';

// The SELECTOR card from BuildScreen's cardRow: Select Tool lives in the
// top-right corner (mirrors Color Tool's spot on the Colors card), then
// Reset/Magic Wand/Select Same Color grow or clear the selection, and
// Duplicate/Move act on it. While a Duplicate/Move copy is floating, the
// row swaps for a single Cancel button - dragging the copy and letting go
// drops it in place immediately (BuildScreen's handleCellRelease commits
// it), so there's no separate Done step. Duplicate deliberately keeps the
// selection afterward (BuildScreen doesn't clear it), so it stays enabled
// for stamping out another copy right away.
//
// Recolor Selected also lives here rather than on the Colors card - it's a
// selection-based action (like Magic Wand/Select Same Color), not a
// painting action, so it belongs with the other "act on what's selected"
// tools. That also means you never have to leave Select Tool mode to use
// it. Its color swatch is its own local state, deliberately independent of
// the shared "active palette color" Colors card uses for painting.
//
// Clicking anywhere in this card - any button, or blank card space - also
// switches you into Select Tool (mirrors the Colors card always switching
// into Color Tool). Every button below calls onSelectTool first; the card's
// outer View also carries a web onClick as a catch-all for clicks that
// land on padding/labels rather than a button (react-native-web forwards
// onClick straight to the underlying div, so this only does anything on
// web - harmless no-op on native).
export default function SelectorCard() {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const {
    palette, colorCount,
    toolMode, onSelectTool,
    selectedCount, onReset, onSelectConnected, onSelectSameColor, floatingKind,
    onDuplicate, onMove, onCancelFloating,
    onRecolorSelection, onFlipHorizontal, onFlipVertical,
  } = useBuildEditor();

  // Dedicated color swatch for Recolor Selected - starts unset (null) so
  // you have to explicitly pick a color before recoloring anything.
  const [recolorIdx, setRecolorIdx] = useState<number | null>(null);

  function cycleRecolor() {
    setRecolorIdx(prev => {
      if (colorCount === 0) return prev;
      if (prev === null) {
        for (let i = 0; i < colorCount; i++) {
          if (palette[i]) return i;
        }
        return prev;
      }
      let next = prev;
      for (let i = 0; i < colorCount; i++) {
        next = (next + 1) % colorCount;
        if (palette[next]) return next;
      }
      return prev;
    });
  }

  const recolorColor = recolorIdx != null ? (palette[recolorIdx] ?? null) : null;
  const canRecolor = selectedCount > 0 && !!recolorColor;

  return (
    <View style={[s.card, toolMode === 'select' && s.cardActive]} {...({ onClick: onSelectTool } as any)}>
      <View style={s.cardHeaderRow}>
        <Text style={s.cardLabel}>SELECTOR</Text>
        <TouchableOpacity
          style={[s.toolbarBtn, toolMode === 'select' && s.toolbarBtnActive]}
          onPress={onSelectTool}
          {...({ title: 'Click or drag across the diamonds you want to grab - just like coloring.' } as any)}
        >
          <Text style={[s.toolbarBtnTxt, toolMode === 'select' && s.toolbarBtnActiveTxt]}>
            Select Tool
          </Text>
        </TouchableOpacity>
      </View>

      {!floatingKind && (
        <Text style={s.instructionsTxt}>Select diamonds, then pick your action.</Text>
      )}

      <View style={s.sectionToolsRow}>
        {floatingKind ? (
          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={() => { onSelectTool(); onCancelFloating(); }}
            {...({ title: 'Drag the copy to where you want it - letting go drops it in place. Cancel backs out instead of placing it.' } as any)}
          >
            <Text style={s.toolbarBtnTxt}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[s.toolbarBtn, selectedCount === 0 && s.toolbarBtnDisabled]}
              onPress={() => { onSelectTool(); onReset(); }}
              disabled={selectedCount === 0}
              {...({ title: 'Clears the current selection so you can start a new one.' } as any)}
            >
              <Text style={[s.toolbarBtnTxt, selectedCount === 0 && s.toolbarBtnDisabledTxt]}>Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.toolbarBtn, selectedCount === 0 && s.toolbarBtnDisabled]}
              onPress={() => { onSelectTool(); onSelectConnected(); }}
              disabled={selectedCount === 0}
              {...({ title: "Grows the selection to every touching diamond that's the same color as a diamond you've already selected." } as any)}
            >
              <Text style={[s.toolbarBtnTxt, selectedCount === 0 && s.toolbarBtnDisabledTxt]}>Magic Wand</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.toolbarBtn, selectedCount === 0 && s.toolbarBtnDisabled]}
              onPress={() => { onSelectTool(); onSelectSameColor(); }}
              disabled={selectedCount === 0}
              {...({ title: "Selects every diamond anywhere in the pattern that's the same color as a diamond you've already selected." } as any)}
            >
              <Text style={[s.toolbarBtnTxt, selectedCount === 0 && s.toolbarBtnDisabledTxt]}>Select Same Color</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.toolbarBtn, selectedCount === 0 && s.toolbarBtnDisabled]}
              onPress={() => { onSelectTool(); onDuplicate(); }}
              disabled={selectedCount === 0}
              {...({ title: 'Makes a movable copy of your selection. Stays available so you can stamp another copy right after.' } as any)}
            >
              <Text style={[s.toolbarBtnTxt, selectedCount === 0 && s.toolbarBtnDisabledTxt]}>Duplicate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.toolbarBtn, selectedCount === 0 && s.toolbarBtnDisabled]}
              onPress={() => { onSelectTool(); onMove(); }}
              disabled={selectedCount === 0}
              {...({ title: 'Picks up your selection so you can move it - the old spot goes blank right away.' } as any)}
            >
              <Text style={[s.toolbarBtnTxt, selectedCount === 0 && s.toolbarBtnDisabledTxt]}>Move</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.toolbarBtn, selectedCount === 0 && s.toolbarBtnDisabled]}
              onPress={() => { onSelectTool(); onFlipHorizontal(); }}
              disabled={selectedCount === 0}
              {...({ title: 'Mirrors your selection left-right, in place, within its own footprint.' } as any)}
            >
              <Text style={[s.toolbarBtnTxt, selectedCount === 0 && s.toolbarBtnDisabledTxt]}>Flip Horizontal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.toolbarBtn, selectedCount === 0 && s.toolbarBtnDisabled]}
              onPress={() => { onSelectTool(); onFlipVertical(); }}
              disabled={selectedCount === 0}
              {...({ title: 'Mirrors your selection top-bottom, in place, within its own footprint.' } as any)}
            >
              <Text style={[s.toolbarBtnTxt, selectedCount === 0 && s.toolbarBtnDisabledTxt]}>Flip Vertical</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {!floatingKind && (
        <View style={s.recolorRow}>
          <TouchableOpacity
            style={[s.replaceSwatch, { backgroundColor: recolorColor ?? theme.border }]}
            onPress={() => { onSelectTool(); cycleRecolor(); }}
            {...({ title: 'Click to cycle through your palette colors.' } as any)}
          />
          <TouchableOpacity
            style={[s.toolbarBtn, !canRecolor && s.toolbarBtnDisabled]}
            onPress={() => { onSelectTool(); if (canRecolor) onRecolorSelection(recolorColor!); }}
            disabled={!canRecolor}
            {...({ title: 'Recolors your current selection - and every diamond connected to it that shares its color - to the swatch on the left.' } as any)}
          >
            <Text style={[s.toolbarBtnTxt, !canRecolor && s.toolbarBtnDisabledTxt]}>Recolor Selected</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card:            { flex: 1, minWidth: 200, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, gap: 8 },
    cardActive:      { borderColor: theme.purple, borderWidth: 2 },
    cardHeaderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: theme.textFaint },
    instructionsTxt: { fontSize: 12, color: theme.textFaint, fontStyle: 'italic' },
    sectionToolsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    recolorRow:      { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
    replaceSwatch:   { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: theme.swatchBorder },
    toolbarBtn:         { borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surfaceMuted },
    toolbarBtnActive:   { backgroundColor: theme.purpleTint, borderColor: theme.purple },
    toolbarBtnActiveTxt:{ color: theme.purple },
    toolbarBtnDisabled: { opacity: 0.4 },
    toolbarBtnDisabledTxt: { color: theme.textFaint },
    toolbarBtnTxt:      { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  });
}
