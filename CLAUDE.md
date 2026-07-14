@AGENTS.md

# Bracelet Buddy - Claude Code Conventions

Friendship bracelet designer app. Expo (React Native) + TypeScript, targeting web, iOS, and Android from one codebase. Expo SDK ~56, Metro bundler, **no expo-router** - `App.tsx` does manual screen-state routing, not file-based routing.

Repo: `B-Gillon/bracelet-buddy` (GitHub). Supabase project ref: `erjlwjaosuagxpqamplb`.

## Non-negotiable conventions

- **Full file overwrites only.** Never partial diffs/snippets for existing files - always the complete file content.
- **Brand color:** `PURPLE = '#7c3aed'`. Centralized as `LIGHT_THEME.purple` in `constants/theme.ts` for BuildScreen and everything it renders (see Theme system below) - `GlobalHeader.tsx` and `SettingsScreen.tsx` still keep their own local `PURPLE` const and were deliberately not migrated.
- **No independent design/layout decisions** without asking first - architecture and schema changes especially need sign-off before applying.

## Routing - deliberately not a real router

`App.tsx` holds a single `screen` state (`useState<Screen>`) and conditionally renders screens - there is no React Navigation or expo-router. On web, the current screen is mirrored into a `?screen=` **query string** (not a path) via `history.replaceState`, specifically so:
- A browser refresh reloads whatever screen you were on, not always Home.
- No server-side rewrite rules are needed for any hosting provider (query strings always resolve to the same URL) - this is why `vercel.json`'s rewrite rule matters less here than in a typical SPA, though it's included anyway as a safety net.

## BuildScreen's layout quirk - do not "fix" this

`BuildScreen` must NOT be wrapped in a `flex: 1` / height-constrained parent - that breaks its internal `ScrollView` + `stickyHeaderIndices` sticky header behavior on web. But it DOES need an explicit `width: '100%'` on whatever wraps it, because Expo Web's root container lays out as a row internally, and an unstyled wrapper won't stretch to fill the viewport otherwise. Both of these were hard-won fixes - don't remove either half.

## Theme system

- `constants/theme.ts` - `Theme` interface + `LIGHT_THEME`, the single source of truth for BuildScreen's colors (brand, surfaces, borders, text, grid canvas, modal overlay). Every value is unchanged from what used to be hardcoded inline - this was a pure centralization pass, not a redesign.
- `context/ThemeContext.tsx` → `useTheme()`: returns `{ theme, mode }`, hardcoded to `LIGHT_THEME`/`'light'` for now. No toggle yet - this is deliberately the one place a future Dark Mode setting plugs in (swap in a `DARK_THEME` based on a stored preference); no consuming component should need to change when that happens.
- Scoped to BuildScreen and its extracted pieces only (see below) - not yet rolled out app-wide.

## BuildScreen architecture - extracted pieces

`BuildScreen.tsx` still owns all editor state directly (grid data, selection, tool mode, undo/redo, floating Duplicate/Move op) - it just hands that state down via `BuildEditorContext` instead of threading a dozen props, and delegates rendering to extracted components:

- `context/BuildEditorContext.tsx` - the shared state contract (`BuildEditorContextValue`) for every card below. Not owned by its own Provider - BuildScreen constructs the value object itself and renders `<BuildEditorContext.Provider>`.
- `components/PatternGridView.tsx` - the actual diamond-grid rendering + touch/click input (press/drag/release, selection overlay, floating-copy overlay, rectangle box-select preview and hit-testing).
- `components/GridEdgeControls.tsx` - the +/- row/column buttons around the grid's four edges.
- `components/BuildScreenModals.tsx` - `StartOverConfirmModal`, `DeletePatternModal`, `AccountRequiredModal`, `SaveAsNewModal`, `SavedModal`.
- `components/build-cards/` - `ColorsCard`, `SelectorCard`, `PatternToolCard` (placeholder), `BehaviorControlsCard`, `ModeIndicator`. These make up the horizontal-mode `cardRow`. Vertical mode still uses an older, separate inline sidebar in `BuildScreen.tsx` that duplicates a *subset* of what the cards do (colors + basic selection) - flagged as a known future consolidation, not a bug.

## Editor tools - Paint / Select / Erase

Exactly one `toolMode: 'paint' | 'select' | 'erase'` is active at a time (see `BuildEditorContext`). `onSelectTool`/`onColorTool`/`onEraseTool` always **set** the mode, never toggle - there's no "neither" state.

- **Color Tool (paint):** default. Click/drag paints the selected palette color; clicking an already-painted diamond with its own color clears it (single-cell toggle).
- **Select Tool:** click/drag adds diamonds to `selectedCells`. Also supports **rectangle box-select** (drag a marquee, release to add everything inside) - box-drag only grabs **colored** diamonds (blanks are excluded, since there's nothing meaningful to select there); a plain single click still toggles any cell regardless of color. Magic Wand (`onSelectConnected`, flood-fill same-color neighbors) and Select Same Color (`onSelectSameColor`, matches anywhere in the pattern) both grow from the current selection. Duplicate/Move snapshot the selection into a floating copy (`FloatingOp`) that locks the tool until Done/Cancel.
- **Delete/Erase Tool:** click/drag clears a diamond's color back to blank, regardless of whichever palette color is selected. A distinct tool (not a palette entry), lives next to Color Tool in the COLORS card.

**Flip Horizontal/Vertical (`onFlipHorizontal`/`onFlipVertical`) is a true rigid-piece flip** - the shape's outline moves with its colors, like flipping a sticker, and the selection itself moves to the new mirrored footprint. It does **not** just recolor whatever cells happen to already be selected - that was a real bug once (asymmetric shapes appeared to do nothing on Flip) and got fixed deliberately; don't regress to the color-only version. Each pass (main beads vs. gap connectors) mirrors within its own bounding box. See `flipSelection()` in `BuildScreen.tsx`.

**Undo/Redo** (`historyRef`/`futureRef`, capped at 20 entries each) covers *every* mutation, including direct single-diamond paint/erase clicks and drags - not just the multi-cell operations (Recolor Selected, Flip, Replace Colors, Duplicate/Move). This required a specific pattern: `ensureStrokeHistory()` pushes a history entry lazily, once per press-and-drag gesture (tracked via `strokeHistoryPushedRef`, reset in `handleCellRelease`), so an entire click-and-drag stroke collapses into exactly one Undo step instead of zero (the original bug - direct painting/erasing never called `pushHistory()` at all) or one-per-diamond. Any new direct-mutation code path needs to call `ensureStrokeHistory()` before its first real grid write, or it'll silently be un-undoable.

## Shared geometry/types - single source of truth

- `types/pattern.ts` - `PatternConfig`, `PatternGrid`, `DualGrid` (main + gap grids), `DEFAULT_PATTERN_NAME`.
- `utils/diamondGrid.ts` - `CellInfo` + `buildCells()`, the diamond-position math. Used by both `BuildScreen.tsx` (full editor) and `components/PatternThumbnail.tsx` (previews). If you need to change diamond geometry, change it here once - don't let the two consumers drift apart again.
- `components/PatternThumbnail.tsx` renders a read-only diamond-weave preview with three modes: `diamondSize` (fixed px/diamond), `maxCols` (crop long patterns, no visual "+N" indicator - removed per request), `fitWidth` (scale the *whole* uncropped pattern to an exact pixel width, used in modals so nothing needs to scroll).

## Local storage

`utils/storage.ts` - generic `storageGet`/`storageSet`/`storageRemove` around `AsyncStorage`, namespaced/versioned keys via `STORAGE_KEYS` (e.g. `braceletBuddy:session:v1`). Two independent things get cached:
1. `App.tsx`: `{screen, config}` session pointer, so refresh resumes an in-progress pattern.
2. `BuildScreen.tsx`: `{dualGrid, palette}` per pattern id, debounced ~400ms, so mid-edit progress survives a refresh even before the first cloud save.

## PWA

`public/index.html` (custom Metro template), `public/manifest.json`, `public/sw.js` (hand-written network-first-falling-back-to-cache service worker - no Workbox, since this project doesn't use expo-router's build tooling). **The service worker deliberately skips registering on `localhost`** to avoid caching stale JS during development. To actually test offline behavior: `npx expo export -p web && npx serve dist` - never test PWA/offline behavior against the dev server.

## Auth (Supabase)

- Email/password only, no OAuth providers.
- `utils/supabaseClient.ts` configures `AsyncStorage`-backed session persistence and `detectSessionInUrl: true` - the latter is required for auto-login via the email-confirmation redirect link.
- `context/AuthContext.tsx` → `useAuth()`: `session`, `user`, `loading`, `signUp`, `signIn`, `signOut`. `signUp` passes an explicit `emailRedirectTo` pointing at `?screen=home&welcome=1`, so confirmation always lands cleanly on Home instead of falling back to whatever's cached locally.
- Sign in/up UI lives on **Home**, not Settings (moved there deliberately). Settings is currently a placeholder plus the profile-editing form.

## Profiles

- `context/ProfileContext.tsx` → `useProfile()`: shared so the header avatar updates immediately after a Settings save, not just on next reload.
- `profiles` table: **all fields optional** (`first_name`, `last_name`, `username` unique, `country`, `avatar_id`). Auto-created (blank) via an `AFTER INSERT` trigger on `auth.users` the moment someone signs up.
- **Deliberately excluded, do not add without checking first:** date of birth / age (flagged as a likely COPPA trigger, needs legal input before revisiting), a freeform bio field (fine while private; becomes a real content-safety question the moment any profile data is ever shown to other users).
- Avatars are a small **preset set** (`constants/avatars.ts` → `AVATAR_OPTIONS`), not user photo uploads - deliberate copyright/content-safety decision. `assets/avatars/bead-*.png`.

## Patterns / Save / My Designs

- `utils/patterns.ts`: `savePattern` (upsert by `client_id`, used for both a normal Save and Save As New), `listPatterns` (metadata + grids for card previews, no relation to a smaller "lightweight" query - the tradeoff of pulling full grid data for thumbnails was made deliberately), `loadPattern` (full single-pattern fetch), `isUsernameTaken` (RPC wrapper - see RLS note below), `formatPatternNumber` (zero-pads `display_number` to 6 digits for display).
- `patterns.user_id` is `NOT NULL` - **an account is required to save, by design**, not an oversight.
- `patterns.display_number`: a plain `bigint`, assigned by an `AFTER INSERT` trigger - **not** a Postgres `IDENTITY`/serial column. This matters: identity columns advance their sequence even when an upsert redirects into an `UPDATE` (a conflict), silently burning numbers and creating gaps. The trigger only fires for genuine inserts.
- A pattern with no user-given name defaults to `DEFAULT_PATTERN_NAME` ("New Bracelet"); the first successful save automatically renames it to `Bracelet #NNNNNN` using the just-assigned `display_number` - this can only happen post-save, since the number doesn't exist before that.
- My Designs list is sorted by `display_number` ascending (not `updated_at`) - so numbering always reads left-to-right correctly regardless of which pattern was edited most recently.
- Save is offline-tolerant by design: the local save always happens first and always succeeds; the cloud upsert is attempted after, and a failure shows "saved on this device, will sync later" rather than an error.

## Row Level Security - a real gotcha we hit twice

**Every table needs both an explicit `GRANT` to `authenticated` AND RLS policies** - missing the grant produces `permission denied for table X` even with entirely correct policies (Postgres checks table-level privileges and row-level policies independently). This bit us once already (the `patterns` table shipped without grants for a while).

Any `SECURITY DEFINER` function needs an explicit `revoke execute ... from anon, authenticated, public` **unless** it's meant to be called directly by the app (e.g. `is_username_taken` - deliberately callable; `handle_new_user` and `assign_display_number` - deliberately locked down, since they should only ever run via their triggers).

The project has "Enable automatic RLS" turned on at the project level - any new table starts fully locked (zero access to anyone) until policies are added deliberately. This is intentional and should stay on.

## Deployment

- **Vercel build command:** `npx expo export -p web`
- **Output directory:** `dist`
- Env vars use the `EXPO_PUBLIC_` prefix (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) - required for Expo to inline them into the client bundle. Set locally via `.env` (gitignored) and separately in Vercel's Project Settings for the deployed build.
- Custom SMTP via Resend (domain `mail.brandongillon.com`, verified) for branded auth emails - only the "Confirm signup" template is customized so far; the other five (reset password, magic link, etc.) still use Supabase's defaults.

## Explicitly NOT built yet - don't assume otherwise

- **"Make the Bracelet" instructional screen.** Blocked on a real design decision: knot direction/type is derived from the color grid at render time (not stored explicitly per-cell) - the derivation algorithm itself hasn't been designed or built.
- **Heart/love-count and star/favorite** on patterns. Blocked on whether patterns become visible to other users at all (currently 100% private per-account via RLS) - this is a scope decision, not just "add a counter."
- Bracelet end-handling options (clasp/tied-loop/etc) - explicitly deprioritized, skip unless asked again.
- Realistic bracelet rendering, pattern macros/stamps, tutorials content, native Android/iOS apps, payment/subscription tiers - all on the roadmap, none built.
- Any profile field beyond what's listed above (see the DOB/bio exclusions).
