// tests/run.mjs — Rules-engine test harness (Code Review Plan, Phase 1)
//
// Usage:  node tests/run.mjs           (add --verbose to print every drift case)
//
// Part A: unit tests locking in the behavior of the shared engine
//         (js/spellFactors.js + js/dicePool.js). Failures exit 1.
// Part B: drift comparison — the same casting inputs are fed to the shared
//         engine and to wizard.html's inline engine (deriveValues), and every
//         disagreement is tallied. Drift is REPORTED, not failed: the findings
//         feed docs/engine-drift.md and are resolved in plan Phase 4.
//
// Both engines are loaded from the live source files (wizard's engine is
// extracted between its "Game data" and "UI atoms" markers), so this harness
// always tests what the app actually ships.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const verbose = process.argv.includes('--verbose');

// ── Load the shared engine ──────────────────────────────────────────────────
const sharedCtx = vm.createContext({ console });
vm.runInContext(read('js/spellFactors.js'), sharedCtx, { filename: 'spellFactors.js' });
vm.runInContext(read('js/dicePool.js'), sharedCtx, { filename: 'dicePool.js' });
const S = {
  calculateSpellFactors: vm.runInContext('calculateSpellFactors', sharedCtx),
  calculateDicePool:     vm.runInContext('calculateDicePool', sharedCtx),
  calculateParadoxPool:  vm.runInContext('calculateParadoxPool', sharedCtx),
  calculateCastingTime:  vm.runInContext('calculateCastingTime', sharedCtx),
  calculateYantraBonus:  vm.runInContext('calculateYantraBonus', sharedCtx),
  getRollQuality:        vm.runInContext('getRollQuality', sharedCtx),
  getMaxYantras:         vm.runInContext('getMaxYantras', sharedCtx),
  getParadoxPerReach:    vm.runInContext('getParadoxPerReach', sharedCtx),
  CASTING_METHODS:       vm.runInContext('CASTING_METHODS', sharedCtx),
  YANTRA_TYPES:          vm.runInContext('YANTRA_TYPES', sharedCtx),
  GNOSIS_CHART:          vm.runInContext('GNOSIS_CHART', sharedCtx),
};

// ── Extract + load the wizard's inline engine ──────────────────────────────
const wizardHtml = read('wizard.html');
const startMark = '// ── Game data'; // prefix match — the full heading carries a note
const endMark = '// ── UI atoms ──';
const startIdx = wizardHtml.indexOf(startMark);
const endIdx = wizardHtml.indexOf(endMark);
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  console.error('FATAL: could not locate wizard engine markers in wizard.html');
  process.exit(2);
}
const wizardCtx = vm.createContext({ console });
vm.runInContext(read('js/gameData.js'), wizardCtx, { filename: 'gameData.js' });
vm.runInContext(read('js/spellFactors.js'), wizardCtx, { filename: 'spellFactors.js' });
vm.runInContext(read('js/dicePool.js'), wizardCtx, { filename: 'dicePool.js' });
// NOTE: Babel standalone executes text/babel blocks in GLOBAL scope, so the
// wizard block's top-level names must not collide with engine globals (that
// bit us once: 'PRACTICES'). The IIFE here keeps the vm tidy; real collision
// safety comes from distinct names in wizard.html itself.
vm.runInContext(
  `globalThis.__wizard = (function () {\n${wizardHtml.slice(startIdx, endIdx)}\n` +
  `return { deriveValues, PATHS }; })();`,
  wizardCtx, { filename: 'wizard-engine.js' });
const W = {
  deriveValues: vm.runInContext('__wizard.deriveValues', wizardCtx),
  PATHS: vm.runInContext('__wizard.PATHS', wizardCtx),
  MageData: vm.runInContext('MageData', wizardCtx),
};

// ── Tiny test runner ────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function t(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`); }
}

// ═════════════════════════════════════════════════════════════════════════════
// Part A — shared engine unit tests
// ═════════════════════════════════════════════════════════════════════════════
console.log('Part A — shared engine unit tests (js/spellFactors.js + js/dicePool.js)');

const sf = (over = {}) => S.calculateSpellFactors({
  practice: 'compelling', arcanumDots: 3, spellArcanumReq: 2, gnosis: 5,
  activeSpells: 0, castingMethod: 'improvised',
  defaultPrimaryFactor: 'potency', primaryFactor: 'potency',
  potency: 1, durationIndex: 0, scaleIndex: 0, scaleType: 'subjects',
  range: 'touch', castingTime: 'ritual', ritualIntervals: 0, additionalReach: 0,
  ...over,
});

// Free Reach
t('freeReach: improvised dots3 req2 = 2', sf().reach.freeReach, 2);
t('freeReach: improvised dots1 req1 = 1', sf({ arcanumDots: 1, spellArcanumReq: 1 }).reach.freeReach, 1);
t('freeReach: clamps to 1 when dots < req', sf({ arcanumDots: 2, spellArcanumReq: 4 }).reach.freeReach, 1);
t('freeReach: rote treats arcanum as 5 (req2 = 4)', sf({ castingMethod: 'roteGrimoire' }).reach.freeReach, 4);
t('freeReach: roteOwn same', sf({ castingMethod: 'roteOwn', arcanumDots: 1 }).reach.freeReach, 4);
t('freeReach: praxis uses real dots', sf({ castingMethod: 'praxis' }).reach.freeReach, 2);

// Paradox-per-Reach + Gnosis chart invariants
for (const g of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  t(`paradoxPerReach g${g} = ceil(g/2)`, S.getParadoxPerReach(g), Math.ceil(g / 2));
  t(`gnosis chart paradoxPerReach g${g} matches formula`, S.GNOSIS_CHART[g].paradoxPerReach, Math.ceil(g / 2));
  t(`maxYantras g${g} = ceil(g/2)+1`, S.getMaxYantras(g), Math.ceil(g / 2) + 1);
}

// Factor penalties
t('potency: primary, within free levels = 0', sf({ potency: 3 }).factors.potency.penalty, 0);
t('potency: primary, 2 over free = -4', sf({ potency: 5 }).factors.potency.penalty, -4);
t('potency: non-primary free level is 1', sf({ primaryFactor: 'duration', defaultPrimaryFactor: 'duration', potency: 3 }).factors.potency.penalty, -4);
t('duration: non-primary index2 (level 3) = -4', sf({ durationIndex: 2 }).factors.duration.penalty, -4);
t('duration: primary uses arcanum dots free', sf({ primaryFactor: 'duration', defaultPrimaryFactor: 'duration', durationIndex: 2 }).factors.duration.penalty, 0);
t('scale: never primary, index1 = -2', sf({ scaleIndex: 1 }).factors.scale.penalty, -2);
t('scale: index clamps to table end', sf({ scaleIndex: 99 }).factors.scale.penalty, -8);
t('total factor penalty sums', sf({ potency: 4, durationIndex: 1, scaleIndex: 1 }).totals.factorPenalty, -2 - 2 - 2);

// Reach accounting
t('reach: advanced duration +1', sf({ useAdvancedDuration: true }).reach.used, 1);
t('reach: advanced scale +1', sf({ useAdvancedScale: true }).reach.used, 1);
t('reach: advanced potency +1', sf({ useAdvancedPotency: true }).reach.used, 1);
t('reach: sensory +1', sf({ range: 'sensory' }).reach.used, 1);
t('reach: remote viewed +2', sf({ range: 'remoteView' }).reach.used, 2);
t('reach: sympathetic costs 0 reach (attainment)', sf({ range: 'sympathetic' }).reach.used, 0);
t('reach: instant +1', sf({ castingTime: 'instant' }).reach.used, 1);
t('reach: changed primary factor +1', sf({ primaryFactor: 'duration' }).reach.used, 1);
t('reach: additionalReach passes through', sf({ additionalReach: 3 }).reach.used, 3);

// Spell control reach: 1 + spells over the Gnosis limit
t('spellControl: under limit = 0', sf({ activeSpells: 4 }).reach.breakdown.spellControl, 0);
t('spellControl: at limit = 1', sf({ activeSpells: 5 }).reach.breakdown.spellControl, 1);
t('spellControl: 2 over limit = 3', sf({ activeSpells: 7 }).reach.breakdown.spellControl, 3);

// Paradox dice from excess reach
t('paradox dice: excess 2 at g5 = 6', sf({ additionalReach: 4 }).totals.paradoxDice, 6);
t('paradox dice: none within free reach', sf({ additionalReach: 2 }).totals.paradoxDice, 0);

// Mana from factors
t('mana: indefinite duration = 1', sf({ useAdvancedDuration: true, durationIndex: 5 }).totals.manaCost, 1);
t('mana: sympathetic range = 1', sf({ range: 'sympathetic' }).totals.manaCost, 1);
t('mana: temporal range = 1', sf({ range: 'temporal' }).totals.manaCost, 1);

// Ritual casting time
t('ritual bonus dice = intervals', S.calculateCastingTime('ritual', 3).bonusDice, 3);
t('ritual bonus caps at +5', S.calculateCastingTime('ritual', 7).bonusDice, 5);
t('instant grants no ritual bonus', S.calculateCastingTime('instant', 3).bonusDice, 0);

// Paradox pool
const pp = (over = {}) => S.calculateParadoxPool({
  reachExcess: 1, gnosis: 5, previousRolls: 0, sleeperWitnesses: 'none',
  inuredToSpell: false, dedicatedTool: false, manaMitigation: 0, ...over,
});
t('paradox pool: excess1 g5 = 3', pp().finalDice, 3);
t('paradox pool: dedicated tool -2', pp({ dedicatedTool: true }).finalDice, 1);
t('paradox pool: mana mitigation subtracts', pp({ manaMitigation: 2 }).finalDice, 1);
t('paradox pool: reduced to 0 with excess = chance die', pp({ dedicatedTool: true, manaMitigation: 1 }), { ...pp({ dedicatedTool: true, manaMitigation: 1 }), finalDice: 1, isChanceDie: true });
t('paradox pool: witnesses +1', pp({ sleeperWitnesses: 'few' }).finalDice, 4);
t('paradox pool: inured +2', pp({ inuredToSpell: true }).finalDice, 5);
t('paradox pool: previous rolls add', pp({ previousRolls: 3 }).finalDice, 6);
t('paradox pool: few witnesses = 9-again', pp({ sleeperWitnesses: 'few' }).rollQuality.label, '9-again');
t('paradox pool: large group = 8-again', pp({ sleeperWitnesses: 'large' }).rollQuality.label, '8-again');
t('paradox pool: crowd = rote quality', pp({ sleeperWitnesses: 'crowd' }).rollQuality.label, 'Rote');

// Dice pool
const dp = (over = {}) => S.calculateDicePool({
  gnosis: 3, arcanumDots: 3, castingMethod: 'improvised',
  castingMethodInfo: S.CASTING_METHODS.improvised,
  spellFactorPenalty: 0, ritualBonus: 0, yantras: [],
  spendWillpower: false, teamworkDice: 0, paradoxSuccesses: 0,
  otherModifiers: [], againOverride: 10, ...over,
});
t('pool: base = gnosis + arcanum', dp().finalPool, 6);
t('pool: willpower +3', dp({ spendWillpower: true }).finalPool, 9);
t('pool: teamwork adds', dp({ teamworkDice: 2 }).finalPool, 8);
t('pool: released paradox successes subtract', dp({ paradoxSuccesses: 2 }).finalPool, 4);
t('pool: other modifiers apply', dp({ otherModifiers: [{ name: 'x', value: -3 }] }).finalPool, 3);
t('pool: heavy penalties -> chance die (1)', dp({ spellFactorPenalty: -8 }).finalPool, 1);
t('pool: heavy penalties -> rollType chance', dp({ spellFactorPenalty: -8 }).rollType, 'chance');
t('pool: yantra net cap at +5 (pen -2, yantras +9 -> adj -2)',
  dp({ spellFactorPenalty: -2, yantras: [{ name: 'a', bonus: 2 }, { name: 'b', bonus: 3 }, { name: 'c', bonus: 4 }], gnosis: 9, arcanumDots: 3 }).modifiers.yantraCapAdjustment, -2);
t('pool: yantras fully offsetting big penalties are not capped',
  dp({ spellFactorPenalty: -8, yantras: [{ name: 'a', bonus: 5 }, { name: 'b', bonus: 5 }], gnosis: 9 }).modifiers.yantraCapApplied, false);
t('pool: yantra count limited to max for gnosis (g1 -> 2 of 3 used)',
  dp({ gnosis: 1, yantras: [{ name: 'a', bonus: 2 }, { name: 'b', bonus: 2 }, { name: 'c', bonus: 2 }] }).yantras.yantrasUsed, 2);

// Roll quality
t('quality: praxis exceptional at 3', S.getRollQuality('praxis', S.CASTING_METHODS.praxis).exceptionalAt, 3);
t('quality: roteOwn has rote quality', S.getRollQuality('roteOwn', S.CASTING_METHODS.roteOwn).quality, 'rote');
t('quality: roteLearned has NO rote quality', S.getRollQuality('roteLearned', S.CASTING_METHODS.roteLearned).quality, 'standard');
t('quality: 8-again override applies', dp({ againOverride: 8 }).rollQuality.againValue, 8);

// B1 resolved (Phase 4): Mudra is a Yantra — its dice ride in the yantra's
// own bonus and count toward the +5 net cap. The dead roteSkill/isOrderSkill
// params were removed from calculateDicePool.
t('B1: mudra dice ride in the yantra bonus',
  dp({ castingMethod: 'roteOwn', castingMethodInfo: S.CASTING_METHODS.roteOwn, yantras: [{ name: 'Mudra', isMudra: true, bonus: 4 }] }).finalPool, 10);
t('B1: mudra dice count toward the +5 net yantra cap',
  dp({ castingMethod: 'roteOwn', castingMethodInfo: S.CASTING_METHODS.roteOwn, gnosis: 9,
       yantras: [{ name: 'Mudra', isMudra: true, bonus: 5 }, { name: 'High Speech', bonus: 2 }] })
    .modifiers.yantraCapAdjustment, -2);

// B2 resolved (Phase 4): no excess Reach -> no Paradox roll at all.
t('B2: zero excess reach -> no paradox roll even when inured',
  pp({ reachExcess: 0, inuredToSpell: true, previousRolls: 3, sleeperWitnesses: 'crowd' }).finalDice, 0);
t('B2: zero excess reach flags noRoll',
  pp({ reachExcess: 0 }).noRoll, true);

// Wizard's yantra bonus table must match shared YANTRA_TYPES values
const yantraPairs = [
  ['Path Tool', 'pathTool'], ['Order Tool', 'orderTool'], ['Demesne', 'demesne'],
  ['Environment', 'environment'], ['Supernal Verge', 'supernalVerge'],
  ['Concentration', 'concentration'], ['High Speech', 'highSpeech'], ['Rune', 'rune'],
  ['Material', 'material'], ['Representational', 'representational'],
  ['Normal Sacrament', 'sacramentNormal'], ['Rare Sacrament', 'sacramentRare'],
  ['Other Realm Sacrament', 'sacramentOtherRealm'],
];
const WIZ_YANTRA_BONUSES = {
  'Path Tool': 1, 'Order Tool': 1, 'Demesne': 2, 'Environment': 1,
  'Supernal Verge': 2, 'Concentration': 2, 'High Speech': 2, 'Rune': 2,
  'Material': 2, 'Representational': 1, 'Normal Sacrament': 1,
  'Rare Sacrament': 2, 'Other Realm Sacrament': 3,
};
for (const [wName, sKey] of yantraPairs) {
  t(`yantra value parity: ${wName}`, WIZ_YANTRA_BONUSES[wName], S.YANTRA_TYPES[sKey].bonus);
}
// (The wizard's PARADOX_PER_REACH / MANA_PER_TURN duplicate tables were
// deleted in Phase 4 — it calls getParadoxPerReach/getManaPerTurn directly.)

// Canonical Arcanum color identities (js/gameData.js) — locked to the table's
// established values; any change here is a deliberate theme decision.
const CANONICAL_HEX = {
  death: '#475569', fate: '#e2e8f0', forces: '#f87171', life: '#4ade80',
  matter: '#d97706', mind: '#fbbf24', prime: '#60a5fa', space: '#a78bfa',
  spirit: '#fb923c', time: '#22d3ee',
};
const MD = W.MageData;
t('gameData: ARCANUM_HEX matches canonical table', MD.ARCANUM_HEX, CANONICAL_HEX);
for (const k of Object.keys(CANONICAL_HEX)) {
  t(`gameData: ARCANUM_INT[${k}] = parsed hex`, MD.ARCANUM_INT[k], parseInt(CANONICAL_HEX[k].slice(1), 16));
}
t('gameData: arcanumHex is case-insensitive', MD.arcanumHex('Death'), '#475569');
t('gameData: arcanumInt falls back to accent purple', MD.arcanumInt('unknown'), 0x7B2CBF);
// ── shared/discord.js (Phase 7) ────────────────────────────────────────────
const discordCtx = vm.createContext({ console });
vm.runInContext(read('js/gameData.js'), discordCtx, { filename: 'gameData.js' });
vm.runInContext(read('shared/discord.js'), discordCtx, { filename: 'discord.js' });
const DS = vm.runInContext('DiscordShared', discordCtx);
t('discord: rote command', DS.formatDiceCommand(7, { quality: 'rote', againValue: 10 }), '$rote 7');
t('discord: 8-again command', DS.formatDiceCommand(5, { quality: 'normal', againValue: 8 }), '$cod8 5');
t('discord: 9-again command', DS.formatDiceCommand(4, { quality: 'normal', againValue: 9 }), '$cod9 4');
t('discord: 10-again command', DS.formatDiceCommand(6, { quality: 'normal', againValue: 10 }), '$cod 6');
t('discord: paradox chance die rolls 0',
  DS.formatParadoxCommand({ isChanceDie: true, finalDice: 1, rollQuality: { againValue: 10 } }), '$cod 0');
t('discord: paradox command with 9-again',
  DS.formatParadoxCommand({ isChanceDie: false, finalDice: 3, rollQuality: { againValue: 9 } }), '$cod9 3');
t('discord: embed color resolves Title Case arcanum',
  DS.buildEmbed({ title: 't', arcanum: 'Forces', fields: [] }).color, MD.ARCANUM_INT.forces);
t('discord: embed color falls back to accent purple',
  DS.buildEmbed({ title: 't', arcanum: null, fields: [] }).color, 0x7B2CBF);
t('discord: pool summary omits paradox when within free Reach',
  DS.buildPoolSummaryFields({ pool: 8, usedReach: 1, freeReach: 2, excessReach: 0, manaCost: 0, paradoxText: '' }).length, 3);
t('discord: pool summary adds paradox field when over Reach',
  DS.buildPoolSummaryFields({ pool: 8, usedReach: 3, freeReach: 2, excessReach: 1, manaCost: 1, paradoxText: '2 dice' }).pop(),
  { name: '⚠️ Paradox', value: '2 dice', inline: true });

// ── js/tiltCatalog.js (Phase 9) — CSV parsing ───────────────────────────────
const tiltCtx = vm.createContext({ console });
vm.runInContext(read('js/tiltCatalog.js'), tiltCtx, { filename: 'tiltCatalog.js' });
const TC = vm.runInContext('tiltCatalog', tiltCtx);
t('tiltCatalog: parses a simple row',
  TC.csvToEntries('name,type,persistent,environmental,description\nBlinded,tilt,no,no,Cannot see.'),
  [{ name: 'Blinded', type: 'tilt', persistent: false, environmental: false,
     description: 'Cannot see.', resolution: '', beat: '', effect: '', causing: '',
     ending: '', sourceBook: '', sourcePage: null }]);
t('tiltCatalog: quoted cells keep commas and escaped quotes',
  TC.csvToEntries('name,type,description\nAddicted,condition,"Needs a ""fix"", badly."')[0].description,
  'Needs a "fix", badly.');
t('tiltCatalog: skips comment and blank lines, finds header after comments',
  TC.csvToEntries('# note\n\nname,type\n# another\nLeg Wrack,tilt\n\n').length, 1);
t('tiltCatalog: rows without a name are dropped',
  TC.csvToEntries('name,type\n,tilt\nStunned,tilt').map(e => e.name), ['Stunned']);
t('tiltCatalog: type defaults to tilt, sourcePage parses to int',
  (e => ({ type: e.type, page: e.sourcePage }))(
    TC.csvToEntries('name,sourcepage\nKnocked Down,285')[0]),
  { type: 'tilt', page: 285 });
t('tiltCatalog: persistent accepts yes/true/1',
  TC.csvToEntries('name,type,persistent\nA,condition,yes\nB,condition,true\nC,condition,1\nD,condition,no')
    .map(e => e.persistent),
  [true, true, true, false]);
t('tiltCatalog: getByName is null-safe on empty catalog', TC.getByName('Blinded'), null);
t('wizard PATHS ruling arcana = Title Case view of canonical',
  Object.fromEntries(Object.entries(W.PATHS).map(([k, p]) => [k, p.rulingArcana])),
  Object.fromEntries(Object.entries(MD.PATHS).map(([k, p]) => [k, p.rulingArcana.map(MD.tc)])));

// ── js/spellCompendium.js (Phase 10) — pure helpers ─────────────────────────
// The module is no-JSX React; evaluated under vm with no React/firebase/window,
// the service object's pure helpers (csvToSpells/validateSpell/sanitiseSpell)
// are still constructed and reachable. CompendiumPanel resolves to null (no React).
const compCtx = vm.createContext({ console });
vm.runInContext(read('js/spellCompendium.js'), compCtx, { filename: 'spellCompendium.js' });
const CMP = vm.runInContext('compendium', compCtx);

// csvToSpells — reach cost-prefix + optArcana pipe parsing
const cmpRow = CMP.csvToSpells(
  'name,sourceBook,sourcePage,primaryArcanum,primaryArcanumLevel,practice,primaryFactor,reach1,reach2,optArcana\n' +
  'Speak with the Dead,core,132,death,2,knowing,potency,First effect.,2: Second effect,space 1: widen|death 2: ghosts')[0];
t('compendium csv: scalar fields', { n: cmpRow.name, b: cmpRow.sourceBook, p: cmpRow.sourcePage, a: cmpRow.primaryArcanum, lvl: cmpRow.primaryArcanumLevel },
  { n: 'Speak with the Dead', b: 'core', p: 132, a: 'death', lvl: 2 });
t('compendium csv: reach1 defaults cost 1, reach2 reads "2:" prefix', cmpRow.reachOptions,
  [{ cost: 1, effect: 'First effect.' }, { cost: 2, effect: 'Second effect' }]);
t('compendium csv: optArcana pipe list parses', cmpRow.optionalArcana,
  [{ arcanum: 'space', level: 1, effect: 'widen' }, { arcanum: 'death', level: 2, effect: 'ghosts' }]);
t('compendium csv: quoted cell keeps comma and escaped quotes',
  CMP.csvToSpells('name,sourceBook,primaryArcanum,practice,primaryFactor,description\nX,core,death,knowing,potency,"Has a comma, and ""quotes""."')[0].description,
  'Has a comma, and "quotes".');
t('compendium csv: strips BOM, skips comments, finds header, drops nameless rows',
  CMP.csvToSpells('﻿# header note\n\nname,sourceBook,primaryArcanum,practice,primaryFactor\n# mid comment\n,core,time,ruling,potency\nBlink,core,time,ruling,potency').map(s => s.name),
  ['Blink']);
t('compendium csv: missing secondary arcanum normalises to null pair',
  (s => ({ a: s.secondaryArcanum, l: s.secondaryArcanumLevel }))(
    CMP.csvToSpells('name,sourceBook,primaryArcanum,practice,primaryFactor\nX,core,death,knowing,potency')[0]),
  { a: null, l: null });

// validateSpell
t('compendium validate: valid spell has no errors',
  CMP.validateSpell({ name: 'X', sourceBook: 'core', primaryArcanum: 'death', practice: 'knowing', primaryFactor: 'potency' }), []);
t('compendium validate: every bad field reported',
  CMP.validateSpell({ name: '', sourceBook: 'bad', primaryArcanum: 'xx', practice: 'zz', primaryFactor: 'qq' }).length, 5);

// sanitiseSpell
const cmpSan = CMP.sanitiseSpell({
  name: '  Trim Me  ', sourceBook: 'core', sourcePage: '132',
  primaryArcanum: 'death', primaryArcanumLevel: '2',
  secondaryArcanum: 'notarc', secondaryArcanumLevel: '3',
  practice: 'knowing', primaryFactor: 'potency',
  reachOptions: [{ cost: '2', effect: '  eff  ' }, { effect: '' }],
  defaults: { potency: '3', range: 'badrange' },
});
t('compendium sanitise: trims name, parses page, drops invalid secondary arcanum',
  { n: cmpSan.name, p: cmpSan.sourcePage, sa: cmpSan.secondaryArcanum, sl: cmpSan.secondaryArcanumLevel },
  { n: 'Trim Me', p: 132, sa: null, sl: null });
t('compendium sanitise: reach options normalised, empties dropped',
  cmpSan.reachOptions, [{ cost: 2, effect: 'eff' }]);
t('compendium sanitise: defaults merge + invalid range falls back to touch',
  { pot: cmpSan.defaults.potency, range: cmpSan.defaults.range, ct: cmpSan.defaults.castingTime },
  { pot: 3, range: 'touch', ct: 'ritual' });

console.log(`\n  ${pass} passed, ${fail} failed\n`);

// ═════════════════════════════════════════════════════════════════════════════
// Part B — drift comparison: shared engine vs wizard.html inline engine
// ═════════════════════════════════════════════════════════════════════════════
console.log('Part B — drift comparison (shared engine vs wizard.html deriveValues)');

const METHOD_MAP = {
  improvised: 'improvised', praxis: 'praxis',
  rote_order: 'roteLearned', rote_self: 'roteOwn', rote_grimoire: 'roteGrimoire',
};
const RANGE_MAP = {
  self: 'self', touch: 'touch', aimed: 'aimed', sensory: 'sensory',
  remote: 'remoteView', sympathetic: 'sympathetic', temporal: 'temporal',
};

// One canonical "case" shape, mapped into each engine's input format.
const BASE_CASE = {
  gnosis: 5, dots: 3, req: 2, method: 'improvised',
  defaultPrimaryFactor: 'potency', primaryFactor: 'potency',
  potency: 2, advancedPotency: false,
  durationIndex: 1, advancedDuration: false,
  scaleIndex: 1, advancedScale: false, scaleMode: 'subjects',
  range: 'touch', castTime: 'ritual', ritualIntervals: 0,
  extraReach: 0, activeSpells: 0,
  yantras: [], persona: 0,
  roteSkillDots: 3, orderSkill: false,
  spendWP: false,
  prevParadox: 0, witnesses: 'none', inured: false,
  dedicatedTool: false, mitigateMana: 0,
};

function buildSharedYantras(c) {
  // One convention since Phase 4 (B1): Mudra dice ride in the yantra's own
  // bonus (rote skill dots, +1 if Order skill), only for Mudra-capable rotes.
  const method = METHOD_MAP[c.method];
  const mudraOk = method.startsWith('rote') && S.CASTING_METHODS[method].mudraAvailable;
  const arr = [];
  for (const name of c.yantras) {
    if (name === 'Mudra') {
      if (mudraOk) arr.push({ name, isMudra: true, bonus: (c.roteSkillDots || 0) + (c.orderSkill ? 1 : 0) });
    }
    else if (name === 'Dedicated Tool') continue; // paradox-only, no dice
    else arr.push({ name, bonus: WIZ_YANTRA_BONUSES[name] ?? 0 });
  }
  if (c.persona > 0) arr.push({ name: 'Persona', bonus: c.persona });
  return arr;
}

function runShared(c) {
  const method = METHOD_MAP[c.method];
  const f = S.calculateSpellFactors({
    practice: 'compelling', arcanumDots: c.dots, spellArcanumReq: c.req,
    gnosis: c.gnosis, activeSpells: c.activeSpells, castingMethod: method,
    defaultPrimaryFactor: c.defaultPrimaryFactor, primaryFactor: c.primaryFactor,
    potency: c.potency, useAdvancedPotency: c.advancedPotency,
    durationIndex: c.durationIndex, useAdvancedDuration: c.advancedDuration,
    scaleIndex: c.scaleIndex, useAdvancedScale: c.advancedScale,
    scaleType: c.scaleMode === 'area' ? 'aoe' : 'subjects',
    range: RANGE_MAP[c.range], castingTime: c.castTime,
    ritualIntervals: c.ritualIntervals, additionalReach: c.extraReach,
  });
  const px = S.calculateParadoxPool({
    reachExcess: f.reach.excess, gnosis: c.gnosis, previousRolls: c.prevParadox,
    sleeperWitnesses: c.witnesses, inuredToSpell: c.inured,
    dedicatedTool: c.dedicatedTool, manaMitigation: c.mitigateMana,
  });
  const pool = S.calculateDicePool({
    gnosis: c.gnosis, arcanumDots: c.dots, castingMethod: method,
    castingMethodInfo: S.CASTING_METHODS[method],
    spellFactorPenalty: f.totals.factorPenalty, ritualBonus: f.totals.ritualBonus,
    yantras: buildSharedYantras(c), spendWillpower: c.spendWP,
    teamworkDice: 0, paradoxSuccesses: 0, otherModifiers: [], againOverride: 10,
  });
  return {
    factorPen: f.totals.factorPenalty,
    freeReach: f.reach.freeReach,
    usedReach: f.reach.used,
    excessReach: f.reach.excess,
    paradox: px.isChanceDie ? '1|chance' : `${px.finalDice}|normal`,
    pool: pool.finalPool,
    factorMana: f.totals.manaCost,
  };
}

function runWizard(c) {
  const d = {
    gnosis: c.gnosis, casterArcanum: 'Forces', casterArcanumDots: c.dots,
    spellArcanumReq: c.req, activeSpells: c.activeSpells,
    roteSkill: 'Computer', roteSkillDots: c.roteSkillDots, orderSkill: c.orderSkill,
    spellName: '', spellDescription: '', method: c.method, practice: '',
    defaultPrimaryFactor: c.defaultPrimaryFactor, primaryFactor: c.primaryFactor,
    combined: false, combinedSpells: [], separateScales: false,
    potency: c.potency, durationIndex: c.durationIndex,
    advancedDuration: c.advancedDuration, advancedPotency: c.advancedPotency,
    scaleIndex: c.scaleIndex, scaleMode: c.scaleMode, advancedScale: c.advancedScale,
    range: c.range, castTime: c.castTime, ritualIntervals: c.ritualIntervals,
    extraReach: c.extraReach,
    yantras: new Set(c.dedicatedTool ? [...c.yantras, 'Dedicated Tool'] : c.yantras),
    pathToolDedicated: false, orderToolDedicated: false, persona: String(c.persona),
    spendWP: c.spendWP, teamworkDice: 0, otherMod: 0, extraManaCost: 0,
    againOverride: 10,
    prevParadox: c.prevParadox, witnesses: c.witnesses, inured: c.inured,
    mitigateMana: c.mitigateMana, paradoxChoice: 'contain',
  };
  const r = W.deriveValues(d, null);
  return {
    factorPen: r.totalFactorPen,
    freeReach: r.freeReach,
    usedReach: r.usedReach,
    excessReach: r.excessReach,
    paradox: r.chanceOnly ? '1|chance' : `${r.paradoxDice}|normal`,
    pool: r.dicePool,
    factorMana: r.indefiniteMana + r.sympathyMana,
  };
}

// ── Case generation: one-factor-at-a-time + seeded random sweep ────────────
const cases = [];
const label = (name, over) => cases.push({ name, c: { ...BASE_CASE, ...over } });

label('base', {});
for (const method of Object.keys(METHOD_MAP)) {
  label(`method=${method}`, { method });
  label(`method=${method} instant`, { method, castTime: 'instant' });
  label(`method=${method} mudra`, { method, yantras: ['Mudra'], orderSkill: true });
}
for (const range of Object.keys(RANGE_MAP)) label(`range=${range}`, { range });
for (let i = 0; i <= 5; i++) label(`advDuration idx${i}`, { advancedDuration: true, durationIndex: i });
for (let i = 0; i <= 4; i++) label(`advScale idx${i}`, { advancedScale: true, scaleIndex: i });
label('scale area std', { scaleMode: 'area', scaleIndex: 2 });
label('scale area adv', { scaleMode: 'area', advancedScale: true, scaleIndex: 2 });
for (const p of [1, 3, 5, 6]) label(`potency=${p}`, { potency: p });
label('advancedPotency', { advancedPotency: true });
label('primary changed to duration', { primaryFactor: 'duration' });
label('primary duration by default', { primaryFactor: 'duration', defaultPrimaryFactor: 'duration' });
for (const a of [4, 5, 7]) label(`activeSpells=${a}`, { activeSpells: a });
for (const r of [1, 2, 3]) label(`extraReach=${r}`, { extraReach: r });
for (const g of [1, 2, 3, 4, 6, 7, 8, 9, 10]) label(`gnosis=${g} excess`, { gnosis: g, extraReach: 4 });
label('dots<req improvised', { dots: 1, req: 3 });
label('dots<req rote', { dots: 1, req: 3, method: 'rote_self' });
// Paradox modifiers, with and without excess Reach
for (const over of [
  { prevParadox: 2 }, { inured: true }, { witnesses: 'few' }, { witnesses: 'large' },
  { witnesses: 'crowd' }, { dedicatedTool: true }, { mitigateMana: 2 },
]) {
  const k = JSON.stringify(over);
  label(`paradox ${k} +excess`, { ...over, extraReach: 4 });
  label(`paradox ${k} no-excess`, over);
}
// Ritual interval handling
for (const n of [3, 5, 7]) {
  label(`ritualIntervals=${n}`, { ritualIntervals: n });
  label(`ritualIntervals=${n} instant`, { ritualIntervals: n, castTime: 'instant' });
}
// Yantra stacks
label('yantras small', { yantras: ['Path Tool', 'High Speech'] });
label('yantras cap-trigger', { yantras: ['Demesne', 'High Speech', 'Concentration', 'Rune', 'Material'], gnosis: 9 });
label('yantras over count limit g1', { yantras: ['Demesne', 'High Speech', 'Concentration'], gnosis: 1 });
label('persona 3', { persona: 3 });

// Seeded random sweep (deterministic LCG)
let seed = 20260611;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const YANTRA_NAMES = Object.keys(WIZ_YANTRA_BONUSES).concat(['Mudra']);
const RANDOM_CASES = 4000;
for (let i = 0; i < RANDOM_CASES; i++) {
  const yc = Math.floor(rnd() * 4);
  const ys = new Set();
  while (ys.size < yc) ys.add(pick(YANTRA_NAMES));
  const defaultPF = pick(['potency', 'duration']);
  label(`random#${i}`, {
    gnosis: 1 + Math.floor(rnd() * 10), dots: 1 + Math.floor(rnd() * 5),
    req: 1 + Math.floor(rnd() * 5), method: pick(Object.keys(METHOD_MAP)),
    defaultPrimaryFactor: defaultPF, primaryFactor: pick(['potency', 'duration']),
    potency: 1 + Math.floor(rnd() * 6), advancedPotency: rnd() < 0.2,
    durationIndex: Math.floor(rnd() * 6), advancedDuration: rnd() < 0.4,
    scaleIndex: Math.floor(rnd() * 5), advancedScale: rnd() < 0.3,
    scaleMode: pick(['subjects', 'area']), range: pick(Object.keys(RANGE_MAP)),
    castTime: pick(['ritual', 'instant']), ritualIntervals: Math.floor(rnd() * 6),
    extraReach: Math.floor(rnd() * 4), activeSpells: Math.floor(rnd() * 12),
    yantras: [...ys], persona: Math.floor(rnd() * 5),
    roteSkillDots: Math.floor(rnd() * 6), orderSkill: rnd() < 0.5,
    spendWP: rnd() < 0.3, prevParadox: Math.floor(rnd() * 4),
    witnesses: pick(['none', 'few', 'large', 'crowd']), inured: rnd() < 0.2,
    dedicatedTool: rnd() < 0.3, mitigateMana: Math.floor(rnd() * 3),
  });
}

// ── Run + tally ─────────────────────────────────────────────────────────────
const FIELDS = ['factorPen', 'freeReach', 'usedReach', 'excessReach', 'paradox', 'pool', 'factorMana'];
const drift = new Map(); // field -> Map(pattern -> { count, examples })
let mismatchedCases = 0;

for (const { name, c } of cases) {
  const s = runShared(c);
  const w = runWizard(c);
  let any = false;
  for (const fld of FIELDS) {
    if (JSON.stringify(s[fld]) !== JSON.stringify(w[fld])) {
      any = true;
      const pattern = `${fld}: shared=${JSON.stringify(s[fld])} wizard=${JSON.stringify(w[fld])}`;
      if (!drift.has(fld)) drift.set(fld, new Map());
      const byPattern = drift.get(fld);
      if (!byPattern.has(pattern)) byPattern.set(pattern, { count: 0, examples: [] });
      const entry = byPattern.get(pattern);
      entry.count++;
      if (entry.examples.length < 3) entry.examples.push(name);
      if (verbose) console.log(`  DRIFT ${name} :: ${pattern}`);
    }
  }
  if (any) mismatchedCases++;
}

console.log(`\n  ${cases.length} cases compared (${cases.length - RANDOM_CASES} targeted + ${RANDOM_CASES} random)`);
console.log(`  ${mismatchedCases} cases with drift, ${cases.length - mismatchedCases} in full agreement\n`);

for (const fld of FIELDS) {
  const byPattern = drift.get(fld);
  if (!byPattern) { console.log(`  ${fld}: no drift`); continue; }
  const total = [...byPattern.values()].reduce((s, e) => s + e.count, 0);
  console.log(`  ${fld}: ${total} mismatches across ${byPattern.size} distinct patterns`);
  const sorted = [...byPattern.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [pattern, { count, examples }] of sorted.slice(0, 8)) {
    console.log(`      [${String(count).padStart(4)}x] ${pattern}`);
    console.log(`              e.g. ${examples.join(' | ')}`);
  }
  if (sorted.length > 8) console.log(`      … ${sorted.length - 8} more patterns (run with --verbose)`);
}

console.log('');
if (fail > 0) {
  console.log(`RESULT: ${fail} unit test failure(s) — see above.`);
  process.exit(1);
}
console.log('RESULT: all unit tests passed. Drift above is documented in docs/engine-drift.md.');
