import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';
import { PatternConfig, DualGrid } from '../types/pattern';
import {
  listStartedPatterns,
  loadPattern,
  markBuildStarted,
  StartedPatternSummary,
  formatPatternNumber,
} from '../utils/patterns';
import { useBuildProgress } from '../hooks/useBuildProgress';
import PatternThumbnail from '../components/PatternThumbnail';
import BuildInstructionView from '../components/BuildInstructionView';
import { computePatternValidity } from '../utils/patternValidity';

// Picker-mode card grid uses the same diamond-math-derived sizing as My
// Designs, so cards in both places stay visually consistent.
const CARD_GAP = 16;
const CARD_PADDING = 16;
const CARD_DIAMOND_SIZE = 12;
const CARD_MAX_COLS = 30;
const THUMBNAIL_WIDTH = CARD_MAX_COLS * CARD_DIAMOND_SIZE;
const CARD_WIDTH = THUMBNAIL_WIDTH + CARD_PADDING * 2;

const DETAIL_PREVIEW_WIDTH = 480;

// What "Yes, Build It!" (which already has the just-saved config/grid in
// memory) and a picker selection (which only has a clientId, and needs a
// fetch) both resolve to.
export type BuildTarget = {
  clientId: string;
  config?: PatternConfig;
  dualGrid?: DualGrid;
};

export default function BuildCenterScreen({
  target,
  onSelectPattern,
  onChoosePattern,
  onOpenInDesignCenter,
}: {
  target: BuildTarget | null;
  onSelectPattern: (clientId: string) => void;
  onChoosePattern: () => void;
  // Open-gate (see PATTERN-VALIDITY-PLAN.md section 4): a pattern with a
  // genuine knotting contradiction can't be opened here at all - instead of
  // showing broken/ambiguous instructions, we hard-block and send the user
  // back to Design Center (via the same loader App.tsx already uses for "open
  // from My Designs") to fix it first.
  onOpenInDesignCenter: (clientId: string) => void;
}) {
  const { user, loading: authLoading } = useAuth();
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  // Picker-mode list state - only patterns that have actually been opened
  // in Build Center before (see markBuildStarted below), not every saved
  // pattern. This is a "continue building" list, not a catalog to pick a
  // fresh pattern from - that happens via "Yes, Build It!" on the Save
  // modal instead.
  const [patterns, setPatterns] = useState<StartedPatternSummary[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (target || !user) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      const { patterns: fetched, error } = await listStartedPatterns(user.id);
      if (cancelled) return;
      if (error) setListError(error);
      setPatterns(fetched);
      setListLoading(false);
    })();
    return () => { cancelled = true; };
  }, [target, user]);

  // Detail-mode pattern state. Skips the fetch entirely when the caller
  // ("Yes, Build It!") already handed over the just-saved config/grid -
  // that's not just an optimization, it also avoids a stale read in the
  // offline "saved on this device, will sync later" case, where the cloud
  // row may not reflect the save yet.
  const [detailConfig, setDetailConfig] = useState<PatternConfig | null>(target?.config ?? null);
  const [detailGrid, setDetailGrid] = useState<DualGrid | null>(target?.dualGrid ?? null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Row techniques + mark-done progress - loaded/saved independently of
  // config/dualGrid above (see hooks/useBuildProgress.ts), since it's a
  // separate, much smaller pair of columns that doesn't benefit from the
  // "already in memory from Yes, Build It!" optimization the grid data has.
  const { rowTechniques, buildProgress, markRowDone, undoRowDone, setRowTechnique, hasUnsavedChanges, saveNow } =
    useBuildProgress(user, target?.clientId ?? null);

  // Open-gate check - only runs once we actually have grid data (detail
  // mode). Same algorithm Design Center's Save uses (utils/patternValidity),
  // so "can't save without warning" and "can't open here" are always
  // perfectly consistent with each other.
  const validity = useMemo(() => (detailGrid ? computePatternValidity(detailGrid) : null), [detailGrid]);

  // Guards against losing progress on a real page close/refresh - only
  // fires while there's a genuine unsaved change sitting in the (brief)
  // debounce window or a failed save, not on every render.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Same guard for in-app navigation away from this page (the "Choose a
  // Different Pattern" link), since beforeunload only covers a real
  // browser close/refresh.
  const handleChoosePattern = useCallback(() => {
    if (hasUnsavedChanges && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const leave = window.confirm('You have unsaved build progress. Leave without saving?');
      if (!leave) return;
    }
    onChoosePattern();
  }, [hasUnsavedChanges, onChoosePattern]);

  useEffect(() => {
    if (!target) {
      setDetailConfig(null);
      setDetailGrid(null);
      setDetailError(null);
      return;
    }
    if (!user) return;

    // Landing on a specific pattern's Build Center page IS what "started"
    // means - mark it here rather than at each individual entry point
    // ("Yes, Build It!", a picker selection), so it's correct no matter how
    // this page was reached. Idempotent server-side (only the first call
    // actually writes anything), so no harm in calling it every time.
    markBuildStarted(user.id, target.clientId);

    if (target.config && target.dualGrid) {
      setDetailConfig(target.config);
      setDetailGrid(target.dualGrid);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    (async () => {
      const { config, dualGrid, error } = await loadPattern(user.id, target.clientId);
      if (cancelled) return;
      setDetailLoading(false);
      if (error || !config || !dualGrid) {
        setDetailError(error ?? 'Could not load this pattern.');
        return;
      }
      setDetailConfig(config);
      setDetailGrid(dualGrid);
    })();
    return () => { cancelled = true; };
  }, [target, user]);

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
        <Text style={s.title}>Build Center</Text>
        <Text style={s.subtitle}>Sign in from the Home page to build one of your saved patterns.</Text>
      </View>
    );
  }

  // Detail mode: a specific pattern was chosen (or just saved).
  if (target) {
    return (
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.topRow}>
          <TouchableOpacity onPress={handleChoosePattern}>
            <Text style={s.backLink}>← Choose a Different Pattern</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.saveBtn, !hasUnsavedChanges && s.saveBtnDisabled]}
            disabled={!hasUnsavedChanges}
            onPress={saveNow}
          >
            <Text style={[s.saveBtnTxt, !hasUnsavedChanges && s.saveBtnTxtDisabled]}>
              {hasUnsavedChanges ? 'Save Progress' : 'Saved'}
            </Text>
          </TouchableOpacity>
        </View>

        {detailLoading && <Text style={s.subtitle}>Loading your pattern...</Text>}
        {detailError && <Text style={s.errorTxt}>{detailError}</Text>}

        {detailConfig && detailGrid && (
          <>
            <Text style={s.title}>{detailConfig.name}</Text>
            <Text style={s.subtitle}>
              {detailConfig.cols} x {detailConfig.rows} - {detailConfig.colorCount} colors
            </Text>

            <View style={s.previewWrapper}>
              <PatternThumbnail
                dualGrid={detailGrid}
                fitWidth={DETAIL_PREVIEW_WIDTH}
                dimmedInstructionRows={new Set(buildProgress)}
              />
            </View>

            {validity && !validity.valid ? (
              <View style={s.blockedWrapper}>
                <Text style={s.blockedTitle}>This Pattern Can't Be Opened Yet</Text>
                <Text style={s.blockedText}>
                  This pattern can't be opened yet - it has a knotting conflict that needs to be
                  fixed in Design Center first.
                </Text>
                <TouchableOpacity
                  style={s.blockedBtn}
                  onPress={() => onOpenInDesignCenter(target.clientId)}
                >
                  <Text style={s.blockedBtnTxt}>Fix in Design Center</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <BuildInstructionView
                dualGrid={detailGrid}
                rowTechniques={rowTechniques}
                buildProgress={buildProgress}
                onMarkRowDone={markRowDone}
                onUndoRowDone={undoRowDone}
                onSetRowTechnique={setRowTechnique}
              />
            )}
          </>
        )}
      </ScrollView>
    );
  }

  // Picker mode: no pattern chosen yet.
  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.title}>Build Center</Text>
      <Text style={s.subtitle}>Pick up where you left off on a bracelet you've started building.</Text>

      {listLoading && <Text style={s.subtitle}>Loading your patterns...</Text>}
      {listError && <Text style={s.errorTxt}>{listError}</Text>}
      {!listLoading && patterns && patterns.length === 0 && (
        <Text style={s.subtitle}>
          You haven't started building any patterns yet. Save a pattern in the Design Center, then
          choose "Yes, Build It!" to start.
        </Text>
      )}

      <View style={[s.grid, (patterns?.length ?? 0) < 3 && s.gridCentered]}>
        {(patterns ?? []).map(p => (
          <TouchableOpacity
            key={p.clientId}
            style={s.card}
            onPress={() => onSelectPattern(p.clientId)}
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
            <Text style={s.cardMetaTxt}>{p.cols} x {p.rows}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: 40, maxWidth: 960, width: '100%', alignSelf: 'center', gap: 4 },
    title:     { fontSize: 26, fontWeight: '700', color: theme.text, marginBottom: 4, textAlign: 'center' },
    subtitle:  { fontSize: 13, color: theme.textFaint, textAlign: 'center', marginBottom: 12 },
    errorTxt:  { fontSize: 12, color: theme.danger, textAlign: 'center', marginBottom: 12 },
    backLink:  { fontSize: 13, color: theme.purple, fontWeight: '600' },

    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    saveBtn: {
      borderWidth: 1.5,
      borderColor: theme.purple,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
      backgroundColor: theme.purple,
    },
    saveBtnDisabled: { borderColor: theme.border, backgroundColor: theme.surfaceMuted },
    saveBtnTxt: { fontSize: 13, fontWeight: '700', color: theme.textOnPurple },
    saveBtnTxtDisabled: { color: theme.textFaint },

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
    cardTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardName:    { fontSize: 15, fontWeight: '700', color: theme.text, flexShrink: 1 },
    cardNumber:  { fontSize: 12, fontWeight: '600', color: theme.textFaint },
    cardMetaTxt: { fontSize: 12, color: theme.textSubtle },

    previewWrapper: { alignItems: 'center', marginVertical: 20 },

    blockedWrapper: {
      alignItems: 'center',
      gap: 10,
      maxWidth: 480,
      alignSelf: 'center',
      borderWidth: 1,
      borderColor: theme.danger,
      borderRadius: 12,
      padding: 20,
      backgroundColor: theme.surfaceMuted,
    },
    blockedTitle: { fontSize: 16, fontWeight: '700', color: theme.text, textAlign: 'center' },
    blockedText:  { fontSize: 13, color: theme.textSubtle, textAlign: 'center', lineHeight: 19 },
    blockedBtn:   { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: theme.purple },
    blockedBtnTxt:{ fontSize: 13, fontWeight: '700', color: theme.textOnPurple },
  });
}
