// Single source of truth for the app's colors. Originally scoped to just
// BuildScreen (every LIGHT_THEME value below is identical to what used to
// be hardcoded inline there), now rolled out app-wide alongside Dark Mode -
// every screen/component pulls from useTheme() instead of a local PURPLE
// const or inline hex values.

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
  headerBackground: string; // GlobalHeader's top nav bar - a distinct tint from surface

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
  danger:  string; // destructive actions (Start Over confirm)
  success: string; // confirmation copy (e.g. "username available", sign-up success)

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
  headerBackground: '#e0f2fe',

  border:       '#e5e7eb',
  borderStrong: '#b0aea4',
  swatchBorder: '#d1d5db',

  text:         '#111',
  textMuted:    '#374151',
  textSubtle:   '#6b7280',
  textFaint:    '#9ca3af',
  textOnPurple: '#fff',

  danger:  '#dc2626',
  success: '#059669',

  gridEmptyFill: '#f0efeb',
  gridStroke:    '#c8c6bc',

  overlay: 'rgba(0,0,0,0.4)',
};

// Brand purple is kept identical to LIGHT_THEME for brand consistency -
// only surfaces/borders/text invert. background/surface/panelBackground are
// deliberately three distinct shades (darkest to lightest) so cards visibly
// "float" above the page and the panel still reads as receding behind them,
// mirroring the light theme's background===surface, panelBackground-a-bit-
// darker relationship without being a literal color-for-color inversion.
export const DARK_THEME: Theme = {
  purple:        '#7c3aed',
  purpleTint:    'rgba(124,58,237,0.18)',
  purpleOverlay: 'rgba(124,58,237,0.30)',

  background:      '#0f0f11',
  surface:         '#1a1a1d',
  surfaceMuted:    '#212124',
  surfaceMutedAlt: '#27272a',
  panelBackground: '#161618',
  headerBackground: '#0f1a24',

  border:       '#2e2e32',
  borderStrong: '#48484d',
  swatchBorder: '#3a3a3f',

  text:         '#f4f4f5',
  textMuted:    '#d4d4d8',
  textSubtle:   '#a1a1aa',
  textFaint:    '#71717a',
  textOnPurple: '#fff',

  danger:  '#f87171',
  success: '#34d399',

  gridEmptyFill: '#222225',
  gridStroke:    '#3a3a3f',

  overlay: 'rgba(0,0,0,0.6)',
};
