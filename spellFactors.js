/**
 * Mage: The Awakening 2nd Edition - Spell Factor Engine
 * Core data structures and calculation logic for spell factors
 * 
 * Corrected based on official Spellcasting Guide
 */

// =============================================================================
// CONSTANTS & DATA STRUCTURES
// =============================================================================

/**
 * Casting Methods
 * - Improvised: +1 Mana if not using Ruling Arcanum
 * - Praxis: Exceptional Success at 3 successes instead of 5
 * - Rote (Grimoire): Treats Arcanum as 5 for Free Reach, Rote Quality, NO Mudra, Double ritual time
 * - Rote (Your Design): Treats Arcanum as 5 for Free Reach, Rote Quality, Mudra available, Normal ritual time
 * - Rote (Learned): Treats Arcanum as 5 for Free Reach, NO Rote Quality, Mudra available, Normal ritual time
 * 
 * Note: Primary Factor free levels are ALWAYS based on highest Arcanum dots, regardless of casting method.
 * 
 * Free Reach formula: Arcanum Dots - Spell Requirement + 1
 * For Rotes: 5 - Spell Requirement + 1
 * 
 * Rote Quality: Re-roll any dice showing 1-7 (not 8, 9, 10). Each die re-rolled once only.
 * If reduced to chance die, don't re-roll dramatic failure.
 */
const CASTING_METHODS = {
    improvised: {
        label: "Improvised",
        description: "Standard spellcasting. +1 Mana if not using Ruling Arcanum.",
        exceptionalAt: 5,
        treatsArcanumAs5: false,
        roteQuality: false,
        mudraAvailable: false,
        doubleRitualTime: false
    },
    praxis: {
        label: "Praxis",
        description: "Exceptional Success at 3 successes.",
        exceptionalAt: 3,
        treatsArcanumAs5: false,
        roteQuality: false,
        mudraAvailable: false,
        doubleRitualTime: false
    },
    roteGrimoire: {
        label: "Rote (Grimoire)",
        description: "5 Free Reach calc. Rote Quality (reroll 1-7). Double ritual time. No Mudra.",
        exceptionalAt: 5,
        treatsArcanumAs5: true,
        roteQuality: true,
        mudraAvailable: false,
        doubleRitualTime: true
    },
    roteOwn: {
        label: "Rote (Your Design)",
        description: "5 Free Reach calc. Rote Quality (reroll 1-7). Mudra available.",
        exceptionalAt: 5,
        treatsArcanumAs5: true,
        roteQuality: true,
        mudraAvailable: true,
        doubleRitualTime: false
    },
    roteLearned: {
        label: "Rote (Learned)",
        description: "5 Free Reach calc. Mudra available. No Rote Quality.",
        exceptionalAt: 5,
        treatsArcanumAs5: true,
        roteQuality: false,
        mudraAvailable: true,
        doubleRitualTime: false
    }
};

/**
 * Practices and their associated Arcanum dot requirements
 * Free Reach = Practice dot level (per PDF)
 */
const PRACTICES = {
    // 1-dot (Initiate) - 1 Free Reach
    compelling: { dots: 1, freeReach: 1, description: "Nudge phenomena toward their natural conclusion" },
    knowing: { dots: 1, freeReach: 1, description: "Gain knowledge and information" },
    unveiling: { dots: 1, freeReach: 1, description: "Reveal hidden things" },
    
    // 2-dot (Apprentice) - 2 Free Reach
    ruling: { dots: 2, freeReach: 2, description: "Exert authority over phenomena" },
    shielding: { dots: 2, freeReach: 2, description: "Protect against phenomena" },
    veiling: { dots: 2, freeReach: 2, description: "Conceal and disguise" },
    
    // 3-dot (Disciple) - 3 Free Reach
    fraying: { dots: 3, freeReach: 3, description: "Degrade and damage" },
    perfecting: { dots: 3, freeReach: 3, description: "Strengthen and idealize" },
    weaving: { dots: 3, freeReach: 3, description: "Alter properties" },
    
    // 4-dot (Adept) - 4 Free Reach
    patterning: { dots: 4, freeReach: 4, description: "Transform completely" },
    unraveling: { dots: 4, freeReach: 4, description: "Significantly damage or dispel" },
    
    // 5-dot (Master) - 5 Free Reach
    making: { dots: 5, freeReach: 5, description: "Create from nothing" },
    unmaking: { dots: 5, freeReach: 5, description: "Destroy utterly" }
};

/**
 * Duration - Standard Scale (Turns)
 * No Reach cost to use standard scale
 * -2 dice for each extra 10 turns beyond the table
 */
const DURATION_STANDARD = [
    { label: "1 Turn", value: 1, unit: "turns", penalty: 0 },
    { label: "2 Turns", value: 2, unit: "turns", penalty: -2 },
    { label: "3 Turns", value: 3, unit: "turns", penalty: -4 },
    { label: "5 Turns", value: 5, unit: "turns", penalty: -6 },
    { label: "10 Turns", value: 10, unit: "turns", penalty: -8 }
];

/**
 * Duration - Advanced Scale (Scene/Hour+)
 * Costs +1 Reach to use advanced scale
 * Advanced Potency grants +2 Withstand vs Dispellation, +1 Clash of Wills
 */
const DURATION_ADVANCED = [
    { label: "1 Scene/Hour", value: 1, unit: "scene", penalty: 0 },
    { label: "1 Day", value: 1, unit: "day", penalty: -2 },
    { label: "1 Week", value: 1, unit: "week", penalty: -4 },
    { label: "1 Month", value: 1, unit: "month", penalty: -6 },
    { label: "1 Year", value: 1, unit: "year", penalty: -8 },
    { label: "Indefinite", value: null, unit: "indefinite", penalty: -10, requiresMana: 1 }
];

/**
 * Scale - Standard (Subjects)
 * Size noted for reference
 */
const SCALE_STANDARD_SUBJECTS = [
    { label: "1 Subject", subjects: 1, size: 5, penalty: 0 },
    { label: "2 Subjects", subjects: 2, size: 6, penalty: -2 },
    { label: "4 Subjects", subjects: 4, size: 7, penalty: -4 },
    { label: "8 Subjects", subjects: 8, size: 8, penalty: -6 },
    { label: "16 Subjects", subjects: 16, size: 9, penalty: -8 }
];

/**
 * Scale - Standard (Area of Effect)
 * Alternative to subjects for area-based spells
 */
const SCALE_STANDARD_AOE = [
    { label: "Arm's Reach", size: "arm's reach", penalty: 0 },
    { label: "Small Room", size: "small room", penalty: -2 },
    { label: "Large Room", size: "large room", penalty: -4 },
    { label: "House Floor", size: "house floor", penalty: -6 },
    { label: "Small House", size: "small house", penalty: -8 }
];

/**
 * Scale - Advanced (Subjects)
 * Costs +1 Reach to use advanced scale
 * -2 for each extra 2x subjects or +5 Size beyond table
 */
const SCALE_ADVANCED_SUBJECTS = [
    { label: "5 Subjects", subjects: 5, size: 5, penalty: 0 },
    { label: "10 Subjects", subjects: 10, size: 10, penalty: -2 },
    { label: "20 Subjects", subjects: 20, size: 15, penalty: -4 },
    { label: "40 Subjects", subjects: 40, size: 20, penalty: -6 },
    { label: "80 Subjects", subjects: 80, size: 25, penalty: -8 }
];

/**
 * Scale - Advanced (Area of Effect)
 * Costs +1 Reach to use advanced scale
 * City Block is maximum
 */
const SCALE_ADVANCED_AOE = [
    { label: "Large House", size: "large house", penalty: 0 },
    { label: "Parking Lot", size: "parking lot", penalty: -2 },
    { label: "Supermarket", size: "supermarket", penalty: -4 },
    { label: "Shopping Mall", size: "shopping mall", penalty: -6 },
    { label: "City Block (Max)", size: "city block", penalty: -8 }
];

/**
 * Potency Scale
 * -2 dice for each level above free levels
 * Advanced Potency grants +2 Withstand vs Dispellation, +1 Clash of Wills
 */
const POTENCY_SCALE = [
    { label: "Potency 1", value: 1, penalty: 0 },
    { label: "Potency 2", value: 2, penalty: -2 },
    { label: "Potency 3", value: 3, penalty: -4 },
    { label: "Potency 4", value: 4, penalty: -6 },
    { label: "Potency 5", value: 5, penalty: -8 }
    // Continues: -2 for each extra Potency
];

/**
 * Range options
 * Standard: Touch, Self, or Aimed (no Reach cost)
 * Advanced: Sensory (+1 Reach), Remote Viewed (+2 Reach total)
 * Sympathetic/Temporal: Requires attainments + Mana
 */
const RANGE_OPTIONS = {
    self: { 
        label: "Self", 
        reachCost: 0, 
        isAdvanced: false,
        description: "Spell affects only the caster" 
    },
    touch: { 
        label: "Touch", 
        reachCost: 0, 
        isAdvanced: false,
        description: "Physical contact. Dex + Brawl/Weaponry to touch unwilling." 
    },
    aimed: { 
        label: "Aimed", 
        reachCost: 0, 
        isAdvanced: false,
        requiresAimedRoll: true,
        description: "Ranged attack. Gnosis + Athletics/Firearms - Defense. Range: Short (Gnosis×10), Medium (Gnosis×20), Long (Gnosis×40)." 
    },
    sensory: { 
        label: "Sensory", 
        reachCost: 1, 
        isAdvanced: true,
        description: "+1 Reach. Anywhere the caster can perceive directly." 
    },
    remoteView: { 
        label: "Remote Viewed", 
        reachCost: 2, 
        isAdvanced: true,
        description: "+2 Reach. Target being viewed via scrying or remote viewing." 
    },
    sympathetic: { 
        label: "Sympathetic", 
        reachCost: 0, // Uses attainment, not raw Reach
        isAdvanced: true,
        requiresAttainment: "Space 2",
        manaCost: 1,
        description: "Requires Space 2 Attainment, Sensory Range, Sympathy Yantra, and 1 Mana. Withstood by connection strength." 
    },
    temporal: { 
        label: "Temporal Sympathy", 
        reachCost: 0, // Uses attainment, not raw Reach
        isAdvanced: true,
        requiresAttainment: "Time 2",
        manaCost: 1,
        description: "Requires Time 2 Attainment, Sensory Range, Sympathy Yantra, and 1 Mana. Withstood by connection strength." 
    }
};

/**
 * Casting Time options
 * Standard: Ritual (each interval gives +1 die, up to +5)
 * Advanced: Instant (+1 Reach)
 */
const CASTING_TIME_OPTIONS = {
    ritual: {
        label: "Ritual",
        reachCost: 0,
        isAdvanced: false,
        maxBonus: 5,
        description: "Each interval (per Gnosis) gives +1 die, up to +5. Teamwork allowed."
    },
    instant: {
        label: "Instant",
        reachCost: 1,
        isAdvanced: true,
        description: "+1 Reach. Single action casting. Yantras may still extend casting time."
    }
};

/**
 * Gnosis chart - affects many spell parameters
 * yantrasMax formula: Math.ceil(gnosis / 2) + 1
 * paradoxPerReach formula: Math.ceil(gnosis / 2)
 */
const GNOSIS_CHART = {
    1:  { ritualInterval: "3 hours",    yantrasMax: 2, paradoxPerReach: 1, maxActiveSpells: 1,  manaMax: 10, manaPerTurn: 1  },
    2:  { ritualInterval: "3 hours",    yantrasMax: 2, paradoxPerReach: 1, maxActiveSpells: 2,  manaMax: 11, manaPerTurn: 2  },
    3:  { ritualInterval: "1 hour",     yantrasMax: 3, paradoxPerReach: 2, maxActiveSpells: 3,  manaMax: 12, manaPerTurn: 3  },
    4:  { ritualInterval: "1 hour",     yantrasMax: 3, paradoxPerReach: 2, maxActiveSpells: 4,  manaMax: 13, manaPerTurn: 4  },
    5:  { ritualInterval: "30 minutes", yantrasMax: 4, paradoxPerReach: 3, maxActiveSpells: 5,  manaMax: 14, manaPerTurn: 5  },
    6:  { ritualInterval: "30 minutes", yantrasMax: 4, paradoxPerReach: 3, maxActiveSpells: 6,  manaMax: 15, manaPerTurn: 6  },
    7:  { ritualInterval: "10 minutes", yantrasMax: 5, paradoxPerReach: 4, maxActiveSpells: 7,  manaMax: 16, manaPerTurn: 7  },
    8:  { ritualInterval: "10 minutes", yantrasMax: 5, paradoxPerReach: 4, maxActiveSpells: 8,  manaMax: 17, manaPerTurn: 8  },
    9:  { ritualInterval: "1 minute",   yantrasMax: 6, paradoxPerReach: 5, maxActiveSpells: 9,  manaMax: 18, manaPerTurn: 9  },
    10: { ritualInterval: "1 minute",   yantrasMax: 6, paradoxPerReach: 5, maxActiveSpells: 10, manaMax: 19, manaPerTurn: 10 }
};

/**
 * Yantra types with their bonuses
 * Maximum bonus from all Yantras combined: +5 (after offsetting penalties)
 * First Yantra is reflexive, each additional adds 1 turn to casting
 */
const YANTRA_TYPES = {
    // Places
    demesne:        { label: "Demesne", bonus: 2, category: "places" },
    environment:    { label: "Environment", bonus: 1, category: "places", description: "Includes mages without Arcanum, Sleepwalkers, Proximi in Teamwork" },
    supernalVerge:  { label: "Supernal Verge", bonus: 2, category: "places" },
    
    // Persona
    persona:        { label: "Persona (Shadow Name/Cabal Theme)", bonus: [1, 2, 3, 4], category: "persona", description: "Based on Shadow Name and Cabal Theme Merits" },
    
    // Tools
    dedicatedTool:  { label: "Dedicated Tool", bonus: 0, category: "tools", special: "paradoxReduction", paradoxReduction: 2, description: "-2 to Paradox dice pool. Soul Stone can be used as Dedicated Tool." },
    pathTool:       { label: "Path Tool", bonus: 1, category: "tools" },
    orderTool:      { label: "Order Tool", bonus: 1, category: "tools" },
    soulStone:      { label: "Soul Stone (other mage's)", bonus: [2, 3], category: "tools", description: "+2, or +3 if owner's Gnosis > caster's" },
    adamantHand:    { label: "Adamant Hand", bonus: 1, category: "tools", description: "Combat action becomes reflexive Order Tool for this/next spell" },
    
    // Sacraments
    sacramentNormal:    { label: "Sacrament (Normal)", bonus: 1, category: "sacraments" },
    sacramentRare:      { label: "Sacrament (Takes effort to find)", bonus: 2, category: "sacraments" },
    sacramentOtherRealm:{ label: "Sacrament (From another realm)", bonus: 3, category: "sacraments" },
    
    // Sympathy
    material:       { label: "Material Sympathy", bonus: 2, category: "sympathy", description: "Subject as they are now" },
    representational:{ label: "Representational Sympathy", bonus: 1, category: "sympathy", description: "Subject as they were once" },
    symbolic:       { label: "Symbolic Sympathy", bonus: 0, category: "sympathy", description: "Indirect tie to subject" },
    legacy:         { label: "Legacy", bonus: 2, category: "sympathy", description: "For targeting Legacy members/items" },
    
    // Actions
    concentration:  { label: "Concentration", bonus: 2, category: "actions", description: "Spell must last >1 turn. Lost if taking non-reflexive action or damage." },
    highSpeech:     { label: "High Speech", bonus: 2, category: "actions", description: "Cannot be used reflexively" },
    mudra:          { label: "Mudra", bonus: "skill", category: "actions", roteOnly: true, description: "Rotes only. +Skill dots. +1 if Skill is from caster's Order." },
    rune:           { label: "Rune", bonus: 2, category: "actions", description: "Breaking runes cancels spell" }
};

// =============================================================================
// SPELL FACTOR ENGINE - Core Calculation Functions
// =============================================================================

/**
 * Calculate the free factor levels
 * Primary factor: free levels = Highest Arcanum dots used in the spell
 * Non-primary factors: free level = 1
 * 
 * Note: Casting method (Rote/Praxis/Improvised) does NOT affect primary factor free levels.
 * The "Free Reach as having 5 dots" for Rotes refers to Free Reach calculation, not primary factor.
 * 
 * @param {number} arcanumDots - Highest Arcanum dots used in the spell
 * @param {boolean} isPrimary - Whether this is the spell's primary factor
 * @returns {number} - Free levels in this factor
 */
function getFreeLevels(arcanumDots, isPrimary) {
    if (isPrimary) {
        return arcanumDots;
    }
    return 1;
}

/**
 * Calculate dice penalty for a factor level
 * Penalty is -2 for each level beyond free levels
 * @param {number} desiredLevel - The level the caster wants (1-indexed)
 * @param {number} freeLevels - Free levels available
 * @returns {number} - Dice penalty (0 or negative)
 */
function getFactorPenalty(desiredLevel, freeLevels) {
    const excess = desiredLevel - freeLevels;
    if (excess <= 0) return 0;
    return excess * -2;
}

/**
 * Calculate spell factor details for Potency
 * @param {number} potency - Desired potency level (1+)
 * @param {number} arcanumDots - Highest Arcanum dots used in the spell
 * @param {boolean} isPrimary - Whether Potency is the primary factor
 * @returns {Object} - { label, value, penalty, freeLevels }
 */
function calculatePotency(potency, arcanumDots, isPrimary) {
    const freeLevels = getFreeLevels(arcanumDots, isPrimary);
    const penalty = getFactorPenalty(potency, freeLevels);
    
    return {
        label: `Potency ${potency}`,
        value: potency,
        penalty: penalty,
        freeLevels: freeLevels,
        isPrimary: isPrimary
    };
}

/**
 * Calculate spell factor details for Duration
 * @param {number} levelIndex - Index in the duration scale (0-indexed)
 * @param {boolean} useAdvanced - Whether using advanced duration scale
 * @param {number} arcanumDots - Highest Arcanum dots used in the spell
 * @param {boolean} isPrimary - Whether Duration is the primary factor
 * @returns {Object} - { label, penalty, reachCost, scale, freeLevels, manaCost }
 */
function calculateDuration(levelIndex, useAdvanced, arcanumDots, isPrimary) {
    const scale = useAdvanced ? DURATION_ADVANCED : DURATION_STANDARD;
    const clampedIndex = Math.min(levelIndex, scale.length - 1);
    const entry = scale[clampedIndex];
    
    const freeLevels = getFreeLevels(arcanumDots, isPrimary);
    const desiredLevel = clampedIndex + 1; // Convert to 1-indexed
    const penalty = getFactorPenalty(desiredLevel, freeLevels);
    
    // Advanced scale costs 1 Reach
    const reachCost = useAdvanced ? 1 : 0;
    
    // Indefinite duration requires Mana
    const manaCost = entry.requiresMana || 0;
    
    return {
        label: entry.label,
        value: entry.value,
        unit: entry.unit,
        penalty: penalty,
        reachCost: reachCost,
        manaCost: manaCost,
        scale: useAdvanced ? "advanced" : "standard",
        level: desiredLevel,
        freeLevels: freeLevels,
        isPrimary: isPrimary
    };
}

/**
 * Calculate spell factor details for Scale
 * @param {number} levelIndex - Index in the scale (0-indexed)
 * @param {boolean} useAdvanced - Whether using advanced scale
 * @param {string} scaleType - 'subjects' or 'aoe'
 * @param {number} arcanumDots - Highest Arcanum dots used in the spell
 * @param {boolean} isPrimary - Whether Scale is the primary factor
 * @returns {Object} - { label, penalty, reachCost, scale, freeLevels }
 */
function calculateScale(levelIndex, useAdvanced, scaleType, arcanumDots, isPrimary) {
    let scale;
    if (useAdvanced) {
        scale = scaleType === 'aoe' ? SCALE_ADVANCED_AOE : SCALE_ADVANCED_SUBJECTS;
    } else {
        scale = scaleType === 'aoe' ? SCALE_STANDARD_AOE : SCALE_STANDARD_SUBJECTS;
    }
    
    const clampedIndex = Math.min(levelIndex, scale.length - 1);
    const entry = scale[clampedIndex];
    
    const freeLevels = getFreeLevels(arcanumDots, isPrimary);
    const desiredLevel = clampedIndex + 1;
    const penalty = getFactorPenalty(desiredLevel, freeLevels);
    
    // Advanced scale costs 1 Reach
    // Making Scale primary also costs 1 Reach (handled separately)
    const reachCost = useAdvanced ? 1 : 0;
    
    return {
        label: entry.label,
        subjects: entry.subjects || null,
        size: entry.size,
        penalty: penalty,
        reachCost: reachCost,
        scale: useAdvanced ? "advanced" : "standard",
        scaleType: scaleType,
        level: desiredLevel,
        freeLevels: freeLevels,
        isPrimary: isPrimary
    };
}

/**
 * Calculate Range details
 * @param {string} rangeKey - Key from RANGE_OPTIONS
 * @returns {Object} - { label, reachCost, manaCost, requiresAttainment, requiresAimedRoll, description }
 */
function calculateRange(rangeKey) {
    const range = RANGE_OPTIONS[rangeKey] || RANGE_OPTIONS.touch;
    return {
        key: rangeKey,
        label: range.label,
        reachCost: range.reachCost,
        manaCost: range.manaCost || 0,
        requiresAttainment: range.requiresAttainment || null,
        requiresAimedRoll: range.requiresAimedRoll || false,
        isAdvanced: range.isAdvanced,
        description: range.description
    };
}

/**
 * Calculate Casting Time details
 * @param {string} castingTimeKey - 'ritual' or 'instant'
 * @param {number} ritualIntervals - Number of ritual intervals (0-5 for bonus dice)
 * @returns {Object} - { label, reachCost, bonusDice, description }
 */
function calculateCastingTime(castingTimeKey, ritualIntervals = 0) {
    const castingTime = CASTING_TIME_OPTIONS[castingTimeKey] || CASTING_TIME_OPTIONS.ritual;
    
    // Ritual casting gives bonus dice (max +5)
    let bonusDice = 0;
    if (castingTimeKey === 'ritual') {
        bonusDice = Math.min(ritualIntervals, castingTime.maxBonus);
    }
    
    return {
        key: castingTimeKey,
        label: castingTime.label,
        reachCost: castingTime.reachCost,
        bonusDice: bonusDice,
        ritualIntervals: ritualIntervals,
        isAdvanced: castingTime.isAdvanced,
        description: castingTime.description
    };
}

/**
 * Calculate maximum Yantras allowed
 * Formula: Math.ceil(gnosis / 2) + 1
 * @param {number} gnosis - Caster's Gnosis
 * @returns {number} - Maximum number of Yantras
 */
function getMaxYantras(gnosis) {
    return Math.ceil(gnosis / 2) + 1;
}

/**
 * Calculate Paradox dice per extra Reach
 * Formula: Math.ceil(gnosis / 2)
 * @param {number} gnosis - Caster's Gnosis
 * @returns {number} - Paradox dice per Reach over free
 */
function getParadoxPerReach(gnosis) {
    return Math.ceil(gnosis / 2);
}

/**
 * Calculate all spell factors and total penalties/reach
 * @param {Object} params - Spell parameters
 * @returns {Object} - Complete spell factor breakdown
 */
function calculateSpellFactors(params) {
    const {
        practice,
        arcanumDots,
        spellArcanumReq = null, // Spell's minimum Arcanum requirement (defaults to arcanumDots if not specified)
        gnosis,
        activeSpells = 0, // Number of spells currently active (for spell control)
        castingMethod = "improvised",
        defaultPrimaryFactor = "potency", // Spell's default primary factor
        primaryFactor = "potency", // Chosen primary factor: "potency" or "duration"
        potency = 1,
        durationIndex = 0,
        useAdvancedDuration = false,
        scaleIndex = 0,
        useAdvancedScale = false,
        scaleType = "subjects", // "subjects" or "aoe"
        range = "touch",
        castingTime = "ritual",
        ritualIntervals = 0,
        additionalReach = 0 // Extra Reach for spell effects (from spell description or DM discretion)
    } = params;
    
    // Spell requirement defaults to caster's Arcanum dots if not specified
    const spellRequirement = spellArcanumReq !== null ? spellArcanumReq : arcanumDots;
    
    // Get practice info
    const practiceInfo = PRACTICES[practice];
    if (!practiceInfo) {
        throw new Error(`Unknown practice: ${practice}`);
    }
    
    // Get Gnosis-based values
    const gnosisInfo = GNOSIS_CHART[gnosis] || GNOSIS_CHART[1];
    
    // Get casting method info
    const methodInfo = CASTING_METHODS[castingMethod] || CASTING_METHODS.improvised;
    
    // Calculate each factor
    const potencyResult = calculatePotency(
        potency, 
        arcanumDots, 
        primaryFactor === "potency"
    );
    
    const durationResult = calculateDuration(
        durationIndex, 
        useAdvancedDuration, 
        arcanumDots, 
        primaryFactor === "duration"
    );
    
    const scaleResult = calculateScale(
        scaleIndex, 
        useAdvancedScale,
        scaleType,
        arcanumDots, 
        false // Scale can never be the primary factor
    );
    
    const rangeResult = calculateRange(range);
    const castingTimeResult = calculateCastingTime(castingTime, ritualIntervals);
    
    // Calculate Reach costs
    // Changing primary factor from spell's default costs +1 Reach
    const primaryFactorChanged = primaryFactor !== defaultPrimaryFactor;
    const primaryFactorChangeReach = primaryFactorChanged ? 1 : 0;
    
    // Spell Control: Extra Reach when exceeding active spell limit
    // Max active spells = Gnosis
    // "Each additional spell requires a Reach, plus another Reach per spell already over the limit"
    const maxActiveSpells = gnosis;
    let spellControlReach = 0;
    let spellsCurrentlyOver = Math.max(0, activeSpells - maxActiveSpells);
    
    if (activeSpells >= maxActiveSpells) {
        // Casting this spell would exceed limit (or already over)
        spellControlReach = 1 + spellsCurrentlyOver;
    }
    
    const totalReachUsed = 
        primaryFactorChangeReach +      // Changing primary factor
        durationResult.reachCost +      // Advanced duration
        scaleResult.reachCost +         // Advanced scale
        rangeResult.reachCost +         // Sensory/Remote range
        castingTimeResult.reachCost +   // Instant casting
        additionalReach +               // Extra Reach for spell effects
        spellControlReach;              // Reach for exceeding spell control limit
    
    // Free Reach = Arcanum Dots - Spell Requirement + 1
    // Each dot that meets or exceeds the spell's requirement grants 1 free Reach
    // For Rotes: Treat as having 5 dots, so 5 - Spell Requirement + 1
    let effectiveArcanumForReach = arcanumDots;
    if (methodInfo.treatsArcanumAs5) {
        // Rotes treat caster as having 5 dots for Free Reach calculation
        effectiveArcanumForReach = 5;
    }
    const freeReach = Math.max(1, effectiveArcanumForReach - spellRequirement + 1);
    const reachExcess = Math.max(0, totalReachUsed - freeReach);
    
    // Calculate Paradox dice from excess Reach
    const paradoxPerReach = getParadoxPerReach(gnosis);
    const paradoxDiceFromReach = reachExcess * paradoxPerReach;
    
    // Sum up dice penalties from factors
    const totalFactorPenalty = potencyResult.penalty + durationResult.penalty + scaleResult.penalty;
    
    // Mana costs
    const totalManaCost = 
        (durationResult.manaCost || 0) + 
        (rangeResult.manaCost || 0);
    
    return {
        practice: {
            name: practice,
            dots: practiceInfo.dots,
            freeReach: practiceInfo.freeReach, // Legacy field, kept for reference
            description: practiceInfo.description
        },
        castingMethod: {
            key: castingMethod,
            label: methodInfo.label,
            description: methodInfo.description,
            exceptionalAt: methodInfo.exceptionalAt,
            treatsArcanumAs5: methodInfo.treatsArcanumAs5 || false,
            roteQuality: methodInfo.roteQuality || false,
            mudraAvailable: methodInfo.mudraAvailable || false,
            doubleRitualTime: methodInfo.doubleRitualTime || false
        },
        gnosis: gnosis,
        gnosisInfo: {
            ...gnosisInfo,
            maxYantras: getMaxYantras(gnosis),
            paradoxPerReach: paradoxPerReach
        },
        arcanumDots: arcanumDots,
        spellRequirement: spellRequirement,
        factors: {
            potency: potencyResult,
            duration: durationResult,
            scale: scaleResult,
            range: rangeResult,
            castingTime: castingTimeResult
        },
        reach: {
            freeReach: freeReach, // Calculated: effectiveArcanum - spellReq + 1
            effectiveArcanum: effectiveArcanumForReach, // 5 for Rotes, else arcanumDots
            used: totalReachUsed,
            excess: reachExcess,
            breakdown: {
                primaryFactorChange: primaryFactorChangeReach,
                advancedDuration: durationResult.reachCost,
                advancedScale: scaleResult.reachCost,
                range: rangeResult.reachCost,
                castingTime: castingTimeResult.reachCost,
                additional: additionalReach,
                spellControl: spellControlReach
            }
        },
        primaryFactor: {
            default: defaultPrimaryFactor,
            chosen: primaryFactor,
            changed: primaryFactorChanged
        },
        spellControl: {
            activeSpells: activeSpells,
            maxActiveSpells: maxActiveSpells,
            spellsOver: spellsCurrentlyOver,
            reachCost: spellControlReach,
            exceedsLimit: activeSpells >= maxActiveSpells
        },
        totals: {
            factorPenalty: totalFactorPenalty,
            ritualBonus: castingTimeResult.bonusDice,
            paradoxDice: paradoxDiceFromReach,
            manaCost: totalManaCost
        }
    };
}

// =============================================================================
// HELPER FUNCTIONS FOR UI
// =============================================================================

/**
 * Get all available duration options for a scale type
 * @param {boolean} useAdvanced - Whether using advanced scale
 * @returns {Array} - Array of duration options
 */
function getDurationOptions(useAdvanced) {
    return useAdvanced ? DURATION_ADVANCED : DURATION_STANDARD;
}

/**
 * Get all available scale options
 * @param {boolean} useAdvanced - Whether using advanced scale
 * @param {string} scaleType - 'subjects' or 'aoe'
 * @returns {Array} - Array of scale options
 */
function getScaleOptions(useAdvanced, scaleType) {
    if (useAdvanced) {
        return scaleType === 'aoe' ? SCALE_ADVANCED_AOE : SCALE_ADVANCED_SUBJECTS;
    }
    return scaleType === 'aoe' ? SCALE_STANDARD_AOE : SCALE_STANDARD_SUBJECTS;
}

/**
 * Get Mana per turn based on Gnosis
 * @param {number} gnosis - Caster's Gnosis
 * @returns {number} - Mana per turn
 */
function getManaPerTurn(gnosis) {
    const gnosisInfo = GNOSIS_CHART[gnosis] || GNOSIS_CHART[1];
    return gnosisInfo.manaPerTurn;
}

/**
 * Calculate maximum Mana available for a casting
 * Based on casting time and Mana per turn
 * @param {Object} params - Parameters
 * @returns {Object} - { maxMana, manaPerTurn, turns, isUnlimited }
 */
function calculateMaxManaAvailable(params) {
    const {
        gnosis,
        castingTimeType, // 'instant' or 'ritual'
        yantrasUsed = 0,
        ritualIntervals = 1
    } = params;
    
    const manaPerTurn = getManaPerTurn(gnosis);
    
    if (castingTimeType === 'instant') {
        // Instant: 1 turn base + 1 turn per Yantra after first
        const turns = Math.max(1, yantrasUsed);
        const maxMana = manaPerTurn * turns;
        return {
            maxMana: maxMana,
            manaPerTurn: manaPerTurn,
            turns: turns,
            isUnlimited: false
        };
    } else {
        // Ritual: Many turns available, effectively unlimited
        // Even 1 minute = 20 turns (at 3 sec/turn)
        // We'll cap display at a reasonable number
        const intervalMinutes = getRitualIntervalMinutes(gnosis);
        const totalMinutes = intervalMinutes * Math.max(1, ritualIntervals);
        const turns = totalMinutes * 20; // ~3 seconds per turn
        const maxMana = manaPerTurn * turns;
        
        return {
            maxMana: Math.min(maxMana, 999), // Cap for display
            manaPerTurn: manaPerTurn,
            turns: turns,
            isUnlimited: true // Effectively unlimited for ritual
        };
    }
}

/**
 * Calculate Paradox dice pool
 * @param {Object} params - Parameters
 * @returns {Object} - { baseDice, finalDice, breakdown, rollQuality, isChanceDie }
 */
function calculateParadoxPool(params) {
    const {
        reachExcess,
        gnosis,
        previousRolls = 0,
        sleeperWitnesses = 'none',
        inuredToSpell = false,
        dedicatedTool = false,
        manaMitigation = 0
    } = params;
    
    const paradoxPerReach = getParadoxPerReach(gnosis);
    
    // Build the pool
    const breakdown = [];
    let totalDice = 0;
    
    // Base from excess Reach
    const baseDice = reachExcess * paradoxPerReach;
    if (baseDice > 0) {
        breakdown.push({ label: `Excess Reach (${reachExcess} × ${paradoxPerReach})`, value: baseDice, type: 'positive' });
        totalDice += baseDice;
    }
    
    // +2 for Inured to Spell
    if (inuredToSpell) {
        breakdown.push({ label: 'Inured to Spell', value: 2, type: 'positive' });
        totalDice += 2;
    }
    
    // +1 per previous Paradox roll this scene
    if (previousRolls > 0) {
        breakdown.push({ label: `Previous Rolls (${previousRolls})`, value: previousRolls, type: 'positive' });
        totalDice += previousRolls;
    }
    
    // +1 for Sleeper witnesses (any amount)
    if (sleeperWitnesses !== 'none') {
        breakdown.push({ label: 'Sleeper Witnesses', value: 1, type: 'positive' });
        totalDice += 1;
    }
    
    // -2 for Dedicated Tool
    if (dedicatedTool) {
        breakdown.push({ label: 'Dedicated Tool', value: -2, type: 'negative' });
        totalDice -= 2;
    }
    
    // -1 per Mana spent on mitigation
    if (manaMitigation > 0) {
        breakdown.push({ label: `Mana Mitigation (${manaMitigation})`, value: -manaMitigation, type: 'negative' });
        totalDice -= manaMitigation;
    }
    
    // Determine roll quality from Sleeper witnesses
    let rollQuality = { label: '', description: 'Standard roll' };
    switch (sleeperWitnesses) {
        case 'few':
            rollQuality = { label: '9-again', description: 'Reroll 9s and 10s' };
            break;
        case 'large':
            rollQuality = { label: '8-again', description: 'Reroll 8s, 9s, and 10s' };
            break;
        case 'crowd':
            rollQuality = { label: 'Rote', description: 'Reroll all failures once' };
            break;
    }
    
    // Final dice (minimum 0, but if any Paradox triggered, at least chance die)
    const finalDice = Math.max(0, totalDice);
    const isChanceDie = totalDice <= 0 && reachExcess > 0;
    
    return {
        baseDice: baseDice,
        finalDice: isChanceDie ? 1 : finalDice,
        totalBeforeMin: totalDice,
        breakdown: breakdown,
        rollQuality: rollQuality,
        isChanceDie: isChanceDie
    };
}

/**
 * Get ritual interval duration string based on Gnosis
 * @param {number} gnosis - Caster's Gnosis
 * @returns {string} - Interval duration (e.g., "3 hours", "1 hour")
 */
function getRitualInterval(gnosis) {
    const gnosisInfo = GNOSIS_CHART[gnosis] || GNOSIS_CHART[1];
    return gnosisInfo.ritualInterval;
}

/**
 * Get ritual interval in minutes for calculation
 * @param {number} gnosis - Caster's Gnosis
 * @returns {number} - Interval duration in minutes
 */
function getRitualIntervalMinutes(gnosis) {
    const intervals = {
        1: 180,  // 3 hours
        2: 180,  // 3 hours
        3: 60,   // 1 hour
        4: 60,   // 1 hour
        5: 30,   // 30 minutes
        6: 30,   // 30 minutes
        7: 10,   // 10 minutes
        8: 10,   // 10 minutes
        9: 1,    // 1 minute
        10: 1    // 1 minute
    };
    return intervals[gnosis] || 180;
}

/**
 * Format minutes into a readable time string
 * @param {number} minutes - Total minutes
 * @returns {string} - Formatted time (e.g., "6 Hours", "30 Minutes")
 */
function formatTime(minutes) {
    if (minutes >= 60) {
        const hours = minutes / 60;
        return hours === 1 ? "1 Hour" : `${hours} Hours`;
    } else {
        return minutes === 1 ? "1 Minute" : `${minutes} Minutes`;
    }
}

/**
 * Calculate total casting time for display purposes
 * @param {Object} params - Casting parameters
 * @returns {Object} - { display, turns, minutes, breakdown }
 */
function getTotalCastingTime(params) {
    const {
        castingTimeType, // 'instant' or 'ritual'
        gnosis,
        ritualIntervals = 0,
        yantrasUsed = 0,
        isGrimoireRote = false
    } = params;
    
    if (castingTimeType === 'instant') {
        // Instant: 1 turn base + 1 turn per Yantra after the first
        const extraTurns = Math.max(0, yantrasUsed - 1);
        const totalTurns = 1 + extraTurns;
        
        return {
            display: totalTurns === 1 ? "1 Turn" : `${totalTurns} Turns`,
            turns: totalTurns,
            minutes: null,
            breakdown: {
                base: 1,
                yantras: extraTurns
            }
        };
    } else {
        // Ritual: interval × number of intervals
        let intervalMinutes = getRitualIntervalMinutes(gnosis);
        
        // Grimoire Rotes double the interval length
        if (isGrimoireRote) {
            intervalMinutes *= 2;
        }
        
        // Minimum 1 interval if doing ritual casting
        const intervals = Math.max(1, ritualIntervals);
        const totalMinutes = intervalMinutes * intervals;
        
        return {
            display: formatTime(totalMinutes),
            turns: null,
            minutes: totalMinutes,
            intervals: intervals,
            intervalLength: formatTime(intervalMinutes),
            breakdown: {
                intervalMinutes: intervalMinutes,
                intervals: intervals,
                doubled: isGrimoireRote
            }
        };
    }
}
