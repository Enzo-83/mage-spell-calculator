// js/scene.js — Scene helper functions (plain JS, shared by index.html and wizard.html)
// Requires: firebase-database-compat.js loaded, _fbDb initialised, session.js loaded first

function sceneGenerateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 for clarity
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function sceneGetRef(roomCode) {
  return _fbDb.ref("sessions/" + roomCode);
}

function sceneCreateRoom(roomCode, stName) {
  return sceneGetRef(roomCode).set({
    sceneActive: false,
    sceneNumber: 0,
    createdBy: stName,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  });
}

function sceneSetActive(roomCode, active) {
  const updates = { sceneActive: active };
  if (active) {
    updates.sceneStartedAt = firebase.database.ServerValue.TIMESTAMP;
  }
  return sceneGetRef(roomCode).update(updates);
}

function sceneIncrementNumber(roomCode) {
  return sceneGetRef(roomCode).child("sceneNumber").transaction(function(n) {
    return (n || 0) + 1;
  });
}

function sceneJoinRoom(roomCode, playerId, playerName, playerPath) {
  const playerRef = sceneGetRef(roomCode).child("players/" + playerId);
  playerRef.set({
    name: playerName,
    path: playerPath || "",
    paradoxRolls: 0,
    stAdjustment: 0,
    stNote: "",
    paradoxLog: [],
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
  });
  // Auto-remove on disconnect
  playerRef.onDisconnect().remove();
  return playerRef;
}

function sceneLeaveRoom(roomCode, playerId) {
  return sceneGetRef(roomCode).child("players/" + playerId).remove();
}

function sceneResetAllPlayers(roomCode) {
  return sceneGetRef(roomCode).child("players").once("value").then(function(snap) {
    const updates = {};
    snap.forEach(function(child) {
      updates[child.key + "/paradoxRolls"] = 0;
      updates[child.key + "/stAdjustment"] = 0;
      updates[child.key + "/stNote"] = "";
      updates[child.key + "/paradoxLog"] = [];
    });
    if (Object.keys(updates).length > 0) {
      return sceneGetRef(roomCode).child("players").update(updates);
    }
  });
}

function sceneSetPlayerAdjustment(roomCode, playerId, adj, note) {
  return sceneGetRef(roomCode).child("players/" + playerId).update({
    stAdjustment: adj,
    stNote: note || "",
  });
}

function scenePushParadoxLog(roomCode, playerId, entry) {
  // entry = { spell, paradoxDice, timestamp }
  // Keep max 20 entries per player to avoid bloat
  const logRef = sceneGetRef(roomCode).child("players/" + playerId + "/paradoxLog");
  return logRef.transaction(function(current) {
    const arr = current || [];
    arr.push(entry);
    if (arr.length > 20) arr = arr.slice(arr.length - 20);
    return arr;
  });
}

function scenePushStats(roomCode, playerId, character) {
  if (!roomCode || !playerId || !character) return;
  // Delegate to shared session helper (extended: willpower + full spell array)
  sessionPushStats(roomCode, playerId, character);
}

function sceneClearParadoxLog(roomCode, playerId) {
  return sceneGetRef(roomCode).child("players/" + playerId + "/paradoxLog").set([]);
}

// Persist room code + role in localStorage
function sceneRememberRoom(code, role) {
  try { localStorage.setItem("mage_scene_room", JSON.stringify({ code: code, role: role })); } catch(e) {}
}
function sceneForgetRoom() {
  try { localStorage.removeItem("mage_scene_room"); } catch(e) {}
}
function sceneRecallRoom() {
  try {
    const raw = localStorage.getItem("mage_scene_room");
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}
