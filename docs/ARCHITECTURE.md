# Electronic Grimoire — Architecture

**Living document.** Every refactor phase (see [CODE_REVIEW_PLAN.md](CODE_REVIEW_PLAN.md))
updates this file so the written description never drifts from the code.
*Last updated: 2026-06-11 (Phase 0).*

## Overview

The Electronic Grimoire (Spellcasting Aide) is a Mage: The Awakening 2nd Edition
companion app: a spell factor calculator, character tracker, shared spell compendium,
and live table session system. It is three self-contained HTML pages served statically
(GitHub Pages, see `.github/workflows/deploy.yml`) with **no build step** — React 18 and
Babel Standalone load from CDN and JSX compiles in the browser.

Backend is Firebase:

- **Realtime Database** — live game sessions (`sessions/{code}/...`). The full schema is
  documented in the comment block at the top of `shared/session.js` — read it first.
- **Firestore** — the global spell compendium.
- **Auth** — role-based compendium editing (admin / editor / sub-editor / suggester).

## Pages

| Page | Role | Tech |
|------|------|------|
| `index.html` | **Classic** — desktop-first calculator, all fields visible at once. Editable spell library (rotes/praxes/favorites), combined spell casting (Classic-only), character editor. | Hybrid: vanilla JS core + React components in `text/babel` blocks, connected by window bridges (below) |
| `wizard.html` | **Wizard** — step-by-step mobile casting flow (440px card). Saves to library but doesn't manage it. | Fully React, single Babel block |
| `storyteller.html` | **ST Screen** — player cards (health/mana/WP/paradox), tilt management with CSV-importable catalog, scene log, sheet viewer with ST edit overrides. | Fully React, single Babel block |

Design invariants (from the Classic → React migration):

- Classic stays desktop-wide with the whole form visible — do **not** mobile-ify it.
- Wizard is the mobile flow — step-by-step, not all-at-once.
- Spell library editing depth and combined casting are Classic-only features.

## Shared modules

Plain script-tag globals (no ES modules). Load order: Firebase compat scripts →
`shared/session.js` → `js/` modules → page logic.

| File | Used by | Purpose |
|------|---------|---------|
| `js/gameData.js` | all three | `MageData` — single source of truth for identity data: Arcana (+canonical colors, hex & Discord int), Paths, Orders, Practice names, Title-Case helpers (Phase 3). Load before character.js. |
| `js/spellFactors.js` | index, wizard | Spell factor engine — casting methods, duration/scale/range tables, GNOSIS_CHART, Reach, Paradox. Rules source of truth. |
| `js/dicePool.js` | index, wizard | Final dice pool calculation (Gnosis + Arcanum base plus all modifiers). Mudra dice ride in the yantra's `bonus` (see B1 note in the file). |
| `js/character.js` | index | PATHS/ORDERS data, character defaults, localStorage + JSON file persistence. |
| `js/spellCompendium.js` | index | Vanilla Firestore compendium UI with roles. (wizard has a parallel React `CompendiumOverlay` — unification is plan Phase 9.) |
| `js/glossary.js` | index, wizard | Glossary data + `window.GlossaryTip` React component (no JSX). |
| `shared/firebase.js` | all three | Single Firebase init — sets `window._fbApp/_fbDb/_fsDb/_fsAuth` for whichever SDKs the page loads (Phase 2). |
| `shared/session.js` | all three | Firebase RTDB session layer + schema docs. Also hosts the legacy `scene*` room helpers merged from the former `js/scene.js` (Phase 2) — see the comment there for how they differ from the `session*` flow. |
| `shared/nav.js` | all three | Floating page-switcher pill. |
| `theme.css` | all three | Color tokens. (Most CSS is still inline per-page; extraction is plan Phase 5.) |

> Consolidation status: identity data (Phase 3) and the rules engine (Phase 4)
> are single-sourced — wizard.html derives its UI table views and Title-Case
> data from the modules above and re-declares nothing. The remaining
> duplication is the compendium UI (vanilla vs React, plan Phase 10) and the
> Discord send layer (plan Phase 7).

## Window bridges (index.html only)

Classic is mid-migration: React owns the UI, a vanilla block owns persistence,
Discord sends, and the spell library store. They talk through window globals:

| Global | Direction | Purpose |
|--------|-----------|---------|
| `window.classicVanilla` | React → vanilla | Vanilla callbacks React invokes: `onCharacterLoad`, `onStatChange`, `onEdit/onSave/onNew`, `addSpell/updateSpell/deleteSpell`, `loadSpell`, `openSaveToLibrary`, `setSpellAsActive`, `sendDicePool`, `sendCard`, `exportSpellLibrary`, `showToast`, `onSceneChange`, `dismissSpell` |
| `window.classicBridge` | vanilla → React | React state setters, **accumulated by merge** (`{...window.classicBridge, ...}`) from several components: `setCharacter`, `setSpellForm`, `setSpellFormField`, `setActiveSpellCount`, `recalculate`, plus editor/modal open functions |
| `window.classicCombinedBridge` | React → vanilla/React | Combined-spell state: `isEnabled`, `getSpells`, penalty/reach helpers |
| `window.spellLibraryAPI` | vanilla → compendium | Spell library access for `js/spellCompendium.js` |

Gotchas (learned during migration, still true):

- Vanilla init code must null-guard `getElementById` for React-rendered nodes — one
  listener attached to a missing element aborts the whole `DOMContentLoaded` handler,
  and `classicVanilla` never gets defined.
- Babel's DOMContentLoaded listener usually runs before the vanilla one, so React
  elements are *usually* in the DOM by vanilla init — but not guaranteed.

## PWA

`sw.js` + `manifest.json`, registered from all three pages. Strategy (Phase 8):

- **Same-origin** (our HTML/JS/CSS/icons): **network-first** with cache
  fallback — online users always run the latest deployed code; offline serves
  the last-seen copy. The full asset set for all three pages is precached on
  install.
- **Versioned CDN runtime** (React, Babel, Firebase SDKs on
  cdnjs/`www.gstatic.com`, Google Fonts): **cache-first** — the URLs are
  immutable, so cached copies never go stale. This makes the app genuinely
  offline-capable. CDN entries are fetched in CORS mode so SRI-tagged script
  tags can be answered from cache.
- **All other cross-origin traffic** (Firebase data on
  firebaseio.com/firestore.googleapis.com, Discord webhooks): **never
  intercepted, never cached**.

`CACHE_NAME` (`mage-grimoire-vNN`) only needs bumping when the caching
strategy/layout itself changes — **not per release**; network-first refreshes
cached entries on every successful fetch.

## Data files

- `data/tilts_conditions.csv` — seed catalog (22 Tilts, 18 Conditions) for the
  Storyteller screen's Tilts Catalog importer (⚙ Tilts Catalog → Import CSV). Columns
  `name,type,description`; the importer also accepts optional `persistent`,
  `environmental`, `resolution`, `beat`, `effect`, `causing`, `ending`, `sourceBook`,
  `sourcePage`.
- `data/spells.csv` — hand-curated core-book spells (descriptions, Reach effects,
  Withstand, page refs) in the Spell Compendium's CSV import format. Version-controlled
  backup of the transcription work behind the Firestore compendium; re-import source.
- `docs/reference/` — salvaged code kept for reference, not loaded by any page
  (currently `tiltCatalog.js`, see review plan Phase 9).

## Testing

`node tests/run.mjs` — no dependencies, runs anywhere Node does. Part A is a
unit suite locking in the shared rules engine (`js/spellFactors.js` +
`js/dicePool.js`); failures exit non-zero. Part B feeds identical casting
inputs to the shared engine and to wizard.html's inline engine (extracted live
from the file) and tallies disagreements — drift is reported, not failed; see
`docs/engine-drift.md` for the triaged findings. Run it before and after any
change to the rules math.

## Development notes

- Serve over HTTP (`npx serve` from the project root) — `file://` breaks Babel/CORS.
- Firebase is live shared infrastructure: test with throwaway session codes.
- Arcanum color identities are canon (see `docs/CODE_REVIEW_PLAN.md` §A2 for the
  table) — any feature touching an Arcanum uses those exact values.
- Deployment: push to `main` → GitHub Pages via `.github/workflows/deploy.yml`.
  No service-worker cache bump needed per release (network-first since Phase 8);
  bump `CACHE_NAME` only if the caching strategy or precache layout changes.
