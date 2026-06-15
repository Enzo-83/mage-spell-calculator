# Electronic Grimoire — Presentation Plan & Outline

**Title:** Electronic Grimoire — MtAw 2nd Ed. Spellcasting Aide
**Purpose:** Introduce new users to the app and explain advanced features to veterans.
**Format:** Web deck built on **reveal.js** (CDN, no build step — matches the app's philosophy).
**Visuals:** **Live-app `<iframe>` demos** for UI tours + custom SVG diagrams for concepts (screenshots as fallback).
**Style:** Self-guided read — slides carry their own explanation.
**Structure:** One unified deck (basics → collaborative → mastery) with a clearly-marked **Advanced Appendix**.

*Status: PLAN — outline for review. No slides built yet.*

---

## 1. Audience & narrative arc

The deck doubles as onboarding and reference. The spine is the app's **three faces**,
framed by one mental model:

> **Set up once in Classic → cast every session in Wizard → the ST runs the table in Storyteller.**

1. **Classic** (`index.html`) — where you *build & manage* your mage (desktop, full editor,
   spell library). The full character editor lives **only here** — this is deliberate
   (see §2), so first-time setup happens in Classic (or by importing a `.json`).
2. **Wizard** (`wizard.html`) — where you *cast* (guided, mobile, every session). It loads
   a character but cannot create a usable one — "New Character" yields a blank stub.
3. **Storyteller** (`storyteller.html`) — the ST's table-running screen.

New users read front-to-back through Act 1–3 (set up, then cast). Veterans skim to
Act 4–5 + the appendix.

---

## 2. Decisions (locked)

| Decision | Choice |
|----------|--------|
| Title / tagline | **Electronic Grimoire — MtAw 2nd Ed. Spellcasting Aide** |
| Delivery format | reveal.js web deck (CDN, single `index.html` in `presentation/`) |
| Visuals | **Live-app `<iframe>` demos** for UI tours + SVG diagrams for concepts. Screenshots used only as fallback posters and for write-side flows that shouldn't run live (Discord sends, session writes). |
| Slide style | **Self-guided read** — fuller on-slide text + callouts; speaker notes are secondary. |
| Emphasis | **Character creation** (Act 1) and **spell create / save / load** (Act 3) get expanded, careful, multi-slide treatment. |
| Structure | Unified deck + Advanced appendix |
| Onboarding flow | **Character editor stays Classic-only** (no Wizard editor work). New users build/import in Classic, then cast in Wizard. The deck teaches this explicitly. |
| Deploy | Lives in `presentation/` — also publishable via the existing GitHub Pages workflow (bonus: linkable as an in-app "Tour") |

---

## 3. Tech approach

- **reveal.js 4.x from CDN** (cdnjs), mirroring how the app loads React/Babel/Firebase — keeps the no-build invariant.
- Single `presentation/index.html`. Self-guided: on-slide text carries the explanation; reveal's `notes` plugin (press `S`) holds optional extras only.
- Custom theme stylesheet `presentation/grimoire-theme.css` deriving the app's tokens.
- **Live-app demos are the core visual.** Tour slides reserve a framed "device" `.live-slot` beside the text; a single **persistent `<iframe>` per app** (Wizard / Classic / Storyteller) is created once and positioned over the active slide's slot by script. Same-origin, so framing just works when served from the project root (deck at `/presentation/`, app at `/wizard.html` etc.).
  - **One instance, never reloaded.** The frames live in a `#live-layer` *outside* `.reveal` and are merely hidden (never unloaded) when off their slide — so a loaded character and an in-progress cast survive moving between slides. (The original per-slide, lazy-loaded iframes reloaded the app on every navigation and lost that state.)
  - **Desktop apps keep their desktop layout.** Each frame is scaled from a fixed logical width — Classic/Storyteller at **1280px** (clearing their 1024px desktop breakpoint), the Wizard fills its phone bezel 1:1. Living outside `.reveal` also dodges reveal's `.reveal iframe{max-width:95%}`, which would otherwise clamp a Classic frame below the breakpoint and force its mobile layout.
  - **Device gating.** On phones the desktop-only slots are hidden and their apps aren't loaded at all (a screenshot poster shows instead); the Wizard slots stay live on both viewports. Frames also hide in reveal's overview/paused modes.
  - **Don't live-demo write-side actions** (Discord webhook posts, live session writes) — those slides use screenshots, or a throwaway/sandboxed session if a live demo is truly wanted.
- Fragments for progressive reveals; `data-auto-animate` for the Reach-economy build.

### File structure
```
presentation/
  index.html                 # the reveal.js deck
  grimoire-theme.css         # dark/arcana theme for the deck
  PRESENTATION_OUTLINE.md    # this file
  assets/
    screenshots/             # captured from the live app
    diagrams/                # hand-built SVGs (three-faces, reach, sync)
    brand/                   # app icon/logo
```

---

## 4. Design system

Pull directly from `theme.css` so the deck *is* the app's look:

| Token | Value | Use in deck |
|-------|-------|-------------|
| `--bg-deep` | `#0f0f23` | slide background |
| `--bg-dark` | `#1a1a2e` | section dividers |
| `--bg-card` | `#16213e` | cards / callout boxes |
| `--accent` | `#7b2cbf` | headings, rules |
| `--accent-light` | `#9d4edd` | emphasis, links |
| `--text` / `--text-muted` | `#e6e6e6` / `#a0a0a0` | body / captions |
| `--warning` | `#e9c46a` | Paradox / cautions |
| `--success` | `#2a9d8f` | "do this" callouts |
| `--discord` | `#5865F2` | Discord-feature slides |

**Arcana accent palette** (use for the 10-Arcana slide and as per-section color coding):
Death `#475569` · Fate `#e2e8f0` · Forces `#f87171` · Life `#4ade80` · Matter `#d97706` ·
Mind `#fbbf24` · Prime `#60a5fa` · Space `#a78bfa` · Spirit `#fb923c` · Time `#22d3ee`.

Type: a display serif for titles (mystical feel) + clean sans for body. Confirm against the app's actual fonts when capturing screenshots.

---

## 5. Asset pipeline

**Live embeds (primary)** — tour slides run the real app in an `<iframe>` from the same local/Pages origin; nothing to produce beyond wiring the URL + a framing wrapper.

**Screenshots (fallback + write-side flows)** — I serve the app locally (`npx serve`) and capture with the preview tools, for slides that shouldn't run live or want a static poster:
- Wizard: the Discord send (write-side); a results-card poster.
- Classic: character editor modal, the save-to-library flow, library export (PNG/print).
- Storyteller: player cards, scene log, tilt catalog.
- Compendium: browse grid + a spell detail.
- Discord: an example embed + dice-bot command in a channel.

**Diagrams (SVG, custom-built):**
- D1 — *The Three Faces & the mental model* (Classic = set up once · Wizard = cast every session · Storyteller = run the table), with the arrows showing the new-user path.
- D2 — *The Reach Economy* (within free Reach = no cost; exceeding it adds Paradox dice, with Mana as an optional 1-for-1 offset). Auto-animated build.
- D3 — *Live Session Sync* (Player apps ↔ Firebase RTDB ↔ Storyteller screen).
- D4 — *Compendium roles* (suggester → sub-editor → editor → admin flow).
- D5 — *A cast, end to end* (character → factors → yantras → dice pool → roll → Discord).

---

## 6. Slide-by-slide outline

> Legend: **[LIVE]** = live-app `<iframe>` demo · **[SS]** = screenshot/poster · **[DIA]** = diagram · **[TXT]** = text/layout only.

### Act 0 — Orientation
1. **Title** — "Electronic Grimoire — MtAw 2nd Ed. Spellcasting Aide." App icon, one-line hook. **[TXT/brand]**
2. **Why it exists** — spell-factor math is fiddly; tracking mana/Paradox/active spells across a session is error-prone. The app does the bookkeeping so you play. **[TXT]**
3. **The three faces & how they fit** — the mental model: *set up once in Classic → cast every session in Wizard → ST runs the table in Storyteller.* **[DIA D1]**
4. **Get started in 30 seconds** — open the URL, "Install" as a PWA, works offline. Live landing embed. **[LIVE/SS]**

### Act 1 — First-time setup: build your mage (Classic) · *treated with care*
> Framing slide: *new characters are built in Classic (or imported). Wizard is for casting — its "New Character" is just a blank stub.*
5. **Two ways to get a character** — build one in Classic, or import a `.json` (from a friend or your ST). What a character holds: Gnosis, Arcana, Path/Order, skills. **[DIA/TXT]**
6. **Editor I — identity** — name / shadow name, Path, Order, Gnosis, Wisdom; what each drives. **[LIVE]**
7. **Editor II — the casting stats** — Arcana dots & skills (the numbers that actually feed the dice pool). **[LIVE]**
8. **Save & carry your mage** — download the `.json`; it's your portable backup and round-trips into Wizard/Storyteller. Webhooks travel with it — privacy callout. **[LIVE/SS]**

### Act 2 — Casting every session (Wizard)
9. **Load your mage in Wizard** — import the `.json`, or resume the locally-stored character. **[LIVE]**
10. **Casting, step by step** — the Wizard flow: Arcanum → Practice → Factors → Yantras. **[LIVE]**
11. **Reading your result** — dice pool, Reach used/free, Mana cost, Paradox flag. **[LIVE + callouts]**
12. **Roll it** — send the pool to Discord; the dice-bot command it generates. **[SS, Discord-themed]**

### Act 3 — Spells: create, save, load (Classic) · *treated with care*
13. **The spell library, explained** — rotes vs. praxes vs. improvised favorites: what each is and when you'd use it. **[DIA/TXT]**
14. **Create & save a spell** — build it in the calculator, "Save to Library", name it, pick the type. **[LIVE]**
15. **Load & re-cast** — pull a saved spell back into the calculator; "update existing" vs. save-new. **[LIVE]**
16. **Edit, organize, export** — edit/delete spells; export the whole library to PNG/print. **[LIVE/SS]**
17. **Wizard can save too** — Wizard saves to the same library, but *managing/editing* lives in Classic. **[TXT/SS]**

### Act 4 — Power user (Classic)
18. **Classic at a glance** — the whole calculator on one screen; when to prefer it over Wizard. **[LIVE]**
19. **Combined spell casting** *(Classic-only)* — casting multiple spells together; lowest-Arcanum & combination penalties. **[LIVE]** ⟶ *also in appendix*
20. **Spell factors & the Reach economy** — potency/duration/scale/range; within free Reach = no cost, exceeding it adds Paradox dice (Mana optionally offsets them 1-for-1). **[DIA D2]**

### Act 5 — Together at the table
21. **The shared Compendium** — browse the community spell library; arcanum-grouped grid; spell details. **[LIVE]**
22. **Contributing** — suggest a spell; roles (suggester → sub-editor → editor → admin). **[DIA D4]**
23. **Live sessions** — connect to a scene; player stats sync in real time. **[DIA D3]**
24. **The Storyteller screen** — player cards (health/mana/WP/Paradox), scene log, sheet viewer & ST overrides. **[LIVE/SS]**
25. **Tilts & Conditions** — hover-tooltip catalog; ST imports the CSV so players see descriptions. **[SS/LIVE]**

### Act 6 — Mastery
26. **Help is built in** — glossary tooltips on tricky terms; the in-app Roll-Quality / n-Again hints. **[LIVE/SS]**
27. **Tips & gotchas** — *build in Classic / import — Wizard "New Character" is blank*; Grimoire rotes can't be cast Instant; webhook privacy in exports; offline use. **[TXT]**
28. **Closing** — recap the mental model, where to find it, how to give feedback. **[TXT/brand]**

### Advanced Appendix (clearly marked divider)
A1. **Anatomy of a cast** — full pipeline, character → Discord. **[DIA D5]**
A2. **Clash of Wills** — opposed-pool resolution and how the app builds it. **[LIVE/SS]**
A3. **Discord setup deep-dive** — webhooks per character, embeds vs. bot commands, the §E privacy policy. **[SS + TXT]**
A4. **Power-user workflow** — Combined casting + library + live session together in one scene. **[LIVE/DIA]**
A5. **Under the hood (optional)** — static pages, Firebase RTDB + Firestore, PWA caching; for the curious/maintainers. **[DIA]**

*~28 core slides + 5 appendix. Trim or expand per feedback.*

---

## 7. Build milestones

1. **Approve this outline** (you) — adjust ordering, depth, what to cut.
2. **Asset gathering** — run the app, capture the screenshots listed in §5; build D1–D5 SVGs.
3. **Deck scaffold** — `presentation/index.html` + `grimoire-theme.css` with reveal.js wired and the title/divider slides.
4. **Fill content** — slides + speaker notes, Act by Act.
5. **Review pass** — read in browser (I can serve + screenshot it), fix flow/visuals.
6. **(Optional) publish** — link from the app nav or leave standalone.

---

## 8. Status — first full draft built ✅

The complete deck is built and verified in-browser: **40 slides** across all 6 acts +
appendix, responsive (desktop ↔ phone), with live device-aware embeds and the
D1–D5 diagrams.

- `presentation/index.html` — reveal.js deck (CDN, no build step).
- `presentation/grimoire-theme.css` — theme + components, derived from `../theme.css`.
- Diagrams built as themed HTML/CSS (not external SVG): D1 three-faces, D2 reach
  economy, D3 session sync, D4 compendium roles, D5 cast pipeline. Discord shown via a
  styled message mock (reliable, no live webhook send).
- Live embeds: **one persistent `<iframe>` per app** in a `#live-layer` outside
  `.reveal`, positioned over each slide's `.live-slot` (and hidden, never unloaded,
  off-slide) so a loaded character + in-progress cast survive slide changes. Wizard
  (phone frame, both viewports) on the casting slides; Classic & Storyteller (desktop
  layout at 1280px logical, scaled to fit, desktop-only) on their slides — hidden on
  phones with a screenshot poster + "open on desktop" note. The Wizard itself also
  checkpoints its cast to `sessionStorage`, so a full deck reload restores it too.

**Verified:** 40/40 slides present; theme + fonts; responsive reflow (420×800 canvas +
column stacking on ≤768px, confirmed via computed styles + screenshots); D2/D4 +
Discord mock + D3 (structural) render correctly.

**Mobile posters for desktop-only slides — DONE.** Real screenshots captured to
`presentation/assets/screenshots/` and wired as `.only-mobile` posters on slides 7
(`classic-editor.png`), 22 (`classic.png`), and 29 (`storyteller-session.png`). On
desktop the live embed shows and the poster is hidden; on phones the poster shows and
the embed is hidden (and not loaded). Verified via computed styles + screenshot.
- Capture method (for re-shoots): a headless browser writes straight to PNG.
  Static views work with `chrome --headless=new --screenshot --virtual-time-budget`.
  Live-data views (the populated ST dashboard) need a DOM-wait, since virtual-time
  doesn't wait for Firebase's websocket — use a tiny Node CDP script (Node 24 has
  global `WebSocket`/`fetch`) that seeds a throwaway session, drives the rejoin form,
  waits for the dashboard, then `Page.captureScreenshot`. Delete the throwaway session
  after.

**Vertical centering — DONE.** Slides are vertically centered (confirmed via geometry +
1280×720 captures: balanced top/bottom gaps). Hardened against the web-font load race
by re-running `Reveal.layout()` on `document.fonts.ready` + window load + a short
timeout — FOUT changed measured heights, which had made early captures look top-heavy.

**Tour nav link — DONE.** `shared/nav.js` now shows a gold "⟡ Tour" entry on all three
app pages, opening `presentation/` in a new tab (so the app/session isn't lost).

**Known follow-ups / polish (optional):**
- The app's service worker (scope `/`) can serve a *stale* cached copy of the deck
  HTML during local dev — hard-refresh (or unregister SW) after edits. Network-first
  should self-refresh on GitHub Pages.

*Resolved decisions: title = "Electronic Grimoire — MtAw 2nd Ed. Spellcasting Aide"; live interactive demos (not screenshots); emphasis on character creation + spell create/save/load; self-guided style; character editor stays Classic-only ("build in Classic → cast in Wizard").*
