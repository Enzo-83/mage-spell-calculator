# Handoff: Fix Storyteller.html Button Obfuscation by Nav Pill

## Problem

In `storyteller.html`, the **shared navigation pill** (Calculator | Wizard | Storyteller) overlaps and obfuscates the **Start Scene** and **Close Session** ("Leave Room") buttons in the header bar.

### Root Cause

The shared nav (`shared/nav.js:9-12`) is `position: fixed; top: 12px; right: 12px; z-index: 100`. The storyteller header buttons (Start Scene, Tilts Catalog, Close Session) are pushed to the right side with `marginLeft: "auto"` inside a flex-wrap header. Both elements compete for the top-right corner, and the fixed nav sits on top of the buttons.

### Relevant Code Locations

| Element | File | Lines | Notes |
|---------|------|-------|-------|
| Shared nav pill | `shared/nav.js` | 9-12 | `position: fixed; top: 12px; right: 12px; z-index: 100` |
| ST header bar | `storyteller.html` | 1516-1569 | Flex row, `flexWrap: "wrap"`, `padding: 10px 20px` |
| ST Screen title | `storyteller.html` | 1520-1523 | Left-aligned label |
| Session code badge | `storyteller.html` | 1525-1536 | Shows room code + player count |
| Scene status indicator | `storyteller.html` | 1538-1546 | Green/gray dot + "Scene N active" text |
| Button group | `storyteller.html` | 1548-1567 | `marginLeft: "auto"` pushes to right -- **obfuscated by nav** |
| Tilts Catalog button | `storyteller.html` | 1549-1554 | Opens modal (portal to body) |
| Start Scene / End Scene | `storyteller.html` | 1555-1560 | Green/red toggle button |
| Close Session | `storyteller.html` | 1561-1566 | Red outlined button, confirms before closing |

## Proposed Fix

### 1. Center the action buttons in their own row

Move **Start Scene** and **Close Session** out of the right-aligned button group and into a **centered row** below the info line. This avoids the nav overlap entirely and gives the primary actions more visual prominence.

**Before (current layout):**
```
[ ST Screen ] [ ABCD 3 players ] [ Scene 1 active ] ···· [ Tilts ] [ Start Scene ] [ Close Session ]
                                                                     ↑ hidden by nav pill ↑
```

**After (proposed layout):**
```
[ ST Screen ] [ ABCD 3 players ] [ Scene 1 active ] ···· [ ⚙ Tilts Catalog ]
                        [ Start Scene ]  [ Close Session ]              ← centered, own row
```

### 2. Implementation Details

In `storyteller.html` header (lines 1516-1569):

**a) Keep info items in the top row** -- ST Screen title, session code badge, scene status indicator, and Tilts Catalog button stay in the flex header.

**b) Extract Start Scene + Close Session into a new centered div** below the header flex row but inside the same top-level border-bottom container, or as a second flex row:

```jsx
{/* Header bar */}
<div style={{ borderBottom: `1px solid ${C.accentBorder}`,
  background: `linear-gradient(90deg,${C.bgDeep},${C.bgCard})`,
  flexShrink: 0 }}>

  {/* Info row */}
  <div style={{ padding: "10px 20px", display: "flex", alignItems: "center",
    gap: 12, flexWrap: "wrap" }}>
    {/* ST Screen title */}
    {/* Session code badge */}
    {/* Scene status indicator */}
    {/* Tilts Catalog button (marginLeft: "auto") */}
  </div>

  {/* Action row -- centered */}
  <div style={{ display: "flex", justifyContent: "center", gap: 8,
    padding: "8px 20px 12px" }}>
    <button ...>Start Scene / End Scene</button>
    <button ...>Close Session</button>
  </div>
</div>
```

**c) No z-index changes needed** -- the nav pill stays fixed at top-right, and the centered buttons are no longer in its path.

### 3. Considerations

- The **Tilts Catalog** button can remain in the top info row (right-aligned) since it's a settings/config action, not a primary scene control.
- On mobile/narrow screens, the centered row naturally stacks well without conflicting with the nav pill.
- The `TiltsCatalogPanel` portal rendering (line 1568) should remain as-is -- it portals to `document.body` so its placement in the JSX tree doesn't matter visually.
- The `flexWrap: "wrap"` on the info row can remain for responsive behavior of the info items.

## Testing Checklist

- [ ] Start Scene / End Scene button visible and clickable at all viewport widths
- [ ] Close Session button visible and not covered by nav pill
- [ ] Nav pill (Calculator | Wizard | Storyteller) still fully visible and functional
- [ ] Tilts Catalog button accessible and opens modal correctly
- [ ] Scene status indicator still visible in info row
- [ ] Mobile/portrait layout doesn't stack awkwardly
- [ ] Verify header height doesn't grow excessively on desktop
