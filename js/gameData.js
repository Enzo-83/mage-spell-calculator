/**
 * Mage: The Awakening 2nd Edition — Game Identity Data
 * Single source of truth for the Arcana, Paths, Orders, Practice names, and
 * the canonical Arcanum color identities (Phase 3 of docs/CODE_REVIEW_PLAN.md).
 *
 * Plain script-tag global. Load BEFORE js/character.js and any page logic.
 * Rules-math tables (GNOSIS_CHART, factor/duration/scale tables, the engine's
 * PRACTICES with dots/freeReach) deliberately stay in js/spellFactors.js —
 * this file is identity/lore data only.
 *
 * Conventions:
 *   - Canonical keys are lowercase ("death", "acanthus", "adamantineArrow").
 *   - Title Case views/helpers are provided for UIs that display names
 *     (wizard.html works in Title Case throughout).
 *   - The Arcanum colors are the table's established color identities and
 *     must be used everywhere an Arcanum is shown: UI dots/pills, spell card
 *     accents, and Discord embed bars (int form).
 */

const MageData = (() => {

    // ── Arcana ───────────────────────────────────────────────────────────
    const ARCANA_KEYS = ['death','fate','forces','life','matter','mind','prime','space','spirit','time'];

    const ARCANA = {
        death:  { label: "Death",  description: "Ghosts, decay, and the Underworld" },
        fate:   { label: "Fate",   description: "Destiny, luck, and oaths" },
        forces: { label: "Forces", description: "Energy, light, and elements" },
        life:   { label: "Life",   description: "Healing, shapeshifting, and biology" },
        matter: { label: "Matter", description: "Alchemy, shaping, and transmutation" },
        mind:   { label: "Mind",   description: "Telepathy, emotions, and Goetia" },
        prime:  { label: "Prime",  description: "Mana, enchantment, and the Supernal" },
        space:  { label: "Space",  description: "Scrying, teleportation, and sympathy" },
        spirit: { label: "Spirit", description: "Spirits, the Shadow, and ephemera" },
        time:   { label: "Time",   description: "Prophecy, time travel, and postcognition" }
    };

    // Canonical color identities (CSS hex + Discord embed int forms).
    const ARCANUM_HEX = {
        death:  '#475569',  // black (dark slate)
        fate:   '#e2e8f0',  // white (near-white)
        forces: '#f87171',  // red
        life:   '#4ade80',  // green
        matter: '#d97706',  // brown
        mind:   '#fbbf24',  // yellow
        prime:  '#60a5fa',  // blue
        space:  '#a78bfa',  // purple
        spirit: '#fb923c',  // orange
        time:   '#22d3ee',  // cyan
    };
    const ARCANUM_INT = Object.fromEntries(
        Object.entries(ARCANUM_HEX).map(([k, hex]) => [k, parseInt(hex.slice(1), 16)])
    );

    // ── Paths ────────────────────────────────────────────────────────────
    const PATHS = {
        acanthus: {
            label: "Acanthus",
            watchtower: "Watchtower of the Lunargent Thorn",
            realm: "Arcadia",
            rulingArcana: ["fate", "time"],
            inferiorArcanum: "forces"
        },
        mastigos: {
            label: "Mastigos",
            watchtower: "Watchtower of the Iron Gauntlet",
            realm: "Pandemonium",
            rulingArcana: ["mind", "space"],
            inferiorArcanum: "matter"
        },
        moros: {
            label: "Moros",
            watchtower: "Watchtower of the Lead Coin",
            realm: "Stygia",
            rulingArcana: ["death", "matter"],
            inferiorArcanum: "spirit"
        },
        obrimos: {
            label: "Obrimos",
            watchtower: "Watchtower of the Golden Key",
            realm: "Aether",
            rulingArcana: ["forces", "prime"],
            inferiorArcanum: "death"
        },
        thyrsus: {
            label: "Thyrsus",
            watchtower: "Watchtower of the Stone Book",
            realm: "Primal Wild",
            rulingArcana: ["life", "spirit"],
            inferiorArcanum: "mind"
        }
    };

    // ── Orders ───────────────────────────────────────────────────────────
    const ORDERS = {
        adamantineArrow:    { label: "Adamantine Arrow",      roteSkills: ["athletics", "intimidation", "medicine"] },
        guardiansOfTheVeil: { label: "Guardians of the Veil", roteSkills: ["investigation", "stealth", "subterfuge"] },
        mysterium:          { label: "Mysterium",             roteSkills: ["investigation", "occult", "survival"] },
        silverLadder:       { label: "Silver Ladder",         roteSkills: ["expression", "persuasion", "subterfuge"] },
        freeCouncil:        { label: "Free Council",          roteSkills: ["crafts", "persuasion", "science"] },
        seersOfTheThrone:   { label: "Seers of the Throne",   roteSkills: ["investigation", "occult", "persuasion"] },
        apostate:           { label: "Apostate",              roteSkills: [] },
        nameless:           { label: "Nameless",              roteSkills: [] }
    };

    // ── Practice names (display) ─────────────────────────────────────────
    // Rules data for practices (free Reach etc.) lives in js/spellFactors.js.
    const PRACTICES_BY_DOTS = [
        ["Compelling", "Knowing", "Unveiling"],     // 1-dot (Initiate)
        ["Ruling", "Shielding", "Veiling"],         // 2-dot (Apprentice)
        ["Fraying", "Perfecting", "Weaving"],       // 3-dot (Disciple)
        ["Patterning", "Unraveling"],               // 4-dot (Adept)
        ["Making", "Unmaking"]                      // 5-dot (Master)
    ];
    const PRACTICE_LABELS = PRACTICES_BY_DOTS.flat();
    const PRACTICE_DOTS = Object.fromEntries(
        PRACTICES_BY_DOTS.flatMap((names, i) => names.map(n => [n, i + 1]))
    );

    // ── Helpers ──────────────────────────────────────────────────────────
    const tc = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    const ARCANA_TC = ARCANA_KEYS.map(tc);
    // Case-insensitive color lookups with the app's accent purple as fallback.
    const arcanumHex = (name) => ARCANUM_HEX[String(name || '').toLowerCase()] || '#9d4edd';
    const arcanumInt = (name) => ARCANUM_INT[String(name || '').toLowerCase()] ?? 0x7B2CBF;

    return {
        ARCANA_KEYS, ARCANA_TC, ARCANA,
        ARCANUM_HEX, ARCANUM_INT, arcanumHex, arcanumInt,
        PATHS, ORDERS,
        PRACTICES_BY_DOTS, PRACTICE_LABELS, PRACTICE_DOTS,
        tc
    };
})();

// Expose on window for Babel-compiled (function-scoped) page scripts.
if (typeof window !== 'undefined') window.MageData = MageData;
