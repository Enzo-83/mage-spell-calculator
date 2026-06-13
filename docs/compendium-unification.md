# Compendium Unification — Design (Code Review Plan, Phase 10)

*Written 2026-06-12, before implementation. The plan requires this design pass
because the two existing compendium UIs differ in role flows, edit/suggest
queues, and layout.*

## 1. Current state

| | Classic (`js/spellCompendium.js`, vanilla, ~1,500 lines) | Wizard (`CompendiumOverlay` in wizard.html, React, ~340 lines) |
|---|---|---|
| Browse | Arcanum-grouped collapsible groups of rich cards, persisted collapse state | Flat list of compact expandable rows |
| Filters | Search + book + arcanum + **practice** | Search + book + arcanum |
| Auth | Google sign-in, role badge | Same |
| Add to library | Modal: rote/praxis/improvised + rote skill & creator; duplicate detection; switches to the target tab | Bottom sheet: rote/praxis/favorite + rote skill & creator; duplicate detection |
| Edit / delete spells | ✅ (editor, admin) | ❌ |
| Suggest an edit | ✅ full editor in suggestion mode | Separate `SuggestSpellDrawer` (book + description + note only), used from StepSpell library cards |
| Suggestions inbox | ✅ (editor, admin) | ❌ |
| Admin panel | ✅ role grants + CSV/JSON bulk import/export/templates | ❌ |
| Rendering | `innerHTML` strings into `#spellLibraryContent` (hosted by the React drawer's `SLCompendiumView`), 4 static modals, `spellLibraryAPI` window bridge | Plain React with inline styles |

### Live drift bugs (fixed by this phase)

1. **Suggestion schema split.** Wizard writes `submitterId` and stores the
   *suggester's* note in `reviewNote`; Classic writes `submittedBy` and uses
   `reviewNote` for the *editor's* review note. Classic's approve flow copies
   `doc.data().submittedBy` into `createdBy` — `undefined` for
   wizard-submitted docs, and Firestore rejects `undefined` field values, so
   **approving a wizard-submitted suggestion fails**.
2. **Wizard reach-option crash.** `CompendiumOverlay` renders each reach
   option directly as a React child. Compendium documents store reach options
   as `{cost, effect}` objects (editor, importer, and sanitiser all produce
   that shape), so expanding any spell that has reach options throws
   *“Objects are not valid as a React child”*.
3. **Dead API.** `window.compendiumModule.suggestFromSpell` (suggest from a
   personal-library card) lost its only caller when the Classic library
   drawer went React; `spellLibraryAPI.renderLibrary`/`_refreshIfActive`'s
   library re-render exists only to support that vanished button.

## 2. Goal

One React implementation of the compendium, mounted on both pages, with zero
behavioural drift between them. Per the app's design invariants
(ARCHITECTURE.md): Classic stays desktop-rich, Wizard stays mobile-flat — so
**logic, data flows, and feature set are 100 % shared; the card layout is a
`variant` prop**, the same envelope-vs-fields split the Discord layer
(Phase 7) used.

## 3. Design

### 3.1 Vehicle

Rewrite `js/spellCompendium.js` in place as a **no-JSX React module** —
plain script, `React.createElement` (aliased `h`), loads before Babel.
Same proven pattern as `js/glossary.js` and `js/tiltCatalog.js`; namespaced
globals only (Babel blocks run in global scope). Keeping the filename keeps
`sw.js`'s precache list unchanged — no `CACHE_NAME` bump (network-first since
Phase 8).

### 3.2 Module API

```
window.compendium = {
  // data
  BOOKS,                        // source-book registry (single copy; wizard's COMP_BOOKS deleted)
  useSpells(),                  // hook: live spell array (lazy onSnapshot subscribe, tiltCatalog pattern)
  useAuth(),                    // hook: { user, role } (single onAuthStateChanged + userRoles fetch)
  signIn(), signOut(),
  // CRUD (editor/admin)
  addSpell(data), updateSpell(id, data), deleteSpell(id),
  // suggestions
  submitSuggestion(spellData, submitterNote),   // canonical schema, see 3.4
  fetchPendingSuggestions(), reviewSuggestion(id, approved, note),
  // admin
  listRoles(), grantRole(uid, email, role), revokeRole(uid),
  importSpells(rawArray, overwrite, onProgress), exportJson(), exportCsv(),
  downloadJsonTemplate(), downloadCsvTemplate(),
  // pure helpers — exported for the test harness
  csvToSpells(text), validateSpell(s), sanitiseSpell(s),
};

window.CompendiumPanel  // React component (no JSX)
  props: {
    variant:        'classic' | 'wizard',
    character,      // current character or null (null ⇒ add buttons disabled)
    onAddToLibrary, // (librarySpell, type) => void — type is canonical 'rote'|'praxis'|'improvised'
    onAfterAdd,     // optional (type) => void — Classic switches the drawer tab
    onClose,        // wizard only — renders the ✕ in the panel header
  }
```

`CompendiumPanel` owns everything below the page chrome: auth bar, search +
**three** filters (wizard gains the practice filter), spell list, add-to-library
sheet, editor (add / edit / suggest mode), suggestions inbox, and (Classic
only) the admin panel. All overlays are React-rendered — the four static
modals in index.html are deleted.

The add flow maps a compendium doc to a personal-library spell **inside the
shared panel** (the `defaults` merge currently in `_confirmAdd`), then emits
it via `onAddToLibrary`; each page persists it its own way (Classic:
`classicVanilla.addSpell`; Wizard: its existing `handleCompendiumAddSpell`
storage, mapping canonical `'improvised'` to its stored `'favorite'` type).

### 3.3 Variant differences (the *only* allowed ones)

| Aspect | classic | wizard |
|---|---|---|
| List layout | Arcanum-grouped collapsible card grid (current look, incl. persisted collapse state) | Flat compact expandable rows (current look) |
| Overlay chrome | `.modal-overlay`-style centered modals | Full-card absolute sheets (current overlay idiom) |
| Admin panel (roles + bulk import/export) | ✅ | ❌ — desktop tooling; file-picker/CSV workflows don't belong in the 440 px card. The Roles/Import buttons simply don't render. |
| Styling | Inline styles + `var(--token)`; orphaned `comp*`/`suggestion*`/`admin*`/`add-to-lib*`/`import-status` selectors removed from classic.css (audit `role-badge`/`source-badge` for other users before deleting) | Inline styles + `var(--token)` |

Wizard **gains**: practice filter, spell editor (add/edit/delete for
editor/admin roles), suggestions inbox, suggest-an-edit on compendium cards,
and correct reach-option / optional-arcana rendering.

### 3.4 Canonical suggestion schema (drift resolution)

```
suggestions/{id}: {
  spell:         { ...spell fields },
  submittedBy:   uid,            // wizard's `submitterId` retired
  submitterName: displayName/email,
  submitterNote: string,         // NEW — the suggester's note to editors
  submittedAt:   serverTimestamp,
  status:        'pending'|'approved'|'rejected',
  reviewNote:    string,         // the EDITOR's note, set on review
  reviewedBy, reviewedAt,
}
```

- Both pages submit through `compendium.submitSuggestion` — wizard's
  `SuggestSpellDrawer` keeps its UI but its Firestore write is replaced.
- The inbox displays `submitterNote` and tolerates legacy docs
  (`submittedBy || submitterId`; old wizard notes surface from `reviewNote`
  when `status === 'pending'`).
- Approve hardening: `createdBy: sug.submittedBy || sug.submitterId || 'unknown'`
  (fixes the undefined-field failure).

### 3.5 Page integration

**index.html**
- `SLCompendiumView` → `h(window.CompendiumPanel, { variant:'classic', character, onAddToLibrary, onAfterAdd })`
  using the drawer's existing `character` state and `classicVanilla.addSpell`.
- Delete: the four static modals (`addToLibraryModal`, `compendiumEditorModal`,
  `suggestionsModal`, `adminPanelModal`), `initCompendium()` call,
  `window.spellLibraryAPI`, and the dead `compendiumModule` global.

**wizard.html**
- `CompendiumOverlay` becomes a thin absolute-positioned shell around
  `CompendiumPanel` (variant `'wizard'`, passing `onClose`).
- App's `compUser`/`compRole` state + `onAuthStateChanged` effect →
  `compendium.useAuth()` (header button and StepSpell suggest-visibility keep
  working unchanged).
- `COMP_BOOKS` const deleted (use `compendium.BOOKS`).
- `SuggestSpellDrawer` submits via `compendium.submitSuggestion`.

**storyteller.html** — untouched (doesn't use the compendium).

### 3.6 Out of scope

- Firestore rules changes (none needed; roles already gate writes server-side).
- Any change to the compendium **document** schema — only `suggestions` gains
  the additive `submitterNote` field.
- Visual redesign of either page's list.

## 4. Testing & verification

- **Harness** (`node tests/run.mjs`): new unit tests for the exported pure
  helpers — `csvToSpells` (quoting, cost-prefixed reach, optArcana pipes,
  comment rows, BOM), `validateSpell`, `sanitiseSpell` (defaults merge,
  invalid secondary arcanum dropped). Suite must stay at 0 engine drift.
- **Live smoke** (npx serve): both pages — anonymous browse of the live
  compendium (read is public), all filters, card expand, reach options render
  (the wizard crash repro), add-to-library with a character on both pages.
  Editor / inbox / admin render-paths exercised with stubbed auth + Firestore
  in-page (rules deny unauthenticated writes — Phase 9 pattern); real
  role-gated writes verified by the admin (user) post-merge.
- **Docs**: ARCHITECTURE.md (module table, delete `spellLibraryAPI` bridge
  row, consolidation note), js/README.md, plan done-note.

## 5. Risks

- Largest single rewrite of the plan (~1,500-line module + integration on two
  pages). Mitigation: the service core is a near-mechanical port of the
  vanilla module's already-reviewed logic; only the render layer is new.
- No-JSX verbosity — accepted; precedent (tiltCatalog) and an `h` alias keep
  it readable.
- Legacy pending suggestions in Firestore must keep rendering in the inbox
  (handled, §3.4).
- Classic visual regression risk in the grouped list — mitigated by porting
  card markup/classes 1:1 where practical and screenshot-comparing at desktop
  width.
