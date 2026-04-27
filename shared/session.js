// shared/session.js — Firebase session helpers
// Used by wizard.html (player) and storyteller.html (ST).
// Firebase (_fbDb) must be initialised before this script runs.
//
// Firebase path layout:
//   sessions/{code}/
//     meta:           { createdBy, createdAt, closed }
//     sceneActive:    bool
//     sceneNumber:    int
//     currentSceneId: string
//     players/{pid}/
//       name, path, joinedAt
//       paradoxRolls, stAdjustment, stNote
//       paradoxLog:   []
//       tilts:        []          ← ST-managed
//       sheetLink:    string      ← ST-managed
//       stEdit:       { stats:{…}, editedAt } ← ST override signal
//       stats:        { gnosis, wisdom, willpower:{cur,max},
//                       mana:{current,max}, health:{max,b,l,a},
//                       activeSpells:[{id,name,arcanum,arcanumLevel,
//                                      potency,duration,castMethod}],
//                       maxActiveSpells }
//       sheet:        { name, shadowName, path, order, legacy, gnosis, wisdom,
//                       arcana:{death,fate,forces,life,matter,mind,prime,space,spirit,time},
//                       skills:{…}, rotes:[…], praxes:[…], improvisedFavorites:[…],
//                       mana:{current,max}, willpower:{current,max},
//                       health:{max,bashing,lethal,aggravated}, activeSpells:[…] }
//     scenes/{sceneId}/
//       number, startedAt, endedAt, active
//       log/{logId}/  { type, playerId, timestamp, data }

// ── Utilities ──────────────────────────────────────────────────────────────

function sessionGenerateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function sessionGetRef(code) {
  return _fbDb.ref("sessions/" + code);
}

// ── Session lifecycle ──────────────────────────────────────────────────────

function sessionCreate(code, stName) {
  const sceneId = "scene_" + Date.now();
  return sessionGetRef(code).set({
    meta: {
      createdBy: stName || "Storyteller",
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    },
    sceneActive: false,
    sceneNumber: 0,
    currentSceneId: sceneId,
    scenes: {
      [sceneId]: {
        number: 0,
        startedAt: null,
        endedAt: null,
        active: false,
      }
    }
  });
}

function sessionClose(code) {
  return sessionGetRef(code).update({ "meta/closed": true, sceneActive: false });
}

// ── Scene management ───────────────────────────────────────────────────────

function sessionStartScene(code) {
  const sceneId = "scene_" + Date.now();
  return sessionGetRef(code).child("sceneNumber").transaction(n => (n || 0) + 1)
    .then(result => {
      const num = result.snapshot.val();
      return sessionGetRef(code).update({
        sceneActive: true,
        currentSceneId: sceneId,
        ["scenes/" + sceneId]: {
          number: num,
          startedAt: firebase.database.ServerValue.TIMESTAMP,
          endedAt: null,
          active: true,
        }
      });
    });
}

function sessionEndScene(code) {
  return sessionGetRef(code).child("currentSceneId").once("value").then(snap => {
    const sceneId = snap.val();
    const updates = { sceneActive: false };
    if (sceneId) {
      updates["scenes/" + sceneId + "/active"] = false;
      updates["scenes/" + sceneId + "/endedAt"] = firebase.database.ServerValue.TIMESTAMP;
    }
    return sessionGetRef(code).update(updates);
  });
}

function sessionResetAllPlayers(code) {
  return sessionGetRef(code).child("players").once("value").then(snap => {
    const updates = {};
    snap.forEach(child => {
      updates[child.key + "/paradoxRolls"] = 0;
      updates[child.key + "/stAdjustment"] = 0;
      updates[child.key + "/stNote"] = "";
      updates[child.key + "/paradoxLog"] = [];
    });
    if (Object.keys(updates).length > 0) {
      return sessionGetRef(code).child("players").update(updates);
    }
  });
}

// ── Player presence ────────────────────────────────────────────────────────

function sessionJoin(code, pid, name, path) {
  const playerRef = sessionGetRef(code).child("players/" + pid);
  playerRef.update({
    name: name || "Unknown Mage",
    path: path || "",
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
  });
  playerRef.onDisconnect().remove();
  return playerRef;
}

function sessionLeave(code, pid) {
  return sessionGetRef(code).child("players/" + pid).remove();
}

// ── Player stats (pushed by player app) ───────────────────────────────────

function sessionPushStats(code, pid, character) {
  if (!code || !pid || !character) return;
  const h  = character.health     || { max: 7, bashing: 0, lethal: 0, aggravated: 0 };
  const wp = character.willpower  || { current: 5, max: 5 };
  const spells = (character.activeSpells || [])
    .filter(s => !s.isRelinquished)
    .map(s => ({
      id:           s.id           || "",
      name:         s.name         || "Unnamed",
      arcanum:      s.arcanum      || "prime",
      arcanumLevel: s.arcanumLevel || 1,
      potency:      s.potency      || 1,
      duration:     s.duration     || "—",
      castMethod:   s.castMethod   || "improvised",
    }));
  return sessionGetRef(code).child("players/" + pid + "/stats").update({
    gnosis:          character.gnosis              || 1,
    wisdom:          character.wisdom              || 7,
    willpower:       { current: wp.current ?? 5, max: wp.max ?? 5 },
    mana:            { current: character.mana?.current ?? 0, max: character.mana?.max ?? 10 },
    health:          { max: h.max || 7, bashing: h.bashing || 0, lethal: h.lethal || 0, aggravated: h.aggravated || 0 },
    activeSpells:    spells,
    maxActiveSpells: character.gnosis || 1,
  });
}

// ── Full character sheet (pushed by player, read by ST) ───────────────────

function sessionPushSheet(code, pid, character) {
  if (!code || !pid || !character) return;
  const h  = character.health    || { max: 7, bashing: 0, lethal: 0, aggravated: 0 };
  const wp = character.willpower || { current: 5, max: 5 };
  const spells = (character.activeSpells || [])
    .filter(s => !s.isRelinquished)
    .map(s => ({
      id:           s.id           || "",
      name:         s.name         || "Unnamed",
      arcanum:      s.arcanum      || "prime",
      arcanumLevel: s.arcanumLevel || 1,
      potency:      s.potency      || 1,
      duration:     s.duration     || "—",
      castMethod:   s.castMethod   || "improvised",
    }));
  const toArr = list =>
    (list || []).map(s => ({
      id:                 s.id                 || "",
      name:               s.name               || "Unnamed",
      primaryArcanum:     s.primaryArcanum     || "",
      primaryArcanumLevel:s.primaryArcanumLevel|| 1,
      secondaryArcanum:   s.secondaryArcanum   || "",
      secondaryArcanumLevel: s.secondaryArcanumLevel || 0,
      description:        s.description        || "",
      type:               s.type               || "",
    }));
  return sessionGetRef(code).child("players/" + pid + "/sheet").set({
    name:               character.name               || "",
    shadowName:         character.shadowName         || "",
    path:               character.path               || "",
    order:              character.order              || "",
    legacy:             character.legacy             || "",
    gnosis:             character.gnosis             || 1,
    wisdom:             character.wisdom             || 7,
    arcana:             character.arcana             || {},
    skills:             character.skills             || {},
    rotes:              toArr(character.rotes),
    praxes:             toArr(character.praxes),
    improvisedFavorites:toArr(character.improvisedFavorites),
    mana:               { current: character.mana?.current ?? 0, max: character.mana?.max ?? 10 },
    willpower:          { current: wp.current ?? 5, max: wp.max ?? 5 },
    health:             { max: h.max || 7, bashing: h.bashing || 0, lethal: h.lethal || 0, aggravated: h.aggravated || 0 },
    activeSpells:       spells,
  });
}

// ── ST stat editing (written by ST, read by player) ───────────────────────

// ST calls this to push a stat override.  Player listener watches for stEdit.
function sessionSTEditStats(code, pid, statsPartial) {
  return sessionGetRef(code).child("players/" + pid).update({
    stEdit: {
      stats: statsPartial,
      editedAt: firebase.database.ServerValue.TIMESTAMP,
    },
    // Also update live stats so ST sees the change immediately
    ...Object.fromEntries(
      Object.entries(statsPartial).map(([k, v]) => ["stats/" + k, v])
    ),
  });
}

// ST calls this to push a sheet override (arcana, etc.). Player listener watches for stEdit.
function sessionSTEditSheet(code, pid, sheetPartial) {
  return sessionGetRef(code).child("players/" + pid).update({
    "stEdit/sheet":    sheetPartial,
    "stEdit/editedAt": firebase.database.ServerValue.TIMESTAMP,
  });
}

// ── Tilts & Conditions (ST-managed) ───────────────────────────────────────

function sessionSetTilts(code, pid, tilts) {
  return sessionGetRef(code).child("players/" + pid + "/tilts").set(tilts || []);
}

// ── Sheet link (ST sets once, persists) ───────────────────────────────────

function sessionSetSheetLink(code, pid, url) {
  return sessionGetRef(code).child("players/" + pid + "/sheetLink").set(url || "");
}

// ── Paradox helpers ────────────────────────────────────────────────────────

function sessionSetAdjustment(code, pid, adj, note) {
  return sessionGetRef(code).child("players/" + pid).update({
    stAdjustment: adj,
    stNote: note || "",
  });
}

function sessionPushParadoxLog(code, pid, entry) {
  const logRef = sessionGetRef(code).child("players/" + pid + "/paradoxLog");
  return logRef.transaction(current => {
    const arr = current || [];
    arr.push(entry);
    return arr.length > 20 ? arr.slice(arr.length - 20) : arr;
  });
}

function sessionClearParadoxLog(code, pid) {
  return sessionGetRef(code).child("players/" + pid + "/paradoxLog").set([]);
}

// ── Scene log (appended by both player and ST) ────────────────────────────

function sessionPushSceneLog(code, sceneId, entry) {
  if (!code || !sceneId) return;
  const logRef = sessionGetRef(code).child("scenes/" + sceneId + "/log");
  return logRef.push({
    ...entry,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
  });
}

// ── localStorage persistence ───────────────────────────────────────────────

function sessionRemember(code, role) {
  try { localStorage.setItem("mage_session", JSON.stringify({ code, role })); } catch(e) {}
}
function sessionForget() {
  try { localStorage.removeItem("mage_session"); } catch(e) {}
}
function sessionRecall() {
  try {
    const raw = localStorage.getItem("mage_session");
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}
