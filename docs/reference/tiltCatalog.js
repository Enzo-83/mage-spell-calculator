/**
 * Tilt & Condition Catalog — Firestore-backed catalog module
 *
 * Requires: firebase-firestore-compat.js loaded, window._fbApp initialised.
 * Exposes:
 *   window.tiltCatalog  — { init, getAll, getByName, onChange, exportCsv, importFromText }
 *   window.TiltBadge    — React component: badge label with hover description tooltip
 *
 * Firestore collection: tiltsConditions
 *   Documents: { name: string, type: "Tilt"|"Condition", description: string, createdAt, updatedAt }
 */
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────
  var _db       = null;
  var _entries  = [];   // live cache: { id, name, type, description }
  var _unsub    = null; // Firestore listener teardown
  var _onChange = [];   // registered change callbacks

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    if (!window._fbApp) {
      console.warn('TiltCatalog: Firebase app not ready.');
      return;
    }
    _db = firebase.firestore();
    _subscribe();
  }

  function _subscribe() {
    if (_unsub) _unsub();
    _unsub = _db.collection('tiltsConditions')
      .orderBy('name')
      .onSnapshot(function (snap) {
        _entries = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          d.id = doc.id;
          _entries.push(d);
        });
        _onChange.forEach(function (cb) { cb(_entries.slice()); });
      }, function (err) {
        console.error('TiltCatalog snapshot error:', err);
      });
  }

  // ── Query API ─────────────────────────────────────────────────────────────
  function getAll() { return _entries.slice(); }

  function getByName(name) {
    if (!name) return null;
    var lc = name.toLowerCase();
    return _entries.find(function (e) { return e.name.toLowerCase() === lc; }) || null;
  }

  // Register a callback fired on every catalog update.
  // Returns an unsubscribe function (suitable as useEffect cleanup).
  function onChange(cb) {
    _onChange.push(cb);
    if (_entries.length) cb(_entries.slice());
    return function () {
      _onChange = _onChange.filter(function (l) { return l !== cb; });
    };
  }

  // ── CSV helpers ───────────────────────────────────────────────────────────
  function _csvCell(val) {
    if (val === null || val === undefined) return '';
    var s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function _parseCsvRow(line) {
    var result = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else { inQ = false; }
        } else { cur += ch; }
      } else {
        if      (ch === '"') { inQ = true; }
        else if (ch === ',') { result.push(cur.trim()); cur = ''; }
        else                 { cur += ch; }
      }
    }
    result.push(cur.trim());
    return result;
  }

  function _parseCsvText(text) {
    var lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    var entries = [], headerIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l || l.startsWith('#')) continue;
      headerIdx = i; break;
    }
    if (headerIdx < 0) return entries;

    var headers = _parseCsvRow(lines[headerIdx]).map(function (h) {
      return h.toLowerCase().trim();
    });

    for (var j = headerIdx + 1; j < lines.length; j++) {
      var line = lines[j].trim();
      if (!line || line.startsWith('#')) continue;
      var cols = _parseCsvRow(lines[j]);
      var row  = {};
      headers.forEach(function (h, idx) { row[h] = (cols[idx] || '').trim(); });
      if (!row.name || !row.type) continue;
      entries.push({ name: row.name, type: row.type, description: row.description || '' });
    }
    return entries;
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function exportCsv() {
    var rows = ['name,type,description'];
    _entries.forEach(function (e) {
      rows.push([_csvCell(e.name), _csvCell(e.type), _csvCell(e.description)].join(','));
    });
    var blob = new Blob([rows.join('\r\n')], { type: 'text/csv' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'tilts-conditions-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import ────────────────────────────────────────────────────────────────
  // onDone(err, count) — called when all Firestore batches commit (or on error).
  // overwrite=true → update existing entries matched by name+type, add new ones.
  // overwrite=false → always add new documents (may create duplicates).
  function importFromText(text, overwrite, onDone) {
    var entries = _parseCsvText(text);
    if (!entries.length) {
      if (onDone) onDone(new Error('No valid rows found in CSV.'), 0);
      return;
    }

    var batches = [_db.batch()];
    var count   = 0;

    entries.forEach(function (entry) {
      if (count > 0 && count % 499 === 0) batches.push(_db.batch());
      var currentBatch = batches[batches.length - 1];
      var ts = firebase.firestore.FieldValue.serverTimestamp();

      if (overwrite) {
        var existing = _entries.find(function (e) {
          return e.name.toLowerCase() === entry.name.toLowerCase() && e.type === entry.type;
        });
        if (existing) {
          currentBatch.update(
            _db.collection('tiltsConditions').doc(existing.id),
            { description: entry.description, updatedAt: ts }
          );
        } else {
          currentBatch.set(_db.collection('tiltsConditions').doc(), {
            name: entry.name, type: entry.type, description: entry.description, createdAt: ts,
          });
        }
      } else {
        currentBatch.set(_db.collection('tiltsConditions').doc(), {
          name: entry.name, type: entry.type, description: entry.description, createdAt: ts,
        });
      }
      count++;
    });

    Promise.all(batches.map(function (b) { return b.commit(); }))
      .then(function ()    { if (onDone) onDone(null, count); })
      .catch(function (e)  { if (onDone) onDone(e, 0); });
  }

  // ── TiltBadge React component ─────────────────────────────────────────────
  // Usage (JSX):  <TiltBadge name={t} />
  // Renders the tilt name as plain text with a hover tooltip showing its
  // description from the Firestore catalog.  No styling of its own — wrap it
  // inside whatever badge element the caller wants.
  var TOOLTIP_W = 244;

  function TiltBadge(props) {
    var name  = props.name;
    var entry = getByName(name);
    var desc  = entry ? entry.description : '';

    var _s      = React.useState(false);
    var hover   = _s[0], setHover = _s[1];

    var wrapRef = React.useRef(null);
    var tipRef  = React.useRef(null);

    React.useLayoutEffect(function () {
      if (!hover || !tipRef.current || !wrapRef.current) return;
      var pop    = tipRef.current;
      var anchor = wrapRef.current.getBoundingClientRect();
      if (anchor.left + TOOLTIP_W > window.innerWidth - 12) {
        pop.style.left = 'auto'; pop.style.right = '0';
      } else {
        pop.style.left = '0';   pop.style.right = 'auto';
      }
    }, [hover]);

    var children = [name];
    if (hover && desc) {
      children.push(React.createElement('div', {
        key: 'tip',
        ref: tipRef,
        style: {
          position:     'absolute',
          bottom:       'calc(100% + 6px)',
          left:         0,
          zIndex:       9999,
          width:        TOOLTIP_W,
          background:   '#13131f',
          border:       '1px solid rgba(123,44,191,0.35)',
          borderRadius: 8,
          padding:      '8px 12px',
          boxShadow:    '0 4px 24px rgba(0,0,0,0.55)',
          pointerEvents:'none',
          textTransform:'none',
          letterSpacing:'normal',
          fontWeight:   'normal',
        },
      },
        React.createElement('div', {
          style: { fontSize: 11, fontWeight: 700, color: '#e0e0e0', marginBottom: 3 },
        }, name),
        React.createElement('div', {
          style: { fontSize: 11, color: '#8888aa', lineHeight: 1.45 },
        }, desc)
      ));
    }

    return React.createElement('span', {
      ref:          wrapRef,
      style:        { position: 'relative' },
      onMouseEnter: desc ? function () { setHover(true);  } : undefined,
      onMouseLeave: desc ? function () { setHover(false); } : undefined,
    }, children);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.tiltCatalog = {
    init:           init,
    getAll:         getAll,
    getByName:      getByName,
    onChange:       onChange,
    exportCsv:      exportCsv,
    importFromText: importFromText,
  };
  window.TiltBadge = TiltBadge;

}());
