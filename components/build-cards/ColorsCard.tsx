import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Theme } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useBuildEditor } from '../../context/BuildEditorContext';

type ReplaceRule = { id: number; fromIdx: number | null; toIdx: number | null };

// The COLORS card from BuildScreen's cardRow: palette swatches + Change
// Colors beside them, Color Tool in the top-right corner (counterpart to
// Select Tool on the Selector card), and a growable list of From/To rules
// for a global find-and-replace across the whole pattern (e.g. "change red
// to blue" AND "change blue to green" at once). Everything in this card is
// a painting/palette concern now - Recolor Selected (which acts on your
// current selection) lives on the Selector card instead, alongside Magic
// Wand/Select Same Color/Duplicate/Move.
//
// Because nothing here depends on an active selection anymore, every
// interactive control also switches you into Color Tool (and out of
// Select Tool) via onColorTool - so you don't have to separately click
// Color Tool before picking a paint color or editing a replace rule. The
// card's outer View also carries a web onClick as a catch-all for clicks
// that land on padding/labels rather than a button (react-native-web
// forwards onClick straight to the underlying div, so this only does
// anything on web - harmless no-op on native).
//
// The Eraser button next to Color Tool is its own tool (Erase), not just
// another palette entry - clicking or dragging diamonds while it's active
// clears their color no matter what's currently painted on them, unrelated
// to whichever palette color happens to be selected. Its onPress carries an
// extra web-only onClick that stops propagation, so the click doesn't also
// bubble up to the card's onColorTool catch-all and immediately flip you
// back to Color Tool - every other control in this card is fine leaving
// that catch-all in place, since they're all meant to land on Color Tool.
// Pulls all its state from BuildEditorContext instead of being handed a
// dozen individual props.
export default function ColorsCard() {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const {
    palette, colorCount, selectedColorIdx, setSelectedColorIdx, onOpenColorPicker,
    toolMode, onColorTool, onEraseTool,
    onReplaceColors,
  } = useBuildEditor();

  // Local UI-only state for the replace-rule list - rules aren't committed
  // to the pattern until Apply All is pressed. Each rule just remembers
  // which two palette slots it's currently showing; nextRuleId gives each
  // row a stable key across add/remove so React doesn't reuse identity
  // across different rows. Rules default to no color picked (null) in
  // either slot, so the user has to explicitly choose both before a rule
  // can ever apply.
  const [rules, setRules] = useState<ReplaceRule[]>([{ id: 0, fromIdx: null, toIdx: null }]);
  const nextRuleId = useRef(1);

  // First non-null palette slot, used as the starting point when cycling
  // up from an unset (null) swatch.
  function firstColorIdx(): number | null {
    for (let i = 0; i < colorCount; i++) {
      if (palette[i]) return i;
    }
    return null;
  }

  function cycle(idx: number | null): number | null {
    if (colorCount === 0) return idx;
    if (idx === null) return firstColorIdx();
    let next = idx;
    for (let i = 0; i < colorCount; i++) {
      next = (next + 1) % colorCount;
      if (palette[next]) return next;
    }
    return idx;
  }

  function addRule() {
    onColorTool();
    setRules(prev => [...prev, { id: nextRuleId.current++, fromIdx: null, toIdx: null }]);
  }
  function removeRule(id: number) {
    onColorTool();
    setRules(prev => prev.filter(r => r.id !== id));
  }
  function cycleRuleFrom(id: number) {
    onColorTool();
    setRules(prev => prev.map(r => (r.id === id ? { ...r, fromIdx: cycle(r.fromIdx) } : r)));
  }
  function cycleRuleTo(id: number) {
    onColorTool();
    setRules(prev => prev.map(r => (r.id === id ? { ...r, toIdx: cycle(r.toIdx) } : r)));
  }

  // Resolve each rule's palette slots to actual colors, then filter to the
  // ones that are actually meaningful (both colors present, and different
  // from each other). If two valid rules share the same "from" color,
  // that's ambiguous - which target should that color end up as? - so
  // Apply All stays disabled until it's fixed rather than silently picking
  // one.
  const resolvedRules = rules.map(r => ({
    id:   r.id,
    from: r.fromIdx != null ? (palette[r.fromIdx] ?? null) : null,
    to:   r.toIdx != null ? (palette[r.toIdx] ?? null) : null,
  }));
  const validRules = resolvedRules.filter(r => r.from && r.to && r.from !== r.to);
  const fromCounts = new Map<string, number>();
  validRules.forEach(r => fromCounts.set(r.from!, (fromCounts.get(r.from!) ?? 0) + 1));
  const hasDuplicateFrom = [...fromCounts.values()].some(count => count > 1);
  const canApply = validRules.length > 0 && !hasDuplicateFrom;

  function handleApplyAll() {
    onColorTool();
    if (!canApply) return;
    onReplaceColors(validRules.map(r => ({ from: r.from!, to: r.to! })));
  }

  return (
    <View
      style={[s.card, (toolMode === 'paint' || toolMode === 'erase') && s.cardActive]}
      {...({ onClick: onColorTool } as any)}
    >
      <View style={s.cardHeaderRow}>
        <Text style={s.cardLabel}>COLORS</Text>
        <View style={s.toolBtnGroup}>
          <TouchableOpacity
            style={[s.toolbarBtn, toolMode === 'paint' && s.toolbarBtnActive]}
            onPress={onColorTool}
          >
            <Text style={[s.toolbarBtnTxt, toolMode === 'paint' && s.toolbarBtnActiveTxt]}>Color Tool</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.toolbarBtn, toolMode === 'erase' && s.toolbarBtnActive]}
            onPress={onEraseTool}
            {...({
              title: 'Click or drag diamonds to clear their color.',
              onClick: (e: any) => { if (e && e.stopPropagation) e.stopPropagation(); },
            } as any)}
          >
            <Text style={[s.toolbarBtnTxt, toolMode === 'erase' && s.toolbarBtnActiveTxt]}>Eraser</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.separator} />

      <View style={s.colorsRow}>
        {palette.slice(0, colorCount).map((c, i) => (
          <TouchableOpacity
            key={i}
            style={[
              s.circleBtn,
              {
                backgroundColor: c ?? theme.border,
                borderWidth:     selectedColorIdx === i ? 3 : 1.5,
                borderColor:     selectedColorIdx === i ? theme.purple : (c ?? theme.swatchBorder),
              },
            ]}
            onPress={() => { onColorTool(); if (c) setSelectedColorIdx(i); }}
          />
        ))}
        <TouchableOpacity style={s.toolbarBtn} onPress={() => { onColorTool(); onOpenColorPicker(); }}>
          <Text style={s.toolbarBtnTxt}>Change Colors</Text>
        </TouchableOpacity>
      </View>

      <View style={s.separator} />

      <View style={s.replaceSection}>
        {/* "Replace Colors" (find/replace across the whole pattern) vs the
            "Change Colors" button above (edits the palette itself) - kept
            visually apart with the separator too, since they're easy to
            conflate otherwise. */}
        <Text style={s.replaceSectionLabel}>Replace Colors on Pattern Grid</Text>

        {rules.map(rule => {
          const from = rule.fromIdx != null ? palette[rule.fromIdx] : null;
          const to   = rule.toIdx != null ? palette[rule.toIdx] : null;
          return (
            <View key={rule.id} style={s.replaceRow}>
              <TouchableOpacity
                style={[s.replaceSwatch, { backgroundColor: from ?? theme.border }]}
                onPress={() => cycleRuleFrom(rule.id)}
                {...({ title: 'Click to cycle through your palette colors.' } as any)}
              />
              <Text style={s.replaceLabel}>to</Text>
              <TouchableOpacity
                style={[s.replaceSwatch, { backgroundColor: to ?? theme.border }]}
                onPress={() => cycleRuleTo(rule.id)}
                {...({ title: 'Click to cycle through your palette colors.' } as any)}
              />
              <TouchableOpacity
                style={s.removeRuleBtn}
                onPress={() => removeRule(rule.id)}
                {...({ title: 'Remove this rule.' } as any)}
              >
                <Text style={s.removeRuleBtnTxt}>×</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {hasDuplicateFrom && (
          <Text style={s.warningTxt}>Two rules can't start from the same color - fix that before applying.</Text>
        )}

        <View style={s.replaceActionsRow}>
          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={addRule}
            {...({ title: 'Add another color-change rule.' } as any)}
          >
            <Text style={s.toolbarBtnTxt}>+ Add Rule</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.toolbarBtn, !canApply && s.toolbarBtnDisabled]}
            onPress={handleApplyAll}
            disabled={!canApply}
            {...({ title: 'Applies every rule above at once, across the whole pattern.' } as any)}
          >
            <Text style={[s.toolbarBtnTxt, !canApply && s.toolbarBtnDisabledTxt]}>Apply All</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card:            { flex: 1, minWidth: 200, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 14, gap: 8 },
    cardActive:      { borderColor: theme.purple, borderWidth: 2 },
    cardHeaderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: theme.textFaint },
    toolBtnGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    separator: { height: 1, backgroundColor: theme.border, marginHorizontal: 4 },
    colorsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    circleBtn: { width: 28, height: 28, borderRadius: 14 },
    replaceSection: { gap: 6 },
    replaceSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: theme.textFaint },
    replaceRow:     { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    replaceLabel:   { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    replaceSwatch:  { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: theme.swatchBorder },
    removeRuleBtn:      { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceMutedAlt, borderWidth: 1, borderColor: theme.border },
    removeRuleBtnTxt:   { fontSize: 13, fontWeight: '700', color: theme.textMuted, lineHeight: 14 },
    replaceActionsRow:  { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    warningTxt:         { fontSize: 11, fontWeight: '600', color: theme.danger },
    toolbarBtn:         { borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surfaceMuted },
    toolbarBtnActive:   { backgroundColor: theme.purpleTint, borderColor: theme.purple },
    toolbarBtnActiveTxt:{ color: theme.purple },
    toolbarBtnDisabled: { opacity: 0.4 },
    toolbarBtnDisabledTxt: { color: theme.textFaint },
    toolbarBtnTxt:      { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  });
}
