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
| `js/spellFactors.js` | index | Spell factor engine — casting methods, duration/scale/range tables, Reach, Paradox. Rules source of truth. |
| `js/dicePool.js` | index | Final dice pool calculation (Gnosis + Arcanum base plus all modifiers). |
| `js/character.js` | index | PATHS/ORDERS data, character defaults, localStorage + JSON file persistence. |
| `js/spellCompendium.js` | index | Vanilla Firestore compendium UI with roles. (wizard has a parallel React `CompendiumOverlay` — unification is plan Phase 9.) |
| `js/glossary.js` | index, wizard | Glossary data + `window.GlossaryTip` React component (no JSX). |
| `js/scene.js` | index, wizard | Legacy scene helpers; overlaps `shared/session.js`, slated for merge (plan Phase 2). |
| `shared/session.js` | all three | Firebase RTDB session layer + schema docs. |
| `shared/nav.js` | all three | Floating page-switcher pill. |
| `theme.css` | all three | Color tokens. (Most CSS is still inline per-page; extraction is plan Phase 5.) |

> Known duplication: wizard.html currently re-declares the factor tables, Yantra math,
> PATHS/ORDERS/PRACTICES, and Arcanum colors instead of using the modules above.
> Consolidation is the heart of the review plan (Phases 3–4).

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

`sw.js` (cache-first, manually versioned `CACHE_NAME`, currently `v49`) +
`manifest.json`. Registered from index.html only. Known limitations (overhaul is plan
Phase 8): the asset list omits storyteller.html, `theme.css`, `shared/`, glossary,
and icons; HTML is cache-first so users run stale code until the version bump; CDN
dependencies (React/Babel/Firebase) are never cached, so the app is not genuinely
offline-capable yet.

## Data files

- `data/tilts_conditions.csv` — seed catalog (22 Tilts, 18 Conditions) for the
  Storyteller screen's Tilts Catalog importer (⚙ Tilts Catalog → Import CSV). Columns
  `name,type,description`; the importer also accepts optional `persistent`,
  `environmental`, `resolution`, `beat`, `effect`, `causing`, `ending`, `sourceBook`,
  `sourcePage`.

## Development notes

- Serve over HTTP (`npx serve` from the project root) — `file://` breaks Babel/CORS.
- Firebase is live shared infrastructure: test with throwaway session codes.
- Arcanum color identities are canon (see `docs/CODE_REVIEW_PLAN.md` §A2 for the
  table) — any feature touching an Arcanum uses those exact values.
- Deployment: push to `main` → GitHub Pages via `.github/workflows/deploy.yml`.
  Remember to bump `CACHE_NAME` in `sw.js` when shipping user-facing changes (until
  Phase 8 automates this).
