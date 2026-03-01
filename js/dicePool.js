/**
 * Mage: The Awakening 2nd Edition - Dice Pool Calculator
 * Calculates the final spellcasting dice pool with all modifiers
 */

// =============================================================================
// DICE POOL CALCULATION
// =============================================================================

/**
 * Calculate the base dice pool before modifiers
 * @param {Object} params - Pool parameters
 * @returns {Object} - { pool, source, components }
 */
function calculateBasePool(params) {
    const {
        gnosis,
        arcanumDots,
        castingMethod,
        roteSkill = 0 // Skill dots used for Rote casting
    } = params;
    
    // Check if this is any type of Rote
    const isRote = castingMethod.startsWith('rote');
    
    if (isRote) {
        return {
            pool: roteSkill + arcanumDots,
            source: 'Skill + Arcanum',
            components: {
                primary: { label: 'Rote Skill', value: roteSkill },
                secondary: { label: 'Arcanum', value: arcanumDots }
            }
        };
    } else {
        // Improvised or Praxis
        return {
            pool: gnosis + arcanumDots,
            source: 'Gnosis + Arcanum',
            components: {
                primary: { label: 'Gnosis', value: gnosis },
                secondary: { label: 'Arcanum', value: arcanumDots }
            }
        };
    }
}

/**
 * Calculate Yantra bonus with proper caps
 * Maximum Yantras = ceil(Gnosis/2) + 1
 * Maximum bonus after offsetting penalties = +5
 * 
 * @param {Array} yantras - Array of yantra objects with bonus values
 * @param {number} gnosis - Caster's Gnosis
 * @param {number} spellPenalties - Total penalties from spell factors (negative number)
 * @returns {Object} - { totalBonus, effectiveBonus, yantrasUsed, maxYantras, capped, castingTimeAdded }
 */
function calculateYantraBonus(yantras, gnosis, spellPenalties) {
    const maxYantras = Math.ceil(gnosis / 2) + 1;
    const maxBonus = 5;
    
    // Limit to max Yantras allowed
    const usableYantras = yantras.slice(0, maxYantras);
    
    // Sum up raw bonus
    let rawBonus = 0;
    usableYantras.forEach(yantra => {
        rawBonus += yantra.bonus || 0;
    });
    
    // Yantras first offset penalties, then provide bonus up to +5
    // Example: -4 penalty + 7 yantra bonus = +3 effective (+5 cap not reached)
    // Example: -2 penalty + 9 yantra bonus = +5 effective (capped)
    const netModifier = spellPenalties + rawBonus;
    const effectiveBonus = Math.min(rawBonus, maxBonus - Math.min(0, spellPenalties + maxBonus));
    
    // More intuitive: after offsetting penalties, cap at +5
    // If penalties are -4 and yantras give +7, net is +3 (under cap)
    // If penalties are -2 and yantras give +9, net would be +7, but bonus portion caps at +5
    // So effective yantra contribution is: min(rawBonus, maxBonus + abs(penalties)) but net can't exceed +5
    
    // Simpler logic: 
    // 1. Yantras offset penalties first
    // 2. Remaining bonus caps at +5
    let effectiveBonusCalc;
    if (rawBonus <= Math.abs(spellPenalties)) {
        // Yantras don't fully offset penalties
        effectiveBonusCalc = rawBonus;
    } else {
        // Yantras offset penalties and provide bonus
        const bonusAfterOffset = rawBonus + spellPenalties; // spellPenalties is negative
        effectiveBonusCalc = Math.abs(spellPenalties) + Math.min(bonusAfterOffset, maxBonus);
    }
    
    // Actually, re-reading the PDF: "After offsetting penalties, maximum bonus from all Yantras combined can't exceed +5"
    // This means: Yantras can offset ANY amount of penalties, but the NET BONUS (after penalties) caps at +5
    // So if you have -8 penalties and +10 yantras, net is +2 (not capped)
    // If you have -2 penalties and +10 yantras, net would be +8 but caps at +5
    
    const netWithYantras = spellPenalties + rawBonus;
    const cappedNet = Math.min(netWithYantras, maxBonus);
    const wasCapped = netWithYantras > maxBonus;
    
    // Casting time: first yantra is reflexive, each additional adds 1 turn
    const castingTimeAdded = Math.max(0, usableYantras.length - 1);
    
    return {
        rawBonus: rawBonus,
        effectiveBonus: rawBonus, // The actual dice added from Yantras
        netAfterPenalties: cappedNet, // Net modifier after penalties and cap
        yantrasUsed: usableYantras.length,
        yantrasProvided: yantras.length,
        maxYantras: maxYantras,
        capped: wasCapped,
        cappedAt: maxBonus,
        castingTimeAdded: castingTimeAdded,
        yantrasDetail: usableYantras
    };
}

/**
 * Determine roll quality based on casting method
 * @param {string} castingMethod - 'improvised', 'praxis', 'roteGrimoire', 'roteOwn', or 'roteLearned'
 * @param {Object} methodInfo - Casting method info from CASTING_METHODS
 * @returns {Object} - { quality, againValue, exceptionalAt, description }
 */
function getRollQuality(castingMethod, methodInfo = null) {
    // Handle Rote types with Rote Quality
    if (methodInfo && methodInfo.roteQuality) {
        return {
            quality: 'rote',
            againValue: 10, // Standard 10-again
            rerollFailures: true,
            exceptionalAt: methodInfo.exceptionalAt || 5,
            description: 'Rote Quality: Reroll dice showing 1-7 once'
        };
    }
    
    // Handle Praxis
    if (castingMethod === 'praxis') {
        return {
            quality: 'standard',
            againValue: 10, // Standard 10-again, no special again bonus
            rerollFailures: false,
            exceptionalAt: 3,
            description: 'Exceptional Success at 3 successes'
        };
    }
    
    // Improvised or Rote without Rote Quality (roteLearned)
    return {
        quality: 'standard',
        againValue: 10,
        rerollFailures: false,
        exceptionalAt: 5,
        description: 'Standard roll (10-again)'
    };
}

/**
 * Calculate the complete dice pool for spellcasting
 * @param {Object} params - All spell parameters
 * @returns {Object} - Complete dice pool breakdown
 */
function calculateDicePool(params) {
    const {
        // Caster stats
        gnosis,
        arcanumDots,
        
        // Casting info
        castingMethod = 'improvised',
        castingMethodInfo = null, // Pass the full method info from CASTING_METHODS
        roteSkill = 0,
        roteSkillName = '',
        isOrderSkill = false, // For Mudra: +1 if Order skill
        
        // From spell factors (can pass the result object or individual values)
        spellFactorPenalty = 0, // Total penalty from Potency/Duration/Scale
        ritualBonus = 0, // Bonus dice from ritual intervals
        
        // Yantras
        yantras = [], // Array of { name, bonus, category }
        
        // Optional modifiers
        spendWillpower = false,
        teamworkDice = 0,
        
        // Paradox (if released)
        paradoxSuccesses = 0,
        
        // Other modifiers
        otherModifiers = [] // Array of { name, value } for misc bonuses/penalties
    } = params;
    
    // Determine if this is a Rote
    const isRote = castingMethod.startsWith('rote');
    
    // 1. Calculate base pool
    const basePool = calculateBasePool({
        gnosis,
        arcanumDots,
        castingMethod,
        roteSkill
    });
    
    // 2. Calculate Yantra bonus
    const yantraResult = calculateYantraBonus(yantras, gnosis, spellFactorPenalty);
    
    // 3. Get roll quality (pass method info for proper Rote Quality detection)
    const rollQuality = getRollQuality(castingMethod, castingMethodInfo);
    
    // 4. Calculate Mudra bonus (Rotes with mudraAvailable only)
    let mudraBonus = 0;
    if (isRote && castingMethodInfo && castingMethodInfo.mudraAvailable) {
        // Check if Mudra yantra is being used
        const mudraYantra = yantras.find(y => y.isMudra);
        if (mudraYantra) {
            mudraBonus = roteSkill + (isOrderSkill ? 1 : 0);
        }
    }
    
    // 5. Sum all modifiers
    const willpowerBonus = spendWillpower ? 3 : 0;
    
    let otherModifiersTotal = 0;
    otherModifiers.forEach(mod => {
        otherModifiersTotal += mod.value;
    });
    
    // 6. Calculate final pool
    // Formula: Base + Factor Penalties + Yantras + Ritual + Willpower + Teamwork - Paradox + Other
    const modifiersBreakdown = {
        spellFactors: spellFactorPenalty,
        yantras: yantraResult.rawBonus,
        ritual: ritualBonus,
        willpower: willpowerBonus,
        teamwork: teamworkDice,
        paradox: -paradoxSuccesses,
        other: otherModifiersTotal
    };
    
    const totalModifiers = 
        spellFactorPenalty + 
        yantraResult.rawBonus + 
        ritualBonus + 
        willpowerBonus + 
        teamworkDice - 
        paradoxSuccesses + 
        otherModifiersTotal;
    
    // Apply yantra cap: net bonus from yantras after penalties can't exceed +5
    // Recalculate with proper capping
    const uncappedPool = basePool.pool + totalModifiers;
    
    // Check yantra cap
    const yantraNetBonus = yantraResult.rawBonus + spellFactorPenalty;
    let poolAdjustment = 0;
    if (yantraNetBonus > 5) {
        poolAdjustment = -(yantraNetBonus - 5);
    }
    
    const finalPool = Math.max(0, uncappedPool + poolAdjustment);
    
    // 7. Determine if spell is possible
    // If final modifier is -10 or worse AND puts pool at chance die, spell is impossible
    const totalPenaltiesOnly = spellFactorPenalty - paradoxSuccesses + 
        otherModifiers.filter(m => m.value < 0).reduce((sum, m) => sum + m.value, 0);
    const isImpossible = totalPenaltiesOnly <= -10 && finalPool <= 0;
    
    // 8. Determine roll type
    let rollType = 'normal';
    if (finalPool <= 0) {
        rollType = isImpossible ? 'impossible' : 'chance';
    }
    
    // 9. Check for doubled ritual time (Grimoire Rotes)
    const doubleRitualTime = castingMethodInfo ? castingMethodInfo.doubleRitualTime : false;
    
    return {
        // Base pool info
        basePool: basePool,
        
        // Modifiers
        modifiers: {
            breakdown: modifiersBreakdown,
            total: totalModifiers,
            yantraCapApplied: poolAdjustment !== 0,
            yantraCapAdjustment: poolAdjustment
        },
        
        // Yantra details
        yantras: yantraResult,
        
        // Final results
        finalPool: rollType === 'chance' ? 1 : finalPool,
        rollType: rollType,
        rollQuality: rollQuality,
        
        // Ritual time
        doubleRitualTime: doubleRitualTime,
        
        // Spell possibility
        isImpossible: isImpossible,
        
        // Summary for display
        summary: {
            base: basePool.pool,
            baseSource: basePool.source,
            spellFactors: spellFactorPenalty,
            yantras: yantraResult.rawBonus,
            ritual: ritualBonus,
            willpower: willpowerBonus,
            teamwork: teamworkDice,
            paradox: paradoxSuccesses > 0 ? -paradoxSuccesses : 0,
            other: otherModifiersTotal,
            yantraCap: poolAdjustment,
            final: rollType === 'chance' ? 1 : finalPool
        }
    };
}

/**
 * Format dice pool for display
 * @param {Object} poolResult - Result from calculateDicePool
 * @returns {string} - Formatted string showing the calculation
 */
function formatDicePoolCalculation(poolResult) {
    const parts = [];
    
    // Base
    parts.push(`${poolResult.basePool.pool} (${poolResult.basePool.source})`);
    
    // Spell factors
    if (poolResult.summary.spellFactors !== 0) {
        parts.push(`${poolResult.summary.spellFactors} (Spell Factors)`);
    }
    
    // Yantras
    if (poolResult.summary.yantras > 0) {
        parts.push(`+${poolResult.summary.yantras} (Yantras)`);
    }
    
    // Ritual
    if (poolResult.summary.ritual > 0) {
        parts.push(`+${poolResult.summary.ritual} (Ritual)`);
    }
    
    // Willpower
    if (poolResult.summary.willpower > 0) {
        parts.push(`+${poolResult.summary.willpower} (Willpower)`);
    }
    
    // Teamwork
    if (poolResult.summary.teamwork > 0) {
        parts.push(`+${poolResult.summary.teamwork} (Teamwork)`);
    }
    
    // Paradox
    if (poolResult.summary.paradox < 0) {
        parts.push(`${poolResult.summary.paradox} (Paradox)`);
    }
    
    // Yantra cap
    if (poolResult.summary.yantraCap !== 0) {
        parts.push(`${poolResult.summary.yantraCap} (Yantra Cap)`);
    }
    
    // Final
    parts.push(`= ${poolResult.summary.final} dice`);
    
    if (poolResult.rollType === 'chance') {
        parts.push('(Chance Die)');
    } else if (poolResult.rollType === 'impossible') {
        parts.push('(IMPOSSIBLE)');
    }
    
    return parts.join(' ');
}

/**
 * Create a spell card object for export/display
 * @param {Object} spellFactors - Result from calculateSpellFactors
 * @param {Object} dicePool - Result from calculateDicePool
 * @param {Object} spellInfo - Additional spell info { name, arcana, description }
 * @returns {Object} - Complete spell card data
 */
function createSpellCard(spellFactors, dicePool, spellInfo = {}) {
    return {
        // Spell identification
        spell: {
            name: spellInfo.name || 'Unnamed Spell',
            arcana: spellInfo.arcana || spellFactors.practice.name,
            practice: spellFactors.practice.name,
            practiceLevel: spellFactors.practice.dots,
            description: spellInfo.description || ''
        },
        
        // Casting method
        casting: {
            method: spellFactors.castingMethod.label,
            rollQuality: dicePool.rollQuality.description
        },
        
        // Spell factors
        factors: {
            potency: spellFactors.factors.potency.value,
            duration: spellFactors.factors.duration.label,
            scale: spellFactors.factors.scale.label,
            range: spellFactors.factors.range.label,
            castingTime: spellFactors.factors.castingTime.label
        },
        
        // Reach
        reach: {
            free: spellFactors.reach.freeReach,
            used: spellFactors.reach.used,
            excess: spellFactors.reach.excess
        },
        
        // Dice pool
        dicePool: {
            final: dicePool.finalPool,
            rollType: dicePool.rollType,
            breakdown: formatDicePoolCalculation(dicePool)
        },
        
        // Costs
        costs: {
            mana: spellFactors.totals.manaCost,
            paradoxDice: spellFactors.totals.paradoxDice
        },
        
        // Timestamp
        createdAt: new Date().toISOString()
    };
}
