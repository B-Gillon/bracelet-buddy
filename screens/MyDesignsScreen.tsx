import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';
import { listPatterns, deletePattern, SavedPatternSummary, formatPatternNumber } from '../utils/patterns';
import { storageRemove, STORAGE_KEYS } from '../utils/storage';
import PatternThumbnail from '../components/PatternThumbnail';

const CARD_GAP = 16;
const COLUMNS = 3;
const CARD_PADDING = 16;
const PAGE_PADDING = 40; // matches container style's own padding, must be added on top

const CARD_DIAMOND_SIZE = 12;
const CARD_MAX_COLS = 30;

// Card size is derived FROM the diamond math (rather than picked
// arbitrarily and hoping the crop limit happens to fit) - this is what
// guarantees CARD_MAX_COLS worth of diamonds actually fits the thumbnail
// area, instead of silently clipping.
const THUMBNAIL_WIDTH = CARD_MAX_COLS * CARD_DIAMOND_SIZE;
const CARD_WIDTH = THUMBNAIL_WIDTH + CARD_PADDING * 2;
// The container's own padding (applied inside its maxWidth) would
// otherwise eat into the space the cards need, silently wrapping to fewer
// columns than intended - it has to be added on top here, not just to the
// space the cards themselves take up.
const CONTAINER_WIDTH = CARD_WIDTH * COLUMNS + CARD_GAP * (COLUMNS - 1) + PAGE_PADDING * 2;

const MODAL_CONTENT_WIDTH = 560 - 24 * 2; // modalCard's maxWidth minus its own padding

export default function MyDesignsScreen({
  onOpenPattern,
  onBuildPattern,
}: {
  onOpenPattern: (clientId: string) => void;
  onBuildPattern: (clientId: string) => void;
}) {
  const { user, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const [patterns, setPatterns] = useState<SavedPatternSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewPattern, setPreviewPattern] = useState<SavedPatternSummary | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { patterns: fetched, error: fetchError } = await listPatterns(user.id);
      if (cancelled) return;
      if (fetchError) setError(fetchError);
      setPatterns(fetched);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user]);

  // Same soft-delete as the Build screen's Delete button - the row stays in
  // the database with deleted_at set, it just drops out of this list.
  async function handleConfirmDelete() {
    if (!user || !previewPattern) return;
    setIsDeleting(true);
    setDeleteError(null);
    const { error } = await deletePattern(user.id, previewPattern.clientId);
    setIsDeleting(false);

    if (error) {
      setDeleteError(error);
      return; // stay on the confirm modal if the delete itself failed
    }

    storageRemove(STORAGE_KEYS.patternState(previewPattern.clientId));
    setPatterns(prev => (prev ?? []).filter(p => p.clientId !== previewPattern.clientId));
    setShowDeleteConfirm(false);
    setPreviewPattern(null);
  }

  if (authLoading) {
    return (
      <View style={s.container}>
        <Text style={s.subtitle}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={s.container}>
        <Text style={s.title}>My Designs</Text>
        <Text style={s.subtitle}>Sign in from the Home page to see your saved patterns.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.title}>My Designs</Text>

      {loading && <Text style={s.subtitle}>Loading your patterns...</Text>}
      {error && <Text style={s.errorTxt}>{error}</Text>}
      {!loading && patterns && patterns.length === 0 && (
        <Text style={s.subtitle}>You haven't saved any patterns yet.</Text>
      )}

      <View style={[s.grid, (patterns?.length ?? 0) < 3 && s.gridCentered]}>
        {(patterns ?? []).map(p => (
          <TouchableOpacity
            key={p.clientId}
            style={s.card}
            onPress={() => setPreviewPattern(p)}
          >
            <View style={s.thumbnailWrapper}>
              <PatternThumbnail
                dualGrid={{ main: p.gridMain, gap: p.gridGap }}
                diamondSize={CARD_DIAMOND_SIZE}
                maxCols={CARD_MAX_COLS}
              />
            </View>
            <View style={s.cardTopRow}>
              <Text style={s.cardName} numberOfLines={1}>{p.name}</Text>
              <Text style={s.cardNumber}>#{formatPatternNumber(p.displayNumber)}</Text>
            </View>
            <View style={s.cardMidRow}>
              <Text style={s.cardMetaTxt}>{p.cols} x {p.rows}</Text>
              <Text style={s.cardMetaTxt}>{p.colorCount} colors</Text>
            </View>
            <Text style={s.cardUpdated}>Updated {new Date(p.updatedAt).toLocaleDateString()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* visible is gated on !showDeleteConfirm too - react-native-web's
          Modal hardcodes its own internal wrapper to a fixed zIndex, and
          doesn't reliably composite a SECOND simultaneously-visible Modal
          above a first one (confirmed live: the delete-confirm modal was
          mounting correctly but rendering underneath this one, making its
          buttons unclickable). Swapping this one out while the confirm
          modal is up - rather than trying to out-z-index a library
          internal - sidesteps that entirely. previewPattern itself stays
          set the whole time, so this modal's content (and the confirm
          modal, which reads previewPattern too) doesn't lose any data. */}
      <Modal
        visible={!!previewPattern && !showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPattern(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {previewPattern && (
              <>
                <TouchableOpacity
                  style={s.modalDeleteCornerBtn}
                  onPress={() => { setDeleteError(null); setShowDeleteConfirm(true); }}
                >
                  <Text style={s.modalDeleteCornerBtnTxt}>Delete</Text>
                </TouchableOpacity>

                <Text style={[s.modalTitle, s.modalTitleWithCornerBtn]} numberOfLines={1}>
                  {previewPattern.name}
                </Text>
                <Text style={s.modalMeta}>
                  {previewPattern.cols} x {previewPattern.rows} - Updated{' '}
                  {new Date(previewPattern.updatedAt).toLocaleDateString()}
                </Text>

                <View style={s.modalPreviewWrapper}>
                  <PatternThumbnail
                    dualGrid={{ main: previewPattern.gridMain, gap: previewPattern.gridGap }}
                    fitWidth={MODAL_CONTENT_WIDTH}
                  />
                </View>

                <View style={s.modalButtonsRow}>
                  <TouchableOpacity
                    style={s.modalCancelBtn}
                    onPress={() => setPreviewPattern(null)}
                  >
                    <Text style={s.modalCancelTxt}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.modalBuildBtn}
                    onPress={() => {
                      const clientId = previewPattern.clientId;
                      setPreviewPattern(null);
                      onBuildPattern(clientId);
                    }}
                  >
                    <Text style={s.modalBuildBtnTxt}>Build It Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.modalConfirmBtn}
                    onPress={() => {
                      const clientId = previewPattern.clientId;
                      setPreviewPattern(null);
                      onOpenPattern(clientId);
                    }}
                  >
                    <Text style={s.modalConfirmTxt}>Open in Design Center</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.confirmModalCard}>
            <Text style={s.modalTitle}>Delete This Bracelet?</Text>
            <Text style={s.modalConfirmText}>
              Are you sure you want to permanently delete this pattern?
            </Text>
            {deleteError && <Text style={s.errorTxt}>{deleteError}</Text>}
            <View style={s.modalButtonsRow}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                <Text style={s.modalCancelTxt}>No, Do Not Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmBtn, isDeleting && s.modalBtnDisabled]}
                onPress={handleConfirmDelete}
                disabled={isDeleting}
              >
                <Text style={s.modalConfirmTxt}>{isDeleting ? 'Deleting...' : 'Yes, Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: PAGE_PADDING, maxWidth: CONTAINER_WIDTH, width: '100%', alignSelf: 'center' },
    title:     { fontSize: 26, fontWeight: '700', color: theme.text, marginBottom: 20, textAlign: 'center' },
    subtitle:  { fontSize: 13, color: theme.textFaint, textAlign: 'center', marginBottom: 12 },
    errorTxt:  { fontSize: 12, color: theme.danger, textAlign: 'center', marginBottom: 12 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
    gridCentered: { justifyContent: 'center' },
    card: {
      width: CARD_WIDTH,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: CARD_PADDING,
      backgroundColor: theme.surfaceMuted,
      gap: 8,
    },
    thumbnailWrapper: {
      height: 120,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardName:   { fontSize: 15, fontWeight: '700', color: theme.text, flexShrink: 1 },
    cardNumber: { fontSize: 12, fontWeight: '600', color: theme.textFaint },
    cardMidRow: { flexDirection: 'row', justifyContent: 'space-between' },
    cardMetaTxt: { fontSize: 12, color: theme.textSubtle },
    cardUpdated: { fontSize: 11, color: theme.textFaint },

    // React Native's <Modal> portals its content into a plain, unpositioned
    // div appended to <body> - it doesn't establish its own stacking
    // context, so it doesn't contain/trap ITS children's z-index either.
    // That means any zIndex:0 element anywhere else on the page (which is
    // effectively every View, via react-native-web's default base style)
    // escapes upward and competes directly against this overlay at the
    // <body> level - and normally wins, since DOM order ties go to
    // whichever renders later, which is the page content, not the modal.
    // This explicit position+zIndex is what actually lets the modal
    // reliably paint (and hit-test) above the page - confirmed live via
    // Chrome DevTools that My Designs' card grid was showing through and
    // intercepting clicks meant for this modal before this was added. Same
    // root cause as the GlobalHeader dropdown fix.
    modalOverlay: { flex: 1, backgroundColor: theme.overlay, alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', zIndex: 1000 },
    modalCard:    { backgroundColor: theme.surface, borderRadius: 14, padding: 24, maxWidth: 560, width: '100%', gap: 4 },
    modalTitle:   { fontSize: 18, fontWeight: '700', color: theme.text },
    modalMeta:    { fontSize: 12, color: theme.textFaint, marginBottom: 12 },
    modalPreviewWrapper: { alignItems: 'center', marginBottom: 16 },
    modalButtonsRow:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    modalCancelBtn:     { borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.surfaceMuted },
    modalCancelTxt:     { fontSize: 13, fontWeight: '600', color: theme.textMuted },
    modalConfirmBtn:    { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.purple },
    modalConfirmTxt:    { fontSize: 13, fontWeight: '700', color: theme.textOnPurple },
    // Secondary to "Open in Design Center" (outlined rather than solid
    // purple) - editing the pattern is still the more common action from
    // here, Build It Now is the newer, less-worn path.
    modalBuildBtn:      { borderWidth: 1.5, borderColor: theme.purple, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.purpleTint },
    modalBuildBtnTxt:   { fontSize: 13, fontWeight: '700', color: theme.purple },
    modalBtnDisabled:   { opacity: 0.5 },

    // Same visual weight as the other toolbar-style buttons (matches Clear on
    // the Build screen) rather than a red danger color - top-right corner of
    // the preview modal, per request.
    //
    // position:'absolute' alone isn't enough to guarantee this paints above
    // its siblings - an absolutely-positioned element with no explicit
    // zIndex is still just a z-index:0-level box, ordered by DOM position
    // among its equally-leveled siblings. Since modalTitle renders right
    // after this in the JSX, it was winning that tie and covering the
    // button entirely (confirmed live via elementFromPoint - clicks meant
    // for Delete were landing on the title text instead). The explicit
    // zIndex is what actually lifts this above its later siblings.
    modalDeleteCornerBtn: {
      position: 'absolute',
      top: 16,
      right: 16,
      zIndex: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: theme.surfaceMuted,
    },
    modalDeleteCornerBtnTxt: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    modalTitleWithCornerBtn: { paddingRight: 90 },

    confirmModalCard: { backgroundColor: theme.surface, borderRadius: 14, padding: 24, maxWidth: 360, width: '100%', gap: 10 },
    modalConfirmText: { fontSize: 13, color: theme.textSubtle, lineHeight: 19, marginBottom: 8 },
  });
}
