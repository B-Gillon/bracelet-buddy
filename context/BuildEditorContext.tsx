import { createContext, useContext } from 'react';

// Unlike AuthContext/ProfileContext, this context's state is NOT owned by
// its own Provider component - BuildScreen already owns all of this state
// (it needs it directly for grid press/drag handling, not just for the
// cards), so BuildScreen constructs the value object itself and renders
// <BuildEditorContext.Provider value={...}>. This file is just the
// plumbing (context + hook + type), so ColorsCard/SelectorCard/etc. can
// pull what they need instead of BuildScreen threading a dozen props down.

export interface BuildEditorContextValue {
  palette:          (string | null)[];
  colorCount:       number;
  selectedColorIdx: number;
  setSelectedColorIdx: (idx: number) => void;
  onOpenColorPicker: () => void;
  // Assigns a color directly to one palette slot (used for an empty/unset
  // swatch in the Colors card - clicking it opens a native color picker
  // rather than requiring the full "Change Colors" flow for a single
  // slot). Also makes that slot the active paint color, same as clicking
  // an already-filled swatch does.
  onSetPaletteColor: (idx: number, color: string) => void;

  // Exactly one of these three tools is active at all times - Select Tool
  // (click/drag individual diamonds into a selection, same gesture as
  // painting), Color Tool (paint diamonds with the selected color), or
  // Delete/Erase Tool (click/drag diamonds to clear their color back to
  // blank, regardless of whichever palette color is currently selected).
  // onSelectTool/onColorTool/onEraseTool always SET the mode (not toggle) -
  // there's no "neither" state.
  toolMode: 'paint' | 'select' | 'erase';
  onSelectTool: () => void;
  onColorTool: () => void;
  onEraseTool: () => void;

  // How many diamonds are currently selected (cards only need the count,
  // not the raw cell set - BuildScreen owns the actual Set for hit-testing).
  selectedCount: number;

  // Clears the current selection back to empty, without touching toolMode -
  // lets you go straight from one selection to picking a new one instead of
  // having to click every currently-selected diamond again to deselect it.
  onReset: () => void;

  // Both grow the current selection, seeded from every diamond already in
  // it (not just a single one) - each seed only ever matches/spreads within
  // its own pass (main beads stay separate from gap connectors).
  // onSelectConnected ("Magic Wand"): flood-fills same-color diamonds
  // reachable via up/down/left/right steps from each seed.
  // onSelectSameColor: selects every diamond anywhere in the same pass that
  // shares a seed's color, connected or not.
  onSelectConnected: () => void;
  onSelectSameColor: () => void;

  // Non-null while a Duplicate/Move copy is floating, awaiting either a
  // drop (releasing a drag on it commits it immediately - no separate Done
  // step) or Cancel - the tool is "locked" into positioning it during this
  // window (see BuildScreen's handleCellPress/handleCellDrag/handleCellRelease).
  floatingKind: 'duplicate' | 'move' | null;
  onDuplicate: () => void;
  onMove: () => void;
  // Still exposed for callers that want to commit programmatically, but
  // the normal path is handleCellRelease auto-committing on drop - no UI
  // button calls this directly anymore.
  onDoneFloating: () => void;
  onCancelFloating: () => void;

  // Recolors your selection to the given color - and, like Magic Wand,
  // expands each selected diamond out to its whole connected same-color
  // region first, so you don't have to Magic Wand then Recolor Selected as
  // two separate steps. The color comes from a dedicated swatch on the
  // Recolor Selected control itself, not the shared "active palette color"
  // used for painting - a no-op if nothing's selected or color is empty.
  onRecolorSelection: (color: string) => void;

  // Mirrors your selection - horizontally (left/right) or vertically
  // (top/bottom) - as one rigid piece within its own bounding box: the
  // shape's outline moves along with its colors, like flipping a sticker,
  // and the selection itself moves to the new mirrored footprint. Applies
  // immediately, the same one-click pattern as Recolor Selected - it never
  // needs Duplicate/Move's floating-preview step, since a flip always stays
  // inside the selection's own bounding box. A no-op if nothing's selected.
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;

  // Global find-and-replace across the whole pattern (both passes) - applies
  // every {from, to} rule in a single pass over the *original* colors, so
  // rules like "red to blue" and "blue to green" given together behave as a
  // simultaneous swap rather than a chain (a diamond that was red ends up
  // blue, not green, even though blue is also a "from" in another rule).
  // Rules with a blank/missing color or from === to are ignored.
  onReplaceColors: (rules: { from: string; to: string }[]) => void;
}

export const BuildEditorContext = createContext<BuildEditorContextValue | undefined>(undefined);

export function useBuildEditor(): BuildEditorContextValue {
  const ctx = useContext(BuildEditorContext);
  if (!ctx) {
    throw new Error('useBuildEditor must be used within BuildEditorContext.Provider');
  }
  return ctx;
}
