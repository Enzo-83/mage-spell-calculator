# js/ — Shared JavaScript modules

All files here are plain script-tag globals (no modules, no build step). Load order
matters: Firebase compat scripts → `shared/session.js` → these files → page logic.

| File | Used by | Purpose |
|------|---------|---------|
| `gameData.js` | all three pages | `MageData` — single source of truth for identity data: Arcana + canonical colors (CSS hex & Discord int), Paths, Orders, Practice names, Title-Case helpers. Load before `character.js`. Rules math stays in `spellFactors.js`. |
| `spellFactors.js` | index.html, wizard.html | Mage 2e spell factor engine: casting methods, duration/scale/range tables, GNOSIS_CHART, Reach, Paradox calculation. The rules source of truth — wizard.html delegates all math here since Phase 4. |
| `dicePool.js` | index.html, wizard.html | Final spellcasting dice pool: Gnosis + Arcanum base plus all modifiers (factors, Yantras, conditions). Mudra dice ride in the yantra's `bonus` (see the B1 note in the file). |
| `character.js` | index.html | Character data structures (PATHS, ORDERS, defaults), localStorage persistence, JSON file import/export. |
| `spellCompendium.js` | index.html | Firestore-backed global spell compendium with role-based editing (admin/editor/sub-editor/suggester). Exposes `window.initCompendium()` and `window.renderCompendiumTab()`. wizard.html has a separate React `CompendiumOverlay` against the same Firestore collection. |
| `glossary.js` | index.html, wizard.html | Glossary term data + `window.GlossaryTip` React component (plain `createElement`, no JSX — safe to load before Babel). |

Related shared code lives in `shared/`:

- `shared/firebase.js` — single Firebase init for all pages; sets
  `window._fbApp/_fbDb/_fsDb/_fsAuth` for whichever SDKs the page loads.
- `shared/session.js` — Firebase Realtime Database session layer. The comment block at
  the top documents the full `sessions/{code}/...` schema — read it first. Also hosts
  the legacy `scene*` room helpers (merged from the former `js/scene.js`).
- `shared/nav.js` — floating page-switcher (Calculator / Wizard / Storyteller).
