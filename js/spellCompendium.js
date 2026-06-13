// js/spellCompendium.js — Shared Spell Compendium (Code Review Plan, Phase 10)
//
// One React implementation of the global spell compendium, mounted on BOTH
// Classic (index.html) and Wizard (wizard.html). No-JSX (React.createElement),
// loads before Babel — same pattern as js/glossary.js and js/tiltCatalog.js.
// Namespaced globals only (Babel blocks run in global scope).
//
// Requires for live data: firebase-app/firestore/auth compat + shared/firebase.js
//   (window._fsDb, window._fsAuth). React global (window.React).
//
// Exposes:
//   window.compendium      — service: live hooks (useSpells/useAuth), auth,
//                            CRUD, suggestions (canonical schema), admin,
//                            import/export, and PURE helpers exported for the
//                            test harness (csvToSpells/validateSpell/sanitiseSpell).
//   window.CompendiumPanel — React component. Props:
//       variant        'classic' | 'wizard'  (the ONLY allowed layout fork)
//       character      current character or null (null ⇒ add buttons disabled)
//       onAddToLibrary (librarySpell, type) => void   type: 'rote'|'praxis'|'improvised'
//       onAfterAdd     (type) => void   optional — Classic switches its drawer tab
//       onClose        () => void       wizard only — renders the ✕ in the header
//
// Card layout differs by design (Classic desktop-rich arcanum-grouped grid vs
// Wizard mobile-flat rows); everything else — data, filters, auth, add flow,
// editor, suggestions inbox — is 100% shared. Admin (role grants + bulk
// import/export) is Classic-only: file/CSV workflows don't belong in the 440px card.

const compendium = (() => {
  'use strict';

  // ── Registries ───────────────────────────────────────────────────────────
  const BOOKS = {
    'core':             { label: 'Core Rulebook',        color: '#e9c46a', short: 'Core' },
    'signs-of-sorcery': { label: 'Signs of Sorcery',     color: '#2a9d8f', short: 'SoS'  },
    'night-horrors':    { label: 'Night Horrors',        color: '#c73e1d', short: 'NH'   },
    'tome-of-pentacle': { label: 'Tome of the Pentacle', color: '#9d4edd', short: 'ToP'  },
  };
  const PRACTICE_DOT = {
    compelling: 1, knowing: 1, unveiling: 1,
    ruling: 2, shielding: 2, veiling: 2,
    fraying: 3, perfecting: 3, weaving: 3,
    patterning: 4, unraveling: 4,
    making: 5, unmaking: 5,
  };
  const ARCANA_ORDER = ['death','fate','forces','life','matter','mind','prime','space','spirit','time'];
  const PRACTICE_GROUPS = [
    ['1-dot (Initiate)',   ['compelling','knowing','unveiling']],
    ['2-dot (Apprentice)', ['ruling','shielding','veiling']],
    ['3-dot (Disciple)',   ['fraying','perfecting','weaving']],
    ['4-dot (Adept)',      ['patterning','unraveling']],
    ['5-dot (Master)',     ['making','unmaking']],
  ];
  const RANGES = ['self','touch','aimed','sensory'];

  const VALID_ARCANA   = ARCANA_ORDER.slice();
  const VALID_PRACTICE = Object.keys(PRACTICE_DOT);
  const VALID_BOOKS    = Object.keys(BOOKS);

  // CSV column order (template header row + export row order must match)
  const CSV_COLUMNS = [
    'name','sourceBook','sourcePage',
    'primaryArcanum','primaryArcanumLevel',
    'secondaryArcanum','secondaryArcanumLevel',
    'practice','primaryFactor','withstand',
    'description',
    'reach1','reach2','reach3','reach4','reach5',
    'optArcana',          // pipe-separated: "death 1: effect|fate 2: other"
    'defaultPotency','defaultRange',
  ];

  // ── Firebase handles (lazy — safe to evaluate this file under Node/vm) ─────
  const db   = () => window._fsDb;
  const auth = () => window._fsAuth;
  const ts   = () => firebase.firestore.FieldValue.serverTimestamp();

  // ── Role predicates ────────────────────────────────────────────────────────
  function isAdmin(role)    { return role === 'admin'; }
  function canEdit(role)    { return role === 'admin' || role === 'editor'; }
  function canSubEdit(role) { return ['admin','editor','sub-editor'].indexOf(role) !== -1; }

  // ── Live spell subscription (shared across all hook consumers) ─────────────
  let _spells = [];
  let _spellListeners = [];
  let _spellUnsub = null;

  function subscribeSpells() {
    if (typeof window === 'undefined' || !db()) {
      console.warn('compendium: Firestore not ready (_fsDb missing) — compendium stays empty.');
      return;
    }
    if (_spellUnsub) _spellUnsub();
    _spellUnsub = db().collection('compendium').orderBy('name').onSnapshot(snap => {
      _spells = [];
      snap.forEach(doc => { const d = doc.data(); d.id = doc.id; _spells.push(d); });
      _spellListeners.forEach(fn => fn(_spells.slice()));
    }, err => console.error('Compendium snapshot error:', err));
  }

  // React hook: live spell array. Lazily auto-subscribes on first use.
  function useSpells() {
    const [list, setList] = React.useState(_spells);
    React.useEffect(() => {
      if (!_spellUnsub) subscribeSpells();
      _spellListeners.push(setList);
      setList(_spells.slice());
      return () => { _spellListeners = _spellListeners.filter(fn => fn !== setList); };
    }, []);
    return list;
  }

  // ── Auth (single onAuthStateChanged shared across both pages) ──────────────
  let _user = null;
  let _role = 'player';
  let _authState = { user: null, role: 'player' };
  let _authListeners = [];
  let _authStarted = false;

  async function fetchRole(uid) {
    try {
      const snap = await db().collection('userRoles').doc(uid).get();
      if (snap.exists) return snap.data().role || 'player';
    } catch (_) { /* not authorised or missing */ }
    return 'player';
  }

  function startAuth() {
    if (_authStarted || typeof window === 'undefined' || !auth()) return;
    _authStarted = true;
    auth().onAuthStateChanged(async user => {
      _user = user;
      _role = user ? await fetchRole(user.uid) : 'player';
      _authState = { user: _user, role: _role };
      _authListeners.forEach(fn => fn(_authState));
    });
  }

  // React hook: { user, role }.
  function useAuth() {
    const [state, setState] = React.useState(_authState);
    React.useEffect(() => {
      startAuth();
      _authListeners.push(setState);
      setState(_authState);
      return () => { _authListeners = _authListeners.filter(fn => fn !== setState); };
    }, []);
    return state;
  }

  function signIn() {
    auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
      .catch(e => alert('Sign-in error: ' + e.message));
  }
  function signOut() { auth().signOut(); }

  // ── Compendium CRUD ────────────────────────────────────────────────────────
  async function addSpell(data) {
    const uid = _user ? _user.uid : 'system';
    return db().collection('compendium').add(Object.assign({}, data, {
      createdBy: uid, createdAt: ts(), updatedBy: uid, updatedAt: ts(),
    }));
  }
  async function updateSpell(id, data) {
    return db().collection('compendium').doc(id).update(Object.assign({}, data, {
      updatedBy: _user ? _user.uid : 'system', updatedAt: ts(),
    }));
  }
  async function deleteSpell(id) {
    return db().collection('compendium').doc(id).delete();
  }

  // ── Suggestions (canonical schema — resolves the Classic/Wizard drift) ─────
  //   submittedBy   : suggester uid          (wizard's old `submitterId` retired)
  //   submitterNote : the SUGGESTER's note   (NEW)
  //   reviewNote    : the EDITOR's note, set on review
  async function submitSuggestion(spellData, submitterNote) {
    return db().collection('suggestions').add({
      spell:         spellData,
      submittedBy:   _user ? _user.uid : null,
      submitterName: _user ? (_user.displayName || _user.email || 'Unknown') : 'Unknown',
      submitterNote: submitterNote || '',
      submittedAt:   ts(),
      status:        'pending',
      reviewNote:    '',
      reviewedBy:    null,
      reviewedAt:    null,
    });
  }

  async function fetchPendingSuggestions() {
    const snap = await db().collection('suggestions').where('status', '==', 'pending').get();
    const list = [];
    snap.forEach(d => { const v = d.data(); v.id = d.id; list.push(v); });
    // Oldest-first client-side (avoids needing a composite Firestore index)
    list.sort((a, b) => {
      const ta = a.submittedAt ? (a.submittedAt.toMillis ? a.submittedAt.toMillis() : a.submittedAt) : 0;
      const tb = b.submittedAt ? (b.submittedAt.toMillis ? b.submittedAt.toMillis() : b.submittedAt) : 0;
      return ta - tb;
    });
    return list;
  }

  async function reviewSuggestion(id, approved, note) {
    const sugRef = db().collection('suggestions').doc(id);
    if (approved) {
      const doc = await sugRef.get();
      if (doc.exists) {
        const data = doc.data();
        // Hardening: legacy wizard docs used `submitterId`; never write undefined
        // (Firestore rejects it — this was why approving wizard suggestions failed).
        const creator = data.submittedBy || data.submitterId || 'unknown';
        const sd = Object.assign({}, data.spell, {
          createdBy: creator, createdAt: ts(),
          updatedBy: _user ? _user.uid : 'system', updatedAt: ts(),
          approvedFrom: id,
        });
        await db().collection('compendium').add(sd);
      }
    }
    return sugRef.update({
      status:     approved ? 'approved' : 'rejected',
      reviewNote: note || '',
      reviewedBy: _user ? _user.uid : 'system',
      reviewedAt: ts(),
    });
  }

  // ── Admin: roles ─────────────────────────────────────────────────────────
  async function listRoles() {
    const snap = await db().collection('userRoles').get();
    const list = [];
    snap.forEach(d => { const v = d.data(); v.uid = d.id; list.push(v); });
    return list;
  }
  async function grantRole(uid, email, role) {
    return db().collection('userRoles').doc(uid).set({
      role: role, email: email || '(not provided)',
      grantedBy: _user ? _user.uid : 'admin', grantedAt: ts(),
    });
  }
  async function revokeRole(uid) {
    return db().collection('userRoles').doc(uid).delete();
  }

  // ── Pure helpers (exported for the test harness) ───────────────────────────

  // Robust CSV row parser — handles quoted fields with embedded commas/quotes.
  function parseCsvRow(line) {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; } }
        else { cur += ch; }
      } else {
        if (ch === '"')      { inQ = true; }
        else if (ch === ',') { result.push(cur.trim()); cur = ''; }
        else                 { cur += ch; }
      }
    }
    result.push(cur.trim());
    return result;
  }

  // Parse a compendium CSV (header-mapped) into raw spell objects.
  function csvToSpells(text) {
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    const spells = [];
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || l.startsWith('#')) continue;
      headerIdx = i; break;
    }
    if (headerIdx < 0) return spells;

    const headers = parseCsvRow(lines[headerIdx]).map(h => h.toLowerCase().trim());

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      const cols = parseCsvRow(lines[i]);
      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });
      if (!row.name) continue;

      // reach1..reach5 → reachOptions, with optional "2: ..." cost prefix
      const reachOptions = [];
      ['reach1','reach2','reach3','reach4','reach5'].forEach(k => {
        const val = row[k] || '';
        if (!val) return;
        let cost = 1, effect = val;
        const m = val.match(/^(\d+)\s*:\s*([\s\S]+)/);
        if (m) { cost = parseInt(m[1], 10) || 1; effect = m[2].trim(); }
        reachOptions.push({ cost: cost, effect: effect });
      });

      // optArcana: "death 1: effect|fate 2: other"
      const optionalArcana = [];
      if (row.optarcana) {
        row.optarcana.split('|').forEach(part => {
          part = part.trim();
          if (!part) return;
          const m2 = part.match(/^([a-z]+)\s+(\d+)\s*(?::|–|-)\s*([\s\S]*)/i);
          if (m2) optionalArcana.push({
            arcanum: m2[1].toLowerCase(), level: parseInt(m2[2], 10) || 1, effect: m2[3].trim(),
          });
        });
      }

      const defaults = {};
      if (row.defaultpotency) defaults.potency = parseInt(row.defaultpotency, 10) || 1;
      if (row.defaultrange)   defaults.range   = row.defaultrange.toLowerCase();

      const spell = {
        name:                  row.name,
        sourceBook:            row.sourcebook    || '',
        sourcePage:            row.sourcepage ? parseInt(row.sourcepage, 10) : null,
        primaryArcanum:        row.primaryarcanum || '',
        primaryArcanumLevel:   row.primaryarcanumlevel ? parseInt(row.primaryarcanumlevel, 10) : 1,
        secondaryArcanum:      row.secondaryarcanum     || null,
        secondaryArcanumLevel: row.secondaryarcanumlevel ? parseInt(row.secondaryarcanumlevel, 10) : null,
        practice:              row.practice      || '',
        primaryFactor:         row.primaryfactor || 'potency',
        withstand:             row.withstand     || '',
        description:           row.description   || '',
        reachOptions:          reachOptions,
        optionalArcana:        optionalArcana,
        defaults:              defaults,
      };
      if (!spell.secondaryArcanum) { spell.secondaryArcanum = null; spell.secondaryArcanumLevel = null; }
      spells.push(spell);
    }
    return spells;
  }

  function validateSpell(s) {
    const errs = [];
    if (!s.name || typeof s.name !== 'string' || !s.name.trim()) errs.push('name required');
    if (!s.sourceBook || VALID_BOOKS.indexOf(s.sourceBook) === -1)
      errs.push('sourceBook must be one of: ' + VALID_BOOKS.join(', '));
    if (!s.primaryArcanum || VALID_ARCANA.indexOf(s.primaryArcanum) === -1)
      errs.push('primaryArcanum invalid');
    if (!s.practice || VALID_PRACTICE.indexOf(s.practice) === -1)
      errs.push('practice invalid');
    if (!s.primaryFactor || ['potency','duration'].indexOf(s.primaryFactor) === -1)
      errs.push('primaryFactor must be potency or duration');
    return errs;
  }

  function sanitiseSpell(s) {
    const def = s.defaults || {};
    // Validate the secondary arcanum first so its level follows it: an invalid
    // (dropped) secondary arcanum carries no level (was inconsistent pre-Phase 10).
    const secArc = (s.secondaryArcanum && VALID_ARCANA.indexOf(s.secondaryArcanum) !== -1) ? s.secondaryArcanum : null;
    return {
      name:                  String(s.name).trim(),
      sourceBook:            s.sourceBook,
      sourcePage:            parseInt(s.sourcePage) || null,
      primaryArcanum:        s.primaryArcanum,
      primaryArcanumLevel:   parseInt(s.primaryArcanumLevel) || 1,
      secondaryArcanum:      secArc,
      secondaryArcanumLevel: secArc ? (parseInt(s.secondaryArcanumLevel) || 1) : null,
      practice:              s.practice,
      primaryFactor:         s.primaryFactor,
      withstand:             String(s.withstand || '').trim(),
      description:           String(s.description || '').trim(),
      reachOptions:          Array.isArray(s.reachOptions)
                               ? s.reachOptions.filter(o => o && o.effect)
                                   .map(o => ({ cost: parseInt(o.cost) || 1, effect: String(o.effect).trim() }))
                               : [],
      optionalArcana:        Array.isArray(s.optionalArcana)
                               ? s.optionalArcana.filter(o => o && o.arcanum && VALID_ARCANA.indexOf(o.arcanum) !== -1)
                                   .map(o => ({ arcanum: o.arcanum, level: parseInt(o.level) || 1, effect: String(o.effect || '').trim() }))
                               : [],
      defaults: {
        potency:             parseInt(def.potency) || 1,
        useAdvancedPotency:  false, yantraDice: 0,
        durationIndex:       0, useAdvancedDuration: false,
        scaleIndex:          0, useAdvancedScale: false,
        scaleType:           'subjects',
        range:               (RANGES.indexOf(def.range) !== -1) ? def.range : 'touch',
        castingTime:         'ritual',
      },
    };
  }

  // Map a compendium document → a personal-library spell (defaults merge).
  // type: 'rote'|'praxis'|'improvised'. extra: { roteSkill, roteCreator } for rotes.
  function toLibrarySpell(s, type, extra) {
    const defaultDefaults = {
      potency: 1, useAdvancedPotency: false, yantraDice: 0,
      durationIndex: 0, useAdvancedDuration: false,
      scaleIndex: 0, useAdvancedScale: false,
      scaleType: 'subjects', range: 'touch', castingTime: 'ritual',
    };
    const data = {
      name:                  s.name,
      primaryArcanum:        s.primaryArcanum,
      primaryArcanumLevel:   s.primaryArcanumLevel  || 1,
      secondaryArcanum:      s.secondaryArcanum      || null,
      secondaryArcanumLevel: s.secondaryArcanumLevel || null,
      practice:              s.practice,
      primaryFactor:         s.primaryFactor || 'potency',
      withstand:             s.withstand || '',
      description:           s.description || '',
      reachOptions:          s.reachOptions ? JSON.parse(JSON.stringify(s.reachOptions)) : [],
      compendiumId:          s.id,
      defaults:              s.defaults ? Object.assign({}, defaultDefaults, JSON.parse(JSON.stringify(s.defaults))) : defaultDefaults,
    };
    if (type === 'rote') {
      data.roteSkill   = (extra && extra.roteSkill)   || 'occult';
      data.roteCreator = (extra && extra.roteCreator) || 'order';
    }
    return data;
  }

  // ── Bulk import / export ──────────────────────────────────────────────────
  async function importSpells(raw, overwrite, onProgress) {
    const report = { added: 0, updated: 0, skipped: 0, invalid: [], errors: 0 };

    const entries = (raw || []).filter(s => s && !s._note && s.name && !String(s.name).startsWith('Spell Name'));
    const valid = [];
    entries.forEach((s, idx) => {
      const errs = validateSpell(s);
      if (errs.length) report.invalid.push({ idx: idx + 1, name: s.name || '(unnamed)', errs: errs });
      else valid.push(sanitiseSpell(s));
    });
    if (!valid.length) return report;

    const existingKeys = {};
    _spells.forEach(s => { existingKeys[(s.name || '').toLowerCase() + '|' + s.sourceBook] = s.id; });

    const toAdd = [], toUpdate = [];
    valid.forEach(s => {
      const key = s.name.toLowerCase() + '|' + s.sourceBook;
      if (existingKeys[key]) {
        if (overwrite) toUpdate.push({ id: existingKeys[key], data: s });
        else report.skipped++;
      } else { toAdd.push(s); }
    });

    const allOps = [];
    toAdd.forEach(s => allOps.push({ type: 'add', data: s }));
    toUpdate.forEach(u => allOps.push({ type: 'update', id: u.id, data: u.data }));

    const total = allOps.length;
    if (!total) return report;
    if (onProgress) onProgress(0, total);

    let done = 0;
    const CHUNK = 499;
    for (let i = 0; i < allOps.length; i += CHUNK) {
      const chunk = allOps.slice(i, i + CHUNK);
      const batch = db().batch();
      const now = ts();
      const uid = _user ? _user.uid : 'import';
      chunk.forEach(op => {
        op.data.updatedBy = uid; op.data.updatedAt = now;
        if (op.type === 'add') {
          op.data.createdBy = uid; op.data.createdAt = now;
          batch.set(db().collection('compendium').doc(), op.data);
        } else {
          batch.update(db().collection('compendium').doc(op.id), op.data);
        }
      });
      try { await batch.commit(); done += chunk.length; }
      catch (e) { report.errors += chunk.length; console.error('Import batch error:', e); }
      if (onProgress) onProgress(done + report.errors, total);
    }
    report.added = toAdd.length;
    report.updated = toUpdate.length;
    return report;
  }

  async function fetchAllForExport() {
    const snap = await db().collection('compendium').orderBy('name').get();
    const spells = [];
    snap.forEach(doc => { const d = doc.data(); d._firestoreId = doc.id; spells.push(d); });
    return spells;
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportJson() {
    const spells = await fetchAllForExport();
    const clean = spells.map(s => {
      const c = Object.assign({}, s);
      if (c.createdAt && c.createdAt.toDate) c.createdAt = c.createdAt.toDate().toISOString();
      if (c.updatedAt && c.updatedAt.toDate) c.updatedAt = c.updatedAt.toDate().toISOString();
      return c;
    });
    download('compendium-export-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify(clean, null, 2), 'application/json');
    return clean.length;
  }

  function csvCell(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  async function exportCsv() {
    const spells = await fetchAllForExport();
    const rows = [CSV_COLUMNS.join(',')];
    spells.forEach(s => {
      const reaches = (s.reachOptions || []).map(r =>
        (r.cost && r.cost > 1) ? r.cost + ': ' + (r.effect || '') : (r.effect || r));
      const optArcana = (s.optionalArcana || []).map(oa =>
        (oa.arcanum || '') + ' ' + (oa.level || 1) + ': ' + (oa.effect || '')).join('|');
      rows.push([
        csvCell(s.name), csvCell(s.sourceBook), csvCell(s.sourcePage),
        csvCell(s.primaryArcanum), csvCell(s.primaryArcanumLevel),
        csvCell(s.secondaryArcanum), csvCell(s.secondaryArcanumLevel),
        csvCell(s.practice), csvCell(s.primaryFactor), csvCell(s.withstand),
        csvCell(s.description),
        csvCell(reaches[0] || ''), csvCell(reaches[1] || ''), csvCell(reaches[2] || ''),
        csvCell(reaches[3] || ''), csvCell(reaches[4] || ''),
        csvCell(optArcana),
        csvCell(s.defaults ? s.defaults.potency : ''), csvCell(s.defaults ? s.defaults.range : ''),
      ].join(','));
    });
    download('compendium-export-' + new Date().toISOString().slice(0, 10) + '.csv',
      rows.join('\r\n'), 'text/csv');
    return spells.length;
  }

  function downloadJsonTemplate() {
    const template = [{
      "_note": "DELETE this entry — it is for reference only. Fields marked (required) must be present.",
      "name": "Spell Name (required)",
      "sourceBook": "core  (required) — core | signs-of-sorcery | night-horrors | tome-of-pentacle",
      "sourcePage": 123,
      "primaryArcanum": "death  (required) — death|fate|forces|life|matter|mind|prime|space|spirit|time",
      "primaryArcanumLevel": 1,
      "secondaryArcanum": "null or one of the arcana above",
      "secondaryArcanumLevel": null,
      "practice": "compelling  (required) — compelling|knowing|unveiling|ruling|shielding|veiling|fraying|perfecting|weaving|patterning|unraveling|making|unmaking",
      "primaryFactor": "potency  (required) — potency | duration",
      "withstand": "Composure (leave blank if none)",
      "description": "Full spell description from the book.",
      "reachOptions": [
        { "cost": 1, "effect": "Description of what this Reach option does." },
        { "cost": 2, "effect": "Another Reach option." }
      ],
      "optionalArcana": [{ "arcanum": "space", "level": 1, "effect": "What the optional arcanum enables." }],
      "defaults": { "potency": 1, "range": "touch  — self | touch | aimed | sensory" }
    }];
    download('compendium-import-template.json', JSON.stringify(template, null, 2), 'application/json');
  }

  function downloadCsvTemplate() {
    const header = CSV_COLUMNS.join(',');
    const sample = [
      'Speak with the Dead', 'core', '132', 'death', '2', '', '', 'knowing', 'potency', 'Composure',
      '"Full spell description here. Use double-quotes to include commas."',
      'First reach option text.',
      '2: Second reach (costs 2 Reach) — prefix with 2: for a 2-Reach option.',
      '', '', '',
      '"fate 1: Allows fate bonus|space 2: Expands range"',
      '1', 'touch',
    ].join(',');
    const note = [
      '# DELETE these comment rows before importing.',
      '# sourceBook values: core | signs-of-sorcery | night-horrors | tome-of-pentacle',
      '# primaryArcanum values: death|fate|forces|life|matter|mind|prime|space|spirit|time',
      '# practice values: knowing|compelling|unveiling|ruling|shielding|veiling|fraying|perfecting|weaving|patterning|unraveling|making|unmaking',
      '# primaryFactor values: potency | duration',
      '# reach cost: prefix with "2: " for a 2-Reach option (e.g.  2: Affect an extra target)',
      '# optArcana: pipe-separated list  arcanum level: effect  e.g.  "space 1: widen range|death 2: affect ghosts"',
      '# defaultRange values: self | touch | aimed | sensory',
    ].join('\n');
    download('compendium-import-template.csv', note + '\n' + header + '\n' + sample, 'text/csv');
  }

  return {
    // data
    BOOKS, PRACTICE_DOT, ARCANA_ORDER, PRACTICE_GROUPS, RANGES,
    // hooks
    useSpells, useAuth,
    // auth
    signIn, signOut, isAdmin, canEdit, canSubEdit,
    // CRUD
    addSpell, updateSpell, deleteSpell,
    // suggestions
    submitSuggestion, fetchPendingSuggestions, reviewSuggestion,
    // admin
    listRoles, grantRole, revokeRole,
    // import / export
    importSpells, exportJson, exportCsv, downloadJsonTemplate, downloadCsvTemplate,
    // pure helpers (harness)
    csvToSpells, validateSpell, sanitiseSpell, toLibrarySpell,
  };
})();

// ════════════════════════════════════════════════════════════════════════════
// React component (no-JSX). Defined only when React is present (browser).
// ════════════════════════════════════════════════════════════════════════════
const CompendiumPanel = (typeof React === 'undefined') ? null : (() => {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const C = compendium;

  // ── Shared style tokens (CSS custom properties resolve on both pages) ──────
  const T = {
    bgDark: 'var(--bg-dark)', bgCard: 'var(--bg-card)', bgDeep: 'var(--bg-deep)',
    accent: 'var(--accent)', accentLight: 'var(--accent-light)',
    accentFaint: 'var(--accent-faint)', accentBorder: 'var(--accent-border)',
    text: 'var(--text)', textMuted: 'var(--text-muted)',
    danger: 'var(--danger)', success: 'var(--success)', warning: 'var(--warning)',
    border: 'var(--border)', borderLight: 'var(--border-light)',
  };
  const INP = { width: '100%', padding: '7px 9px', borderRadius: 6, fontSize: 13,
    background: T.bgDeep, border: '1px solid ' + T.border, color: T.text,
    outline: 'none', boxSizing: 'border-box' };
  const LBL = { display: 'block', fontSize: 11, color: T.textMuted, marginBottom: 4 };
  const BTN = { padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1px solid ' + T.border, background: 'transparent', color: T.textMuted };
  const BTN_PRIMARY = Object.assign({}, BTN, { border: 'none',
    background: 'linear-gradient(135deg,' + T.accent + ',' + T.accentLight + ')', color: '#fff' });
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const dots = n => '●'.repeat(Math.max(0, n || 0));
  const ROLE_BADGE = { admin: T.danger, editor: T.success, 'sub-editor': T.warning, suggester: T.accentLight };
  const tag = (bg, color, border) => ({ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: bg, color: color, border: '1px solid ' + border });

  const SKILL_OPTS = [
    ['academics','Academics'],['computer','Computer'],['crafts','Crafts'],['investigation','Investigation'],
    ['medicine','Medicine'],['occult','Occult'],['politics','Politics'],['science','Science'],
    ['athletics','Athletics'],['brawl','Brawl'],['drive','Drive'],['firearms','Firearms'],
    ['larceny','Larceny'],['stealth','Stealth'],['survival','Survival'],['weaponry','Weaponry'],
    ['animalKen','Animal Ken'],['empathy','Empathy'],['expression','Expression'],['intimidation','Intimidation'],
    ['persuasion','Persuasion'],['socialize','Socialize'],['streetwise','Streetwise'],['subterfuge','Subterfuge'],
  ];

  function reachText(r) { // reach option may be {cost,effect} object or bare string (legacy)
    if (r && typeof r === 'object') return (r.cost > 1 ? '+' + r.cost + ' ' : '+1 ') + (r.effect || '');
    return String(r || '');
  }

  function inLibrary(character, compId, type) {
    if (!character || !compId) return false;
    const arr = type === 'rote' ? (character.rotes || [])
      : type === 'praxis' ? (character.praxes || [])
      : (character.improvisedFavorites || []);
    return arr.some(s => s.compendiumId === compId);
  }
  function anyAdded(character, s) {
    return inLibrary(character, s.id, 'rote') || inLibrary(character, s.id, 'praxis') || inLibrary(character, s.id, 'improvised');
  }

  // ── Generic overlay chrome (classic → centered modal; wizard → full card) ──
  function Overlay(props) {
    const { variant, title, onClose, footer, width, zIndex } = props;
    const z = zIndex || (variant === 'wizard' ? 400 : 1100);
    const header = h('div', { key: 'hd', style: { padding: '12px 16px', flexShrink: 0,
        borderBottom: '1px solid ' + T.border, display: 'flex', alignItems: 'center', gap: 8,
        background: variant === 'wizard' ? 'linear-gradient(90deg,' + T.bgDeep + ',' + T.bgCard + ')' : 'transparent' } },
      h('span', { key: 't', style: { flex: 1, fontFamily: "'Rajdhani',sans-serif", fontSize: 15,
        fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: T.accentLight } }, title),
      h('button', { key: 'x', onClick: onClose, style: Object.assign({}, BTN, { padding: '4px 9px', fontSize: 14 }) }, '✕'));
    const body = h('div', { key: 'bd', style: { overflowY: 'auto', flex: 1, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12 } }, props.children);
    const foot = footer ? h('div', { key: 'ft', style: { padding: '12px 16px', flexShrink: 0,
      borderTop: '1px solid ' + T.border, display: 'flex', gap: 8, alignItems: 'center' } }, footer) : null;

    if (variant === 'wizard') {
      return h('div', { style: { position: 'absolute', inset: 0, zIndex: z, background: T.bgDark,
        display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden' } }, header, body, foot);
    }
    return h('div', { style: { position: 'fixed', inset: 0, zIndex: z, background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' },
      onClick: e => { if (e.target === e.currentTarget) onClose(); } },
      h('div', { style: { background: T.bgCard, borderRadius: 12, width: width || 620, maxWidth: '96vw',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: '1px solid ' + T.accentBorder } }, header, body, foot));
  }

  // ── Auth bar ────────────────────────────────────────────────────────────────
  function AuthBar(props) {
    const { user, role, onAddSpell, onInbox, onAdmin } = props;
    const kids = [];
    if (!user) {
      kids.push(h('span', { key: 'i', style: { flex: 1, fontSize: 12, color: T.textMuted } }, 'Sign in to contribute spells'));
      kids.push(h('button', { key: 'in', onClick: C.signIn, style: Object.assign({}, BTN, { flexShrink: 0 }) }, '🔑 Sign In'));
    } else {
      const badge = (role && role !== 'player') ? h('span', { key: 'rb', style: { fontSize: 9, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.8, padding: '2px 6px', borderRadius: 4, marginLeft: 6,
        background: (ROLE_BADGE[role] || T.accentLight) + '22', color: ROLE_BADGE[role] || T.accentLight,
        border: '1px solid ' + (ROLE_BADGE[role] || T.accentBorder) + '44' } }, role) : null;
      kids.push(h('span', { key: 'i', style: { flex: 1, fontSize: 12, color: T.text, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, user.displayName || user.email, badge));
      if (C.canEdit(role)) kids.push(h('button', { key: 'add', onClick: onAddSpell, style: Object.assign({}, BTN, { flexShrink: 0 }) }, '＋ Add Spell'));
      if (C.canEdit(role)) kids.push(h('button', { key: 'inb', onClick: onInbox, style: Object.assign({}, BTN, { flexShrink: 0 }) }, '📬 Suggestions'));
      if (C.isAdmin(role) && onAdmin) kids.push(h('button', { key: 'adm', onClick: onAdmin, style: Object.assign({}, BTN, { flexShrink: 0 }) }, '⚙️ Roles'));
      kids.push(h('button', { key: 'out', onClick: C.signOut, style: Object.assign({}, BTN, { flexShrink: 0 }) }, 'Sign Out'));
    }
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '8px 12px', borderBottom: '1px solid ' + T.border, flexShrink: 0 } }, kids);
  }

  // ── Filter bar ──────────────────────────────────────────────────────────────
  function FilterBar(props) {
    const { filters, setFilters, variant } = props;
    const sel = (key, options) => h('select', {
      key: key, value: filters[key],
      onChange: e => setFilters(Object.assign({}, filters, { [key]: e.target.value })),
      style: Object.assign({}, INP, { flex: 1, padding: '5px 6px', fontSize: variant === 'wizard' ? 11 : 12 }),
    }, options);

    const bookOpts = [h('option', { key: 'all', value: 'all' }, 'All Books')]
      .concat(Object.keys(C.BOOKS).map(k => h('option', { key: k, value: k }, variant === 'wizard' ? C.BOOKS[k].short : C.BOOKS[k].label)));
    const arcOpts = [h('option', { key: 'all', value: 'all' }, 'All Arcana')]
      .concat(C.ARCANA_ORDER.map(a => h('option', { key: a, value: a }, cap(a))));
    const pracOpts = [h('option', { key: 'all', value: 'all' }, 'All Practices')]
      .concat([['1','1-dot (Initiate)'],['2','2-dot (Apprentice)'],['3','3-dot (Disciple)'],['4','4-dot (Adept)'],['5','5-dot (Master)']]
        .map(p => h('option', { key: p[0], value: p[0] }, p[1])));

    return h('div', { style: { padding: '8px 12px', borderBottom: '1px solid ' + T.border,
      display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 } },
      h('input', { key: 'q', type: 'text', value: filters.search,
        onChange: e => setFilters(Object.assign({}, filters, { search: e.target.value })),
        placeholder: '🔍 Search spells…', style: INP }),
      h('div', { key: 'row', style: { display: 'flex', gap: 6 } },
        sel('book', bookOpts), sel('arcanum', arcOpts), sel('practice', pracOpts)));
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  function applyFilters(spells, f) {
    return spells.filter(s => {
      if (f.book !== 'all' && s.sourceBook !== f.book) return false;
      if (f.arcanum !== 'all' && s.primaryArcanum !== f.arcanum) return false;
      if (f.practice !== 'all' && C.PRACTICE_DOT[s.practice] !== parseInt(f.practice)) return false;
      if (f.search) {
        const q = f.search.toLowerCase();
        const hay = (s.name + ' ' + (s.description || '') + ' ' + (s.primaryArcanum || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  // ── Spell detail bits shared by both card layouts ──────────────────────────
  function ReachBlock(s) {
    if (!s.reachOptions || !s.reachOptions.length) return null;
    return h('div', { key: 'reach', style: { marginBottom: 8 } },
      h('div', { style: { fontSize: 10, color: T.accentLight, fontWeight: 600, marginBottom: 3 } }, 'Reach Options'),
      s.reachOptions.map((r, i) => h('div', { key: i, style: { fontSize: 11, color: T.textMuted,
        paddingLeft: 8, borderLeft: '2px solid ' + T.accentBorder, marginBottom: 2 } }, reachText(r))));
  }
  function OptArcBlock(s) {
    if (!s.optionalArcana || !s.optionalArcana.length) return null;
    return h('div', { key: 'oa', style: { marginBottom: 8 } },
      h('div', { style: { fontSize: 10, color: T.warning, fontWeight: 600, marginBottom: 3 } }, 'Optional Arcana'),
      s.optionalArcana.map((oa, i) => h('div', { key: i, style: { fontSize: 11, color: T.textMuted,
        paddingLeft: 8, borderLeft: '2px solid rgba(233,196,106,0.4)', marginBottom: 2 } },
        cap(oa.arcanum || '') + ' ' + dots(oa.level) + (oa.effect ? ' — ' + oa.effect : ''))));
  }

  // ── CLASSIC list — arcanum-grouped collapsible card grid ───────────────────
  function ClassicList(props) {
    const { spells, allCount, role, character, canSuggest, onAdd, onEdit, onDelete, onSuggest } = props;
    const [collapsed, setCollapsed] = useState(() => {
      try { return new Set(JSON.parse(localStorage.getItem('spellLibraryCollapsed') || '[]')); }
      catch (_) { return new Set(); }
    });
    const [openDesc, setOpenDesc] = useState({});

    function toggleGroup(arc) {
      setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(arc)) next.delete(arc); else next.add(arc);
        try { localStorage.setItem('spellLibraryCollapsed', JSON.stringify(Array.from(next))); } catch (_) {}
        return next;
      });
    }

    if (allCount === 0) return h('div', { style: { padding: 20, textAlign: 'center', color: T.textMuted, fontStyle: 'italic' } }, 'Loading compendium…');
    if (!spells.length) return h('div', { style: { padding: 20, textAlign: 'center', color: T.textMuted, fontStyle: 'italic' } }, 'No spells match these filters.');

    const groups = {};
    spells.forEach(s => { const a = s.primaryArcanum || 'prime'; (groups[a] = groups[a] || []).push(s); });

    return h('div', { style: { padding: '8px 10px' } }, C.ARCANA_ORDER.filter(a => groups[a] && groups[a].length).map(arc => {
      const isCol = collapsed.has(arc);
      return h('div', { key: arc, style: { marginBottom: 14 } },
        h('div', { onClick: () => toggleGroup(arc), style: { display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', padding: '6px 4px', borderBottom: '1px solid ' + T.borderLight, marginBottom: 8 } },
          h('h3', { key: 'h', style: { margin: 0, fontSize: 14, fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
            letterSpacing: 1, textTransform: 'uppercase', color: T.accentLight, flex: 1 } }, cap(arc)),
          h('span', { key: 'c', style: { fontSize: 11, color: T.textMuted } }, groups[arc].length),
          h('span', { key: 't', style: { fontSize: 11, color: T.textMuted, marginLeft: 6 } }, isCol ? '▸' : '▾')),
        isCol ? null : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 } },
          groups[arc].map(s => ClassicCard(s, { role, character, canSuggest, onAdd, onEdit, onDelete, onSuggest, openDesc, setOpenDesc }))));
    }));
  }

  function ClassicCard(s, ctx) {
    const { role, canSuggest, onAdd, onEdit, onDelete, onSuggest, openDesc, setOpenDesc } = ctx;
    const book = C.BOOKS[s.sourceBook] || { color: '#a0a0a0', short: s.sourceBook || '?' };
    const page = s.sourcePage ? ' p.' + s.sourcePage : '';
    let arc = cap(s.primaryArcanum || 'prime') + ' ' + dots(s.primaryArcanumLevel || 1);
    if (s.secondaryArcanum) arc += ' / ' + cap(s.secondaryArcanum) + ' ' + dots(s.secondaryArcanumLevel || 1);
    let prac = cap(s.practice || '') + ' | Primary: ' + cap(s.primaryFactor || 'potency');
    if (s.withstand) prac += ' | Withstand: ' + s.withstand;
    const descOpen = !!openDesc[s.id];

    const actions = [h('button', { key: 'add', onClick: () => onAdd(s), style: Object.assign({}, BTN_PRIMARY, { flex: 1 }) }, '＋ Add to My Library')];
    if (C.canEdit(role)) {
      actions.push(h('button', { key: 'ed', onClick: () => onEdit(s), title: 'Edit this spell', style: BTN }, '✏️'));
      actions.push(h('button', { key: 'del', onClick: () => onDelete(s), title: 'Delete this spell',
        style: Object.assign({}, BTN, { background: 'rgba(199,62,29,0.2)', color: T.danger }) }, '🗑'));
    } else if (canSuggest) {
      actions.push(h('button', { key: 'sug', onClick: () => onSuggest(s), title: 'Suggest an edit',
        style: Object.assign({}, BTN, { color: T.warning, border: '1px solid rgba(233,196,106,0.3)' }) }, '💡'));
    }

    return h('div', { key: s.id, style: { background: T.bgCard, borderRadius: 8, border: '1px solid ' + T.border,
      display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
      h('div', { key: 'hd', style: { padding: '9px 11px', display: 'flex', justifyContent: 'space-between', gap: 8,
        alignItems: 'flex-start', borderBottom: '1px solid ' + T.borderLight } },
        h('div', { key: 'l', style: { minWidth: 0 } },
          h('div', { style: { fontWeight: 700, fontSize: 14, color: T.text } }, s.name || 'Unnamed'),
          h('div', { style: { fontSize: 11, color: T.textMuted, marginTop: 2 } }, arc)),
        h('span', { key: 'b', style: { fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, flexShrink: 0,
          background: 'rgba(0,0,0,0.35)', color: book.color, border: '1px solid ' + book.color + '50' } }, book.short + page)),
      h('div', { key: 'bd', style: { padding: '8px 11px', flex: 1 } },
        h('div', { key: 'p', style: { fontSize: 11, color: T.textMuted, marginBottom: 6 } }, prac),
        s.description ? h('div', { key: 'd' },
          h('div', { onClick: () => setOpenDesc(o => Object.assign({}, o, { [s.id]: !o[s.id] })),
            style: { fontSize: 11, color: T.accentLight, cursor: 'pointer', marginBottom: descOpen ? 4 : 0 } },
            (descOpen ? '▼' : '▶') + ' Description'),
          descOpen ? h('div', { style: { fontSize: 11, color: T.textMuted, lineHeight: 1.5 } }, s.description) : null) : null,
        ReachBlock(s), OptArcBlock(s)),
      h('div', { key: 'ac', style: { padding: '8px 11px', borderTop: '1px solid ' + T.borderLight,
        display: 'flex', gap: 6 } }, actions));
  }

  // ── WIZARD list — flat compact expandable rows ─────────────────────────────
  function WizardList(props) {
    const { spells, loading, role, character, canSuggest, onAdd, onEdit, onDelete, onSuggest, addFeedback } = props;
    const [expandedId, setExpandedId] = useState(null);

    if (loading) return h('div', { style: { textAlign: 'center', color: T.textMuted, padding: 40, fontSize: 13 } }, 'Loading compendium…');
    if (!spells.length) return h('div', { style: { textAlign: 'center', color: T.textMuted, padding: 40, fontSize: 13 } }, 'No spells match your filters.');

    return h('div', { style: { padding: '8px 10px' } }, spells.map(s => {
      const book = C.BOOKS[s.sourceBook];
      const isExp = expandedId === s.id;
      const added = anyAdded(character, s);
      const just = addFeedback[s.id];
      return h('div', { key: s.id, style: { marginBottom: 8, borderRadius: 8, background: T.bgCard,
        border: '1px solid ' + (isExp ? T.accentBorder : T.border), overflow: 'hidden' } },
        h('div', { key: 'hd', onClick: () => setExpandedId(isExp ? null : s.id),
          style: { padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
          book ? h('span', { key: 'b', style: { fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
            background: book.color + '22', color: book.color, border: '1px solid ' + book.color + '44',
            textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 0 } }, book.short) : null,
          h('span', { key: 'n', style: { fontWeight: 600, fontSize: 13, color: added ? T.accentLight : T.text, flex: 1 } }, s.name),
          h('span', { key: 'a', style: { fontSize: 10, color: T.textMuted, flexShrink: 0 } }, (s.primaryArcanum || '') + ' ' + dots(s.primaryArcanumLevel)),
          h('span', { key: 'x', style: { fontSize: 11, color: T.textMuted, flexShrink: 0, marginLeft: 4 } }, isExp ? '▲' : '▼')),
        isExp ? h('div', { key: 'ex', style: { padding: '0 11px 11px', borderTop: '1px solid ' + T.borderLight } },
          h('div', { key: 'tags', style: { display: 'flex', flexWrap: 'wrap', gap: 4, margin: '8px 0 6px' } },
            s.practice ? h('span', { key: 'p', style: tag(T.accentFaint, T.accentLight, T.accentBorder) }, s.practice) : null,
            s.primaryFactor ? h('span', { key: 'f', style: tag('rgba(42,157,143,0.15)', T.success, 'rgba(42,157,143,0.3)') }, 'Factor: ' + s.primaryFactor) : null,
            s.withstand ? h('span', { key: 'w', style: tag('rgba(199,62,29,0.12)', T.danger, 'rgba(199,62,29,0.25)') }, 'Withstand: ' + s.withstand) : null),
          s.description ? h('p', { key: 'd', style: { fontSize: 11, color: T.textMuted, lineHeight: 1.55, marginBottom: 8 } }, s.description) : null,
          ReachBlock(s), OptArcBlock(s),
          C.canEdit(role) ? h('div', { key: 'admrow', style: { display: 'flex', gap: 6, marginBottom: 8 } },
            h('button', { key: 'e', onClick: () => onEdit(s), style: Object.assign({}, BTN, { flex: 1 }) }, '✏️ Edit'),
            h('button', { key: 'x', onClick: () => onDelete(s), style: Object.assign({}, BTN, { flex: 1, color: T.danger, border: '1px solid rgba(199,62,29,0.3)' }) }, '🗑 Delete')) : null,
          character ? (just
            ? h('div', { key: 'fb', style: { textAlign: 'center', fontSize: 11, color: T.success, padding: '6px 0' } }, '✓ Added as ' + just + '!')
            : h('button', { key: 'add', onClick: () => onAdd(s), style: Object.assign({}, BTN_PRIMARY, { width: '100%', padding: '8px 0' }) }, added ? '✚ Add Again' : '✚ Add to Grimoire'))
            : h('div', { key: 'noc', style: { textAlign: 'center', fontSize: 11, color: T.textMuted, padding: '6px 0', fontStyle: 'italic' } }, 'Load a character to add spells'),
          canSuggest ? h('button', { key: 'sug', onClick: () => onSuggest(s),
            style: Object.assign({}, BTN, { width: '100%', marginTop: 6, color: T.warning, border: '1px solid rgba(233,196,106,0.3)' }) }, '💡 Suggest an Edit') : null
        ) : null);
    }));
  }

  // ── Add-to-library sheet ────────────────────────────────────────────────────
  function AddSheet(props) {
    const { variant, spell, character, onConfirm, onClose } = props;
    const status = {
      rote: inLibrary(character, spell.id, 'rote'),
      praxis: inLibrary(character, spell.id, 'praxis'),
      improvised: inLibrary(character, spell.id, 'improvised'),
    };
    const firstFree = !status.rote ? 'rote' : !status.praxis ? 'praxis' : !status.improvised ? 'improvised' : null;
    const [type, setType] = useState(firstFree || 'rote');
    const [roteSkill, setRoteSkill] = useState('occult');
    const [roteCreator, setRoteCreator] = useState('order');
    const allFull = !firstFree;

    const typeRow = h('div', { key: 'types', style: { display: 'flex', gap: 6, marginBottom: 10 } },
      ['rote', 'praxis', 'improvised'].map(t => {
        const already = status[t];
        return h('button', { key: t, onClick: () => { if (!already) setType(t); }, disabled: already,
          style: { flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: already ? 'not-allowed' : 'pointer',
            border: '1px solid ' + (type === t ? T.accentBorder : T.border),
            background: (already || type === t) ? T.accentFaint : 'transparent',
            color: (already || type === t) ? T.accentLight : T.textMuted, opacity: already ? 0.6 : 1 } },
          (already ? '✓ ' : '') + (t === 'improvised' ? 'Improvised' : cap(t)));
      }));

    const roteExtras = type === 'rote' ? h('div', { key: 'rx', style: { marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 } },
      h('select', { key: 'sk', value: roteSkill, onChange: e => setRoteSkill(e.target.value), style: INP },
        SKILL_OPTS.map(o => h('option', { key: o[0], value: o[0] }, o[1]))),
      h('select', { key: 'cr', value: roteCreator, onChange: e => setRoteCreator(e.target.value), style: INP },
        h('option', { value: 'order' }, 'Order Rote (Mudra only)'),
        h('option', { value: 'self' }, 'Your Design (Rote Quality + Mudra)'),
        h('option', { value: 'grimoire' }, 'Grimoire (Rote Quality, 2× time)'))) : null;

    const body = [
      h('div', { key: 'note', style: { fontSize: 13, color: T.text, marginBottom: 10 } }, 'Add "' + (spell.name || 'Spell') + '"'),
      typeRow, roteExtras,
      allFull ? h('div', { key: 'full', style: { fontSize: 11, color: T.textMuted, marginBottom: 8 } }, 'This spell is already in all library categories.') : null,
    ];
    const buttons = h('div', { style: { display: 'flex', gap: 8 } },
      h('button', { key: 'c', onClick: onClose, style: Object.assign({}, BTN, { flex: 1, padding: '9px 0' }) }, 'Cancel'),
      h('button', { key: 'ok', onClick: () => onConfirm(type, { roteSkill, roteCreator }), disabled: allFull,
        style: Object.assign({}, BTN_PRIMARY, { flex: 2, padding: '9px 0', opacity: allFull ? 0.5 : 1 }) }, '✓ Confirm'));

    if (variant === 'wizard') {
      // bottom sheet (current wizard idiom)
      return h('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 410,
        background: T.bgCard, borderTop: '2px solid ' + T.accentBorder, borderRadius: '0 0 20px 20px',
        padding: '14px 16px 20px' } }, body, buttons);
    }
    return h(Overlay, { variant: variant, title: 'Add to Grimoire', onClose: onClose, width: 460, footer: buttons }, body);
  }

  // ── Editor (add / edit / suggest) ───────────────────────────────────────────
  function EditorModal(props) {
    const { variant, spell, mode, role, onClose, onToast } = props; // mode: 'add'|'edit'|'suggest'
    const d = spell || {};
    const [f, setF] = useState({
      name: d.name || '', sourceBook: d.sourceBook || 'core', sourcePage: d.sourcePage || '',
      primaryArcanum: d.primaryArcanum || 'prime', primaryArcanumLevel: d.primaryArcanumLevel || 1,
      secondaryArcanum: d.secondaryArcanum || '', secondaryArcanumLevel: d.secondaryArcanumLevel || 1,
      practice: d.practice || 'compelling', primaryFactor: d.primaryFactor || 'potency',
      withstand: d.withstand || '', description: d.description || '',
      defaultPotency: (d.defaults && d.defaults.potency) || 1,
      defaultRange: (d.defaults && d.defaults.range) || 'touch',
    });
    const [reach, setReach] = useState((d.reachOptions || []).map(o => ({ cost: o.cost || 1, effect: o.effect || (typeof o === 'string' ? o : '') })));
    const [optArc, setOptArc] = useState((d.optionalArcana || []).map(o => ({ arcanum: o.arcanum || 'prime', level: o.level || 1, effect: o.effect || '' })));
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const upd = (k, v) => setF(p => Object.assign({}, p, { [k]: v }));

    function buildData() {
      return {
        name: f.name.trim(), sourceBook: f.sourceBook, sourcePage: parseInt(f.sourcePage) || null,
        primaryArcanum: f.primaryArcanum, primaryArcanumLevel: parseInt(f.primaryArcanumLevel) || 1,
        secondaryArcanum: f.secondaryArcanum || null,
        secondaryArcanumLevel: f.secondaryArcanum ? (parseInt(f.secondaryArcanumLevel) || 1) : null,
        practice: f.practice, primaryFactor: f.primaryFactor, withstand: f.withstand.trim(),
        description: f.description.trim(),
        reachOptions: reach.filter(r => r.effect.trim()).map(r => ({ cost: parseInt(r.cost) || 1, effect: r.effect.trim() })),
        optionalArcana: optArc.filter(o => o.arcanum).map(o => ({ arcanum: o.arcanum, level: parseInt(o.level) || 1, effect: o.effect.trim() })),
        defaults: {
          potency: parseInt(f.defaultPotency) || 1, useAdvancedPotency: false, yantraDice: 0,
          durationIndex: 0, useAdvancedDuration: false, scaleIndex: 0, useAdvancedScale: false,
          scaleType: 'subjects', range: f.defaultRange, castingTime: 'ritual',
        },
      };
    }

    async function save() {
      if (!f.name.trim()) { alert('Please enter a spell name.'); return; }
      if (mode === 'suggest' && !f.sourceBook) { alert('Please select a source book.'); return; }
      setBusy(true);
      try {
        const data = buildData();
        if (mode === 'suggest') { await C.submitSuggestion(data, note); onToast && onToast('Suggestion submitted! An editor will review it shortly.'); }
        else if (mode === 'edit') { await C.updateSpell(d.id, data); onToast && onToast('Spell updated.'); }
        else { await C.addSpell(data); onToast && onToast('Spell added.'); }
        onClose();
      } catch (e) { console.error('Compendium save error:', e); alert('Save failed: ' + e.message); }
      finally { setBusy(false); }
    }

    const arcOpts = C.ARCANA_ORDER.map(a => h('option', { key: a, value: a }, cap(a)));
    const pracOpts = C.PRACTICE_GROUPS.map(g => h('optgroup', { key: g[0], label: g[0] },
      g[1].map(p => h('option', { key: p, value: p }, cap(p)))));

    const field = (label, node) => h('div', { key: label, style: { flex: 1, minWidth: 120 } }, h('label', { style: LBL }, label), node);
    const row = (...kids) => h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } }, kids);

    const reachRows = h('div', { key: 'reach' },
      h('label', { style: LBL }, 'Reach Options'),
      reach.map((r, i) => h('div', { key: i, style: { display: 'flex', gap: 6, marginBottom: 6 } },
        h('input', { type: 'number', min: 1, max: 5, value: r.cost, onChange: e => setReach(a => a.map((x, j) => j === i ? Object.assign({}, x, { cost: e.target.value }) : x)), style: Object.assign({}, INP, { width: 60 }) }),
        h('input', { type: 'text', value: r.effect, placeholder: 'Reach effect description', onChange: e => setReach(a => a.map((x, j) => j === i ? Object.assign({}, x, { effect: e.target.value }) : x)), style: INP }),
        h('button', { onClick: () => setReach(a => a.filter((_, j) => j !== i)), style: Object.assign({}, BTN, { flexShrink: 0 }) }, '×'))),
      h('button', { onClick: () => setReach(a => a.concat([{ cost: 1, effect: '' }])), style: BTN }, '+ Add Reach Option'));

    const optArcRows = h('div', { key: 'oa' },
      h('label', { style: LBL }, 'Optional Arcana'),
      optArc.map((o, i) => h('div', { key: i, style: { display: 'flex', gap: 6, marginBottom: 6 } },
        h('select', { value: o.arcanum, onChange: e => setOptArc(a => a.map((x, j) => j === i ? Object.assign({}, x, { arcanum: e.target.value }) : x)), style: Object.assign({}, INP, { flex: 1 }) }, arcOpts),
        h('input', { type: 'number', min: 1, max: 5, value: o.level, onChange: e => setOptArc(a => a.map((x, j) => j === i ? Object.assign({}, x, { level: e.target.value }) : x)), style: Object.assign({}, INP, { width: 60 }) }),
        h('input', { type: 'text', value: o.effect, placeholder: 'Effect', onChange: e => setOptArc(a => a.map((x, j) => j === i ? Object.assign({}, x, { effect: e.target.value }) : x)), style: INP }),
        h('button', { onClick: () => setOptArc(a => a.filter((_, j) => j !== i)), style: Object.assign({}, BTN, { flexShrink: 0 }) }, '×'))),
      h('button', { onClick: () => setOptArc(a => a.concat([{ arcanum: 'prime', level: 1, effect: '' }])), style: BTN }, '+ Add Optional Arcanum'));

    // Suggest mode is a slimmer form (matches the old SuggestSpellDrawer intent)
    const suggestMode = mode === 'suggest';
    const body = suggestMode ? [
      field('Spell Name', h('input', { value: f.name, onChange: e => upd('name', e.target.value), style: INP })),
      field('Source Book *', h('select', { value: f.sourceBook, onChange: e => upd('sourceBook', e.target.value), style: INP },
        Object.keys(C.BOOKS).map(k => h('option', { key: k, value: k }, C.BOOKS[k].label)))),
      field('Description', h('textarea', { value: f.description, onChange: e => upd('description', e.target.value), rows: 4, style: Object.assign({}, INP, { resize: 'vertical', lineHeight: 1.5 }) })),
      field('Note to editors (optional)', h('input', { value: note, onChange: e => setNote(e.target.value), placeholder: 'e.g. Page 132, checked against errata', style: INP })),
    ] : [
      row(field('Spell Name', h('input', { value: f.name, onChange: e => upd('name', e.target.value), style: INP })),
        field('Source Book', h('select', { value: f.sourceBook, onChange: e => upd('sourceBook', e.target.value), style: INP }, Object.keys(C.BOOKS).map(k => h('option', { key: k, value: k }, C.BOOKS[k].label)))),
        field('Page', h('input', { type: 'number', value: f.sourcePage, onChange: e => upd('sourcePage', e.target.value), style: INP }))),
      row(field('Primary Arcanum', h('select', { value: f.primaryArcanum, onChange: e => upd('primaryArcanum', e.target.value), style: INP }, arcOpts)),
        field('Level', h('select', { value: f.primaryArcanumLevel, onChange: e => upd('primaryArcanumLevel', e.target.value), style: INP }, [1,2,3,4,5].map(n => h('option', { key: n, value: n }, dots(n))))),
        field('Secondary (optional)', h('select', { value: f.secondaryArcanum, onChange: e => upd('secondaryArcanum', e.target.value), style: INP }, [h('option', { key: '', value: '' }, 'None')].concat(arcOpts))),
        field('Level', h('select', { value: f.secondaryArcanumLevel, onChange: e => upd('secondaryArcanumLevel', e.target.value), disabled: !f.secondaryArcanum, style: Object.assign({}, INP, { opacity: f.secondaryArcanum ? 1 : 0.4 }) }, [1,2,3,4,5].map(n => h('option', { key: n, value: n }, dots(n)))))),
      row(field('Practice', h('select', { value: f.practice, onChange: e => upd('practice', e.target.value), style: INP }, pracOpts)),
        field('Primary Factor', h('select', { value: f.primaryFactor, onChange: e => upd('primaryFactor', e.target.value), style: INP }, h('option', { value: 'potency' }, 'Potency'), h('option', { value: 'duration' }, 'Duration'))),
        field('Withstand (optional)', h('input', { value: f.withstand, onChange: e => upd('withstand', e.target.value), placeholder: 'e.g. Composure', style: INP }))),
      row(field('Default Potency', h('input', { type: 'number', min: 1, max: 10, value: f.defaultPotency, onChange: e => upd('defaultPotency', e.target.value), style: INP })),
        field('Default Range', h('select', { value: f.defaultRange, onChange: e => upd('defaultRange', e.target.value), style: INP }, C.RANGES.map(r => h('option', { key: r, value: r }, cap(r) + (r === 'sensory' ? ' (+1 Reach)' : '')))))),
      reachRows, optArcRows,
      field('Description', h('textarea', { value: f.description, onChange: e => upd('description', e.target.value), rows: 4, style: Object.assign({}, INP, { resize: 'vertical', lineHeight: 1.5 }) })),
    ];

    const title = suggestMode ? 'Suggest to Compendium' : (mode === 'edit' ? 'Edit Compendium Spell' : 'Add Compendium Spell');
    const saveLabel = suggestMode ? 'Submit Suggestion' : 'Save Spell';
    const footer = [
      (mode === 'edit' && C.canEdit(role)) ? h('button', { key: 'del', onClick: async () => {
        if (!confirm('Delete "' + (d.name || 'this spell') + '" from the compendium?\nThis cannot be undone.')) return;
        try { await C.deleteSpell(d.id); onToast && onToast('Spell deleted.'); onClose(); } catch (e) { alert('Delete failed: ' + e.message); }
      }, style: Object.assign({}, BTN, { marginRight: 'auto', background: 'rgba(199,62,29,0.2)', color: T.danger }) }, 'Delete') : null,
      h('button', { key: 'c', onClick: onClose, style: BTN }, 'Cancel'),
      h('button', { key: 's', onClick: save, disabled: busy, style: Object.assign({}, BTN_PRIMARY, { opacity: busy ? 0.6 : 1 }) }, busy ? 'Saving…' : saveLabel),
    ];
    return h(Overlay, { variant: variant, title: title, onClose: onClose, footer: footer }, body);
  }

  // ── Suggestions inbox ───────────────────────────────────────────────────────
  function InboxModal(props) {
    const { variant, onClose } = props;
    const [list, setList] = useState(null);
    const [err, setErr] = useState('');
    useEffect(() => {
      C.fetchPendingSuggestions().then(setList).catch(e => setErr(e.message));
    }, []);

    function decide(sug, approved, noteVal, setLocal) {
      setLocal('busy');
      C.reviewSuggestion(sug.id, approved, noteVal)
        .then(() => setLocal(approved ? 'approved' : 'rejected'))
        .catch(e => { alert('Error: ' + e.message); setLocal(''); });
    }

    let body;
    if (err) body = h('div', { style: { color: T.danger } }, 'Error: ' + err);
    else if (list === null) body = h('div', { style: { color: T.textMuted } }, 'Loading…');
    else if (!list.length) body = h('div', { style: { color: T.textMuted, textAlign: 'center', padding: 20 } }, 'No pending suggestions. ✓');
    else body = list.map(sug => h(SuggestionItem, { key: sug.id, sug: sug, onDecide: decide }));

    return h(Overlay, { variant: variant, title: '📬 Suggestions Inbox', onClose: onClose,
      footer: h('button', { onClick: onClose, style: BTN_PRIMARY }, 'Close') }, body);
  }

  function SuggestionItem(props) {
    const { sug, onDecide } = props;
    const s = sug.spell || {};
    const book = C.BOOKS[s.sourceBook] || { label: s.sourceBook || '' };
    // Canonical submitterNote, with legacy fallback (old wizard wrote it to reviewNote)
    const submitterNote = sug.submitterNote || (sug.status === 'pending' ? sug.reviewNote : '') || '';
    const [note, setNote] = useState('');
    const [state, setState] = useState('');
    const done = state === 'approved' || state === 'rejected';

    return h('div', { style: { border: '1px solid ' + T.border, borderRadius: 8, padding: 12, marginBottom: 10,
      opacity: done ? 0.5 : 1 } },
      h('div', { key: 'h', style: { marginBottom: 4 } },
        h('strong', { style: { color: T.text } }, s.name || 'Unnamed'),
        h('span', { style: { color: T.textMuted, fontSize: 12, marginLeft: 6 } }, 'by ' + (sug.submitterName || 'Unknown'))),
      h('div', { key: 'meta', style: { fontSize: 12, color: T.textMuted, margin: '4px 0' } },
        cap(s.primaryArcanum || '') + ' ' + dots(s.primaryArcanumLevel || 1) + ' | ' + cap(s.practice || '') + ' | ' + (book.label || '')),
      s.description ? h('div', { key: 'd', style: { fontSize: 12, color: T.textMuted, margin: '6px 0' } }, s.description.slice(0, 240) + (s.description.length > 240 ? '…' : '')) : null,
      submitterNote ? h('div', { key: 'sn', style: { fontSize: 12, color: T.warning, margin: '6px 0' } }, '📝 ' + submitterNote) : null,
      h('div', { key: 'act', style: { display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' } },
        h('input', { type: 'text', value: note, onChange: e => setNote(e.target.value), placeholder: 'Optional review note…', disabled: done, style: Object.assign({}, INP, { flex: 1 }) }),
        h('button', { onClick: () => onDecide(sug, true, note, setState), disabled: state === 'busy' || done, style: Object.assign({}, BTN_PRIMARY, { flexShrink: 0 }) }, done ? (state === 'approved' ? 'Approved ✓' : '✓') : '✓ Approve'),
        h('button', { onClick: () => onDecide(sug, false, note, setState), disabled: state === 'busy' || done, style: Object.assign({}, BTN, { flexShrink: 0, color: T.danger }) }, done ? (state === 'rejected' ? 'Rejected ✗' : '✗') : '✗ Reject')));
  }

  // ── Admin panel (Classic only) ─────────────────────────────────────────────
  function AdminModal(props) {
    const { variant, onClose } = props;
    const [roles, setRoles] = useState(null);
    const [grant, setGrant] = useState({ uid: '', email: '', role: 'editor' });
    const [importStatus, setImportStatus] = useState('');
    const [exportStatus, setExportStatus] = useState('');
    const [progress, setProgress] = useState(null); // {done,total}
    const [overwrite, setOverwrite] = useState(false);
    const fileRef = useRef(null);

    function refresh() { C.listRoles().then(setRoles).catch(e => setRoles([{ error: e.message }])); }
    useEffect(refresh, []);

    async function doGrant() {
      if (!grant.uid) { alert("Enter the user's UID (Firebase Console → Authentication → Users)."); return; }
      try { await C.grantRole(grant.uid, grant.email, grant.role); setGrant({ uid: '', email: '', role: grant.role }); refresh(); }
      catch (e) { alert('Error granting role: ' + e.message); }
    }
    async function doRevoke(uid) {
      if (!confirm('Revoke role for this user?')) return;
      try { await C.revokeRole(uid); refresh(); } catch (e) { alert('Error: ' + e.message); }
    }
    function onFile(e) {
      const file = e.target.files[0]; if (!file) return;
      e.target.value = '';
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const reader = new FileReader();
      reader.onload = async ev => {
        let raw;
        try { raw = isCsv ? C.csvToSpells(ev.target.result) : JSON.parse(ev.target.result); }
        catch (err) { setImportStatus((isCsv ? 'CSV' : 'JSON') + ' parse error — ' + err.message); return; }
        if (!isCsv && !Array.isArray(raw)) { setImportStatus('JSON must be an array [ { … } ]'); return; }
        if (isCsv && !raw.length) { setImportStatus('No data rows found in CSV.'); return; }
        setProgress({ done: 0, total: 0 });
        const report = await C.importSpells(raw, overwrite, (done, total) => setProgress({ done, total }));
        const parts = [];
        if (report.added) parts.push(report.added + ' added');
        if (report.updated) parts.push(report.updated + ' updated');
        if (report.skipped) parts.push(report.skipped + ' skipped (exist)');
        if (report.invalid.length) parts.push(report.invalid.length + ' invalid');
        if (report.errors) parts.push(report.errors + ' errors');
        setImportStatus('✓ Import complete — ' + (parts.join(', ') || 'nothing to do') + '.');
        setProgress(null);
      };
      reader.readAsText(file);
    }

    const section = (title, kids) => h('div', { key: title, style: { marginBottom: 16 } },
      h('h3', { style: { margin: '0 0 8px', fontSize: 13, color: T.accentLight, textTransform: 'uppercase', letterSpacing: 1 } }, title), kids);

    const roleList = roles === null ? h('div', { style: { color: T.textMuted, fontSize: 12 } }, 'Loading…')
      : roles.length === 0 ? h('div', { style: { color: T.textMuted, fontSize: 12 } }, 'No roles assigned yet.')
      : roles[0] && roles[0].error ? h('div', { style: { color: T.danger, fontSize: 12 } }, 'Error: ' + roles[0].error)
      : roles.map(r => h('div', { key: r.uid, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' } },
          h('span', { style: { flex: 1, fontSize: 13, wordBreak: 'break-all' } }, r.email || r.uid),
          h('span', { style: { fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: (ROLE_BADGE[r.role] || T.accentLight) + '22', color: ROLE_BADGE[r.role] || T.accentLight } }, r.role || ''),
          h('button', { onClick: () => doRevoke(r.uid), style: Object.assign({}, BTN, { color: T.danger }) }, 'Revoke')));

    const body = [
      section('Grant Role', h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('input', { key: 'u', value: grant.uid, onChange: e => setGrant(g => Object.assign({}, g, { uid: e.target.value })), placeholder: 'Firebase UID', style: INP }),
        h('input', { key: 'e', value: grant.email, onChange: e => setGrant(g => Object.assign({}, g, { email: e.target.value })), placeholder: 'Email (for reference)', style: INP }),
        h('div', { key: 'r', style: { display: 'flex', gap: 8 } },
          h('select', { value: grant.role, onChange: e => setGrant(g => Object.assign({}, g, { role: e.target.value })), style: Object.assign({}, INP, { flex: 1 }) },
            ['editor', 'sub-editor', 'suggester', 'admin'].map(r => h('option', { key: r, value: r }, cap(r)))),
          h('button', { onClick: doGrant, style: BTN_PRIMARY }, 'Grant Role')))),
      section('Current Roles', roleList),
      section('Export Compendium', h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { key: 'csv', onClick: () => C.exportCsv().then(n => setExportStatus('✓ Exported ' + n + ' spells as CSV.')).catch(e => setExportStatus('Export failed: ' + e.message)), style: BTN_PRIMARY }, '📊 Export CSV'),
        h('button', { key: 'json', onClick: () => C.exportJson().then(n => setExportStatus('✓ Exported ' + n + ' spells as JSON.')).catch(e => setExportStatus('Export failed: ' + e.message)), style: BTN }, '📄 Export JSON'),
        exportStatus ? h('span', { key: 's', style: { fontSize: 12, color: T.textMuted } }, exportStatus) : null)),
      section('Bulk Import', h('div', null,
        h('div', { key: 'btns', style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 } },
          h('button', { onClick: C.downloadCsvTemplate, style: BTN }, '📊 CSV Template'),
          h('button', { onClick: C.downloadJsonTemplate, style: BTN }, '📄 JSON Template'),
          h('button', { onClick: () => fileRef.current && fileRef.current.click(), style: BTN_PRIMARY }, '📥 Import File'),
          h('input', { ref: fileRef, type: 'file', accept: '.csv,.json', onChange: onFile, style: { display: 'none' } })),
        h('label', { key: 'ow', style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMuted, marginBottom: 8, cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: overwrite, onChange: e => setOverwrite(e.target.checked) }), 'Overwrite existing spells (same name & book)'),
        progress ? h('div', { key: 'pg', style: { fontSize: 12, color: T.textMuted } }, 'Importing… ' + progress.done + ' / ' + progress.total) : null,
        importStatus ? h('div', { key: 'st', style: { fontSize: 12, color: T.textMuted, whiteSpace: 'pre-wrap', marginTop: 4 } }, importStatus) : null)),
    ];
    return h(Overlay, { variant: variant, title: '⚙️ Role Management', onClose: onClose,
      footer: h('button', { onClick: onClose, style: BTN_PRIMARY }, 'Close') }, body);
  }

  // ── Main panel ──────────────────────────────────────────────────────────────
  function CompendiumPanel(props) {
    const variant = props.variant || 'classic';
    const character = props.character || null;
    const spells = C.useSpells();
    const authState = C.useAuth();
    const user = authState.user, role = authState.role;
    const canSuggest = !!user && !C.canEdit(role);

    const [filters, setFilters] = useState({ book: 'all', arcanum: 'all', practice: 'all', search: '' });
    const [addingSpell, setAddingSpell] = useState(null);
    const [editor, setEditor] = useState(null);   // { spell, mode }
    const [inboxOpen, setInboxOpen] = useState(false);
    const [adminOpen, setAdminOpen] = useState(false);
    const [addFeedback, setAddFeedback] = useState({}); // wizard inline feedback
    const [toast, setToast] = useState('');

    function showToast(msg) {
      if (variant === 'wizard') { setToast(msg); setTimeout(() => setToast(''), 2500); }
      else if (window.classicVanilla && window.classicVanilla.showToast) window.classicVanilla.showToast(msg, 'success');
    }

    const filtered = applyFilters(spells, filters);

    function confirmAdd(type, extra) {
      const librarySpell = C.toLibrarySpell(addingSpell, type, extra);
      props.onAddToLibrary && props.onAddToLibrary(librarySpell, type);
      if (variant === 'wizard') {
        const id = addingSpell.id;
        setAddFeedback(p => Object.assign({}, p, { [id]: type }));
        setTimeout(() => setAddFeedback(p => { const n = Object.assign({}, p); delete n[id]; return n; }), 3000);
      }
      setAddingSpell(null);
      props.onAfterAdd && props.onAfterAdd(type);
    }

    function onAdd(s) {
      if (!character) { if (variant === 'classic') alert('Please load or create a character first.'); return; }
      setAddingSpell(s);
    }
    function onEdit(s) { setEditor({ spell: s, mode: 'edit' }); }
    function onSuggest(s) { setEditor({ spell: s, mode: 'suggest' }); }
    async function onDelete(s) {
      if (!confirm('Delete "' + (s.name || 'this spell') + '" from the compendium?\nThis cannot be undone.')) return;
      try { await C.deleteSpell(s.id); showToast('Deleted "' + s.name + '"'); } catch (e) { alert('Delete failed: ' + e.message); }
    }

    const header = (variant === 'wizard') ? h('div', { key: 'wh', style: { padding: '10px 14px 9px',
      background: 'linear-gradient(90deg,var(--bg-deep),var(--bg-card))', borderBottom: '1px solid ' + T.accentBorder,
      display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 } },
      h('span', { key: 'i', style: { fontSize: 16 } }, '📖'),
      h('span', { key: 't', style: { flex: 1, fontFamily: "'Rajdhani',sans-serif", fontSize: 15, fontWeight: 700,
        letterSpacing: 2, textTransform: 'uppercase', color: T.accentLight } }, 'Spell Compendium'),
      props.onClose ? h('button', { key: 'x', onClick: props.onClose, style: Object.assign({}, BTN, { padding: '4px 8px' }) }, '✕') : null) : null;

    const count = h('div', { key: 'count', style: { padding: '4px 14px', fontSize: 11, color: T.textMuted,
      borderBottom: '1px solid ' + T.borderLight, flexShrink: 0 } },
      spells.length === 0 ? 'Loading…' : (filtered.length + ' spell' + (filtered.length !== 1 ? 's' : '')));

    const list = (variant === 'wizard')
      ? h(WizardList, { spells: filtered, loading: spells.length === 0, role, character, canSuggest, onAdd, onEdit, onDelete, onSuggest, addFeedback })
      : h(ClassicList, { spells: filtered, allCount: spells.length, role, character, canSuggest, onAdd, onEdit, onDelete, onSuggest });

    const overlays = [];
    if (addingSpell) overlays.push(h(AddSheet, { key: 'add', variant, spell: addingSpell, character, onConfirm: confirmAdd, onClose: () => setAddingSpell(null) }));
    if (editor) overlays.push(h(EditorModal, { key: 'ed', variant, spell: editor.spell, mode: editor.mode, role, onClose: () => setEditor(null), onToast: showToast }));
    if (inboxOpen) overlays.push(h(InboxModal, { key: 'inb', variant, onClose: () => setInboxOpen(false) }));
    if (adminOpen) overlays.push(h(AdminModal, { key: 'adm', variant, onClose: () => setAdminOpen(false) }));

    const toastEl = (variant === 'wizard' && toast) ? h('div', { key: 'toast', style: { position: 'absolute', bottom: 14,
      left: 14, right: 14, zIndex: 500, background: T.bgCard, border: '1px solid ' + T.accentBorder, borderRadius: 8,
      padding: '10px 14px', fontSize: 12, color: T.text, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' } }, toast) : null;

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', position: 'relative',
      background: variant === 'wizard' ? T.bgDark : 'transparent', borderRadius: variant === 'wizard' ? 20 : 0,
      overflow: 'hidden' } },
      header,
      h(AuthBar, { key: 'auth', user, role,
        onAddSpell: () => setEditor({ spell: null, mode: 'add' }),
        onInbox: () => setInboxOpen(true),
        onAdmin: variant === 'classic' ? () => setAdminOpen(true) : null }),
      h(FilterBar, { key: 'filters', filters, setFilters, variant }),
      count,
      h('div', { key: 'list', style: { flex: 1, minHeight: 0, overflowY: 'auto' } }, list),
      overlays, toastEl);
  }

  return CompendiumPanel;
})();

// Expose on window for Babel-compiled (function-scoped) page scripts.
if (typeof window !== 'undefined') {
  window.compendium = compendium;
  window.CompendiumPanel = CompendiumPanel;
}
