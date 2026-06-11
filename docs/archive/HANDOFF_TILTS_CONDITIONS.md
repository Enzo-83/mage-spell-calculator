# Handoff: Firestore-backed Tilts & Conditions Catalog for storyteller.html

## Goal

Add a **Tilts & Conditions Catalog** to `storyteller.html` using the same Firestore + CSV-upload pattern as the Spell Compendium (`js/spellCompendium.js`). The ST uploads a CSV to populate a Firestore collection, then picks tilts/conditions from a searchable dropdown on each player card. Custom freeform entries are still allowed.

**No auth/sign-in required** — the catalog is a shared read-only resource. Any ST with session access can upload CSV data to populate it.

---

## Reference: How the Spell Compendium Does It

Study these sections of `js/spellCompendium.js` — the tilts catalog mirrors this pattern:

| Compendium Pattern | Line Range | What to Reuse |
|---|---|---|
| Firestore real-time subscription | `80-97` (`_subscribe()`) | `_db.collection('compendium').orderBy('name').onSnapshot(...)` — mirror for `tiltsConditions` collection |
| Robust CSV row parser | `1092-1114` (`_parseCsvRow()`) | **Copy this function exactly** — handles quoted fields with embedded commas/newlines |
| CSV-to-object-array converter | `1116-1206` (`_csvToSpellArray()`) | Adapt for simpler tilt/condition schema |
| File upload handler | `1208-1249` (`_handleImportFile()`) | CSV detection, FileReader, error status messages |
| Batch Firestore import | `1251-1363` (`_doImport()`) | Batch writes with duplicate detection & overwrite toggle |
| Import status/progress UI | `1416-1434` | Status message + progress bar pattern |
| CSV template download | `1048-1090` (`_downloadCsvTemplate()`) | Generate a sample CSV for the user to fill in |
| CSV export | `972-1034` (`_exportCsv()`) | Export current catalog back to CSV |

---

## Architecture

### Firestore Collection: `tiltsConditions`

Each document represents one tilt or condition. **Tilts and Conditions have different field structures in the books**, so the schema is a superset — each type uses only its relevant fields, the rest stay empty.

**Conditions** use: `description`, `resolution`, `beat`
**Tilts** use: `description`, `effect`, `causing`, `ending`

```javascript
{
  // ── Shared fields ──
  name:          "Addicted",           // string, required
  type:          "condition",          // "tilt" | "condition", required
  persistent:    true,                 // boolean — Conditions marked "(Persistent)"
  environmental: false,                // boolean — Tilts marked "(Environmental)"
  description:   "Your character …",   // string — intro/flavor text
  sourceBook:    "core",               // string (optional)
  sourcePage:    289,                  // number (optional)

  // ── Condition-only fields ──
  resolution:    "Regain a dot …",     // string — how the condition resolves
  beat:          "Your character …",   // string — what earns a Beat ("n/a" if none)

  // ── Tilt-only fields ──
  effect:        "If your arm's …",    // string — mechanical effect of the tilt
  causing:       "Some supernatural …",// string — how the tilt is inflicted
  ending:        "If the Tilt is …",   // string — how the tilt is removed

  // ── Auto-managed ──
  createdAt:     Timestamp,
  updatedAt:     Timestamp
}
```

### CSV Schema

The user fills out a CSV file with this header row:

```csv
name,type,persistent,environmental,description,resolution,beat,effect,causing,ending,sourceBook,sourcePage
```

**Example Condition rows:**
```csv
Addicted,condition,yes,no,"Your character is addicted to something, whether drugs, gambling or other destructive behaviors. Some addictions are more dangerous than others, but the nature of addiction is that it slowly takes over your life, impeding functionality. If you are addicted, you need to indulge your addiction regularly to keep it under control. A specific addiction should be chosen upon taking this Condition; characters can take this Condition multiple times for different addictions. Being unable to feed your addiction can result in the Deprived Condition.","Regain a dot of Integrity or Wisdom, lose another dot of Integrity or Wisdom, or achieve an exceptional success on a breaking point or Act of Hubris.","Your character chooses to get a fix rather than fulfill an obligation.","","","",core,289
Inspired,condition,no,no,"Your character is deeply inspired. When your character takes an action pertaining to that inspiration, you may resolve this Condition. An exceptional success on that roll requires only three successes instead of five and you gain a point of Willpower.","You spend inspiration to spur yourself to greater success, resolving the Condition as described above.",n/a,"","","",core,
Informed,condition,no,no,"Your character has a breadth of research information based on the topic she investigated. When you make a roll relating to the topic, you may choose to resolve this Condition. If you resolve it and the roll fails, it is instead considered to have a single success. If it succeeds, the roll is considered an exceptional success. The roll that benefits from the Informed Condition can be any relevant Skill roll. Combat rolls cannot benefit from this Condition.","Your character uses her research to gain information; the Condition is resolved as described above.",n/a,"","","",core,
```

**Example Tilt rows:**
```csv
Arm Wrack,tilt,no,no,"Your arm burns with pain and then goes numb. It could be dislocated, sprained, or broken: whatever's wrong with it, you can't move your limb.","","","If your arm's broken or otherwise busted, you drop whatever you're holding in that arm and can't use it to attack opponents — unless you've got the Ambidextrous Merit, you suffer off-hand penalties for any rolls that require manual dexterity. If this effect spreads to both limbs, you're down to a chance die on any rolls that require manual dexterity, and -3 to all other Physical actions.","Some supernatural powers can cripple a victim's limbs or break bones with a touch. A character can have his arm knocked out by a targeted blow to the arm (-2 penalty) that deals more damage than the character's Stamina. A targeted blow to the hand inflicts this Tilt if it does any damage.","If the Tilt is inflicted as a result of an attack, mark an 'x' under the leftmost Health box inflicted in that attack; the Tilt ends when the damage that caused it has healed. If aggravated damage inflicts this Tilt, the character loses the use of his arm (or straight up loses his arm) permanently.",core,280
Extreme Cold,tilt,no,yes,"Bone-chilling winds bite through the character, or trudging through knee-deep snow takes all of the sensation from his limbs. Any time the temperature gets down below zero degrees Celsius (32 degrees Fahrenheit), a character can suffer from the cold's effects. This Tilt can sometimes be personal, either as a result of a medical Condition such as hypothermia or a supernatural power.","","","When the temperature is below freezing, characters can't heal bashing damage — the extreme temperature deals damage at the same rate normal characters heal it. Supernatural beings and characters who heal faster than normal instead halve their normal healing rate. For every hour that a character is continuously affected by this Tilt, he accrues a -1 penalty to all rolls. When that penalty hits -5 dice, he instead suffers one point of lethal damage per hour.","A character can suffer this Tilt from being in a frozen environment — whether he's outside in the Arctic tundra or in a walk-in freezer. Inflicting the Tilt is reasonably straightforward: Throw the victim into a freezing lake or lock him in a freezer for long enough and he'll develop hypothermia.","The best way to escape the freezing cold is to find a source of warmth — either a building with working heating, or warm bundled clothing. A character who has hypothermia requires medical attention.",core,
Knocked Down,tilt,no,no,"Something knocks the character to the floor, either toppling her with a powerful blow to the chest or taking one of her legs out from under her.","","","The character is knocked off her feet. If she hasn't already acted this turn, she loses her action. Once she's on the ground, a character is considered prone. The character can still apply Defense against incoming attacks, and can attempt to attack from the ground at a -2 penalty.","Some weapons list ""Knockdown"" as a special effect of a damaging hit. Otherwise, a melee weapon with a damage modifier of +2 or greater, or a firearm with a damage modifier of +3 or more can be used to knock a character down, with the force of the blow. Alternatively, a melee weapon or unarmed attack can knock an opponent down with a targeted attack against the legs (-2 modifier). The attacker declares that he wants to knock his opponent down and halves the total damage done (rounding down). On a successful attack, the target is knocked down.","The easiest way to end this Tilt is to stand up, which takes an action. A character affected by this Tilt who hasn't yet acted can make a Dexterity + Athletics roll, minus any weapon modifier, instead of her normal action. If successful, she avoids the effects of this Tilt altogether. On a failure, she falls over and the Tilt applies as normal.",core,
Stunned,tilt,no,no,"Your character is dazed and unable to think straight. Maybe her vision blurs. If she's stunned as a result of a blow to the head, she's probably got a concussion.","","","A character with the Stunned Tilt loses her next action, and halves her Defense until she can next act.","A character can be stunned by any attack that does at least as much damage as her Size in a single hit. Some weapons have a ""stun"" special ability. These double the weapon modifier only for the purposes of determining whether the attacker inflicts the Stunned Tilt. Attacks against the target's head (see Specified Targets, p.220) count the character's Size as one lower for the purposes of this Tilt. The Storyteller might determine that additional effects cause this Tilt, like being caught in the blast area of an explosion.","The effects of this Tilt normally only last for a single turn. The character can end the Tilt during her own action by reflexively spending a point of Willpower to gather her wits, though she suffers a -3 modifier to any actions she takes that turn.",core,
```

**CSV notes for the user:**
- `persistent` / `environmental`: use `yes`/`no` (or `true`/`false` or `1`/`0`). Persistent applies to Conditions; Environmental applies to Tilts.
- All text fields: Wrap in double-quotes since they will contain commas. Use `""` to escape any quotes inside.
- **Conditions**: fill `resolution` and `beat`. Leave `effect`, `causing`, `ending` empty (`""`).
- **Tilts**: fill `effect`, `causing`, `ending`. Leave `resolution` and `beat` empty (`""`).
- `beat`: Use `n/a` if the condition has no Beat mechanic.

### Valid Values

```javascript
var VALID_TYPES = ['tilt', 'condition'];
```

---

## Files to Read Before Implementing

| File | Why | Key Lines |
|---|---|---|
| `storyteller.html` | Main file to modify — all changes go here | Lines 43-61 (script imports + Firebase init), 131-147 (PlayerCard state), 185-196 (tilt functions), 441-482 (tilts UI) |
| `js/spellCompendium.js` | **Primary reference** — copy CSV parser, import/export pattern, Firestore subscription | Lines 80-97 (subscription), 1092-1114 (CSV parser), 1116-1206 (CSV→objects), 1208-1363 (import flow), 972-1034 (export) |
| `shared/session.js` | Firebase Realtime DB helpers for session tilts (player.tilts still stored here) | Lines 175-179 (`sessionSetTilts`) |

---

## Files to Modify

### `storyteller.html` — All changes in this single file

#### 1. Add Firestore SDK (line 48, after `firebase-database-compat.js`)

```html
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
```

#### 2. Add Firestore handle (line 59, after `const _fbDb = firebase.database();`)

```javascript
const _fsDb = firebase.firestore();
```

#### 3. Add Tilts Catalog Module (inside the `<script type="text/babel">` block, before component definitions)

This is a self-contained module following the compendium pattern. Place it after the color constants (`C` object) and before the first component.

```javascript
// ── Tilts & Conditions Catalog ───────────────────────────────────────
// Mirrors the Spell Compendium pattern (js/spellCompendium.js):
//   - Firestore collection "tiltsConditions" for the shared catalog
//   - CSV upload to populate it (no auth needed)
//   - Real-time onSnapshot keeps all ST tabs in sync

const TiltsCatalog = (() => {
  let _entries = [];       // Live cache from Firestore
  let _listeners = [];     // React setState callbacks to notify on change
  let _unsub = null;

  const VALID_TYPES = ['tilt', 'condition'];

  const CSV_COLUMNS = ['name', 'type', 'persistent', 'environmental', 'description', 'resolution', 'beat', 'effect', 'causing', 'ending', 'sourceBook', 'sourcePage'];

  // ── Subscribe to Firestore (call once on app mount) ──
  function subscribe() {
    if (_unsub) _unsub();
    _unsub = _fsDb.collection('tiltsConditions')
      .orderBy('name')
      .onSnapshot(snap => {
        _entries = [];
        snap.forEach(doc => {
          const d = doc.data();
          d.id = doc.id;
          _entries.push(d);
        });
        _listeners.forEach(fn => fn([..._entries]));
      }, err => {
        console.error('TiltsCatalog snapshot error:', err);
      });
  }

  // React hook: useTiltsCatalog()
  function useCatalog() {
    const [catalog, setCatalog] = React.useState(_entries);
    React.useEffect(() => {
      _listeners.push(setCatalog);
      setCatalog([..._entries]);  // hydrate immediately
      return () => {
        _listeners = _listeners.filter(fn => fn !== setCatalog);
      };
    }, []);
    return catalog;
  }

  // ── Robust CSV row parser (copied from spellCompendium.js lines 1092-1114) ──
  function parseCsvRow(line) {
    var result = [];
    var cur    = '';
    var inQ    = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else { inQ = false; }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"')       { inQ = true; }
        else if (ch === ',')  { result.push(cur.trim()); cur = ''; }
        else                  { cur += ch; }
      }
    }
    result.push(cur.trim());
    return result;
  }

  // ── CSV → object array (adapted from spellCompendium.js _csvToSpellArray) ──
  function csvToEntries(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    const entries = [];
    let headerIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || l.startsWith('#')) continue;
      headerIdx = i;
      break;
    }
    if (headerIdx < 0) return entries;

    const headers = parseCsvRow(lines[headerIdx]).map(h => h.toLowerCase().trim());

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      const cols = parseCsvRow(lines[i]);

      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });

      if (!row.name) continue;

      function parseBool(val) {
        const v = (val || '').toLowerCase();
        return v === 'yes' || v === 'true' || v === '1';
      }

      entries.push({
        name:          row.name,
        type:          (row.type || 'tilt').toLowerCase(),
        persistent:    parseBool(row.persistent),
        environmental: parseBool(row.environmental),
        description:   row.description || '',
        // Condition fields
        resolution:    row.resolution || '',
        beat:          row.beat || '',
        // Tilt fields
        effect:        row.effect || '',
        causing:       row.causing || '',
        ending:        row.ending || '',
        sourceBook:    row.sourcebook || '',
        sourcePage:    row.sourcepage ? parseInt(row.sourcepage, 10) : null,
      });
    }
    return entries;
  }

  // ── Validation (adapted from spellCompendium.js _validateSpell) ──
  function validate(entry) {
    const errs = [];
    if (!entry.name || !entry.name.trim()) errs.push('name required');
    if (VALID_TYPES.indexOf(entry.type) === -1) errs.push('type must be tilt or condition');
    return errs;
  }

  function sanitise(entry) {
    return {
      name:          String(entry.name).trim(),
      type:          entry.type,
      persistent:    !!entry.persistent,
      environmental: !!entry.environmental,
      description:   String(entry.description || '').trim(),
      // Condition fields
      resolution:    String(entry.resolution || '').trim(),
      beat:          String(entry.beat || '').trim(),
      // Tilt fields
      effect:        String(entry.effect || '').trim(),
      causing:       String(entry.causing || '').trim(),
      ending:        String(entry.ending || '').trim(),
      sourceBook:    String(entry.sourceBook || '').trim(),
      sourcePage:    entry.sourcePage ? parseInt(entry.sourcePage, 10) : null,
    };
  }

  // ── Batch import (adapted from spellCompendium.js _doImport) ──
  async function doImport(raw, overwrite, onStatus, onProgress) {
    const entries = raw.filter(e => e && e.name && !e.name.startsWith('#'));
    if (!entries.length) { onStatus('No valid entries found.', 'warn'); return; }

    const valid = [];
    const invalid = [];
    entries.forEach((e, idx) => {
      const errs = validate(e);
      if (errs.length) invalid.push({ idx: idx + 1, name: e.name || '(unnamed)', errs });
      else valid.push(sanitise(e));
    });

    if (invalid.length) {
      const msgs = invalid.map(e => `#${e.idx} "${e.name}": ${e.errs.join(', ')}`).join('\n');
      onStatus(`⚠️ ${invalid.length} entries skipped:\n${msgs}`, 'warn');
    }
    if (!valid.length) { onStatus('No valid entries after validation.', 'err'); return; }

    // Duplicate detection against live cache
    const existingKeys = {};
    _entries.forEach(e => { existingKeys[e.name.toLowerCase()] = e.id; });

    const toAdd = [];
    const toUpdate = [];
    let skipped = 0;

    valid.forEach(e => {
      const key = e.name.toLowerCase();
      if (existingKeys[key]) {
        if (overwrite) toUpdate.push({ id: existingKeys[key], data: e });
        else skipped++;
      } else {
        toAdd.push(e);
      }
    });

    const total = toAdd.length + toUpdate.length;
    if (!total) {
      onStatus(`All ${skipped} entries already exist. Enable "Overwrite" to update.`, 'warn');
      return;
    }

    // Batch writes (Firestore max 499 per batch)
    const CHUNK = 499;
    const allOps = [
      ...toAdd.map(e => ({ type: 'add', data: e })),
      ...toUpdate.map(u => ({ type: 'update', id: u.id, data: u.data })),
    ];

    let done = 0;
    let errors = 0;
    const now = firebase.firestore.FieldValue.serverTimestamp();

    for (let i = 0; i < allOps.length; i += CHUNK) {
      const chunk = allOps.slice(i, i + CHUNK);
      const batch = _fsDb.batch();

      chunk.forEach(op => {
        op.data.updatedAt = now;
        if (op.type === 'add') {
          op.data.createdAt = now;
          batch.set(_fsDb.collection('tiltsConditions').doc(), op.data);
        } else {
          batch.update(_fsDb.collection('tiltsConditions').doc(op.id), op.data);
        }
      });

      try {
        await batch.commit();
        done += chunk.length;
      } catch (e) {
        errors += chunk.length;
        console.error('Import batch error:', e);
      }
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

  // ── CSV Template Download ──
  function downloadTemplate() {
    const header = CSV_COLUMNS.join(',');
    const note = [
      '# DELETE these comment rows before importing.',
      '# type: tilt | condition',
      '# persistent: yes | no — for Conditions marked "(Persistent)"',
      '# environmental: yes | no — for Tilts marked "(Environmental)"',
      '# Conditions: fill description + resolution + beat. Leave effect/causing/ending empty.',
      '# Tilts: fill description + effect + causing + ending. Leave resolution/beat empty.',
      '# Wrap any text containing commas in double-quotes.',
      '# sourceBook: optional, e.g. core, signs-of-sorcery, night-horrors, tome-of-pentacle',
    ].join('\n');
    const sample = [
      'Addicted', 'condition', 'yes', 'no',
      '"Your character is addicted to something, whether drugs, gambling or other destructive behaviors."',
      '"Regain a dot of Integrity or Wisdom, lose another dot."',
      '"Your character chooses to get a fix rather than fulfill an obligation."',
      '""', '""', '""',
      'core', '289'
    ].join(',');
    const csv = note + '\n' + header + '\n' + sample;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tilts-conditions-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── CSV Export ──
  async function exportCsv(onStatus) {
    function csvCell(val) {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    if (!_entries.length) { onStatus('No entries in catalog.', 'warn'); return; }

    const rows = [CSV_COLUMNS.join(',')];
    _entries.forEach(e => {
      rows.push([
        csvCell(e.name), csvCell(e.type),
        csvCell(e.persistent ? 'yes' : 'no'), csvCell(e.environmental ? 'yes' : 'no'),
        csvCell(e.description),
        csvCell(e.resolution), csvCell(e.beat),
        csvCell(e.effect), csvCell(e.causing), csvCell(e.ending),
        csvCell(e.sourceBook), csvCell(e.sourcePage),
      ].join(','));
    });

    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tilts-conditions-export-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    onStatus(`✓ Exported ${_entries.length} entries.`, 'ok');
  }

  // ── Handle file input change ──
  function handleImportFile(file, overwrite, onStatus, onProgress) {
    if (!file) return;
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (!isCsv) { onStatus('Please upload a .csv file.', 'err'); return; }

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = csvToEntries(e.target.result);
        if (!raw.length) { onStatus('No data rows found. Check header row.', 'warn'); return; }
        doImport(raw, overwrite, onStatus, onProgress);
      } catch (err) {
        onStatus('CSV parse error — ' + err.message, 'err');
      }
    };
    reader.readAsText(file);
  }

  return { subscribe, useCatalog, handleImportFile, downloadTemplate, exportCsv };
})();
```

#### 4. Call `TiltsCatalog.subscribe()` in App mount

In the main `App` component (or at the top-level `useEffect` that sets up the session listener), add:

```javascript
useEffect(() => { TiltsCatalog.subscribe(); }, []);
```

#### 5. Add Catalog Management UI Panel

Add a **"⚙ Tilts Catalog"** button in the ST header bar (near the existing session controls). It opens a modal/panel with:

- **Download Template** button → calls `TiltsCatalog.downloadTemplate()`
- **File upload** input (`<input type="file" accept=".csv">`) → triggers `TiltsCatalog.handleImportFile()`
- **Overwrite existing** checkbox (matches compendium pattern)
- **Export CSV** button → calls `TiltsCatalog.exportCsv()`
- **Status message** area (styled like compendium's `.import-status`)
- **Progress bar** (shown during import)
- **Entry count** display: "42 tilts & conditions loaded"

Style this panel to match the existing ST header style — dark card, subtle border, Arcanum purple accent.

#### 6. Modify PlayerCard Tilts UI (lines 441-482)

**Two changes in this section:**

**A. Enrich the applied-tilt badges** (lines 446-460) — When a tilt name matches a catalog entry, show richer info. Build a lookup map and use it in the badge rendering:

```javascript
const catalogByName = {};
catalog.forEach(c => { catalogByName[c.name.toLowerCase()] = c; });
```

Then in the tilts display (lines 446-460), replace the simple `{t}` badge with:

```jsx
{tilts.map((t, i) => {
  const catEntry = catalogByName[t.toLowerCase()];
  return (
    <span key={i}
      title={catEntry
        ? catEntry.type === 'condition'
          ? [catEntry.description, catEntry.resolution ? 'Resolution: ' + catEntry.resolution : '', catEntry.beat && catEntry.beat !== 'n/a' ? 'Beat: ' + catEntry.beat : ''].filter(Boolean).join('\n\n')
          : [catEntry.description, catEntry.effect ? 'Effect: ' + catEntry.effect : '', catEntry.ending ? 'Ending the Tilt: ' + catEntry.ending : ''].filter(Boolean).join('\n\n')
        : t}
      style={{ display:"inline-flex", alignItems:"center", gap:4,
        padding:"3px 8px", borderRadius:20, fontSize:11,
        background: catEntry?.persistent ? "rgba(199,62,29,0.15)"
                  : catEntry?.environmental ? "rgba(42,157,143,0.15)"
                  : C.warningFaint,
        border:`1px solid ${catEntry?.persistent ? "rgba(199,62,29,0.3)" : catEntry?.environmental ? "rgba(42,157,143,0.3)" : "rgba(233,196,106,0.3)"}`,
        color: catEntry?.persistent ? C.danger : catEntry?.environmental ? "#2a9d8f" : C.warning }}>
      {t}
      {catEntry?.persistent && (
        <span style={{ fontSize: 8, opacity: 0.7 }}>⟳</span>
      )}
      {catEntry?.environmental && (
        <span style={{ fontSize: 8, opacity: 0.7 }}>🌍</span>
      )}
      <button onClick={() => removeTilt(i)}
        style={{ background:"transparent", border:"none",
          color: catEntry?.persistent ? C.danger : catEntry?.environmental ? "#2a9d8f" : C.warning,
          cursor:"pointer", fontSize:13, lineHeight:1, padding:0, opacity:0.7 }}>
        ×
      </button>
    </span>
  );
})}
```

This gives:
- **Native `title` tooltip** with the full description, resolution, and beat — visible on hover
- **Persistent tilts** get a red-tinted badge with a ⟳ icon instead of the default yellow
- **Custom tilts** (not in catalog) keep the existing yellow styling

**B. Replace the text input** (lines 465-481) with the combo-box dropdown pattern. The catalog now comes from Firestore via `TiltsCatalog.useCatalog()` instead of a static CSV fetch.

Inside `PlayerCard`, at the top with other hooks:

```javascript
const catalog = TiltsCatalog.useCatalog();
const [tiltDropdownOpen, setTiltDropdownOpen] = useState(false);
const tiltInputRef = useRef(null);     // the <input> element — for getBoundingClientRect()
const tiltDropdownRef = useRef(null);  // the portal dropdown — for outside-click detection
```

The filtering, dropdown rendering, `addTiltFromCatalog()`, `addTilt()`, and outside-click handler are **identical to the previous plan** (see code blocks in the "UI Changes in PlayerCard" section below).

**Filtering logic:**
```javascript
const filteredCatalog = tiltInput.trim()
  ? catalog.filter(c => c.name.toLowerCase().includes(tiltInput.toLowerCase()))
  : catalog;
const grouped = {
  tilt:      filteredCatalog.filter(c => c.type === "tilt"),
  condition: filteredCatalog.filter(c => c.type === "condition"),
};
const exactMatch = catalog.some(c => c.name.toLowerCase() === tiltInput.trim().toLowerCase());
```

**Updated addTilt / addTiltFromCatalog:**
```javascript
function addTiltFromCatalog(name) {
  if (!tilts.includes(name)) {
    sessionSetTilts(sessionCode, pid, [...tilts, name]);
  }
  setTiltInput("");
  setTiltDropdownOpen(false);
}

function addTilt() {
  const t = tiltInput.trim();
  if (!t) return;
  sessionSetTilts(sessionCode, pid, [...tilts, t]);
  setTiltInput("");
  setTiltDropdownOpen(false);
}
```

**Outside-click + scroll/resize handler** (must check both the input area AND the portal dropdown):
```javascript
useEffect(() => {
  function handleClick(e) {
    const inInput    = tiltInputRef.current    && tiltInputRef.current.parentElement.contains(e.target);
    const inDropdown = tiltDropdownRef.current && tiltDropdownRef.current.contains(e.target);
    if (!inInput && !inDropdown) {
      setTiltDropdownOpen(false);
    }
  }
  function handleDismiss() { setTiltDropdownOpen(false); }
  document.addEventListener("mousedown", handleClick);
  window.addEventListener("scroll", handleDismiss, true);   // capture phase catches inner scrolls
  window.addEventListener("resize", handleDismiss);
  return () => {
    document.removeEventListener("mousedown", handleClick);
    window.removeEventListener("scroll", handleDismiss, true);
    window.removeEventListener("resize", handleDismiss);
  };
}, []);
```

**⚠️ CRITICAL: Overflow Clipping Problem & Portal Solution**

The PlayerCard outer `<div>` (line 230) has `overflow:"hidden"` for its `borderRadius:12`.
The Tilts section sits at the **bottom** of the card. A normal `position: absolute`
dropdown will be **completely invisible** — clipped by the card boundary.

**Solution: Use `ReactDOM.createPortal()`** to render the dropdown directly into `document.body`,
positioned with `position: fixed` using `getBoundingClientRect()` from the input element.

**Dropdown position helper** (compute on every render when dropdown is open):
```javascript
function getDropdownPos() {
  if (!tiltInputRef.current) return { top: 0, left: 0, width: 200 };
  const rect = tiltInputRef.current.getBoundingClientRect();
  const dropdownH = 240; // maxHeight + margin
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUpward = spaceBelow < dropdownH && rect.top > dropdownH;
  return {
    left:  rect.left,
    width: rect.width + 42,  // include the + button width
    top:   openUpward ? undefined : rect.bottom + 4,
    bottom: openUpward ? (window.innerHeight - rect.top + 4) : undefined,
  };
}
```

> The `openUpward` logic handles the case where the card is near the bottom of the viewport —
> the dropdown flips above the input instead of extending below into nothingness.

**Dropdown UI** (replaces lines 465-481):
```jsx
{/* ── Input row (stays inside the card) ── */}
<div style={{ display:"flex", gap:6 }}>
  <input
    ref={tiltInputRef}
    value={tiltInput}
    onChange={e => { setTiltInput(e.target.value); setTiltDropdownOpen(true); }}
    onFocus={() => setTiltDropdownOpen(true)}
    onKeyDown={e => {
      if (e.key === "Enter") {
        exactMatch
          ? addTiltFromCatalog(filteredCatalog.find(
              c => c.name.toLowerCase() === tiltInput.trim().toLowerCase()
            ).name)
          : addTilt();
      }
      if (e.key === "Escape") setTiltDropdownOpen(false);
    }}
    placeholder="Add tilt or condition…"
    style={{ flex:1, padding:"5px 8px", borderRadius:6, fontSize:11,
      background:C.bgDeep, border:`1px solid ${C.border}`,
      color:C.text, outline:"none" }}
  />
  <button onClick={addTilt}
    style={{ padding:"5px 12px", borderRadius:6, cursor:"pointer",
      border:`1px solid ${C.accentBorder}`, background:C.accentFaint,
      color:C.accentLight, fontSize:13, fontWeight:700 }}>
    +
  </button>
</div>

{/* ── Dropdown (portaled to document.body to escape overflow:hidden) ── */}
{tiltDropdownOpen && (filteredCatalog.length > 0 || tiltInput.trim()) &&
  ReactDOM.createPortal(
    (() => {
      const pos = getDropdownPos();
      return (
        <div ref={tiltDropdownRef} style={{
          position: "fixed", zIndex: 9999,
          left: pos.left, width: pos.width,
          top: pos.top, bottom: pos.bottom,
          maxHeight: 220, overflowY: "auto",
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)"
        }}>
          {["tilt", "condition"].map(type => (
            grouped[type].length > 0 && (
              <div key={type}>
                <div style={{ padding: "6px 10px", fontSize: 10, color: C.textMuted,
                  textTransform: "uppercase", letterSpacing: 1 }}>
                  {type === "tilt" ? "Tilts" : "Conditions"}
                </div>
                {grouped[type].map(c => (
                  <div key={c.name}
                    onClick={() => addTiltFromCatalog(c.name)}
                    style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, color: C.text }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bgDeep}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ fontWeight: 600 }}>
                      {c.name}
                      {c.persistent && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px",
                          borderRadius: 4, background: "rgba(199,62,29,0.2)",
                          color: C.danger, verticalAlign: "middle" }}>
                          PERSISTENT
                        </span>
                      )}
                      {c.environmental && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px",
                          borderRadius: 4, background: "rgba(42,157,143,0.2)",
                          color: "#2a9d8f", verticalAlign: "middle" }}>
                          ENVIRONMENTAL
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <div style={{ fontSize: 10, color: C.textMuted,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        maxWidth: "100%" }}>
                        {c.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ))}
          {!exactMatch && tiltInput.trim() && (
            <div onClick={() => addTilt()}
              style={{ padding: "8px 10px", cursor: "pointer", fontSize: 12,
                color: C.accentLight, borderTop: `1px solid ${C.border}` }}>
              + Add custom: <strong>{tiltInput.trim()}</strong>
            </div>
          )}
        </div>
      );
    })(),
    document.body
  )
}
```

---

## Implementation Checklist

1. **Add Firestore SDK** — add `firebase-firestore-compat.js` script tag after line 48
2. **Init Firestore** — add `const _fsDb = firebase.firestore();` after line 59
3. **Add `TiltsCatalog` module** — paste the full module into the `<script type="text/babel">` block, before components
4. **Call `TiltsCatalog.subscribe()`** — in App's `useEffect`
5. **Build the Catalog Management panel** — button in ST header, modal with upload/download/export/status
6. **Modify PlayerCard** — add `useCatalog()` hook, dropdown state, `tiltInputRef` + `tiltDropdownRef` refs, outside-click + scroll/resize handler
7. **Replace input section** (lines 465-481) with the combo-box dropdown — **the dropdown MUST use `ReactDOM.createPortal()` into `document.body`** because the PlayerCard has `overflow:"hidden"` (line 230) and the tilts section is at the bottom of the card. A normal absolutely-positioned dropdown will be invisible. Use `position: fixed` + `getBoundingClientRect()` for positioning, with upward-flip logic.
8. **Keep the + button** for custom entries
9. **Duplicate prevention** — `addTiltFromCatalog` checks `tilts.includes()`
10. **Dismiss on scroll/resize** — close the dropdown when the page scrolls or resizes to avoid stale portal positioning
11. **Test the full flow**: upload CSV → catalog populates → dropdown shows entries → select one → shows on player → remove → add custom → works without catalog. **Verify the dropdown is visible** and not clipped by the card boundary — scroll a player card to the bottom of the viewport and confirm the dropdown flips upward.

---

## Styling Notes

- Use existing color constants: `C.bgCard`, `C.bgDeep`, `C.border`, `C.text`, `C.textMuted`, `C.accentLight`, `C.warning`, `C.warningFaint`
- Dropdown: dark card, subtle border, soft shadow — match glossary tooltip feel
- Group headers ("TILTS", "CONDITIONS") in uppercase muted text
- Hover state on rows: `background: C.bgDeep`
- Import panel: match the compendium's admin panel styling

## Edge Cases

- **Empty Firestore collection**: dropdown shows nothing, input works as pure freeform (current behavior preserved)
- **Firestore permissions error**: `subscribe()` catches error, falls back to empty catalog
- **CSV with commas in description**: the `parseCsvRow()` function handles quoted fields (copied from compendium)
- **Duplicate entries in CSV**: `doImport()` detects by name, skips or overwrites based on checkbox
- **Multiple ST tabs open**: `onSnapshot` keeps all tabs in sync automatically
- **Mobile**: click events work with touch; no hover-dependent behavior
- **Overflow clipping** *(critical)*: The PlayerCard outer div (line 230) uses `overflow:"hidden"` for its border-radius. The tilts section is at the bottom of the card. A normal absolutely-positioned dropdown would be **completely invisible**. The solution is `ReactDOM.createPortal()` to render the dropdown into `document.body` with `position: fixed`, positioned via `getBoundingClientRect()` on the input. See the "Portal Solution" section in the dropdown UI code above.
- **Viewport edge (bottom of screen)**: The `getDropdownPos()` helper measures space below the input. If there isn't enough room, the dropdown flips **upward** above the input (using `bottom` instead of `top`)
- **Scroll / resize while dropdown open**: If the page scrolls or resizes while the dropdown is open, the portal's fixed position will drift. A simple fix: close the dropdown on `scroll`/`resize` events, or recalculate position on those events. Closing is simpler and acceptable UX

## Firestore Security Rules

Add to your existing `firestore.rules`:

```
match /tiltsConditions/{docId} {
  allow read: if true;
  allow write: if true;   // No auth — any ST can upload
}
```

> If you later add auth to storyteller.html, tighten `write` to `if request.auth != null`.
