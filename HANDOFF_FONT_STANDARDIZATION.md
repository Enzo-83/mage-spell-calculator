# Font Size Standardization Handoff — index.html

**Status:** Ready for implementation  
**Target:** index.html (all views — mobile and landscape desktop)  
**Scope:** CSS-only changes. No JSX/logic changes.

---

## Problem

Font sizes across the UI are inconsistent between peer elements. Accordion card headers on the input-panel don't match output-panel section headers, form-group labels don't match preview-section-labels, and several other mismatches exist. This creates a visually unpolished feel.

---

## Task 1: Match accordion card headers to output-panel section headers

**Goal:** The `.accordion-header h2` on the input-panel side should match the visual weight of `.result-section h3` on the output-panel side.

**Current state:**
- `.card h2` (line 59): no explicit font-size — inherits browser default h2 (~1.5em)
- `.accordion-header h2` (line 2657): also no explicit font-size, inherits `.card h2`
- `.result-section h3` (line 194–197): `font-size: 1em`, uppercase, letter-spacing: 1px

**Fix:** Add an explicit `font-size: 1em` to `.accordion-header h2` to match `.result-section h3`. Both should be uppercase with letter-spacing for consistency.

```css
/* Line 2657 — .accordion-header h2 */
.accordion-header h2 {
    margin: 0;
    border-bottom: none;
    padding-bottom: 0;
    flex: 1;
    font-size: 1em;
    text-transform: uppercase;
    letter-spacing: 1px;
}
```

**Note:** Verify that `.result-section h3` at line 194 already has uppercase + letter-spacing (it does). Both headers should look identical in weight and style after this change.

---

## Task 2: Match form-group labels to preview-section-label size

**Goal:** Labels inside accordion card form-groups should match `.preview-section-label` size.

**Current state:**
- `label` (line 113): `font-size: 0.85em`, uppercase, letter-spacing: 0.5px
- `.preview-section-label` (line 1770): `font-size: 0.75em`, uppercase, letter-spacing: 1px
- `.preview-stat-label` (line 1844): `font-size: 0.75em`, uppercase, letter-spacing: 0.5px

These are **mismatched at 0.85em vs 0.75em**. Since the user wants them to match, change the global `label` font-size to `0.75em` and update the letter-spacing to `1px` for consistency.

**Fix:**

```css
/* Line 113 — global label */
label {
    font-size: 0.75em;
    color: var(--text-muted);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 1px;
}
```

**Cascade impact — update landscape override too:**

```css
/* Line 2628 — landscape label override */
.calculator-landscape label { font-size: 0.82em; }
```

(Was 0.92em, proportionally reduced by the same ~10% delta to maintain the landscape bump ratio.)

**Also update these landscape overrides proportionally:**
- Line 2634: `.calculator-landscape .radio-group label` → `font-size: 0.85em;` (was 0.95em)
- Line 2633: `.calculator-landscape .checkbox-group label` → `font-size: 0.85em;` (was 0.95em, same line)

---

## Task 3: Unify accordion-summary font size

**Current state:**
- `.accordion-summary` (line 2664): `font-size: 0.8em` (mobile/base)
- `.accordion-summary` (line 2688): `font-size: 0.88em` (desktop ≥1024px override)

The base size is never displayed (the element is `display: none` on mobile, line 2667), so the 0.8em declaration is dead code that could cause confusion.

**Fix:** Remove the base `font-size: 0.8em` from line 2664 and keep only the desktop override at 0.88em.

```css
/* Line 2663 — remove font-size, keep other props */
.accordion-summary {
    color: var(--text-muted);
    font-weight: normal;
    display: none;
}
```

---

## Task 4: Fix mixed CSS units (px vs em)

**Current state:** Line 1552 uses `16px` while every other font-size in the file uses `em` units.

**Fix:** Check what 16px maps to in context. If the parent/root is 16px (typical), replace with `1em`. Verify visually.

```css
/* Line ~1552 — convert px to em */
font-size: 1em;
```

---

## Task 5: Standardize secondary text sizes

Several element classes serve the same "secondary/helper text" role but use slightly different sizes:

| Selector | Current | Line | Role |
|----------|---------|------|------|
| `.info-text` | 0.85em | ~709 | Help text |
| `.spell-list-item .spell-details` | 0.85em | ~688 | Spell detail text |
| `.preview-factor` | 0.85em | 1789 | Factor pills |
| `.preview-penalty-summary` | 0.85em | 1803 | Penalty text |
| `.spell-tab-count` | 0.8em | ~892 | Tab badge counts |
| `.accordion-chevron` | 0.85em | 2670 | Chevron icon |

The `.spell-tab-count` at `0.8em` is the outlier among secondary text. Bump it to `0.85em` to match its peers:

```css
/* Line ~892 — .spell-tab-count */
font-size: 0.85em;
```

---

## Task 6: Verify consistent heading hierarchy

After the above changes, the intended hierarchy should be:

| Level | Size | Elements |
|-------|------|----------|
| Section headers | 1em, uppercase | `.accordion-header h2`, `.result-section h3`, `.modal-section h3` |
| Display values | 1.1em–1.3em | `.preview-method`, `.preview-stat-value` |
| Body/controls | 0.9em | selects, inputs, radio options, info-text |
| Labels | 0.75em, uppercase | `label`, `.preview-section-label`, `.preview-stat-label` |
| Secondary text | 0.85em | `.info-text`, factor pills, spell details |
| Large display | 3em–4em | `.pool-value`, `.paradox-pool-value` |

**Verify** `.modal-section h3` (line ~544) also has `font-size: 1em` (it should already).

---

## Testing checklist

- [ ] Mobile view (<1024px): accordion cards show open with correct header and label sizes
- [ ] Desktop landscape (≥1024px): accordion cards collapse/expand; headers match output-panel section headers
- [ ] Labels inside form-groups are visually the same size as preview-section-label in the output panel
- [ ] No text appears unexpectedly large or small after the label size reduction (0.85→0.75em)
- [ ] Spell library cards and grimoire view are unaffected (different component tree)
- [ ] Mixed-unit fix doesn't visually change the element (should be equivalent)
