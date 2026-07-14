// Single source of truth for BuildScreen's colors. Every value here is
// identical to what was previously hardcoded inline across BuildScreen.tsx -
// this pass only centralizes them, it does not change any color.
//
// Scoped to BuildScreen and its extracted pieces for now. GlobalHeader.tsx
// and SettingsScreen.tsx still keep their own local PURPLE consts and are
// deliberately not migrated in this pass.
//
// When real dark mode is built, add a DARK_THEME object below with the same
// keys and wire the swap into ThemeContext - no consuming component should
// need to change.

export interface Theme {
  // Brand
  purple:        string;
  purpleTint:    string; // pale purple background used behind active/selected states
  purpleOverlay: string; // translucent purple, used for the paste-preview rect

  // Surfaces
  background:      string; // page/screen background
  surface:         string; // cards, modal cards
  surfaceMuted:    string; // toolbar/edge/modal-cancel button backgrounds
  surfaceMutedAlt: string; // tab bar / zoom control backgrounds (a hair lighter than surfaceMuted)
  panelBackground: string; // card row / sidebar panel background

  // Borders
  border:       string; // default hairline border (also the empty-swatch fallback background)
  borderStrong: string; // grid outer border
  swatchBorder: string; // fallback ring color for an unset palette swatch

  // Text
  text:         string; // primary text
  textMuted:    string; // secondary text (button labels)
  textSubtle:   string; // modal body copy, unselected toggle labels
  textFaint:    string; // tertiary text (group labels, "coming soon")
  textOnPurple: string; // text/icons on top of a purple background

  // Status
  danger: string; // destructive actions (Start Over confirm)

  // Grid canvas
  gridEmptyFill: string;
  gridStroke:    string;

  // Modal overlay scrim
  overlay: string;
}

export const LIGHT_THEME: Theme = {
  purple:        '#7c3aed',
  purpleTint:    '#f3f0ff',
  purpleOverlay: 'rgba(124,58,237,0.18)',

  background:      '#fff',
  surface:         '#fff',
  surfaceMuted:    '#fafafa',
  surfaceMutedAlt: '#f9fafb',
  panelBackground: '#f3f4f6',

  border:       '#e5e7eb',
  borderStrong: '#b0aea4',
  swatchBorder: '#d1d5db',

  text:         '#111',
  textMuted:    '#374151',
  textSubtle:   '#6b7280',
  textFaint:    '#9ca3af',
  textOnPurple: '#fff',

  danger: '#dc2626',

  gridEmptyFill: '#f0efeb',
  gridStroke:    '#c8c6bc',

  overlay: 'rgba(0,0,0,0.4)',
};
