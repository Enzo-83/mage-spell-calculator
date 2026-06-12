# Engine Drift Report — Classic shared engine vs Wizard inline engine

**Phase 1 deliverable** (see [CODE_REVIEW_PLAN.md](CODE_REVIEW_PLAN.md)).
Produced by `node tests/run.mjs`, which compares `js/spellFactors.js` +
`js/dicePool.js` against the engine embedded in `wizard.html` (`deriveValues`)
over 84 targeted cases and 4,000 seeded-random cases.
*Written 2026-06-11. Re-run the harness after any engine change.*

> ## ✅ RESOLVED — Phase 4 (2026-06-11)
> The wizard now delegates all rules math to the shared engine
> (`calculateSpellFactors` + `calculateParadoxPool` + `calculateDicePool`);
> its duplicate factor tables, Reach accounting, Paradox math, and
> Gnosis-keyed charts are deleted. **The harness reports 0 drift across all
> 4,084 cases.** Per-finding resolutions:
>
> - **W1 (live bug, fixed):** ritual interval dice no longer leak into
>   Instant casts — the pool's `ritualBonus` comes from the engine's
>   casting-time result, which gates on ritual casting.
> - **W2 (fixed):** the same path caps ritual bonus dice at +5 in the math
>   layer, not just the UI.
> - **B1 (fixed):** the dead `roteSkill`/`isOrderSkill` params and unused
>   `mudraBonus` computation were **removed** from `calculateDicePool`. The
>   one convention, now documented in the code: Mudra dice ride in the
>   yantra's own `bonus` (so they correctly count toward the +5 net Yantra
>   cap). Both pages already did this.
> - **B2 (fixed):** `calculateParadoxPool` now returns a `noRoll` result with
>   zero dice when `reachExcess <= 0` — callers no longer need external
>   guards (index.html's guard remains harmlessly; Phase 6 may drop it).
> - **D1 (resolved by convention):** the engine charges +1 Reach for Instant
>   on any method, including Grimoire rotes; the *UI* is responsible for
>   forbidding Instant + Grimoire (wizard already does — **Phase 6 must
>   verify Classic's form does too**).
> - **Mana layering (kept as-is):** the non-Ruling-Arcanum +1 Mana stays at
>   page level — it needs character path knowledge the engine doesn't model.
>
> The body below is preserved as the historical record of what drifted and why.

## Headline

**4,084 cases compared → 1,851 disagreed, but every disagreement traces to just
four root causes.** The core rules math — factor penalties, free Reach
(including the rote-as-5-dots rule and clamping), spell-control Reach
progression, Paradox-per-Reach chart, Yantra bonus values, and factor Mana —
is in **perfect agreement** between the two engines. Phase 4 (consolidating the
wizard onto the shared engine) is therefore lower-risk than feared: it needs to
resolve four specific behaviors, not untangle pervasive drift.

| Field compared | Mismatches | Root cause |
|---|---|---|
| factorPen | 0 | — |
| freeReach | 0 | — |
| factorMana | 0 | — |
| usedReach / excessReach | 403 / 328 | D1 only |
| paradox | 814 | B2 + downstream of D1 |
| pool | 1,353 | W1 + W2 + B1 |

## Findings

### W1 — LIVE BUG (wizard): ritual interval dice leak into Instant casts
`wizard.html:350` passes `d.ritualIntervals` to `calculateDicePool` as
`ritualBonus` **unconditionally**. Selecting Ritual with +3 intervals and then
switching to Instant hides the stepper but keeps the +3 dice — the spell gets
the ritual bonus *and* pays +1 Reach for Instant. The shared engine gates this
correctly (`calculateCastingTime` returns 0 bonus dice for instant).

- Harness cases: `ritualIntervals=3 instant` → shared pool 4, wizard pool 7.
- **Severity: real, user-reachable, inflates pools.**
- **Resolution: wizard adopts the shared gating.** Quick interim fix is one
  line: `ritualBonus: d.castTime === "ritual" ? d.ritualIntervals : 0`.

### W2 — wizard: ritual bonus not capped at +5
Same line: the shared engine caps ritual bonus dice at +5
(`calculateCastingTime`); the wizard passes the raw count. **Currently
unreachable** (the wizard's stepper caps at 5) but fragile — nothing in the
math layer enforces the rule. Resolved by the same change as W1 (route through
`calculateCastingTime`).

### B1 — shared engine trap: `mudraBonus` is computed but never added
`js/dicePool.js` `calculateDicePool` computes
`mudraBonus = roteSkill + (isOrderSkill ? 1 : 0)` (step 4) but the value is
**never included in the pool total** — dead code. Both pages independently
discovered this and work around it by baking the skill dice into the Mudra
yantra's own `bonus` field (`index.html:3016-3020`, wizard `deriveValues`).

- Harness case: `method=rote_self mudra` via the documented API (roteSkill
  param) → shared pool 4 vs wizard (baked-in) pool 8. The baked-in answer is
  the rules-correct one.
- **Severity: no live impact today, but the documented API lies** — any future
  caller using `roteSkill`/`isOrderSkill` params will silently lose Mudra dice.
- **Resolution (Phase 4): pick one convention.** Recommended: make the params
  work (add `mudraBonus` to the modifier sum, stop baking dice into the yantra
  at both call sites) so Mudra dice are also visible to the +5 net Yantra cap
  consistently — or delete the dead params entirely. Decide once, test both
  pages.
- Note: baking Mudra into the yantra bonus (current behavior) means Mudra dice
  count toward the +5 net Yantra cap. Per core rules Mudra **is** a Yantra, so
  counting it toward the cap appears correct — preserve this when fixing.

### B2 — shared engine trap: Paradox reported with zero excess Reach
`calculateParadoxPool` happily returns dice from witnesses / inured / previous
rolls even when `reachExcess` is 0 — but per MtAw 2e, a Paradox roll only
happens when the caster exceeds free Reach; the other inputs are modifiers to
a roll that must already be triggered. Both pages currently guard externally
(`index.html:3863` returns null unless excess > 0; wizard's `deriveValues`
zeroes paradox unless `excessReach > 0`), so there is **no live impact** — but
the function is wrong when called naively.

- Harness cases: `paradox {"inured":true} no-excess` → shared 2 dice,
  wizard 0. Wizard is rules-correct.
- **Resolution (Phase 4): gate inside `calculateParadoxPool`** (return zero
  dice / no roll when `reachExcess <= 0`), then drop the duplicated external
  guards.

### D1 — divergent rule: Instant casting Reach for Grimoire rotes
For `castTime = instant` on a Grimoire rote, the shared engine charges +1
Reach; the wizard charges nothing (`wizard.html:296` skips the charge when
`methodInfo.doubleRitual`). The wizard's UI **forbids** Instant for Grimoire
rotes ("2× Ritual · No Instant") and force-resets to ritual on method change,
so the wizard never feeds itself this input — the skip is belt-and-braces.

- Harness case: `method=rote_grimoire instant` → shared usedReach 1, wizard 0.
- Rules reading: Grimoire-cast rotes require ritual casting, so *the input
  itself is invalid* — the wizard UI is right to forbid it.
- **Resolution (Phase 4): keep the shared engine simple** (charging +1 for
  instant is fine for valid inputs) and enforce "no Instant for Grimoire" at
  the UI layer. **Phase 6 check:** verify Classic's form also prevents
  Instant + Grimoire; if not, add the same constraint there.

## Confirmed parity (no drift across all 4,084 cases)

- Factor penalties: Potency / Duration / Scale, primary vs non-primary free
  levels, table clamping, -2 per excess level
- Free Reach: `dots − requirement + 1`, min 1, rote-treats-as-5
- Spell-control Reach: `1 + (spells over Gnosis limit)` progression
- Paradox-per-Reach chart (= ⌈Gnosis/2⌉) and max-Yantra count (= ⌈Gnosis/2⌉+1)
- All 13 shared Yantra bonus values + Persona
- Yantra +5 net cap behavior (both route through shared `calculateDicePool`
  since PR #52)
- Factor Mana (Indefinite duration +1, Sympathetic/Temporal range +1)

## Out of scope here (different layer, noted for later phases)

- Non-Ruling-Arcanum Mana (+1 improvised): computed in wizard `deriveValues`
  and in Classic page glue, not in the shared engine — unify in Phase 4.
- The wizard offers no Soul Stone / Adamant Hand / Symbolic Sympathy / Legacy
  Yantras (present in shared `YANTRA_TYPES`) — feature gap, not math drift.
- Combined-spell casting math is wizard/Classic-page logic, untested here —
  cover when its engine home is decided (Phase 4 or 6).
