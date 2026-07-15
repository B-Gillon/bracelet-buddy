import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useBuildEditor } from '../../context/BuildEditorContext';

// New: a small always-visible badge answering "what am I doing right now" -
// Painting (default), Selecting (Select tool is on), Erasing (Eraser tool
// is on), or Duplicating/Moving (a Duplicate/Move copy is floating,
// awaiting drop or Cancel). A floating copy takes priority over
// Selecting/Erasing, since handleCellPress in BuildScreen checks floatingOp
// before toolMode too.
export default function ModeIndicator() {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { toolMode, floatingKind } = useBuildEditor();

  const label =
    floatingKind === 'duplicate' ? 'Duplicating' :
    floatingKind === 'move'      ? 'Moving' :
    toolMode === 'select'        ? 'Selecting' :
    toolMode === 'erase'         ? 'Erasing' : 'Painting';
  const active = floatingKind != null || toolMode === 'select' || toolMode === 'erase';

  return (
    <View style={[s.badge, active && s.badgeActive]}>
      <View style={[s.dot, active && s.dotActive]} />
      <Text style={[s.label, active && s.labelActive]}>{label}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    badge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceMuted,
      borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
    },
    badgeActive: { backgroundColor: theme.purpleTint, borderColor: theme.purple },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.textFaint },
    dotActive: { backgroundColor: theme.purple },
    label: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    labelActive: { color: theme.purple },
  });
}
