// shared/firebase.js — single Firebase initialization for all pages.
// Load order: firebase-*-compat SDK scripts → this file → shared/session.js → page logic.
//
// Initializes only the services whose SDK the page actually loaded:
//   window._fbApp  — Firebase app          (firebase-app-compat)
//   window._fbDb   — Realtime Database     (firebase-database-compat)  → live sessions
//   window._fsDb   — Firestore             (firebase-firestore-compat) → spell compendium, tilt catalog
//   window._fsAuth — Auth                  (firebase-auth-compat)      → compendium editor roles
//
// All globals are window properties (not top-level consts) so every script —
// including this one running more than once — sees the same instances.
(function () {
  if (!window._fbApp) {
    window._fbApp = firebase.initializeApp({
      apiKey: "AIzaSyA9QA2jJvjoClR7W7jEmOG9WTUPqE93Xzc",
      authDomain: "electronic-grimoire.firebaseapp.com",
      databaseURL: "https://electronic-grimoire-default-rtdb.firebaseio.com",
      projectId: "electronic-grimoire",
      storageBucket: "electronic-grimoire.appspot.com",
      messagingSenderId: "1032950336095",
      appId: "1:1032950336095:web:7a8a44130f14db710429ea"
    });
  }
  if (!window._fbDb && firebase.database) window._fbDb = firebase.database();
  if (!window._fsDb && firebase.firestore) window._fsDb = firebase.firestore();
  if (!window._fsAuth && firebase.auth) window._fsAuth = firebase.auth();
})();
