/**
 * Mage: The Awakening 2nd Edition - Character System
 * Character data structures, persistence, and management
 */

// =============================================================================
// PATHS - Determines Ruling and Inferior Arcana
// =============================================================================

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

// =============================================================================
// ORDERS
// =============================================================================

const ORDERS = {
    adamantineArrow: {
        label: "Adamantine Arrow",
        roteSkills: ["athletics", "intimidation", "medicine"]
    },
    guardiansOfTheVeil: {
        label: "Guardians of the Veil",
        roteSkills: ["investigation", "stealth", "subterfuge"]
    },
    mysterium: {
        label: "Mysterium",
        roteSkills: ["investigation", "occult", "survival"]
    },
    silverLadder: {
        label: "Silver Ladder",
        roteSkills: ["expression", "persuasion", "subterfuge"]
    },
    freeCouncil: {
        label: "Free Council",
        roteSkills: ["crafts", "persuasion", "science"]
    },
    seersOfTheThrone: {
        label: "Seers of the Throne",
        roteSkills: ["investigation", "occult", "persuasion"]
    },
    apostate: {
        label: "Apostate",
        roteSkills: []
    },
    nameless: {
        label: "Nameless",
        roteSkills: []
    }
};

// =============================================================================
// ARCANA
// =============================================================================

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

// =============================================================================
// SKILLS
// =============================================================================

const SKILLS = {
    // Mental Skills
    mental: {
        label: "Mental",
        skills: {
            academics:     { label: "Academics" },
            computer:      { label: "Computer" },
            crafts:        { label: "Crafts" },
            investigation: { label: "Investigation" },
            medicine:      { label: "Medicine" },
            occult:        { label: "Occult" },
            politics:      { label: "Politics" },
            science:       { label: "Science" }
        }
    },
    // Physical Skills
    physical: {
        label: "Physical",
        skills: {
            athletics:  { label: "Athletics" },
            brawl:      { label: "Brawl" },
            drive:      { label: "Drive" },
            firearms:   { label: "Firearms" },
            larceny:    { label: "Larceny" },
            stealth:    { label: "Stealth" },
            survival:   { label: "Survival" },
            weaponry:   { label: "Weaponry" }
        }
    },
    // Social Skills
    social: {
        label: "Social",
        skills: {
            animalKen:    { label: "Animal Ken" },
            empathy:      { label: "Empathy" },
            expression:   { label: "Expression" },
            intimidation: { label: "Intimidation" },
            persuasion:   { label: "Persuasion" },
            socialize:    { label: "Socialize" },
            streetwise:   { label: "Streetwise" },
            subterfuge:   { label: "Subterfuge" }
        }
    }
};

/**
 * Get a flat list of all skills
 * @returns {Object} - { skillKey: { label, category } }
 */
function getAllSkills() {
    const allSkills = {};
    for (const [category, data] of Object.entries(SKILLS)) {
        for (const [skillKey, skillData] of Object.entries(data.skills)) {
            allSkills[skillKey] = {
                label: skillData.label,
                category: category,
                categoryLabel: data.label
            };
        }
    }
    return allSkills;
}

// =============================================================================
// CHARACTER DATA STRUCTURE
// =============================================================================

/**
 * Create a new blank character
 * @returns {Object} - Character data object
 */
function createNewCharacter() {
    return {
        // Meta
        version: "1.0",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        
        // Basic Info
        name: "New Mage",
        shadowName: "",
        path: "obrimos",
        order: "mysterium",
        legacy: "",
        
        // Attributes & Traits
        gnosis: 1,
        wisdom: 7,
        
        // Resources
        mana: {
            current: 10,
            max: 10
        },
        willpower: {
            current: 5,
            max: 5
        },
        
        // Arcana (0-5 dots each)
        arcana: {
            death: 0,
            fate: 0,
            forces: 0,
            life: 0,
            matter: 0,
            mind: 0,
            prime: 0,
            space: 0,
            spirit: 0,
            time: 0
        },
        
        // Skills (0-5 dots each)
        skills: {
            // Mental
            academics: 0,
            computer: 0,
            crafts: 0,
            investigation: 0,
            medicine: 0,
            occult: 0,
            politics: 0,
            science: 0,
            // Physical
            athletics: 0,
            brawl: 0,
            drive: 0,
            firearms: 0,
            larceny: 0,
            stealth: 0,
            survival: 0,
            weaponry: 0,
            // Social
            animalKen: 0,
            empathy: 0,
            expression: 0,
            intimidation: 0,
            persuasion: 0,
            socialize: 0,
            streetwise: 0,
            subterfuge: 0
        },
        
        // Additional Rote Skills (from Legacies, etc.)
        additionalRoteSkills: [],
        
        // Dedicated Magical Tool
        dedicatedTool: "",
        
        // Spell Library
        rotes: [],
        praxes: [],
        improvisedFavorites: [],
        
        // Currently Active Spells
        activeSpells: [],
        
        // Session tracking
        session: {
            paradoxRollsThisScene: 0
        },
        
        // Discord Integration
        discord: {
            spellPreviewWebhook: "",
            dicePoolWebhook: ""
        }
    };
}

/**
 * Create a new Rote entry
 * @param {Object} params - Rote parameters
 * @returns {Object} - Rote data object
 */
function createRote(params = {}) {
    return {
        id: generateId(),
        type: 'rote',
        name: params.name || "New Rote",
        primaryArcanum: params.primaryArcanum || "prime",
        primaryArcanumLevel: params.primaryArcanumLevel || 1,
        secondaryArcanum: params.secondaryArcanum || null,
        secondaryArcanumLevel: params.secondaryArcanumLevel || null,
        practice: params.practice || "compelling",
        primaryFactor: params.primaryFactor || "potency",
        withstand: params.withstand || "",
        roteSkill: params.roteSkill || "occult",
        roteCreator: params.roteCreator || "order", // "self", "order", "grimoire"
        description: params.description || "",
        reachOptions: params.reachOptions || [], // Array of {cost: 1, effect: "description"}
        // Default casting settings
        defaults: {
            potency: params.defaults?.potency || 1,
            durationIndex: params.defaults?.durationIndex || 0,
            useAdvancedDuration: params.defaults?.useAdvancedDuration || false,
            scaleIndex: params.defaults?.scaleIndex || 0,
            useAdvancedScale: params.defaults?.useAdvancedScale || false,
            scaleType: params.defaults?.scaleType || "subjects",
            range: params.defaults?.range || "touch",
            castingTime: params.defaults?.castingTime || "ritual",
            yantraDice: params.defaults?.yantraDice || 0
        }
    };
}

/**
 * Create a new Praxis entry
 * @param {Object} params - Praxis parameters
 * @returns {Object} - Praxis data object
 */
function createPraxis(params = {}) {
    return {
        id: generateId(),
        type: 'praxis',
        name: params.name || "New Praxis",
        primaryArcanum: params.primaryArcanum || "prime",
        primaryArcanumLevel: params.primaryArcanumLevel || 1,
        secondaryArcanum: params.secondaryArcanum || null,
        secondaryArcanumLevel: params.secondaryArcanumLevel || null,
        practice: params.practice || "compelling",
        primaryFactor: params.primaryFactor || "potency",
        withstand: params.withstand || "",
        description: params.description || "",
        reachOptions: params.reachOptions || [],
        // Default casting settings
        defaults: {
            potency: params.defaults?.potency || 1,
            durationIndex: params.defaults?.durationIndex || 0,
            useAdvancedDuration: params.defaults?.useAdvancedDuration || false,
            scaleIndex: params.defaults?.scaleIndex || 0,
            useAdvancedScale: params.defaults?.useAdvancedScale || false,
            scaleType: params.defaults?.scaleType || "subjects",
            range: params.defaults?.range || "touch",
            castingTime: params.defaults?.castingTime || "ritual",
            yantraDice: params.defaults?.yantraDice || 0
        }
    };
}

/**
 * Create a new Improvised Favorite entry
 * @param {Object} params - Spell parameters
 * @returns {Object} - Improvised favorite data object
 */
function createImprovisedFavorite(params = {}) {
    return {
        id: generateId(),
        type: 'improvised',
        name: params.name || "New Spell",
        primaryArcanum: params.primaryArcanum || "prime",
        primaryArcanumLevel: params.primaryArcanumLevel || 1,
        secondaryArcanum: params.secondaryArcanum || null,
        secondaryArcanumLevel: params.secondaryArcanumLevel || null,
        practice: params.practice || "compelling",
        primaryFactor: params.primaryFactor || "potency",
        withstand: params.withstand || "",
        description: params.description || "",
        reachOptions: params.reachOptions || [],
        // Default casting settings
        defaults: {
            potency: params.defaults?.potency || 1,
            durationIndex: params.defaults?.durationIndex || 0,
            useAdvancedDuration: params.defaults?.useAdvancedDuration || false,
            scaleIndex: params.defaults?.scaleIndex || 0,
            useAdvancedScale: params.defaults?.useAdvancedScale || false,
            scaleType: params.defaults?.scaleType || "subjects",
            range: params.defaults?.range || "touch",
            castingTime: params.defaults?.castingTime || "ritual",
            yantraDice: params.defaults?.yantraDice || 0
        }
    };
}

/**
 * Create an Active Spell entry
 * @param {Object} params - Spell parameters
 * @returns {Object} - Active spell data object
 */
function createActiveSpell(params = {}) {
    return {
        id: generateId(),
        name: params.name || "Active Spell",
        arcanum: params.arcanum || "prime",
        arcanumLevel: params.arcanumLevel || 1,
        potency: params.potency || 1,
        duration: params.duration || "1 scene",
        durationRemaining: params.durationRemaining || "",
        reachUsed: params.reachUsed || 0,
        freeReach: params.freeReach || 1,
        isRelinquished: params.isRelinquished || false,
        relinquishedSafely: params.relinquishedSafely || false,
        notes: params.notes || "",
        castAt: params.castAt || new Date().toISOString()
    };
}

/**
 * Generate a unique ID
 * @returns {string} - Unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// =============================================================================
// CHARACTER HELPER FUNCTIONS
// =============================================================================

/**
 * Check if an Arcanum is a Ruling Arcanum for the character
 * @param {Object} character - Character data
 * @param {string} arcanum - Arcanum key
 * @returns {boolean}
 */
function isRulingArcanum(character, arcanum) {
    const pathData = PATHS[character.path];
    if (!pathData) return false;
    return pathData.rulingArcana.includes(arcanum);
}

/**
 * Check if an Arcanum is the Inferior Arcanum for the character
 * @param {Object} character - Character data
 * @param {string} arcanum - Arcanum key
 * @returns {boolean}
 */
function isInferiorArcanum(character, arcanum) {
    const pathData = PATHS[character.path];
    if (!pathData) return false;
    return pathData.inferiorArcanum === arcanum;
}

/**
 * Get all Rote Skills for a character (Order + Additional)
 * @param {Object} character - Character data
 * @returns {string[]} - Array of skill keys
 */
function getCharacterRoteSkills(character) {
    const orderData = ORDERS[character.order];
    const orderSkills = orderData ? orderData.roteSkills : [];
    return [...new Set([...orderSkills, ...character.additionalRoteSkills])];
}

/**
 * Check if a skill is a Rote Skill for the character
 * @param {Object} character - Character data
 * @param {string} skill - Skill key
 * @returns {boolean}
 */
function isRoteSkill(character, skill) {
    return getCharacterRoteSkills(character).includes(skill);
}

/**
 * Get the character's highest Arcanum level
 * @param {Object} character - Character data
 * @returns {number}
 */
function getHighestArcanum(character) {
    return Math.max(...Object.values(character.arcana));
}

/**
 * Get the number of active spells (not relinquished)
 * @param {Object} character - Character data
 * @returns {number}
 */
function getActiveSpellCount(character) {
    return character.activeSpells.filter(s => !s.isRelinquished).length;
}

/**
 * Get max active spells for character (equals Gnosis)
 * @param {Object} character - Character data
 * @returns {number}
 */
function getMaxActiveSpells(character) {
    return character.gnosis;
}

/**
 * Calculate Mana cost for improvised spell
 * @param {Object} character - Character data
 * @param {string} primaryArcanum - Primary Arcanum used
 * @param {string} secondaryArcanum - Secondary Arcanum used (optional)
 * @returns {number} - Additional Mana cost (0 or 1)
 */
function getImprovisedManaCost(character, primaryArcanum, secondaryArcanum = null) {
    // No cost if using Ruling Arcana
    if (isRulingArcanum(character, primaryArcanum)) {
        if (!secondaryArcanum || isRulingArcanum(character, secondaryArcanum)) {
            return 0;
        }
    }
    // +1 Mana for non-Ruling improvised
    return 1;
}

/**
 * Update character's Mana/Willpower based on Gnosis
 * @param {Object} character - Character data
 */
function updateDerivedStats(character) {
    const gnosisInfo = GNOSIS_CHART[character.gnosis] || GNOSIS_CHART[1];
    character.mana.max = gnosisInfo.manaMax;
    // Keep current within max
    character.mana.current = Math.min(character.mana.current, character.mana.max);
}

// =============================================================================
// PERSISTENCE - SAVE/LOAD
// =============================================================================

/**
 * Export character to JSON string
 * @param {Object} character - Character data
 * @returns {string} - JSON string
 */
function exportCharacter(character) {
    character.updatedAt = new Date().toISOString();
    return JSON.stringify(character, null, 2);
}

/**
 * Export character as downloadable file
 * @param {Object} character - Character data
 */
function downloadCharacter(character) {
    const json = exportCharacter(character);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${character.name.replace(/[^a-z0-9]/gi, '_')}_mage.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Import character from JSON string
 * @param {string} json - JSON string
 * @returns {Object} - Character data or null if invalid
 */
function importCharacter(json) {
    try {
        const character = JSON.parse(json);
        
        // Validate required fields
        if (!character.name || !character.gnosis || !character.arcana) {
            throw new Error("Invalid character file: missing required fields");
        }
        
        // Merge with default to ensure all fields exist
        const defaultChar = createNewCharacter();
        const merged = deepMerge(defaultChar, character);
        merged.updatedAt = new Date().toISOString();
        
        return merged;
    } catch (e) {
        console.error("Failed to import character:", e);
        return null;
    }
}

/**
 * Load character from file input
 * @param {File} file - File object from input
 * @returns {Promise<Object>} - Promise resolving to character data
 */
function loadCharacterFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const character = importCharacter(e.target.result);
            if (character) {
                resolve(character);
            } else {
                reject(new Error("Failed to parse character file"));
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} - Merged object
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
            if (Array.isArray(source[key])) {
                result[key] = source[key];
            } else {
                result[key] = deepMerge(target[key], source[key]);
            }
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

// =============================================================================
// SPELL MANAGEMENT
// =============================================================================

/**
 * Add an active spell to character
 * @param {Object} character - Character data
 * @param {Object} spellParams - Spell parameters
 * @returns {Object} - The created spell
 */
function addActiveSpell(character, spellParams) {
    const spell = createActiveSpell(spellParams);
    character.activeSpells.push(spell);
    return spell;
}

/**
 * Remove an active spell by ID
 * @param {Object} character - Character data
 * @param {string} spellId - Spell ID to remove
 */
function removeActiveSpell(character, spellId) {
    character.activeSpells = character.activeSpells.filter(s => s.id !== spellId);
}

/**
 * Relinquish a spell
 * @param {Object} character - Character data
 * @param {string} spellId - Spell ID
 * @param {boolean} safely - Whether relinquished safely (costs Willpower dot)
 */
function relinquishSpell(character, spellId, safely = false) {
    const spell = character.activeSpells.find(s => s.id === spellId);
    if (spell) {
        spell.isRelinquished = true;
        spell.relinquishedSafely = safely;
    }
}

/**
 * Add a Rote to character
 * @param {Object} character - Character data
 * @param {Object} roteParams - Rote parameters
 * @returns {Object} - The created rote
 */
function addRote(character, roteParams) {
    const rote = createRote(roteParams);
    character.rotes.push(rote);
    return rote;
}

/**
 * Remove a Rote by ID
 * @param {Object} character - Character data
 * @param {string} roteId - Rote ID
 */
function removeRote(character, roteId) {
    character.rotes = character.rotes.filter(r => r.id !== roteId);
}

/**
 * Add a Praxis to character
 * @param {Object} character - Character data
 * @param {Object} praxisParams - Praxis parameters
 * @returns {Object} - The created praxis
 */
function addPraxis(character, praxisParams) {
    const praxis = createPraxis(praxisParams);
    character.praxes.push(praxis);
    return praxis;
}

/**
 * Remove a Praxis by ID
 * @param {Object} character - Character data
 * @param {string} praxisId - Praxis ID
 */
function removePraxis(character, praxisId) {
    character.praxes = character.praxes.filter(p => p.id !== praxisId);
}

/**
 * Add an Improvised Favorite to character
 * @param {Object} character - Character data
 * @param {Object} spellParams - Spell parameters
 * @returns {Object} - The created spell
 */
function addImprovisedFavorite(character, spellParams) {
    const spell = createImprovisedFavorite(spellParams);
    if (!character.improvisedFavorites) character.improvisedFavorites = [];
    character.improvisedFavorites.push(spell);
    return spell;
}

/**
 * Remove an Improvised Favorite by ID
 * @param {Object} character - Character data
 * @param {string} spellId - Spell ID
 */
function removeImprovisedFavorite(character, spellId) {
    if (!character.improvisedFavorites) return;
    character.improvisedFavorites = character.improvisedFavorites.filter(s => s.id !== spellId);
}

/**
 * Get all spells grouped by Arcanum
 * @param {Object} character - Character data
 * @returns {Object} - { arcanum: { rotes: [], praxes: [], improvised: [] } }
 */
function getSpellsByArcanum(character) {
    const grouped = {};
    
    // Initialize all arcana
    const arcanaList = ['death', 'fate', 'forces', 'life', 'matter', 'mind', 'prime', 'space', 'spirit', 'time'];
    arcanaList.forEach(a => {
        grouped[a] = { rotes: [], praxes: [], improvised: [] };
    });
    
    // Group rotes
    (character.rotes || []).forEach(spell => {
        const arcanum = spell.primaryArcanum?.toLowerCase() || 'prime';
        if (grouped[arcanum]) grouped[arcanum].rotes.push(spell);
    });
    
    // Group praxes
    (character.praxes || []).forEach(spell => {
        const arcanum = spell.primaryArcanum?.toLowerCase() || 'prime';
        if (grouped[arcanum]) grouped[arcanum].praxes.push(spell);
    });
    
    // Group improvised favorites
    (character.improvisedFavorites || []).forEach(spell => {
        const arcanum = spell.primaryArcanum?.toLowerCase() || 'prime';
        if (grouped[arcanum]) grouped[arcanum].improvised.push(spell);
    });
    
    return grouped;
}

/**
 * Calculate spell card display data
 * @param {Object} spell - Spell data
 * @param {Object} character - Character data
 * @returns {Object} - Display data for spell card
 */
function calculateSpellCardData(spell, character) {
    const isRote = spell.type === 'rote';
    const isPraxis = spell.type === 'praxis';
    
    // Get arcanum dots
    const primaryDots = character.arcana[spell.primaryArcanum] || 0;
    const secondaryDots = spell.secondaryArcanum ? (character.arcana[spell.secondaryArcanum] || 0) : null;
    const highestDots = Math.max(primaryDots, secondaryDots || 0);
    
    // Calculate dice pool base
    let basePool = 0;
    let baseSource = '';
    
    if (isRote && spell.roteSkill) {
        // Rote: Skill + Arcanum
        const skillDots = character.skills[spell.roteSkill] || 0;
        basePool = skillDots + primaryDots;
        const skillLabel = getSkillLabel(spell.roteSkill);
        baseSource = `${skillLabel} ${skillDots} + ${capitalize(spell.primaryArcanum)} ${primaryDots}`;
    } else {
        // Praxis/Improvised: Gnosis + Arcanum
        basePool = character.gnosis + primaryDots;
        baseSource = `Gnosis ${character.gnosis} + ${capitalize(spell.primaryArcanum)} ${primaryDots}`;
    }
    
    // Calculate Free Reach
    let freeReach = 1;
    let effectiveArcanum = highestDots;
    
    if (isRote) {
        // Rotes treat as having 5 dots for Free Reach
        effectiveArcanum = 5;
    }
    freeReach = Math.max(1, effectiveArcanum - spell.primaryArcanumLevel + 1);
    
    // Get default settings
    const defaults = spell.defaults || {};
    
    // Yantra dice
    const yantraDice = defaults.yantraDice || 0;
    const totalPool = basePool + yantraDice;
    
    // Get duration and scale labels
    const durationLabel = getDurationLabel(defaults.durationIndex || 0, defaults.useAdvancedDuration || false);
    const scaleLabel = getScaleLabel(defaults.scaleIndex || 0, defaults.useAdvancedScale || false, defaults.scaleType || 'subjects');
    
    // Check if ruling arcanum (no +1 Mana for improvised)
    const isRuling = isRulingArcanum(character, spell.primaryArcanum);
    const manaCost = (!isRote && !isPraxis && !isRuling) ? 1 : 0;
    
    // Roll quality
    let rollQuality = 'Standard';
    if (isRote) {
        if (spell.roteCreator === 'self' || spell.roteCreator === 'order') {
            rollQuality = 'Rote Quality';
        } else if (spell.roteCreator === 'grimoire') {
            rollQuality = 'Rote Quality (2× time)';
        }
    } else if (isPraxis) {
        rollQuality = 'Exceptional at 3';
    }
    
    return {
        name: spell.name,
        type: spell.type,
        typeLabel: isRote ? 'Rote' : (isPraxis ? 'Praxis' : 'Improvised'),
        primaryArcanum: spell.primaryArcanum,
        primaryArcanumLevel: spell.primaryArcanumLevel,
        secondaryArcanum: spell.secondaryArcanum,
        secondaryArcanumLevel: spell.secondaryArcanumLevel,
        practice: spell.practice,
        primaryFactor: spell.primaryFactor,
        withstand: spell.withstand,
        roteSkill: spell.roteSkill,
        roteCreator: spell.roteCreator,
        description: spell.description,
        reachOptions: spell.reachOptions || [],
        // Calculated values
        basePool: basePool,
        baseSource: baseSource,
        freeReach: freeReach,
        effectiveArcanum: effectiveArcanum,
        rollQuality: rollQuality,
        manaCost: manaCost,
        isRuling: isRuling,
        // Yantra info
        yantraDice: yantraDice,
        totalPool: totalPool,
        // Default settings
        potency: defaults.potency || 1,
        durationLabel: durationLabel,
        scaleLabel: scaleLabel,
        range: defaults.range || 'touch',
        castingTime: defaults.castingTime || 'ritual'
    };
}

/**
 * Get skill label from key
 */
function getSkillLabel(skillKey) {
    const labels = {
        academics: 'Academics', computer: 'Computer', crafts: 'Crafts',
        investigation: 'Investigation', medicine: 'Medicine', occult: 'Occult',
        politics: 'Politics', science: 'Science', athletics: 'Athletics',
        brawl: 'Brawl', drive: 'Drive', firearms: 'Firearms',
        larceny: 'Larceny', stealth: 'Stealth', survival: 'Survival',
        weaponry: 'Weaponry', animalKen: 'Animal Ken', empathy: 'Empathy',
        expression: 'Expression', intimidation: 'Intimidation', persuasion: 'Persuasion',
        socialize: 'Socialize', streetwise: 'Streetwise', subterfuge: 'Subterfuge'
    };
    return labels[skillKey] || skillKey;
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get duration label from index
 */
function getDurationLabel(index, isAdvanced) {
    const standard = ['1 turn', '2 turns', '3 turns', '5 turns', '10 turns', '20 turns'];
    const advanced = ['1 scene', '1 day', '1 week', '1 month', '1 year', 'Indefinite'];
    const scale = isAdvanced ? advanced : standard;
    return scale[Math.min(index, scale.length - 1)] || scale[0];
}

/**
 * Get scale label from index
 */
function getScaleLabel(index, isAdvanced, scaleType) {
    if (scaleType === 'aoe') {
        const standard = ['Arm\'s reach', 'Small room', 'Large room', 'Several rooms', 'Small building'];
        const advanced = ['Large building', 'City block', 'Small neighborhood', 'Large neighborhood', 'Entire district'];
        const scale = isAdvanced ? advanced : standard;
        return scale[Math.min(index, scale.length - 1)] || scale[0];
    } else {
        const standard = ['1 subject', '2 subjects', '4 subjects', '8 subjects', '16 subjects'];
        const advanced = ['5 subjects', '10 subjects', '20 subjects', '40 subjects', '80 subjects'];
        const scale = isAdvanced ? advanced : standard;
        return scale[Math.min(index, scale.length - 1)] || scale[0];
    }
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate that character can cast a spell with given Arcanum requirements
 * @param {Object} character - Character data
 * @param {string} primaryArcanum - Primary Arcanum needed
 * @param {number} primaryLevel - Level needed
 * @param {string} secondaryArcanum - Secondary Arcanum (optional)
 * @param {number} secondaryLevel - Secondary level (optional)
 * @returns {Object} - { canCast, reason }
 */
function canCastSpell(character, primaryArcanum, primaryLevel, secondaryArcanum = null, secondaryLevel = null) {
    // Check primary Arcanum
    if (character.arcana[primaryArcanum] < primaryLevel) {
        return {
            canCast: false,
            reason: `Requires ${ARCANA[primaryArcanum].label} ${primaryLevel}, you have ${character.arcana[primaryArcanum]}`
        };
    }
    
    // Check secondary Arcanum if applicable
    if (secondaryArcanum && secondaryLevel) {
        if (character.arcana[secondaryArcanum] < secondaryLevel) {
            return {
                canCast: false,
                reason: `Requires ${ARCANA[secondaryArcanum].label} ${secondaryLevel}, you have ${character.arcana[secondaryArcanum]}`
            };
        }
    }
    
    return { canCast: true, reason: null };
}
