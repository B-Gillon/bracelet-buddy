import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PRESET_PALETTES } from '../constants/palettes';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Theme } from '../constants/theme';
import { listFavoriteColors, addFavoriteColor, removeFavoriteColor } from '../utils/favorites';

// "Choose Your Colors" - fills in localPalette/localColorCount before
// handing off to onStart.
//
// There is deliberately no "selected slot" concept here - an earlier
// version let you tap a "Your Colors" circle to mark it as the target for
// the next color you picked, but that made it too easy to unintentionally
// overwrite a color you'd already placed (tap the wrong circle, then tap a
// favorite - oops). Instead, adding a color from anywhere (Favorites, an
// individual Preset color, or Custom Color) always fills the first empty
// slot, same spirit as "+ Add Color" already had. To change a color you've
// already placed, you explicitly clear it first via the hover popup below.
//
// Hover popups (web/mouse only - there's no hover concept on native/touch,
// a known gap for now) replace the old per-swatch favorite star: hovering
// a filled "Your Colors" circle shows Remove (clears that slot back to
// empty) and Add as Favorite / Remove from Favorites (toggles). Hovering a
// swatch in the FAVORITES row shows Remove from Favorites - this is the
// only way to un-favorite a color that isn't currently placed in Your
// Colors at all.
export default function ColorPickerScreen({
  palette,
  colorCount,
  onStart,
  onBack,
}: {
  palette: (string | null)[];
  colorCount: number;
  onStart: (palette: (string | null)[], colorCount: number) => void;
  onBack: () => void;
}) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const [localPalette, setLocalPalette] = useState<(string | null)[]>([...palette]);
  const [localColorCount, setLocalColorCount] = useState(colorCount);
  const [favorites, setFavorites] = useState<string[]>([]);
  // Which swatch the mouse is currently over, per section - drives which
  // hover popup (if any) is rendered. Two separate pieces of state since a
  // "Your Colors" index and a favorite color aren't the same kind of key.
  const [hoveredSlotIdx, setHoveredSlotIdx] = useState<number | null>(null);
  const [hoveredFavorite, setHoveredFavorite] = useState<string | null>(null);
  // The popup is a separate absolutely-positioned element below the
  // swatch, not touching it pixel-for-pixel - moving the real mouse from
  // the swatch down into the popup briefly crosses a gap that belongs to
  // neither element, which fires a genuine mouseLeave on the wrapper and
  // would otherwise unmount the popup before the cursor ever reaches it.
  // Standard fix (same as any hover-dropdown menu): don't hide immediately
  // on mouseLeave - wait a beat, and cancel the pending hide if the mouse
  // re-enters (either back on the swatch or landing on the popup itself)
  // within that window.
  const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function armHover<T>(setter: (v: T) => void, value: T) {
    if (hoverHideTimer.current) { clearTimeout(hoverHideTimer.current); hoverHideTimer.current = null; }
    setter(value);
  }

  function disarmHover<T>(setter: (updater: (prev: T | null) => T | null) => void, value: T) {
    if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
    hoverHideTimer.current = setTimeout(() => {
      setter(prev => (prev === value ? null : prev));
      hoverHideTimer.current = null;
    }, 250);
  }
  // Always targets the first empty slot, opened via the Custom Color
  // button - there's no per-swatch picker anymore now that swatches don't
  // carry an individual "active" state.
  const colorInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) { setFavorites([]); return; }
    let cancelled = false;
    (async () => {
      const { colors } = await listFavoriteColors(user.id);
      if (!cancelled && colors) setFavorites(colors);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const hasEmptySlot = localPalette.slice(0, localColorCount).some(c => !c);

  // Fills the first empty slot with the given color - the only way any
  // color ever gets placed here now, whether it came from a favorite, a
  // single preset color, or the native Custom Color picker. A no-op if
  // every slot is already filled (use + Add Color first).
  function assignToFirstEmptySlot(color: string) {
    setLocalPalette(prev => {
      const idx = prev.findIndex((c, i) => i < localColorCount && !c);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = color;
      return updated;
    });
  }

  function removeColorFromSlot(i: number) {
    setLocalPalette(prev => {
      const updated = [...prev];
      updated[i] = null;
      return updated;
    });
    if (hoverHideTimer.current) { clearTimeout(hoverHideTimer.current); hoverHideTimer.current = null; }
    setHoveredSlotIdx(null);
  }

  function handleOpenCustomPicker() {
    if (!hasEmptySlot) return;
    colorInputRef.current?.click();
  }

  // Optimistic - toggles locally right away and only reverts if the
  // request actually fails, so favoriting/unfavoriting feels instant.
  async function toggleFavorite(color: string) {
    if (!user) return;
    const alreadyFavorited = favorites.includes(color);
    setFavorites(prev => (alreadyFavorited ? prev.filter(f => f !== color) : [color, ...prev]));
    const { error } = alreadyFavorited
      ? await removeFavoriteColor(user.id, color)
      : await addFavoriteColor(user.id, color);
    if (error) {
      console.warn('[favorite color] failed:', error);
      setFavorites(prev => (alreadyFavorited ? [color, ...prev] : prev.filter(f => f !== color)));
    }
  }

  // Always available on this screen, independent of presets - lets you grow
  // past whatever colorCount you started with (e.g. picked 6 on the New
  // Bracelet form, decide you actually want 7). Appends one empty slot and
  // grows localColorCount to match, same shape as what applyPreset already
  // does when a preset needs more room than you currently have.
  function handleAddColor() {
    setLocalColorCount(prev => prev + 1);
    setLocalPalette(prev => [...prev, null]);
  }

  // A preset only ever GROWS colorCount (to fit all of its own colors) -
  // it never shrinks it. Picking a 5-color preset while set to 6 colors
  // used to overwrite colorCount down to 5, silently discarding the 6th
  // slot instead of leaving it for the user to fill in themselves.
  function applyPreset(colors: string[]) {
    const newCount = Math.max(localColorCount, colors.length);
    setLocalColorCount(newCount);
    setLocalPalette(prev => {
      const updated = [...prev];
      while (updated.length < newCount) updated.push(null);
      colors.forEach((c, i) => { updated[i] = c; });
      return updated;
    });
  }

  return (
    <ScrollView contentContainerStyle={s.container}>

      <View style={s.headerRow}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>Choose Your Colors</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={s.label}>YOUR COLORS</Text>
      <Text style={s.hint}>Hover a color to remove it or save it as a favorite. New colors always fill the next empty spot.</Text>
      <View style={s.swatchRow}>
        {localPalette.slice(0, localColorCount).map((c, i) => {
          const isFavorited = !!c && favorites.includes(c);
          const isHovered = hoveredSlotIdx === i;
          return (
            <View
              key={i}
              style={[s.swatchWrapper, isHovered && s.swatchWrapperRaised]}
              {...({
                onMouseEnter: () => armHover(setHoveredSlotIdx, i),
                onMouseLeave: () => disarmHover(setHoveredSlotIdx, i),
              } as any)}
            >
              <View
                style={[
                  s.swatch,
                  {
                    backgroundColor: c ?? 'transparent',
                    // Always a neutral, fixed-contrast border regardless of
                    // the swatch's own fill - it used to match the swatch's
                    // own color, so a color close to the page background
                    // (near-black on dark theme, near-white on light theme)
                    // made the whole circle nearly disappear.
                    borderColor: theme.swatchBorder,
                    borderWidth: 2,
                  },
                ]}
              />
              {!!c && isHovered && (
                <View
                  style={s.hoverPopup}
                  {...({
                    onMouseEnter: () => armHover(setHoveredSlotIdx, i),
                    onMouseLeave: () => disarmHover(setHoveredSlotIdx, i),
                  } as any)}
                >
                  <TouchableOpacity style={s.hoverPopupBtn} onPress={() => removeColorFromSlot(i)}>
                    <Text style={s.hoverPopupBtnTxt}>Remove</Text>
                  </TouchableOpacity>
                  {user && (
                    <>
                      <View style={s.hoverPopupDivider} />
                      <TouchableOpacity style={s.hoverPopupBtn} onPress={() => toggleFavorite(c)}>
                        <Text style={s.hoverPopupBtnTxt}>{isFavorited ? 'Remove from Favorites' : 'Add as Favorite'}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}
        <TouchableOpacity
          style={[s.customColorBtn, !hasEmptySlot && s.customColorBtnDisabled]}
          onPress={handleOpenCustomPicker}
          disabled={!hasEmptySlot}
        >
          <Text style={s.customColorBtnTxt}>Custom Color...</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.addColorBtn} onPress={handleAddColor}>
          <Text style={s.addColorBtnTxt}>+ Add Color</Text>
        </TouchableOpacity>
        {/* Web-only, invisible - always fills the first empty slot, opened
            only via the Custom Color button above. */}
        <input
          type="color"
          ref={colorInputRef}
          value="#ffffff"
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          onChange={e => assignToFirstEmptySlot(e.target.value)}
        />
      </View>

      <View style={s.sectionDivider} />

      <Text style={s.label}>FAVORITES</Text>
      {!user ? (
        <View style={s.favoritesBox}>
          <Text style={s.emptyTxt}>Sign in to save and reuse favorite colors.</Text>
        </View>
      ) : favorites.length === 0 ? (
        <View style={s.favoritesBox}>
          <Text style={s.emptyTxt}>No favorites saved yet - hover a color above and choose Add as Favorite.</Text>
        </View>
      ) : (
        <View style={s.favoritesRow}>
          {favorites.map(color => {
            const isHovered = hoveredFavorite === color;
            return (
              <View
                key={color}
                style={[s.swatchWrapper, isHovered && s.swatchWrapperRaised]}
                {...({
                  onMouseEnter: () => armHover(setHoveredFavorite, color),
                  onMouseLeave: () => disarmHover(setHoveredFavorite, color),
                } as any)}
              >
                <TouchableOpacity
                  style={[s.favoriteSwatch, { backgroundColor: color, borderColor: theme.swatchBorder }]}
                  onPress={() => assignToFirstEmptySlot(color)}
                  {...({ title: 'Tap to use this color for the next empty slot.' } as any)}
                />
                {isHovered && (
                  <View
                    style={s.hoverPopup}
                    {...({
                      onMouseEnter: () => armHover(setHoveredFavorite, color),
                      onMouseLeave: () => disarmHover(setHoveredFavorite, color),
                    } as any)}
                  >
                    <TouchableOpacity style={s.hoverPopupBtn} onPress={() => toggleFavorite(color)}>
                      <Text style={s.hoverPopupBtnTxt}>Remove from Favorites</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={s.sectionDivider} />

      <Text style={s.label}>PRESETS</Text>
      <View style={s.presetGrid}>
        {PRESET_PALETTES.map(preset => (
          <TouchableOpacity
            key={preset.id}
            style={s.presetCard}
            onPress={() => applyPreset(preset.colors)}
          >
            <Text style={s.presetName}>{preset.name}</Text>
            <View style={s.presetSwatches}>
              {preset.colors.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.presetSwatch, { backgroundColor: c, borderColor: theme.swatchBorder }]}
                  onPress={() => assignToFirstEmptySlot(c)}
                  {...({
                    title: 'Tap to add just this color to the next empty spot.',
                    onClick: (e: any) => { if (e && e.stopPropagation) e.stopPropagation(); },
                  } as any)}
                />
              ))}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.startBtn} onPress={() => onStart(localPalette, localColorCount)}>
        <Text style={s.startBtnTxt}>Start</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container:      { padding: 16, maxWidth: 600, width: '100%', alignSelf: 'center' },
    headerRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    title:          { fontSize: 20, fontWeight: '700', color: theme.text },
    backTxt:        { fontSize: 13, color: theme.purple, fontWeight: '600', width: 60 },
    label:          { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: theme.purple, marginBottom: 8 },
    hint:           { fontSize: 12, color: theme.textFaint, marginBottom: 12 },
    // position/zIndex here (not just on the individual swatch/popup) is
    // required, not optional - react-native-web gives every unstyled View
    // an implicit zIndex:0 stacking context, and ties break by DOM order
    // with the LATER sibling winning. The FAVORITES section below this row
    // is a later sibling in the same ScrollView, so without this, its own
    // (also implicit zIndex:0) stacking context painted entirely on top of
    // this row's - including the popup inside it, no matter how high the
    // popup's own zIndex was set. Same root cause as the GlobalHeader
    // avatar-dropdown bug fixed earlier.
    swatchRow:      { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 8, position: 'relative', zIndex: 10 },
    // Relative so the hover popup (absolute) can hang below the swatch
    // without affecting layout of its neighbors. Raised zIndex only while
    // hovered, so its popup reliably paints above later siblings in the
    // row - react-native-web gives every View an implicit zIndex:0 /
    // position-based stacking context, and ties are broken by DOM order
    // (later wins), which would otherwise let a swatch to the right paint
    // over this one's popup.
    swatchWrapper:        { position: 'relative' },
    swatchWrapperRaised:  { zIndex: 20 },
    swatch:         { width: 52, height: 52, borderRadius: 26 },
    // Small floating menu, anchored below the swatch it belongs to.
    // Web/mouse-hover only for now (see file header comment) - deliberately
    // NOT a React Native <Modal>, both to avoid that component's known
    // stacking issues with multiple simultaneous instances, and because a
    // plain absolutely-positioned View is simpler for something this small
    // that only ever shows one at a time.
    hoverPopup: {
      position: 'absolute',
      // Deliberately tight against the swatch (52px tall, this starts at
      // 50) rather than leaving a visible gap - even with the hover-delay
      // above, less dead space between the two means less chance of a real
      // mouse crossing it slowly enough to matter.
      top: 50,
      left: -44,
      minWidth: 150,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 4,
      zIndex: 30,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 6,
    },
    hoverPopupBtn:    { paddingVertical: 8, paddingHorizontal: 12 },
    hoverPopupBtnTxt: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    hoverPopupDivider: { height: 1, backgroundColor: theme.border, marginHorizontal: 4 },
    // Same outlined-purple secondary style as My Designs' "Build It Now" -
    // always available on this screen regardless of colorCount or whatever
    // preset was last applied.
    addColorBtn:    { borderWidth: 1.5, borderColor: theme.purple, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.purpleTint, justifyContent: 'center' },
    addColorBtnTxt: { fontSize: 13, fontWeight: '700', color: theme.purple },
    // Neutral (not purple) - the fallback path for anything not already
    // available as a favorite or preset color.
    customColorBtn:         { borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.surfaceMuted, justifyContent: 'center' },
    customColorBtnDisabled: { opacity: 0.4 },
    customColorBtnTxt:      { fontSize: 13, fontWeight: '600', color: theme.textMuted },
    sectionDivider: { height: 1, backgroundColor: theme.border, marginVertical: 20 },
    favoritesBox:   { borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', borderRadius: 10, padding: 20, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center', minHeight: 80 },
    // Same stacking fix as swatchRow above, same reason - PRESETS is a
    // later sibling that would otherwise paint over this row's hover popup.
    favoritesRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, position: 'relative', zIndex: 10 },
    favoriteSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
    emptyTxt:       { fontSize: 12, color: theme.swatchBorder },
    presetGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
    presetCard:     { width: '31%', paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.panelBackground, borderRadius: 8, gap: 8 },
    presetName:     { fontSize: 12, color: theme.textMuted, fontWeight: '600' },
    presetSwatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    presetSwatch:   { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
    startBtn:       { backgroundColor: theme.purple, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    startBtnTxt:    { color: theme.textOnPurple, fontSize: 15, fontWeight: '700' },
  });
}
