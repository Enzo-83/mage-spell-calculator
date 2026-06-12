# Electronic Grimoire — Code Review & Refactor Plan

**Date:** 2026-06-11
**Purpose:** A guided plan for reviewing, refactoring, and consolidating the Electronic
Grimoire (Spellcasting Aide). Each phase below is sized to be executed as an independent
agent task / PR, with its own verification steps and documentation deliverable.

> **Ground rule for every phase:** documentation is part of the deliverable. Each phase
> updates `docs/ARCHITECTURE.md` (created in Phase 0) so the written description of the
> app never drifts from the code.

---

## 1. Architecture snapshot (what exists today)

Three self-contained HTML apps share a common JS layer and a Firebase backend
(Realtime Database for live sessions, Firestore for the spell compendium, Auth for
compendium roles). No build step — React 18 + Babel Standalone load from CDN and JSX
compiles in the browser.

| Page | Size | Role | Tech |
|------|------|------|------|
| `index.html` | ~7,650 lines | "Classic" calculator — desktop, all fields visible | Hybrid: vanilla JS core + 5 React (Babel) blocks bridged via `window.classicVanilla` |
| `wizard.html` | ~4,150 lines | Step-by-step mobile casting flow | Fully React (one Babel block) |
| `storyteller.html` | ~1,500 lines | ST dashboard — player cards, tilts, scene log | Fully React (one Babel block) |

Shared modules (plain script-tag globals, no modules/bundler):

| File | Lines | Contents |
|------|------|----------|
| `js/spellFactors.js` | 951 | Spell factor engine: casting methods, duration/scale/range tables, Reach, Paradox |
| `js/dicePool.js` | 415 | Dice pool calculation with all modifiers |
| `js/character.js` | 894 | PATHS/ORDERS data, character persistence (localStorage + JSON file) |
| `js/spellCompendium.js` | 1,347 | Firestore-backed global compendium with role-based editing (vanilla, index.html only) |
| `js/glossary.js` | 168 | Glossary data + `GlossaryTip` React component (no JSX, shared cleanly) |
| `js/scene.js` | 101 | Legacy scene helpers — overlaps `shared/session.js` |
| `shared/session.js` | 262 | Firebase session layer (documented path schema at top — good) |
| `shared/nav.js` | 25 | Floating page-switcher nav pill |
| `theme.css` | 20 | Color tokens only — almost all CSS still lives inline in each page |
| `sw.js` | 99 | PWA service worker, cache-first, manually versioned (`v49`) |

History note: the Classic → React migration (Phases 1–8) and UX backlog Phases 1–4 are
complete. index.html is mid-architecture: React owns the UI, but a large vanilla block
(lines ~2890–4405) still owns character persistence, spell library storage, Discord
sends, and the export path, exposed to React through `window.classicVanilla`.

---

## 2. Findings

### A. Duplication & consolidation (highest value)

**A1. The spell engine exists twice.**
*(Update 2026-06-11: PR #52 started this consolidation — wizard.html now loads
`js/dicePool.js`. The factor tables and Yantra/Reach/Paradox math below are still
duplicated; Phase 4 covers the remainder.)*
`wizard.html` does **not** load `js/spellFactors.js`. It re-declares
its own copies of the duration/scale tables (`wizard.html:147–183`), Paradox-per-Reach
chart (`wizard.html:217–218` — the comment literally says *"from GNOSIS_CHART in
spellFactors.js"*), free-Reach formula, and the full Yantra bonus table
(`wizard.html:316–331`). Two engines means every rules fix must be made twice and they
can silently drift. **This is the most important refactor in the plan.**

**A2. Game data exists two-to-three times.**
`PATHS`, `ORDERS`, `PRACTICES`, `ARCANA` are declared in both `js/character.js` and
`wizard.html:97–115`. Arcanum colors exist as `ARCANUM_COLORS` (wizard, Title Case keys)
and `SL_ARC_COLORS` (`index.html:7071`, lowercase keys). The canonical color identities
(see project memory: Death `#475569`, Fate `#e2e8f0`, Forces `#f87171`, Life `#4ade80`,
Matter `#d97706`, Mind `#fbbf24`, Prime `#60a5fa`, Space `#a78bfa`, Spirit `#fb923c`,
Time `#22d3ee`, plus Discord integer forms) should live in exactly one place.

**A3. Firebase config pasted into all three pages.**
`index.html:2863–2879`, `wizard.html:42–57`, `storyteller.html:40–52` each carry the
config with a *"MUST MATCH"* comment. That comment is the smell: extract
`shared/firebase.js` that initializes `_fbApp` / `_fbDb` (/ Firestore + Auth where
needed) once.

**A4. `js/scene.js` vs `shared/session.js`.**
Near-total overlap: `sceneGenerateCode`≡`sessionGenerateCode`, `sceneGetRef`≡
`sessionGetRef`, join/leave, reset-all-players, paradox log push/clear, and the
localStorage remember/recall trio all exist in both. `scenePushStats` already just
delegates to `sessionPushStats`. Merge the few unique scene functions into
`shared/session.js` and delete `js/scene.js`.

**A5. Two compendium implementations.**
`js/spellCompendium.js` (1,347 lines, vanilla, used by index.html) and
`CompendiumOverlay` (`wizard.html:3525+`, React) both implement the Firestore
compendium with role-based editing. Long-term they should converge on one React
component; this is the largest and riskiest consolidation, so it is sequenced last.

**A6. Discord send logic duplicated.**
index.html has vanilla `sendDicePool` / `sendCard` / `buildSpellPreviewEmbed` /
`formatDicePoolCommand` (lines ~3835–4288), the React `ClashPill` has its own webhook
fetch (`index.html:4829+`), and wizard.html has `postDiscord` plus its own embed
builders (`wizard.html:2523+`). Extract `shared/discord.js` (embed builders + post
helper + status UI hook).

### B. index.html internal structure

**B1. Migration "Phase 8 cleanup" never fully landed.** The vanilla block
(`index.html:2890–4405`) still contains DOM-reading helpers that predate the React form
(`getScaleType`, `populateDurationSelect`, `populateScaleSelect`, `updateGnosisInfo`,
`toggleRitualIntervals`, `updateParadoxDisplay`, etc.). Audit which are dead now that
`ClassicCalculator` owns form state, and delete them. The live remainder (character
persistence, spell library CRUD, Discord, export) should be tightened into a clearly
documented `classicVanilla` API.

**B2. Five separate `text/babel` blocks** (`4765`, `5377`, `6723`, `7002`, `7062`) plus
two plain script blocks. Each Babel block is a separate parse/compile. Consolidating to
one block is a cheap win; longer term, components could move to `.jsx`-style files only
if a build step is ever adopted (out of scope for this plan).

**B3. ~2,800 lines of CSS inline** (`index.html:25–2831`) against a 20-line
`theme.css`. There is also a nested `<style>` tag *inside a JS template string* at
`index.html:3815` (part of the export path — verify intent before touching). Extract
page CSS to `classic.css`; promote genuinely shared rules (cards, buttons, accordions,
focus-visible) into `theme.css` so wizard/storyteller can stop re-declaring them.

### C. PWA / service worker (`sw.js`)

- `ASSETS_TO_CACHE` is stale: missing `storyteller.html`, `theme.css`,
  `shared/nav.js`, `shared/session.js`, `js/scene.js`, `js/glossary.js`, and all icons.
  A first offline load of those pages will fail.
- Cache-first for HTML means users run stale code until `CACHE_NAME` is manually
  bumped (currently `v49`). Switch HTML navigation requests to network-first with
  cache fallback; keep cache-first for static assets.
- CDN responses are implicitly never cached (`response.type !== 'basic'`) — fine, but
  document it: the app is *not* actually offline-capable while React/Babel/Firebase
  come from CDN. Either cache the CDN scripts explicitly or state the limitation.

### D. Repo, branch & documentation hygiene

- **Current branch is stale.** `fix/mirror-spell-results-to-window` tracks a deleted
  remote; its first commit merged as PR #48, and its second (`fd5c698 StorytellerFix`)
  appears superseded by PR #49 on main but the storyteller.html diff is not identical —
  reconcile (diff against main, salvage anything real, then delete). **All execution
  phases below should branch from fresh `main`.**
- Many merged/abandoned `claude/*` branches — prune.
- `.claude/worktrees/**` shows as untracked clutter in every `git status` — add to
  `.gitignore` (currently it contains only `*.ps1`).
- `Get-SystemDiagnostics.ps1` / `Remove-UserProfiles.ps1` are unrelated IT scripts in
  the working tree (ignored, untracked) — consider relocating them out of this project.
- `js/README.md` is a placeholder ("trying to organize my files") — replace with a real
  module overview (done alongside this plan).
- `HANDOFF_*.md` files for completed work sit at the repo root — move to `docs/archive/`.
- `data/tilts_conditions.csv` is referenced by nothing in the code (storyteller's CSV
  importer generates its own template). Confirm whether it is seed data worth keeping;
  if so, document it, else remove.

### E. Quality & safety spot-checks (review-as-you-go items)

- **Webhook privacy:** Discord webhook URLs are stored on the character object
  (`character.discord.*`). Verify whether the character JSON export includes them — a
  shared character file would leak a postable webhook URL. If so, strip on export or
  warn. (`sessionPushSheet` correctly omits them.)
- Vanilla code builds `innerHTML` from template strings (e.g. dropdown population,
  spell cards). Sources are internal data today, but spell *names* are user input —
  audit the export/render paths for unescaped interpolation.
- Error handling around `fetch` to webhooks is `alert()`-based; consistent toast usage
  exists (`showToast`) — standardize.
- Firebase API key in client code is expected for Firebase, but the security posture
  lives in RTDB/Firestore **rules**, which are not in this repo. Add a phase task to
  export the rules into `docs/firebase-rules.md` so they're reviewable.
- No automated tests exist. `spellFactors.js`/`dicePool.js` are pure-function global
  scripts — a tiny browser test page (or Node `vm` runner) would lock the rules math
  before Phase 4 touches it. Strongly recommended as a prerequisite to A1.

---

## 3. Execution phases

Ordered by value-vs-risk. Each phase = one branch from `main`, one PR, smoke-tested
on all three pages, and ends with a `docs/ARCHITECTURE.md` update.

### Phase 0 — Hygiene & living documentation *(low risk, do first)*
1. Add `.claude/worktrees/` to `.gitignore`.
2. Reconcile/delete the stale `fix/mirror-spell-results-to-window` branch; prune merged
   `claude/*` branches (local + remote).
3. Create `docs/ARCHITECTURE.md` from the snapshot in §1 (pages, modules, bridges,
   Firebase schema — lift the excellent comment block from `shared/session.js`).
4. Move completed `HANDOFF_*.md` to `docs/archive/`.
5. Resolve `data/tilts_conditions.csv` (document or delete).
- **Verify:** `git status` clean; all pages still load (no file moves touch runtime).

### Phase 1 — Test harness for the rules engine *(prerequisite for Phase 4)*
*(Done 2026-06-11: `tests/run.mjs` — 105 unit tests + 4,084-case drift sweep.
All drift traced to four causes; see `docs/engine-drift.md`. One live wizard
bug found: W1, ritual dice leak into Instant casts.)*
1. Add `tests/engine.html` (or `tests/run.mjs` with a tiny loader) exercising
   `spellFactors.js` + `dicePool.js`: free Reach, Paradox per Gnosis, factor penalties,
   Yantra caps, casting-method differences.
2. Capture current outputs of **both** engines (shared JS vs wizard's inline copy) over
   a grid of inputs; document any drift found — those are live rules bugs to triage.
- **Verify:** test page green; drift report written to `docs/engine-drift.md`.

### Phase 2 — Shared Firebase init + session layer merge
*(Done 2026-06-11: `shared/firebase.js` created, three inline config blocks
deleted; duplicate `scene*` call sites renamed to their `session*` equivalents;
the 7 genuinely unique scene-room helpers moved verbatim into
`shared/session.js`; `js/scene.js` deleted. Bonus: retired a latent bug —
scene.js's `scenePushParadoxLog` reassigned a `const` and would have thrown
once a player's paradox log exceeded 20 entries; the session.js version is
correct.)*
1. New `shared/firebase.js`: config + `_fbApp`/`_fbDb` (+ Firestore/Auth init guards).
   All three pages load it; delete the three inline config blocks.
2. Merge unique `scene*` functions into `shared/session.js`; delete `js/scene.js`;
   update the script tags and call sites (index + wizard).
- **Verify:** scene create/join/leave round-trip between wizard and storyteller;
  compendium still loads in index.

### Phase 3 — Single source of truth for game data
1. New `js/gameData.js`: `ARCANA`, `PATHS`, `ORDERS`, `PRACTICES`, `GNOSIS_CHART`,
   and `ARCANUM_COLORS` with **both** CSS hex and Discord int forms (canonical values
   in §A2), lowercase keys + a Title Case lookup helper.
2. `js/character.js`, `index.html` (`SL_ARC_COLORS`), and `wizard.html` consume it;
   delete the local copies.
- **Verify:** spell cards / dots / Discord embeds show identical colors on all pages.

### Phase 4 — Wizard adopts the shared spell engine *(highest care)*
1. Load `js/spellFactors.js` + `js/dicePool.js` in wizard.html.
2. Replace wizard's inline tables/Yantra/Reach/Paradox math with calls into the shared
   engine, resolving any drift per the Phase 1 report (decide which behavior is correct
   rule-by-rule — record decisions in `docs/engine-drift.md`).
- **Verify:** Phase 1 tests green; side-by-side manual casts (improvised/praxis/rote ×
  standard/advanced factors) produce identical pools, Reach, Paradox, Mana in Classic
  and Wizard.

### Phase 5 — CSS extraction
1. Move `index.html` inline CSS to `classic.css`; promote shared primitives to
   `theme.css`; leave page-specific rules page-local.
2. Investigate the nested `<style>` inside the export template (`index.html:~3815`).
- **Verify:** pixel-level eyeball of all index views (form, results, drawers, modals,
  desktop 3-col grid and mobile) plus wizard/storyteller unchanged.

### Phase 6 — index.html vanilla cleanup (finish "Phase 8")
1. Dead-code audit of the `2890–4405` block; delete helpers superseded by React state.
2. Consolidate the five Babel blocks into one.
3. Write the surviving `classicVanilla` API into `docs/ARCHITECTURE.md` (name, args,
   purpose for each method) — this is the contract between the two halves.
- **Verify:** full Classic smoke: load/save/new character, cast, save-to-library,
  load-from-library, export, combined spells, active spells, scene pill, Discord sends.

### Phase 7 — Shared Discord layer
1. `shared/discord.js`: `postDiscord`, embed builders (dice pool, spell card, paradox,
   clash), color via `gameData`.
2. index (vanilla + ClashPill) and wizard consume it.
3. Decide and implement the webhook-in-export policy (§E).
- **Verify:** test webhook fires from all send buttons on both pages; embeds visually
  unchanged in Discord.

### Phase 8 — Service worker overhaul
*(Done 2026-06-11, pulled ahead of Phases 3–7 after Phase 2 verification caught
the stale-cache problem live. sw.js rebuilt: network-first for ALL same-origin
requests — not just navigations — so per-release CACHE_NAME bumps are no longer
needed; full precache for all three pages; CDN runtime (React/Babel/Firebase
SDKs/fonts) cached cache-first in CORS mode, making the app offline-capable;
Firebase data + Discord traffic never intercepted; SW now registered from all
three pages, not just index.)*
1. Complete `ASSETS_TO_CACHE`; network-first for navigations, cache-first for assets.
2. Document the CDN/offline limitation (or cache CDN scripts deliberately).
3. Consider deriving `CACHE_NAME` from a date/commit string to make bumps mechanical.
- **Verify:** offline reload of all three pages after one online visit; update flow
  (new SW takes over) still works.

### Phase 9 — Tilt catalog module + player tilt tooltips *(feature-flavored consolidation)*
Salvaged from an abandoned worktree (2026-06-11): extract storyteller.html's inline
Firestore tilt catalog into a shared `js/tiltCatalog.js` module exposing
`window.tiltCatalog` + a `TiltBadge` React component, and use `TiltBadge` in
wizard.html's tilt strip so **players** see tilt descriptions on hover, not just the
ST. A clean earlier implementation (written against an older storyteller.html — do not
merge as-is, re-implement against current code) is preserved as
`docs/reference/tiltCatalog.js`.
- **Verify:** ST catalog import/export/dropdown unchanged; wizard tilt badges show
  hover descriptions for catalog entries and degrade gracefully for custom tilts.

### Phase 10 — Compendium unification *(largest; optional / schedule separately)*
Converge `js/spellCompendium.js` (vanilla) and wizard's `CompendiumOverlay` (React) on
one React implementation mounted on both pages. Requires its own design pass — role
flows, edit/suggest queues, and index's drawer layout differ. Write a short design doc
first (`docs/compendium-unification.md`).

*(Phase numbering note: Phases 9/10 were renumbered on 2026-06-11 when the tilt
catalog task was salvaged from an abandoned worktree.)*

---

## 4. Verification & tooling notes for executing agents

- **Serve, don't open via `file://`:** run `npx serve` from the worktree (it can die
  between sessions — restart it). Babel/CORS behave differently from disk.
- Smoke flows live in each phase's Verify line; when touching anything visual, use the
  preview/screenshot tooling against desktop **and** narrow widths (Classic is
  desktop-first by design — do not mobile-ify it; Wizard is the mobile flow).
- Firebase is shared live infrastructure — use a throwaway session code for testing,
  never write to other sessions' paths.
- Known bridge gotcha (from migration notes): vanilla init code must null-guard
  `getElementById` for React-rendered nodes; a stale listener on a removed element
  aborts the whole `DOMContentLoaded` handler.

## 5. Documentation deliverables checklist

- [x] `docs/ARCHITECTURE.md` — living overview (Phase 0, updated every phase)
- [x] `js/README.md` — real module index (done with this plan)
- [x] `docs/engine-drift.md` — Classic vs Wizard rules-math drift + decisions (Phase 1; Phase 4 records resolutions)
- [ ] `docs/firebase-rules.md` — exported RTDB/Firestore rules for review (§E)
- [ ] `docs/compendium-unification.md` — design doc before Phase 9
- [ ] `docs/archive/` — completed HANDOFF docs moved out of the root
