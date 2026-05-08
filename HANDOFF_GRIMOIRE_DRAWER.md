# Handoff: Electronic Grimoire — Drawer Redesign

## Problem

The Electronic Grimoire currently occupies a permanent 360px column on the right side of the landscape layout (`grid-template-columns: 1fr 360px`). This steals ~27% of screen width at all times, even when the user is focused on configuring a spell and not consulting their library. The grimoire is a **reference tool**, not a primary workspace — it should be available on demand, not always visible.

## Goal

Convert the Electronic Grimoire from a fixed grid column into a **slide-in drawer** that overlays from the right edge. The calculator reclaims the full container width when the drawer is closed. The user can open the drawer to consult their spell library while configuring a spell, then dismiss it to focus on the form.

## Design Spec

### Layout Changes

**Current (remove):**
```css
@media (min-width: 1024px) {
    #app-layout {
        display: grid;
        grid-template-columns: 1fr 360px;  /* grimoire steals 360px */
        gap: 20px;
        align-items: start;
    }
    #classic-spelllib-root {
        position: sticky;
        top: 20px;
        height: calc(100vh - 40px);
        overflow: hidden;
    }
}
```

**New:**
```css
@media (min-width: 1024px) {
    #app-layout {
        display: block;  /* single column — calculator gets full width */
    }

    /* Drawer overlay */
    #classic-spelllib-root {
        position: fixed;
        top: 0;
        right: 0;
        width: 420px;
        height: 100vh;
        transform: translateX(100%);       /* off-screen when closed */
        transition: transform 0.3s ease;
        z-index: 300;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(123,44,191,0.3) transparent;
        box-shadow: -4px 0 24px rgba(0,0,0,0.5);
    }
    #classic-spelllib-root.grimoire-open {
        transform: translateX(0);          /* slide in when open */
    }
}
```

- **Width: 420px** — wider than the old 360px column because it's overlaying, not competing for grid space. More room for spell cards.
- **Full viewport height** (`100vh`) — no 20px offset needed since it's an overlay, not sticky.
- **CSS transition** on `transform` for smooth slide animation.
- **z-index: 300** — above the calculator but below modals (spell editor modal uses z-index in the 1000+ range).

### Toggle Button (Grimoire Tab)

Add a persistent **edge tab** on the right side of the viewport that opens/closes the drawer:

```css
.grimoire-toggle {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 301;                          /* above the drawer */
    writing-mode: vertical-rl;
    text-orientation: mixed;
    padding: 12px 6px;
    background: var(--bg-card);
    border: 1px solid rgba(255,255,255,0.1);
    border-right: none;
    border-radius: 8px 0 0 8px;
    color: var(--accent-light);
    font-family: 'Rajdhani', sans-serif;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.2s, right 0.3s ease;
}
/* When drawer is open, shift the tab to sit at the drawer's left edge */
.grimoire-toggle.grimoire-open {
    right: 420px;
}
```

**Label:** `⚡ Grimoire` (vertical text along the right edge).

**Behavior:** Clicking toggles `.grimoire-open` on both the toggle button and `#classic-spelllib-root`.

### Backdrop (Optional — Recommended)

Add a semi-transparent backdrop when the drawer is open so the user can click outside to dismiss:

```css
.grimoire-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.3);
    z-index: 299;                          /* behind drawer, above calculator */
}
.grimoire-backdrop.grimoire-open {
    display: block;
}
```

Clicking the backdrop closes the drawer.

### Keyboard

- **Escape** closes the drawer when open.

## Implementation Steps

### Step 1: CSS Changes (index.html, lines 2617-2630)

Replace the `#app-layout` and `#classic-spelllib-root` landscape media query rules. The `#app-layout` grid should become `display: block` at desktop (or remove the grid entirely since it's now single-column). Keep `#classic-spelllib-root` mobile styling as-is (block flow, no drawer behavior below 1024px).

The `.calculator-landscape` grid (`1fr 1fr` for input/output) stays unchanged — it still splits the calculator into two panels. But now each panel gets ~50% of the full container width instead of 50% of `(container - 360px)`.

### Step 2: Add Toggle Button + Backdrop HTML

Inside the `ClassicSpellLibraryDrawer` component (index.html, line 7677), or as a sibling rendered alongside it. The toggle button must be **outside** the drawer div so it remains visible when the drawer is closed.

**Recommended approach:** Wrap the drawer render in a React fragment that includes the toggle and backdrop:

```jsx
// In ClassicSpellLibraryDrawer, around line 7677
const [drawerOpen, setDrawerOpen] = React.useState(false);
const isLandscape = useMediaQuery('(min-width: 1024px)');
// Note: useMediaQuery doesn't exist — use window.matchMedia in a useEffect
// or just use a simple state + resize listener pattern (see helper below)

return (
  <>
    {/* Edge toggle tab — only at landscape */}
    {isLandscape && (
      <button
        className={`grimoire-toggle ${drawerOpen ? 'grimoire-open' : ''}`}
        onClick={() => setDrawerOpen(o => !o)}>
        ⚡ Grimoire
      </button>
    )}

    {/* Backdrop */}
    {isLandscape && drawerOpen && (
      <div className="grimoire-backdrop grimoire-open"
        onClick={() => setDrawerOpen(false)} />
    )}

    {/* Existing grimoire content — add class for open state */}
    <div className={drawerOpen ? 'grimoire-open' : ''}
      style={{ /* existing inline styles */ }}>
      {/* ... existing tab bar, content, modals ... */}
    </div>
  </>
);
```

**Media query helper** (no hooks library available — vanilla pattern):
```jsx
function useIsLandscape() {
  const [is, setIs] = React.useState(
    () => window.matchMedia('(min-width: 1024px)').matches
  );
  React.useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = e => setIs(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return is;
}
```

### Step 3: Escape Key Handler

Add a `useEffect` in `ClassicSpellLibraryDrawer` for Escape:

```jsx
React.useEffect(() => {
  if (!drawerOpen) return;
  const handler = e => { if (e.key === 'Escape') setDrawerOpen(false); };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [drawerOpen]);
```

### Step 4: Adjust Inline Styles on Grimoire Root

The `ClassicSpellLibraryDrawer` component currently sets `height: "100%"` on its root div (line 7680). At landscape in drawer mode this should become `height: "100vh"` since the container is now `position: fixed` with `height: 100vh`. The CSS on `#classic-spelllib-root` handles the fixed positioning, but the inner div needs to fill it.

**Change at line 7680:**
- Current: `height: "100%"`
- Keep as-is — `100%` will correctly fill the fixed-positioned parent.

No change needed — `height: 100%` of a `100vh` fixed parent is `100vh`.

### Step 5: Remove Grimoire-Specific Font Bumps (Optional Cleanup)

Lines 2659-2669 have font-size overrides for spell cards at landscape. These were compensating for the 360px squeeze. With 420px drawer width, review whether these are still needed or if they can be removed/adjusted. The wider drawer may allow slightly larger fonts.

### Step 6: Mobile Behavior — No Change

Below 1024px, the grimoire renders inline in normal block flow (after the calculator). No drawer behavior, no toggle button. The existing mobile layout is untouched.

## Key Files

| What | File | Lines |
|------|------|-------|
| App layout grid CSS | index.html | 2615-2630 |
| Calculator 2-panel grid CSS | index.html | 2632-2670 |
| Grimoire font overrides | index.html | 2659-2669 |
| ClassicSpellLibraryDrawer component | index.html | 7593-7769 |
| Grimoire render return | index.html | 7677-7766 |
| ReactDOM mount | index.html | 7769 |
| Container max-width | index.html | 2611 |

## Edge Cases

1. **Drawer open + spell load:** When user clicks "Load" on a spell card in the drawer, the spell populates the calculator form. The drawer should **auto-close** so the user can immediately focus on the results panel. The load action already calls `handleLoad` — add `setDrawerOpen(false)` to that handler.

2. **Spell Editor Modal:** The `SLSpellEditorModal` (rendered inside `ClassicSpellLibraryDrawer`) should appear above the drawer. Its existing z-index positioning should handle this since it's a child of the drawer.

3. **Save-to-Library Modal:** Same as above — `SLSaveToLibModal` renders inside the component and should layer above the drawer.

4. **Container max-width:** Currently bumped to 1400px at landscape (line 2611). With the grimoire no longer in the grid, the calculator alone at 1400px may be too wide. Consider reducing to **1200px** or keeping 1400px if the two-panel calculator layout benefits from the extra width.

5. **Service Worker Cache:** The service worker (`sw.js`) caches `index.html` as `mage-spell-calc-v48`. After making changes, **bump the cache version** in `sw.js` so returning users get the new layout.

## Visual Summary

```
BEFORE (permanent column):
┌──────────────────────────────────┬──────────┐
│  Input Panel  │  Output Panel    │ Grimoire │
│  (472px)      │  (472px)         │ (360px)  │
│               │                  │          │
└──────────────────────────────────┴──────────┘

AFTER (drawer overlay):
┌─────────────────────────────────────────────┐ ┐
│  Input Panel      │      Output Panel       │ │ ⚡
│  (~600px)         │      (~600px)           │ │ G
│                   │                         │ │ r  ← edge tab
│                   │                         │ │ i
└─────────────────────────────────────────────┘ ┘ m

AFTER (drawer open):
┌─────────────────────────────────────────────┬──────────┐
│  Input Panel      │      Output Panel       │ Grimoire │
│  (~600px)         │      (~600px)           │ (420px)  │
│                   │     [backdrop overlay]   │          │
└─────────────────────────────────────────────┴──────────┘
```
