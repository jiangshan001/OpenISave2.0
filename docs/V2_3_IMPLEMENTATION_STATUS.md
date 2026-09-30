# OpenISave 2.3.0: Visual System and Dark Mode

Presentation-only release. No financial feature, API, schema, migration or
accounting rule changed; the backend differs from 2.2.0 only in `APP_VERSION`.
The one new piece of state is the UI appearance preference, kept in the
webview's `localStorage`, never in the vault.

Version 2.3.0 is set in `backend/app/core/config.py`, `backend/pyproject.toml`,
both `package.json`/lockfile roots, `desktop/Cargo.toml`, `desktop/Cargo.lock`
and `desktop/tauri.conf.json` (installer name and sidebar follow it).

## 1. Theme system

| Piece | Where | What it does |
|---|---|---|
| Preference | `src/theme/appearance.ts` | `system` (default) / `light` / `dark` in `localStorage["openisave.appearance"]`; resolves System through `prefers-color-scheme`; applies `<html data-theme>` + `color-scheme` |
| First paint | `frontend/index.html` inline script | Resolves and applies the theme (and a first-frame background, set through `element.style`) before any bundle loads, so no frame is painted in the wrong theme. **Never add an inline `<style>` element to `index.html`**: Tauri then adds a nonce to the CSP's `style-src`, browsers ignore `'unsafe-inline'`, and every style Ant Design injects at runtime is blocked in the desktop build only (a test guards this) |
| Desktop window | `desktop/tauri.conf.json` (`visible: false`), `desktop/src/lib.rs` (`on_page_load`) | The window is shown only when the page has loaded (4 s safety fallback), so the WebView's white default background never flashes |
| Provider | `src/theme/ThemeProvider.tsx`, `themeContext.ts` | Holds the preference, follows Windows live while on System, hands AntD the theme, cross-fades switches with a 180 ms view transition (instant under reduced motion) |
| Ant Design | `src/theme/antdTheme.ts` → `createTheme(mode)` | Dark = official `darkAlgorithm` + OpenISave tokens (surfaces, text, accent, controls, tables, overlays); light = default algorithm + the same token set |
| CSS tokens | `src/styles/tokens.css` | `:root`/`[data-theme='light']` and `[data-theme='dark']` define the same `--oi-*` names (a test enforces parity) |
| Data colours | `src/theme/chartPalette.ts` → `useChartPalette()` | Separate light and dark palettes for axis, grid, cursor, income, expense, net, dots, category and allocation series, heatmap levels and heatmap hover |
| Controls | `src/theme/AppearanceSwitch.tsx` | Settings → Appearance (labelled) and the sidebar footer (icons with names in tooltips and accessible labels) |

## 2. Visual system

Direction: quiet, precise, cool-neutral financial desktop. Depth comes from a
surface ladder (canvas → panel → raised → hero) and hairlines; shadows are kept
for things that float (popovers, toasts) and the account card you act on.

- **Overview**: a single graphite-navy net worth hero (36 px figure, supporting
  assets / liabilities / possessions, composition bar and legend) replaces the
  separate net-worth card and composition card; income, expenses, net cash flow
  and savings rate are one flat strip; the heatmap is a flat section on the
  canvas; chart panels lost their resting shadow.
- **Sidebar**: 2 px accent rail + tint for the current page, quieter icons,
  footer reorganised into *Local & encrypted*, exchange-rate status and theme.
- **Controls**: primary buttons get an inner top highlight, a short tinted
  shadow and a half-pixel press; neutral secondary buttons; inputs share one
  hover/focus language (stronger border, 3 px soft focus halo, no glow).
- **Tables**: quiet headers, tabular figures, lighter separators (very faint in
  dark), row actions muted until the row is hovered or focused.
- **Transactions**: filters are a compact toolbar inside the table panel with
  removable active-filter chips; the date range and search are now controlled
  so *Clear all* really clears them.
- **Accounts / Assets / Budget / Reports**: stat rows are one strip each.
- **Settings**: new Appearance panel; Data & Security rebuilt around a quiet
  vault summary and a facts grid with worded status chips.
- **Startup, lock, recovery, vault-missing** screens use tokens only, the logo
  and a quiet 2 px progress sweep, in both themes.
- **Feedback**: messages and notifications on the surface language with a
  tinted icon well and a 200 ms entrance.
- About 100 layout inline styles moved to shared classes; no component file
  contains a colour literal any more (test-enforced).

### Uiverse Galaxy (MIT) references

Ideas taken from [uiverse-io/galaxy](https://github.com/uiverse-io/galaxy)
(MIT licence) and re-drawn with OpenISave tokens; no snippet was copied:

- tactile buttons: inner top highlight and a small press offset;
- notification cards: tinted icon well, title/description weight contrast,
  soft 0.98 → 1 entrance;
- toggles: a thumb with a light shadow on a flat track.

Deliberately not used: gradient or glowing buttons, neon/purple accents,
rotating icons, glassmorphism, 3D controls, bouncing or looping animation.

## 3. Accessibility and motion

- Text tokens checked for WCAG AA in both themes (e.g. muted text 5.5:1 on
  white, 6.7:1 on the dark panel; primary button label 4.8:1 in dark).
- Visible 2 px focus rings on buttons, segmented controls, switches,
  checkboxes and radio buttons; tooltips for icon-only theme options also
  carry accessible labels.
- Positive and negative values keep their sign and words; status chips carry
  a glyph and text, not just colour.
- `prefers-reduced-motion` disables reveal, toast, meter, startup-sweep, chart
  entrance and theme cross-fade animation.

## 4. Tests

New: `src/theme/appearance.test.ts` (default System, persistence, resolving,
early apply, OS changes, and the `index.html` boot script executed for each
stored value), `ThemeProvider.test.tsx` (Light / Dark / System, persistence
across launches, live OS changes only while on System, chart palette switch,
Settings → Appearance), `darkMode.test.ts` (no colour literals in components,
token parity light/dark, separate chart palettes, dark algorithm), sidebar
footer theme control. Screenshots are not pixel-tested.

## 5. Screenshots

`docs/ui-review/2.3/`: `before-*-light.png` (2.2.0) and `after-*-{light,dark}.png`
(2.3.0) for Overview, Accounts, Transactions and Settings at 1440 × 900, all
from the same synthetic fixture (`scripts/ui_review_fixture.py`, isolated
scratch vault, in-memory key). No real financial data appears in any of them.

## 6. Final polish: interaction, account identity, goal progress

Still presentation only (no API, schema or calculation change).

- **Sidebar** (`styles/nav.css`, `components/layout/navItems.tsx`): tinted hover
  row, 24 px icon well, stronger label; the current page keeps its 2 px rail
  (it now draws in once), gets a tinted well with a faint top highlight and a
  hairline inner edge. Icons make one small gesture on hover or keyboard focus:
  Transactions' two arrows part (the glyph is stacked twice and clipped),
  Recurring turns 18°, Accounts lifts, Goals' flag rises, Settings turns 14°,
  the rest scale to 1.06.
- **Buttons** (`styles/interactions.css`): primary buttons lift 1 px, pass one
  soft sheen across on hover, press down 0.5 px; icons inside any button make a
  matching gesture (plus turns, arrows shift, import rises, edit tilts, undo
  turns back). Text actions gain contrast, never colour.
- **Account identity** (`theme/accountTheme.ts`, `styles/accountThemes.css`):
  `resolveAccountTheme()` → known institution (HSBC, Bank of China, 招商银行,
  CCB, Monzo, Barclays, WeChat, Alipay; matched on institution or account name)
  → account type (cash, savings/provident fund, investment, credit/loan,
  property) → one of seven fallback palettes chosen by an FNV-1a hash of
  institution + account name. Each theme is one accent per mode plus an
  abstract motif at 5–7.5 % opacity (lattice, arcs, ribbon, stacked bands,
  dots, pinstripe, wave, rise, diagonal, contour) and a typographic monogram.
  No logo or brand artwork is used. Monograms also appear on the Overview
  accounts table and in goal contributions.
- **Goals** (`theme/goalTheme.ts`, `components/common/MilestoneProgress.tsx`,
  `styles/goals.css`, `styles/milestones.css`): goal kind from name keywords
  (emergency, travel, home, education, car, occasion, else savings; UI only),
  milestone track with stops at 25 / 50 / 75 % and a star at 100 %, calm copy
  (Getting started, Momentum building, Halfway there, Almost there, Goal
  reached), contribution split bar in each account's identity colour. A
  milestone crossed since the last visit plays one soft ring (sparks at 100 %,
  < 600 ms); the "already shown" marker is in `localStorage
  ["openisave.goalMilestones"]` (goal ids and milestone numbers only). The
  Overview card reads `remaining_minor` from `/goals` rather than computing it.
- All motion sits behind `prefers-reduced-motion: no-preference` (test-enforced
  in `theme/themeStyles.test.ts`, which also checks light/dark palette parity
  and WCAG AA for monograms and goal percentages).
- Screenshots: `docs/ui-review/2.3/before-{sidebar-interactions,accounts-themed,goals}.png`
  and `after-*-{light,dark}.png`, from the synthetic fixture.
- New tests: `theme/accountTheme.test.ts` (known institutions, type themes,
  deterministic fallback, stable hash, monograms), `theme/goalTheme.test.ts`
  (keyword classification and fallback, milestone boundaries 0 / 25 / 50 / 75 /
  100, copy, one-shot milestone memory), `theme/themeStyles.test.ts` (palettes
  for light and dark, WCAG AA, faint patterns, reduced-motion gating),
  `features/goals/components/GoalCard.test.tsx`, extended `Sidebar.test.tsx`
  (active state, accessible names, decorative icon wells, motion kinds).

### Validation (final polish)

| Check | Result |
|---|---|
| Backend `pytest` | 313 passed, 1 skipped (no backend change) |
| Frontend `npm test` | 143 passed in 25 files |
| typecheck / lint / check:size / build | pass (largest handwritten file 318 lines; expected >500 kB chunk warning) |
| Installer | `release/OpenISave_2.3.0_x64-setup.exe`, SHA-256 `a2e64014364550d8cbeba2a1c7bfd3e6887ad2cbd7c9c746030f6e48637e8051` |
| Real Windows install | via `explorer.exe`, outside the agent sandbox; registry and exe at 2.3.0 |
| Installed-app smoke test (read-only) | sidebar hover / active, account themes, goal milestones and contributions, Overview goals in Light and Dark; System follows the OS; zero console errors |
| Data | record counts and balance / goal digests identical before and after install; zero orphan backend processes |
