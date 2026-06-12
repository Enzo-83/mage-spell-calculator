// js/tiltCatalog.js — Tilts & Conditions catalog (Code Review Plan, Phase 9)
// Firestore collection "tiltsConditions" — mirrors the Spell Compendium pattern.
// Extracted from storyteller.html's inline TiltsCatalog so wizard.html and
// Classic's scene pill can show players tilt descriptions, not just the ST.
//
// Requires for live data: firebase-firestore-compat.js + shared/firebase.js
// (window._fsDb). Requires React only when useCatalog()/TiltBadge render —
// TiltBadge is plain React.createElement (no JSX), safe to load before Babel,
// same pattern as js/glossary.js.
//
// Exposes:
//   window.tiltCatalog — { subscribe, useCatalog, getByName, csvToEntries,
//                          handleImportFile, downloadTemplate, exportCsv,
//                          getEntryCount }
//   window.TiltBadge   — tilt/condition name with a hover description tooltip;
//                        renders the bare name when the catalog has no entry
//                        (custom tilts degrade gracefully).
const tiltCatalog = (() => {
  let _entries   = [];
  let _listeners = [];
  let _unsub     = null;

  const VALID_TYPES  = ['tilt', 'condition'];
  const CSV_COLUMNS  = ['name','type','persistent','environmental','description',
                        'resolution','beat','effect','causing','ending','sourceBook','sourcePage'];

  function subscribe() {
    if (typeof window === 'undefined' || !window._fsDb) {
      console.warn('tiltCatalog: Firestore not ready (_fsDb missing) — catalog stays empty.');
      return;
    }
    if (_unsub) _unsub();
    _unsub = window._fsDb.collection('tiltsConditions')
      .orderBy('name')
      .onSnapshot(snap => {
        _entries = [];
        snap.forEach(doc => { const d = doc.data(); d.id = doc.id; _entries.push(d); });
        _listeners.forEach(fn => fn([..._entries]));
      }, err => console.error('tiltCatalog snapshot error:', err));
  }

  // React hook: live catalog array. Auto-subscribes on first use so pages
  // that only render badges (wizard, Classic) need no explicit wiring.
  function useCatalog() {
    const [catalog, setCatalog] = React.useState(_entries);
    React.useEffect(() => {
      if (!_unsub) subscribe();
      _listeners.push(setCatalog);
      setCatalog([..._entries]);
      return () => { _listeners = _listeners.filter(fn => fn !== setCatalog); };
    }, []);
    return catalog;
  }

  function getByName(name) {
    if (!name) return null;
    const lc = String(name).trim().toLowerCase();
    return _entries.find(e => e.name.toLowerCase() === lc) || null;
  }

  function parseCsvRow(line) {
    var result = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else { inQ = false; } }
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

  function csvToEntries(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    const entries = [];
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || l.startsWith('#')) continue;
      headerIdx = i; break;
    }
    if (headerIdx < 0) return entries;
    const headers = parseCsvRow(lines[headerIdx]).map(h => h.toLowerCase().trim());
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      const cols = parseCsvRow(lines[i]);
      const row  = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });
      if (!row.name) continue;
      function parseBool(val) {
        const v = (val || '').toLowerCase();
        return v === 'yes' || v === 'true' || v === '1';
      }
      entries.push({
        name: row.name, type: (row.type || 'tilt').toLowerCase(),
        persistent: parseBool(row.persistent), environmental: parseBool(row.environmental),
        description: row.description || '',
        resolution: row.resolution || '', beat: row.beat || '',
        effect: row.effect || '', causing: row.causing || '', ending: row.ending || '',
        sourceBook: row.sourcebook || '',
        sourcePage: row.sourcepage ? parseInt(row.sourcepage, 10) : null,
      });
    }
    return entries;
  }

  function validate(e) {
    const errs = [];
    if (!e.name || !e.name.trim()) errs.push('name required');
    if (VALID_TYPES.indexOf(e.type) === -1) errs.push('type must be tilt or condition');
    return errs;
  }

  function sanitise(e) {
    return {
      name: String(e.name).trim(), type: e.type,
      persistent: !!e.persistent, environmental: !!e.environmental,
      description: String(e.description || '').trim(),
      resolution: String(e.resolution || '').trim(), beat: String(e.beat || '').trim(),
      effect: String(e.effect || '').trim(), causing: String(e.causing || '').trim(),
      ending: String(e.ending || '').trim(),
      sourceBook: String(e.sourceBook || '').trim(),
      sourcePage: e.sourcePage ? parseInt(e.sourcePage, 10) : null,
    };
  }

  async function doImport(raw, overwrite, onStatus, onProgress) {
    const entries = raw.filter(e => e && e.name && !e.name.startsWith('#'));
    if (!entries.length) { onStatus('No valid entries found.', 'warn'); return; }
    const valid = [], invalid = [];
    entries.forEach((e, idx) => {
      const errs = validate(e);
      if (errs.length) invalid.push({ idx: idx+1, name: e.name || '(unnamed)', errs });
      else valid.push(sanitise(e));
    });
    if (invalid.length) {
      const msgs = invalid.map(e => `#${e.idx} "${e.name}": ${e.errs.join(', ')}`).join('\n');
      onStatus(`⚠️ ${invalid.length} entries skipped:\n${msgs}`, 'warn');
    }
    if (!valid.length) { onStatus('No valid entries after validation.', 'err'); return; }
    const existingKeys = {};
    _entries.forEach(e => { existingKeys[e.name.toLowerCase()] = e.id; });
    const toAdd = [], toUpdate = [];
    let skipped = 0;
    valid.forEach(e => {
      const key = e.name.toLowerCase();
      if (existingKeys[key]) { if (overwrite) toUpdate.push({ id: existingKeys[key], data: e }); else skipped++; }
      else toAdd.push(e);
    });
    const total = toAdd.length + toUpdate.length;
    if (!total) { onStatus(`All ${skipped} entries already exist. Enable "Overwrite" to update.`, 'warn'); return; }
    const CHUNK = 499;
    const allOps = [...toAdd.map(e => ({ type:'add', data:e })), ...toUpdate.map(u => ({ type:'update', id:u.id, data:u.data }))];
    let done = 0, errors = 0;
    const now = firebase.firestore.FieldValue.serverTimestamp();
    for (let i = 0; i < allOps.length; i += CHUNK) {
      const chunk = allOps.slice(i, i + CHUNK);
      const batch = window._fsDb.batch();
      chunk.forEach(op => {
        op.data.updatedAt = now;
        if (op.type === 'add') { op.data.createdAt = now; batch.set(window._fsDb.collection('tiltsConditions').doc(), op.data); }
        else { batch.update(window._fsDb.collection('tiltsConditions').doc(op.id), op.data); }
      });
      try { await batch.commit(); done += chunk.length; }
      catch (e) { errors += chunk.length; console.error('Import batch error:', e); }
      if (onProgress) onProgress(done + errors, total);
    }
    const parts = [];
    if (toAdd.length)    parts.push(`${toAdd.length} added`);
    if (toUpdate.length) parts.push(`${toUpdate.length} updated`);
    if (skipped)         parts.push(`${skipped} skipped`);
    if (invalid.length)  parts.push(`${invalid.length} invalid`);
    if (errors)          parts.push(`${errors} batch errors`);
    onStatus(`✓ Import complete — ${parts.join(', ')}.`, errors ? 'warn' : 'ok');
  }

  function downloadTemplate() {
    const header = CSV_COLUMNS.join(',');
    const note = [
      '# DELETE these comment rows before importing.',
      '# type: tilt | condition',
      '# persistent: yes | no  (Conditions marked "(Persistent)")',
      '# environmental: yes | no  (Tilts marked "(Environmental)")',
      '# Conditions: fill description + resolution + beat. Leave effect/causing/ending empty.',
      '# Tilts: fill description + effect + causing + ending. Leave resolution/beat empty.',
      '# Wrap text containing commas in double-quotes.',
      '# sourceBook: optional, e.g. core, signs-of-sorcery',
    ].join('\n');
    const sample = ['Addicted','condition','yes','no',
      '"Your character is addicted to something."',
      '"Regain a dot of Integrity or lose another dot."',
      '"Your character chooses a fix over an obligation."',
      '""','""','""','core','289'].join(',');
    const csv  = note + '\n' + header + '\n' + sample;
    const blob = new Blob([csv], { type:'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tilts-conditions-template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportCsv(onStatus) {
    function csvCell(val) {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    if (!_entries.length) { onStatus('No entries in catalog.', 'warn'); return; }
    const rows = [CSV_COLUMNS.join(',')];
    _entries.forEach(e => {
      rows.push([
        csvCell(e.name), csvCell(e.type),
        csvCell(e.persistent ? 'yes' : 'no'), csvCell(e.environmental ? 'yes' : 'no'),
        csvCell(e.description), csvCell(e.resolution), csvCell(e.beat),
        csvCell(e.effect), csvCell(e.causing), csvCell(e.ending),
        csvCell(e.sourceBook), csvCell(e.sourcePage),
      ].join(','));
    });
    const blob = new Blob([rows.join('\r\n')], { type:'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tilts-conditions-export-' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    onStatus(`✓ Exported ${_entries.length} entries.`, 'ok');
  }

  function handleImportFile(file, overwrite, onStatus, onProgress) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { onStatus('Please upload a .csv file.', 'err'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = csvToEntries(e.target.result);
        if (!raw.length) { onStatus('No data rows found. Check header row.', 'warn'); return; }
        doImport(raw, overwrite, onStatus, onProgress);
      } catch (err) { onStatus('CSV parse error — ' + err.message, 'err'); }
    };
    reader.readAsText(file);
  }

  function getEntryCount() { return _entries.length; }

  return { subscribe, useCatalog, getByName, csvToEntries,
           handleImportFile, downloadTemplate, exportCsv, getEntryCount };
})();

// ── TiltBadge — name with hover description tooltip ─────────────────────────
// Plain React.createElement (no JSX) so this file loads before Babel.
// Wrap it inside whatever chip/badge element the caller styles; it brings no
// chip styling of its own. Custom tilts (no catalog entry) render bare.
const TiltBadge = (() => {
  const TOOLTIP_W = 244;

  // Same field selection as the ST player-card chips: conditions show
  // resolution + beat, tilts show effect + ending.
  function tooltipLines(entry) {
    const lines = entry.type === 'condition'
      ? [entry.description,
         entry.resolution ? 'Resolution: ' + entry.resolution : '',
         entry.beat && entry.beat !== 'n/a' ? 'Beat: ' + entry.beat : '']
      : [entry.description,
         entry.effect ? 'Effect: ' + entry.effect : '',
         entry.ending ? 'Ending: ' + entry.ending : ''];
    return lines.filter(Boolean);
  }

  function typeLabel(entry) {
    if (entry.type === 'condition') return entry.persistent ? 'Persistent Condition' : 'Condition';
    return entry.environmental ? 'Environmental Tilt' : 'Tilt';
  }

  return function TiltBadge(props) {
    const h = React.createElement;
    tiltCatalog.useCatalog();                 // re-render on catalog updates (auto-subscribes)
    const entry = tiltCatalog.getByName(props.name);
    const [hover, setHover] = React.useState(false);
    const wrapRef = React.useRef(null);
    const tipRef  = React.useRef(null);

    React.useLayoutEffect(() => {
      if (!hover || !tipRef.current || !wrapRef.current) return;
      // Flip the tooltip to hug the right edge when it would overflow.
      const anchor = wrapRef.current.getBoundingClientRect();
      const pop = tipRef.current;
      if (anchor.left + TOOLTIP_W > window.innerWidth - 12) {
        pop.style.left = 'auto'; pop.style.right = '0';
      } else {
        pop.style.left = '0'; pop.style.right = 'auto';
      }
    }, [hover]);

    const lines = entry ? tooltipLines(entry) : [];
    const hasTip = lines.length > 0;

    const children = [props.name];
    if (hover && hasTip) {
      children.push(h('div', {
        key: 'tip', ref: tipRef,
        style: {
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 9999,
          width: TOOLTIP_W, background: '#13131f',
          border: '1px solid rgba(123,44,191,0.35)', borderRadius: 8,
          padding: '8px 12px', boxShadow: '0 4px 24px rgba(0,0,0,0.55)',
          pointerEvents: 'none', textAlign: 'left',
          textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal',
          whiteSpace: 'normal',
        },
      },
        h('div', { key: 'head', style: { fontSize: 11, fontWeight: 700, color: '#e0e0e0', marginBottom: 3 } },
          props.name,
          h('span', { style: { fontWeight: 400, color: '#8888aa' } }, ' — ' + typeLabel(entry))),
        lines.map((l, i) =>
          h('div', { key: i, style: { fontSize: 11, color: '#8888aa', lineHeight: 1.45, marginTop: i ? 4 : 0 } }, l))
      ));
    }

    return h('span', {
      ref: wrapRef,
      style: { position: 'relative' },
      onMouseEnter: hasTip ? () => setHover(true)  : undefined,
      onMouseLeave: hasTip ? () => setHover(false) : undefined,
    }, children);
  };
})();

// Expose on window for Babel-compiled (function-scoped) page scripts.
if (typeof window !== 'undefined') {
  window.tiltCatalog = tiltCatalog;
  window.TiltBadge   = TiltBadge;
}
