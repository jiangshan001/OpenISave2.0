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
