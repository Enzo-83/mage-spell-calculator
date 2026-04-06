/**
 * Mage Spell Calculator – Global Compendium Module
 * Manages the read-only spell compendium backed by Firebase Firestore.
 * Provides role-based editing (Admin, Editor, Sub-Editor, Suggester).
 *
 * Requires (loaded before this file):
 *   firebase-app-compat, firebase-firestore-compat, firebase-auth-compat
 *
 * Exposes:
 *   window.initCompendium()      — call once after DOMContentLoaded
 *   window.renderCompendiumTab() — called by renderSpellLibrary() in index.html
 */

(function () {
    'use strict';

    // ── Firebase handles ──────────────────────────────────────────────────
    var _db   = null;
    var _auth = null;

    // ── Runtime state ─────────────────────────────────────────────────────
    var _user           = null;   // Firebase User object
    var _role           = null;   // 'admin'|'editor'|'sub-editor'|'suggester'|null
    var _spells         = [];     // Live cache from Firestore onSnapshot
    var _unsub          = null;   // Firestore listener teardown function
    var _filters        = { book: 'all', arcanum: 'all', practice: 'all', search: '' };
    var _pendingSpell   = null;   // Spell being added to personal library
    var _selectedType   = 'rote'; // Selected type in Add-to-Library modal
    var _editingId      = null;   // Compendium spell being edited (null = new)
    var _suggestionMode = false;  // True when editor is submitting a suggestion

    // ── Source book registry ──────────────────────────────────────────────
    var BOOKS = {
        'core':             { label: 'Core Rulebook',        color: '#e9c46a', short: 'Core' },
        'signs-of-sorcery': { label: 'Signs of Sorcery',     color: '#2a9d8f', short: 'SoS'  },
        'night-horrors':    { label: 'Night Horrors',         color: '#c73e1d', short: 'NH'   },
        'tome-of-pentacle': { label: 'Tome of the Pentacle', color: '#9d4edd', short: 'ToP'  }
    };

    var PRACTICE_DOT = {
        compelling: 1, knowing: 1, unveiling: 1,
        ruling: 2, shielding: 2, veiling: 2,
        fraying: 3, perfecting: 3, weaving: 3,
        patterning: 4, unraveling: 4,
        making: 5, unmaking: 5
    };

    var ARCANA_ORDER = ['death','fate','forces','life','matter','mind','prime','space','spirit','time'];

    // ── Initialise ────────────────────────────────────────────────────────
    function init() {
        if (!window._fbApp) {
            console.warn('Compendium: Firebase app not ready.');
            return;
        }
        _db   = firebase.firestore();
        _auth = firebase.auth();

        _auth.onAuthStateChanged(function (user) {
            _user = user;
            if (user) {
                _fetchRole(user.uid).then(function (role) {
                    _role = role;
                    _refreshIfActive();
                });
            } else {
                _role = null;
                _refreshIfActive();
            }
        });

        _subscribe();
        _wireStaticEvents();

        // Expose render function so index.html's renderSpellLibrary() can call it
        window.renderCompendiumTab = renderTab;
    }

    // ── Firestore real-time subscription ──────────────────────────────────
    function _subscribe() {
        if (_unsub) _unsub();
        _unsub = _db.collection('compendium')
            .orderBy('name')
            .onSnapshot(function (snap) {
                _spells = [];
                snap.forEach(function (doc) {
                    var d = doc.data();
                    d.id = doc.id;
                    _spells.push(d);
                });
                var countEl = document.getElementById('compendiumCount');
                if (countEl) countEl.textContent = _spells.length;
                _refreshIfActive();
            }, function (err) {
                console.error('Compendium snapshot error:', err);
            });
    }

    // ── Authentication ────────────────────────────────────────────────────
    function signIn() {
        _auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
            .catch(function (e) { alert('Sign-in error: ' + e.message); });
    }
    function signOut() { _auth.signOut(); }

    async function _fetchRole(uid) {
        try {
            var snap = await _db.collection('userRoles').doc(uid).get();
            if (snap.exists) return snap.data().role || null;
        } catch (_) { /* not authorised or missing */ }
        return null;
    }

    // ── Role helpers ──────────────────────────────────────────────────────
    function _isAdmin()    { return _role === 'admin'; }
    function _canEdit()    { return _role === 'admin' || _role === 'editor'; }
    function _canSubEdit() { return ['admin','editor','sub-editor'].indexOf(_role) !== -1; }
    function _isSignedIn() { return !!_user; }

    // ── Firestore CRUD ────────────────────────────────────────────────────
    function _ts() { return firebase.firestore.FieldValue.serverTimestamp(); }

    async function _addSpell(data) {
        data.createdBy = _user ? _user.uid : 'system';
        data.createdAt = _ts();
        data.updatedBy = data.createdBy;
        data.updatedAt = _ts();
        return _db.collection('compendium').add(data);
    }
    async function _updateSpell(id, data) {
        data.updatedBy = _user ? _user.uid : 'system';
        data.updatedAt = _ts();
        return _db.collection('compendium').doc(id).update(data);
    }
    async function _deleteSpell(id) {
        return _db.collection('compendium').doc(id).delete();
    }

    // ── Suggestions ───────────────────────────────────────────────────────
    async function _submitSuggestion(spellData) {
        return _db.collection('suggestions').add({
            spell:         spellData,
            submittedBy:   _user.uid,
            submitterName: _user.displayName || _user.email,
            submittedAt:   _ts(),
            status:        'pending',
            reviewNote:    '',
            reviewedBy:    null,
            reviewedAt:    null
        });
    }

    async function _reviewSuggestion(id, approved, note) {
        var sugRef = _db.collection('suggestions').doc(id);
        if (approved) {
            var doc = await sugRef.get();
            if (doc.exists) {
                var sd = Object.assign({}, doc.data().spell, {
                    createdBy:    doc.data().submittedBy,
                    createdAt:    _ts(),
                    updatedBy:    _user.uid,
                    updatedAt:    _ts(),
                    approvedFrom: id
                });
                await _db.collection('compendium').add(sd);
            }
        }
        return sugRef.update({
            status:     approved ? 'approved' : 'rejected',
            reviewNote: note || '',
            reviewedBy: _user.uid,
            reviewedAt: _ts()
        });
    }

    // ── Duplicate check ───────────────────────────────────────────────────
    function _inLibrary(char, compId, type) {
        if (!char || !compId) return false;
        var arr = type === 'rote'   ? (char.rotes || [])
                : type === 'praxis' ? (char.praxes || [])
                : (char.improvisedFavorites || []);
        return arr.some(function (s) { return s.compendiumId === compId; });
    }

    // ── Filtering ─────────────────────────────────────────────────────────
    function _filtered() {
        return _spells.filter(function (s) {
            if (_filters.book     !== 'all' && s.sourceBook     !== _filters.book)                        return false;
            if (_filters.arcanum  !== 'all' && s.primaryArcanum !== _filters.arcanum)                     return false;
            if (_filters.practice !== 'all' && PRACTICE_DOT[s.practice] !== parseInt(_filters.practice)) return false;
            if (_filters.search) {
                var q = _filters.search.toLowerCase();
                var haystack = (s.name + ' ' + (s.description || '') + ' ' + (s.primaryArcanum || '')).toLowerCase();
                if (haystack.indexOf(q) === -1) return false;
            }
            return true;
        });
    }

    // ── Main tab render ───────────────────────────────────────────────────
    function renderTab() {
        var content = document.getElementById('spellLibraryContent');
        if (!content) return;

        var list = _filtered();
        var html = _buildAuthBar() + _buildFilterBar();

        if (_spells.length === 0) {
            html += '<div class="spell-library-empty">Loading compendium…</div>';
        } else if (list.length === 0) {
            html += '<div class="spell-library-empty">No spells match these filters.</div>';
        } else {
            var groups = {};
            list.forEach(function (s) {
                var a = s.primaryArcanum || 'prime';
                if (!groups[a]) groups[a] = [];
                groups[a].push(s);
            });
            ARCANA_ORDER.forEach(function (arc) {
                if (!groups[arc] || !groups[arc].length) return;
                html += '<div class="arcanum-group">' +
                    '<div class="arcanum-group-header">' +
                        '<span class="arcanum-dot"></span>' +
                        '<h3>' + _cap(arc) + '</h3>' +
                    '</div>' +
                    '<div class="spell-cards-grid">';
                groups[arc].forEach(function (s) { html += _buildCard(s); });
                html += '</div></div>';
            });
        }

        content.innerHTML = html;
        _wireCardEvents(content);
        _wireFilterEvents(content);
    }

    // ── Auth bar HTML ─────────────────────────────────────────────────────
    function _buildAuthBar() {
        var h = '<div class="compendium-auth-bar">';
        if (!_user) {
            h += '<span class="compendium-auth-info">Sign in to contribute spells</span>' +
                 '<button class="btn-small" id="btnCompSignIn">🔑 Sign In</button>';
        } else {
            var rb = _role
                ? '<span class="role-badge role-' + _role + '">' + _cap(_role) + '</span>'
                : '';
            h += '<span class="compendium-auth-info">' + _esc(_user.displayName || _user.email) + ' ' + rb + '</span>';
            if (_canEdit())  h += '<button class="btn-small" id="btnCompAddSpell">＋ Add Spell</button>';
            if (_canEdit())  h += '<button class="btn-small" id="btnCompSuggestions">📬 Suggestions</button>';
            if (_isAdmin())  h += '<button class="btn-small" id="btnCompAdmin">⚙️ Roles</button>';
            h += '<button class="btn-small" id="btnCompSignOut">Sign Out</button>';
        }
        h += '</div>';
        return h;
    }

    // ── Filter bar HTML ───────────────────────────────────────────────────
    function _buildFilterBar() {
        var bookOpts = '<option value="all">All Books</option>';
        Object.keys(BOOKS).forEach(function (k) {
            bookOpts += '<option value="' + k + '"' + (_filters.book === k ? ' selected' : '') + '>' + BOOKS[k].label + '</option>';
        });

        var arcOpts = '<option value="all">All Arcana</option>';
        ARCANA_ORDER.forEach(function (a) {
            arcOpts += '<option value="' + a + '"' + (_filters.arcanum === a ? ' selected' : '') + '>' + _cap(a) + '</option>';
        });

        var pracOpts = '<option value="all">All Practices</option>';
        [['1','1-dot (Initiate)'],['2','2-dot (Apprentice)'],['3','3-dot (Disciple)'],['4','4-dot (Adept)'],['5','5-dot (Master)']].forEach(function (p) {
            pracOpts += '<option value="' + p[0] + '"' + (_filters.practice === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
        });

        return '<div class="compendium-filter-bar">' +
            '<input type="text" class="compendium-search" id="compSearch" placeholder="🔍 Search spells…" value="' + _esc(_filters.search) + '">' +
            '<select class="compendium-filter-select" id="compFilterBook">'     + bookOpts + '</select>' +
            '<select class="compendium-filter-select" id="compFilterArcanum">'  + arcOpts  + '</select>' +
            '<select class="compendium-filter-select" id="compFilterPractice">' + pracOpts + '</select>' +
            '</div>';
    }

    // ── Spell card HTML ───────────────────────────────────────────────────
    function _buildCard(s) {
        var book   = BOOKS[s.sourceBook] || { label: s.sourceBook || '?', color: '#a0a0a0', short: '?' };
        var page   = s.sourcePage ? ' p.' + s.sourcePage : '';
        var bstyle = 'background:rgba(0,0,0,0.35);color:' + book.color + ';border:1px solid ' + book.color + '50;';

        // Arcanum display
        var arcHtml = _cap(s.primaryArcanum || 'prime') + ' ';
        for (var i = 0; i < (s.primaryArcanumLevel || 1); i++) arcHtml += '●';
        if (s.secondaryArcanum) {
            arcHtml += ' / ' + _cap(s.secondaryArcanum) + ' ';
            for (var j = 0; j < (s.secondaryArcanumLevel || 1); j++) arcHtml += '●';
        }

        // Practice line
        var pracHtml = _cap(s.practice || '') + ' | Primary: ' + _cap(s.primaryFactor || 'potency');
        if (s.withstand) pracHtml += ' | Withstand: ' + _esc(s.withstand);

        // Reach options
        var reachHtml = '';
        if (s.reachOptions && s.reachOptions.length) {
            reachHtml = '<div class="spell-card-reach"><div class="spell-card-reach-title">Reach Options</div>';
            s.reachOptions.forEach(function (o) {
                reachHtml += '<div class="spell-reach-option"><span class="spell-reach-cost">+' + o.cost + '</span>' + _esc(o.effect || '') + '</div>';
            });
            reachHtml += '</div>';
        }

        // Optional arcana
        var optArcHtml = '';
        if (s.optionalArcana && s.optionalArcana.length) {
            optArcHtml = '<div class="spell-optional-arcana"><div class="spell-card-reach-title">Optional Arcana</div>';
            s.optionalArcana.forEach(function (oa) {
                var dots = '';
                for (var k = 0; k < (oa.level || 1); k++) dots += '●';
                optArcHtml += '<div class="spell-reach-option"><span class="spell-reach-cost">' + _cap(oa.arcanum || '') + ' ' + dots + '</span>' + _esc(oa.effect || '') + '</div>';
            });
            optArcHtml += '</div>';
        }

        // Collapsible description
        var descHtml = '';
        if (s.description) {
            descHtml = '<div class="compendium-description">' +
                '<div class="compendium-desc-toggle" data-id="' + s.id + '">▶ Description</div>' +
                '<div class="compendium-desc-text" id="cdesc-' + s.id + '" style="display:none">' + _esc(s.description) + '</div>' +
                '</div>';
        }

        // Action buttons
        var actHtml = '<button class="btn-small btn-primary comp-add-btn" data-id="' + s.id + '">＋ Add to My Library</button>';
        if (_canEdit()) {
            actHtml += '<button class="btn-small comp-edit-btn" data-id="' + s.id + '" title="Edit this spell">✏️</button>';
            actHtml += '<button class="btn-small comp-del-btn" data-id="' + s.id + '" title="Delete this spell" style="background:rgba(199,62,29,0.2);color:var(--danger)">🗑</button>';
        } else if (_isSignedIn()) {
            actHtml += '<button class="btn-small comp-suggest-btn" data-id="' + s.id + '" title="Suggest an edit">💡</button>';
        }

        return '<div class="spell-card compendium-card">' +
            '<div class="spell-card-header compendium-card-header">' +
                '<div>' +
                    '<div class="spell-card-title">' + _esc(s.name || 'Unnamed') + '</div>' +
                    '<div class="spell-card-arcanum">' + arcHtml + '</div>' +
                '</div>' +
                '<span class="source-badge" style="' + bstyle + '">' + book.short + page + '</span>' +
            '</div>' +
            '<div class="spell-card-body">' +
                '<div class="spell-card-practice">' + pracHtml + '</div>' +
                descHtml + reachHtml + optArcHtml +
            '</div>' +
            '<div class="spell-card-actions">' + actHtml + '</div>' +
        '</div>';
    }

    // ── Card event wiring ─────────────────────────────────────────────────
    function _wireCardEvents(root) {
        var el;

        el = root.querySelector('#btnCompSignIn');
        if (el) el.onclick = signIn;

        el = root.querySelector('#btnCompSignOut');
        if (el) el.onclick = signOut;

        el = root.querySelector('#btnCompAddSpell');
        if (el) el.onclick = function () { _openEditor(null); };

        el = root.querySelector('#btnCompSuggestions');
        if (el) el.onclick = _openSuggestionsInbox;

        el = root.querySelector('#btnCompAdmin');
        if (el) el.onclick = _openAdminPanel;

        root.querySelectorAll('.comp-add-btn').forEach(function (b) {
            b.onclick = function () {
                var api = window.spellLibraryAPI;
                if (!api || !api.getCharacter()) {
                    alert('Please load or create a character first.');
                    return;
                }
                _openAddModal(b.dataset.id);
            };
        });

        root.querySelectorAll('.comp-edit-btn').forEach(function (b) {
            b.onclick = function () { _openEditor(b.dataset.id); };
        });

        root.querySelectorAll('.comp-del-btn').forEach(function (b) {
            b.onclick = async function () {
                var spell = _spells.find(function (s) { return s.id === b.dataset.id; });
                var name  = spell ? spell.name : 'this spell';
                if (!confirm('Delete "' + name + '" from the compendium?\nThis cannot be undone.')) return;
                try { await _deleteSpell(b.dataset.id); }
                catch (e) { alert('Delete failed: ' + e.message); }
            };
        });

        root.querySelectorAll('.comp-suggest-btn').forEach(function (b) {
            b.onclick = function () { _openEditorAsSuggestion(b.dataset.id); };
        });

        root.querySelectorAll('.compendium-desc-toggle').forEach(function (t) {
            t.onclick = function () {
                var txt  = document.getElementById('cdesc-' + t.dataset.id);
                if (!txt) return;
                var open = txt.style.display !== 'none';
                txt.style.display = open ? 'none' : 'block';
                t.textContent = (open ? '▶' : '▼') + ' Description';
            };
        });
    }

    // ── Filter event wiring ───────────────────────────────────────────────
    function _wireFilterEvents(root) {
        var s = root.querySelector('#compSearch');
        if (s) s.oninput = function () { _filters.search = s.value; renderTab(); };

        var b = root.querySelector('#compFilterBook');
        if (b) b.onchange = function () { _filters.book = b.value; renderTab(); };

        var a = root.querySelector('#compFilterArcanum');
        if (a) a.onchange = function () { _filters.arcanum = a.value; renderTab(); };

        var p = root.querySelector('#compFilterPractice');
        if (p) p.onchange = function () { _filters.practice = p.value; renderTab(); };
    }

    // ── Add to Library modal ──────────────────────────────────────────────
    function _openAddModal(spellId) {
        var spell = _spells.find(function (s) { return s.id === spellId; });
        if (!spell) return;
        _pendingSpell = spell;

        var api    = window.spellLibraryAPI;
        var char   = api ? api.getCharacter() : null;
        var status = {
            rote:       _inLibrary(char, spellId, 'rote'),
            praxis:     _inLibrary(char, spellId, 'praxis'),
            improvised: _inLibrary(char, spellId, 'improvised')
        };

        document.getElementById('addLibModalTitle').textContent = 'Add "' + (spell.name || 'Spell') + '"';

        ['rote', 'praxis', 'improvised'].forEach(function (t) {
            var btn = document.getElementById('addLibBtn-' + t);
            if (!btn) return;
            if (status[t]) {
                btn.disabled = true;
                btn.classList.add('already-added');
                btn.classList.remove('selected');
                btn.innerHTML = btn.dataset.label + ' <span class="already-check">✓</span>';
            } else {
                btn.disabled = false;
                btn.classList.remove('already-added', 'selected');
                btn.textContent = btn.dataset.label;
            }
        });

        // Pre-select first available type
        var def = !status.rote ? 'rote' : !status.praxis ? 'praxis' : !status.improvised ? 'improvised' : null;
        var confirmBtn  = document.getElementById('addLibConfirmBtn');
        var noteEl      = document.getElementById('addLibTypeNote');
        confirmBtn.disabled = !def;
        noteEl.textContent  = def ? '' : 'This spell is already in all library categories.';
        if (def) _selectType(def);

        document.getElementById('addToLibraryModal').classList.add('active');
    }

    function _selectType(type) {
        _selectedType = type;
        document.querySelectorAll('.add-to-lib-type-btn').forEach(function (b) {
            b.classList.toggle('selected', b.dataset.type === type);
        });
        var rs = document.getElementById('addLibRoteSection');
        if (rs) rs.style.display = type === 'rote' ? 'block' : 'none';
        document.getElementById('addLibConfirmBtn').disabled = false;
        document.getElementById('addLibTypeNote').textContent = '';
    }

    function _confirmAdd() {
        if (!_pendingSpell) return;
        var api  = window.spellLibraryAPI;
        var char = api ? api.getCharacter() : null;
        if (!char) return;

        var s    = _pendingSpell;
        var type = _selectedType;

        var defaultDefaults = {
            potency: 1, useAdvancedPotency: false, yantraDice: 0,
            durationIndex: 0, useAdvancedDuration: false,
            scaleIndex: 0, useAdvancedScale: false,
            scaleType: 'subjects', range: 'touch', castingTime: 'ritual'
        };

        var data = {
            name:                 s.name,
            primaryArcanum:       s.primaryArcanum,
            primaryArcanumLevel:  s.primaryArcanumLevel  || 1,
            secondaryArcanum:     s.secondaryArcanum     || null,
            secondaryArcanumLevel:s.secondaryArcanumLevel|| null,
            practice:             s.practice,
            primaryFactor:        s.primaryFactor        || 'potency',
            withstand:            s.withstand            || '',
            description:          s.description          || '',
            reachOptions:         s.reachOptions  ? JSON.parse(JSON.stringify(s.reachOptions)) : [],
            compendiumId:         s.id,
            defaults:             s.defaults ? Object.assign({}, defaultDefaults, JSON.parse(JSON.stringify(s.defaults))) : defaultDefaults
        };

        if (type === 'rote') {
            data.roteSkill   = document.getElementById('addLibRoteSkill').value   || 'occult';
            data.roteCreator = document.getElementById('addLibRoteCreator').value || 'order';
            addRote(char, data);
        } else if (type === 'praxis') {
            addPraxis(char, data);
        } else {
            addImprovisedFavorite(char, data);
        }

        if (api && api.save) api.save();
        _closeAddModal();

        // Switch to the corresponding personal library tab
        if (api && api.switchTab) {
            api.switchTab({ rote: 'rotes', praxis: 'praxes', improvised: 'improvised' }[type]);
        }
    }

    function _closeAddModal() {
        document.getElementById('addToLibraryModal').classList.remove('active');
        _pendingSpell = null;
    }

    // ── Compendium editor modal ───────────────────────────────────────────
    function _openEditor(spellId) {
        _editingId      = spellId || null;
        _suggestionMode = false;
        var spell = spellId ? _spells.find(function (s) { return s.id === spellId; }) : null;

        document.getElementById('compEditorTitle').textContent    = spell ? 'Edit Compendium Spell' : 'Add Compendium Spell';
        document.getElementById('btnCompEditorSave').textContent  = 'Save Spell';
        document.getElementById('btnCompEditorDelete').style.display = (spell && _canEdit()) ? 'block' : 'none';

        _populateEditorForm(spell);
        document.getElementById('compendiumEditorModal').classList.add('active');
    }

    function _openEditorAsSuggestion(spellId) {
        var spell = _spells.find(function (s) { return s.id === spellId; }) || null;
        _openEditorWithData(spell);
    }

    // Open the compendium editor pre-filled from a personal library spell.
    // Used by the 💡 button on personal library cards.
    function _openEditorWithData(spellData) {
        _editingId      = null;
        _suggestionMode = true;

        document.getElementById('compEditorTitle').textContent    = 'Suggest to Compendium';
        document.getElementById('btnCompEditorSave').textContent  = 'Submit Suggestion';
        document.getElementById('btnCompEditorDelete').style.display = 'none';

        _populateEditorForm(spellData || null);
        document.getElementById('compendiumEditorModal').classList.add('active');
    }

    function _populateEditorForm(spell) {
        var d   = spell   || {};
        var def = d.defaults || {};

        document.getElementById('compEdName').value                = d.name                 || '';
        document.getElementById('compEdSourceBook').value          = d.sourceBook            || 'core';
        document.getElementById('compEdSourcePage').value          = d.sourcePage            || '';
        document.getElementById('compEdPrimaryArcanum').value      = d.primaryArcanum        || 'prime';
        document.getElementById('compEdPrimaryLevel').value        = d.primaryArcanumLevel   || 1;
        document.getElementById('compEdSecondaryArcanum').value    = d.secondaryArcanum      || '';
        document.getElementById('compEdSecondaryLevel').value      = d.secondaryArcanumLevel || 1;
        document.getElementById('compEdPractice').value            = d.practice              || 'compelling';
        document.getElementById('compEdPrimaryFactor').value       = d.primaryFactor         || 'potency';
        document.getElementById('compEdWithstand').value           = d.withstand             || '';
        document.getElementById('compEdDescription').value         = d.description           || '';
        document.getElementById('compEdDefaultPotency').value      = def.potency             || 1;
        document.getElementById('compEdDefaultRange').value        = def.range               || 'touch';

        // Reach options
        var rc = document.getElementById('compEdReachContainer');
        rc.innerHTML = '';
        (d.reachOptions || []).forEach(function (o) { _addReachRow(o.cost, o.effect); });

        // Optional arcana
        var oc = document.getElementById('compEdOptArcContainer');
        oc.innerHTML = '';
        (d.optionalArcana || []).forEach(function (oa) { _addOptArcRow(oa.arcanum, oa.level, oa.effect); });
    }

    function _addReachRow(cost, effect) {
        var c = document.getElementById('compEdReachContainer');
        var r = document.createElement('div');
        r.className = 'reach-option-row';
        r.innerHTML =
            '<input type="number" class="ced-reach-cost" min="1" max="5" value="' + (cost || 1) + '" placeholder="Cost">' +
            '<input type="text" class="ced-reach-effect" value="' + _esc(effect || '') + '" placeholder="Reach effect description">' +
            '<button class="btn-remove-reach" type="button">&times;</button>';
        r.querySelector('.btn-remove-reach').onclick = function () { r.remove(); };
        c.appendChild(r);
    }

    function _addOptArcRow(arc, lvl, eff) {
        var c = document.getElementById('compEdOptArcContainer');
        var r = document.createElement('div');
        r.className = 'opt-arc-row';
        var opts = ARCANA_ORDER.map(function (a) {
            return '<option value="' + a + '"' + (a === arc ? ' selected' : '') + '>' + _cap(a) + '</option>';
        }).join('');
        r.innerHTML =
            '<select class="ced-oa-name"><option value="">Arcanum…</option>' + opts + '</select>' +
            '<input type="number" class="ced-oa-level" min="1" max="5" value="' + (lvl || 1) + '">' +
            '<input type="text" class="ced-oa-effect" value="' + _esc(eff || '') + '" placeholder="Optional arcanum effect">' +
            '<button class="btn-remove-reach" type="button">&times;</button>';
        r.querySelector('.btn-remove-reach').onclick = function () { r.remove(); };
        c.appendChild(r);
    }

    function _closeEditor() {
        document.getElementById('compendiumEditorModal').classList.remove('active');
        _editingId      = null;
        _suggestionMode = false;
    }

    async function _saveEditor() {
        var name = document.getElementById('compEdName').value.trim();
        if (!name) { alert('Please enter a spell name.'); return; }

        var reachOptions = [];
        document.querySelectorAll('#compEdReachContainer .reach-option-row').forEach(function (r) {
            var cost   = parseInt(r.querySelector('.ced-reach-cost').value)  || 1;
            var effect = r.querySelector('.ced-reach-effect').value.trim();
            if (effect) reachOptions.push({ cost: cost, effect: effect });
        });

        var optionalArcana = [];
        document.querySelectorAll('#compEdOptArcContainer .opt-arc-row').forEach(function (r) {
            var arc = r.querySelector('.ced-oa-name').value;
            var lvl = parseInt(r.querySelector('.ced-oa-level').value) || 1;
            var eff = r.querySelector('.ced-oa-effect').value.trim();
            if (arc) optionalArcana.push({ arcanum: arc, level: lvl, effect: eff });
        });

        var sec  = document.getElementById('compEdSecondaryArcanum').value;
        var data = {
            name:                 document.getElementById('compEdName').value.trim(),
            sourceBook:           document.getElementById('compEdSourceBook').value,
            sourcePage:           parseInt(document.getElementById('compEdSourcePage').value) || null,
            primaryArcanum:       document.getElementById('compEdPrimaryArcanum').value,
            primaryArcanumLevel:  parseInt(document.getElementById('compEdPrimaryLevel').value) || 1,
            secondaryArcanum:     sec || null,
            secondaryArcanumLevel:sec ? (parseInt(document.getElementById('compEdSecondaryLevel').value) || 1) : null,
            practice:             document.getElementById('compEdPractice').value,
            primaryFactor:        document.getElementById('compEdPrimaryFactor').value,
            withstand:            document.getElementById('compEdWithstand').value.trim(),
            description:          document.getElementById('compEdDescription').value.trim(),
            reachOptions:         reachOptions,
            optionalArcana:       optionalArcana,
            defaults: {
                potency: parseInt(document.getElementById('compEdDefaultPotency').value) || 1,
                useAdvancedPotency: false, yantraDice: 0,
                durationIndex: 0, useAdvancedDuration: false,
                scaleIndex: 0, useAdvancedScale: false,
                scaleType: 'subjects',
                range:    document.getElementById('compEdDefaultRange').value,
                castingTime: 'ritual'
            }
        };

        var btn = document.getElementById('btnCompEditorSave');
        btn.disabled    = true;
        btn.textContent = 'Saving…';

        try {
            if (_suggestionMode) {
                await _submitSuggestion(data);
                alert('Suggestion submitted! An editor will review it shortly.');
            } else if (_editingId) {
                await _updateSpell(_editingId, data);
            } else {
                await _addSpell(data);
            }
            _closeEditor();
        } catch (e) {
            console.error('Compendium save error:', e);
            alert('Save failed: ' + e.message);
        } finally {
            btn.disabled    = false;
            btn.textContent = _suggestionMode ? 'Submit Suggestion' : 'Save Spell';
        }
    }

    async function _deleteEditor() {
        if (!_editingId) return;
        var spell = _spells.find(function (s) { return s.id === _editingId; });
        if (!confirm('Delete "' + (spell ? spell.name : 'this spell') + '" from the compendium?\nThis cannot be undone.')) return;
        try {
            await _deleteSpell(_editingId);
            _closeEditor();
        } catch (e) { alert('Delete failed: ' + e.message); }
    }

    // ── Suggestions inbox ─────────────────────────────────────────────────
    async function _openSuggestionsInbox() {
        if (!_canEdit()) return;
        var c = document.getElementById('suggestionsContent');
        c.innerHTML = '<div class="spell-library-empty">Loading…</div>';
        document.getElementById('suggestionsModal').classList.add('active');
        try {
            var snap = await _db.collection('suggestions')
                .where('status', '==', 'pending')
                .orderBy('submittedAt')
                .get();
            var list = [];
            snap.forEach(function (d) { var v = d.data(); v.id = d.id; list.push(v); });
            _renderSuggestionsContent(list);
        } catch (e) {
            c.innerHTML = '<div class="spell-library-empty" style="color:var(--danger)">Error: ' + _esc(e.message) + '</div>';
        }
    }

    function _renderSuggestionsContent(list) {
        var c = document.getElementById('suggestionsContent');
        if (!list.length) {
            c.innerHTML = '<div class="spell-library-empty">No pending suggestions. ✓</div>';
            return;
        }
        var html = '';
        list.forEach(function (sug) {
            var s    = sug.spell || {};
            var book = BOOKS[s.sourceBook] || { label: s.sourceBook || '' };
            var desc = s.description ? s.description.substring(0, 200) + (s.description.length > 200 ? '…' : '') : '';
            html += '<div class="suggestion-item" data-sug-id="' + sug.id + '">' +
                '<div class="suggestion-header">' +
                    '<strong>' + _esc(s.name || 'Unnamed') + '</strong> ' +
                    '<span style="color:var(--text-muted);font-size:0.85em">by ' + _esc(sug.submitterName || 'Unknown') + '</span>' +
                '</div>' +
                '<div style="font-size:0.85em;color:var(--text-muted);margin:4px 0">' +
                    _cap(s.primaryArcanum || '') + ' ' + (s.primaryArcanumLevel || 1) + '● | ' +
                    _cap(s.practice || '') + ' | ' + book.label +
                '</div>' +
                (desc ? '<div style="font-size:0.85em;margin:6px 0;color:var(--text-light)">' + _esc(desc) + '</div>' : '') +
                '<div class="suggestion-actions">' +
                    '<input type="text" class="sug-note" placeholder="Optional review note…" style="flex:1">' +
                    '<button class="btn-small btn-primary sug-approve" data-id="' + sug.id + '">✓ Approve</button>' +
                    '<button class="btn-small sug-reject" data-id="' + sug.id + '" style="background:rgba(199,62,29,0.2);color:var(--danger)">✗ Reject</button>' +
                '</div>' +
            '</div>';
        });
        c.innerHTML = html;

        c.querySelectorAll('.sug-approve').forEach(function (b) {
            b.onclick = function () {
                var note = b.closest('.suggestion-item').querySelector('.sug-note').value;
                b.disabled = true;
                b.textContent = 'Approving…';
                _reviewSuggestion(b.dataset.id, true, note).then(function () {
                    b.closest('.suggestion-item').style.opacity = '0.4';
                    b.textContent = 'Approved ✓';
                }).catch(function (e) { alert('Error: ' + e.message); b.disabled = false; b.textContent = '✓ Approve'; });
            };
        });
        c.querySelectorAll('.sug-reject').forEach(function (b) {
            b.onclick = function () {
                var note = b.closest('.suggestion-item').querySelector('.sug-note').value;
                b.disabled = true;
                b.textContent = 'Rejecting…';
                _reviewSuggestion(b.dataset.id, false, note).then(function () {
                    b.closest('.suggestion-item').style.opacity = '0.4';
                    b.textContent = 'Rejected ✗';
                }).catch(function (e) { alert('Error: ' + e.message); b.disabled = false; b.textContent = '✗ Reject'; });
            };
        });
    }

    function _closeSuggestions() {
        document.getElementById('suggestionsModal').classList.remove('active');
    }

    // ── Admin panel ───────────────────────────────────────────────────────
    function _openAdminPanel() {
        document.getElementById('adminPanelModal').classList.add('active');
        _refreshAdminList();
    }
    function _closeAdminPanel() {
        document.getElementById('adminPanelModal').classList.remove('active');
    }

    async function _refreshAdminList() {
        var c = document.getElementById('adminRoleList');
        c.innerHTML = '<div style="color:var(--text-muted);font-size:0.85em;padding:8px">Loading…</div>';
        try {
            var snap = await _db.collection('userRoles').get();
            if (snap.empty) {
                c.innerHTML = '<div style="color:var(--text-muted);font-size:0.85em;padding:8px">No roles assigned yet.</div>';
                return;
            }
            var html = '';
            snap.forEach(function (d) {
                var v = d.data();
                html += '<div class="admin-role-row">' +
                    '<span style="flex:1;font-size:0.9em;word-break:break-all">' + _esc(v.email || d.id) + '</span>' +
                    '<span class="role-badge role-' + (v.role || '') + '" style="margin:0 8px;flex-shrink:0">' + _cap(v.role || '') + '</span>' +
                    '<button class="btn-small admin-revoke-btn" data-uid="' + d.id + '" style="background:rgba(199,62,29,0.2);color:var(--danger);flex-shrink:0">Revoke</button>' +
                    '</div>';
            });
            c.innerHTML = html;
            c.querySelectorAll('.admin-revoke-btn').forEach(function (b) {
                b.onclick = function () {
                    if (!confirm('Revoke role for this user?')) return;
                    _db.collection('userRoles').doc(b.dataset.uid).delete()
                        .then(function () { _refreshAdminList(); })
                        .catch(function (e) { alert('Error: ' + e.message); });
                };
            });
        } catch (e) {
            c.innerHTML = '<div style="color:var(--danger);font-size:0.85em;padding:8px">Error loading roles: ' + _esc(e.message) + '</div>';
        }
    }

    async function _grantRole() {
        var uid   = document.getElementById('adminGrantUID').value.trim();
        var email = document.getElementById('adminGrantEmail').value.trim();
        var role  = document.getElementById('adminGrantRole').value;
        if (!uid) { alert('Please enter the user\'s UID.\n\nFind it in:\nFirebase Console → Authentication → Users'); return; }
        try {
            await _db.collection('userRoles').doc(uid).set({
                role:      role,
                email:     email || '(not provided)',
                grantedBy: _user ? _user.uid : 'admin',
                grantedAt: _ts()
            });
            alert('Role "' + role + '" granted successfully.');
            document.getElementById('adminGrantUID').value   = '';
            document.getElementById('adminGrantEmail').value = '';
            _refreshAdminList();
        } catch (e) { alert('Error granting role: ' + e.message); }
    }

    // ── Bulk JSON import ──────────────────────────────────────────────────

    var VALID_ARCANA   = ['death','fate','forces','life','matter','mind','prime','space','spirit','time'];
    var VALID_PRACTICE = ['compelling','knowing','unveiling','ruling','shielding','veiling',
                          'fraying','perfecting','weaving','patterning','unraveling','making','unmaking'];
    var VALID_BOOKS    = Object.keys(BOOKS);

    function _downloadTemplate() {
        var template = [
            {
                "_note": "DELETE this entry — it is for reference only. Fields marked (required) must be present.",
                "name":                 "Spell Name (required)",
                "sourceBook":           "core  (required) — core | signs-of-sorcery | night-horrors | tome-of-pentacle",
                "sourcePage":           123,
                "primaryArcanum":       "death  (required) — death|fate|forces|life|matter|mind|prime|space|spirit|time",
                "primaryArcanumLevel":  1,
                "secondaryArcanum":     "null or one of the arcana above",
                "secondaryArcanumLevel":null,
                "practice":             "compelling  (required) — compelling|knowing|unveiling|ruling|shielding|veiling|fraying|perfecting|weaving|patterning|unraveling|making|unmaking",
                "primaryFactor":        "potency  (required) — potency | duration",
                "withstand":            "Composure (leave blank if none)",
                "description":          "Full spell description from the book.",
                "reachOptions": [
                    { "cost": 1, "effect": "Description of what this Reach option does." },
                    { "cost": 2, "effect": "Another Reach option." }
                ],
                "optionalArcana": [
                    { "arcanum": "space", "level": 1, "effect": "What the optional arcanum enables." }
                ],
                "defaults": {
                    "potency": 1,
                    "range":   "touch  — self | touch | aimed | sensory"
                }
            }
        ];
        var blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = 'compendium-import-template.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function _triggerImport() {
        document.getElementById('adminImportFileInput').click();
    }

    function _handleImportFile(event) {
        var file = event.target.files[0];
        if (!file) return;
        // Reset input so same file can be re-selected after a fix
        event.target.value = '';

        var reader = new FileReader();
        reader.onload = function (e) {
            var raw;
            try {
                raw = JSON.parse(e.target.result);
            } catch (err) {
                _setImportStatus('Invalid JSON — ' + err.message, 'err');
                return;
            }
            if (!Array.isArray(raw)) {
                _setImportStatus('JSON must be an array [ { ... }, { ... } ]', 'err');
                return;
            }
            var overwrite = document.getElementById('adminImportOverwrite').checked;
            _doImport(raw, overwrite);
        };
        reader.readAsText(file);
    }

    async function _doImport(raw, overwrite) {
        // Filter out reference/comment entries
        var entries = raw.filter(function (s) { return s && !s._note && s.name && !s.name.startsWith('Spell Name'); });

        if (!entries.length) {
            _setImportStatus('No valid entries found. Make sure you removed the reference entry.', 'warn');
            return;
        }

        // Validate and sanitise each entry
        var valid   = [];
        var invalid = [];
        entries.forEach(function (s, idx) {
            var errs = _validateSpell(s);
            if (errs.length) {
                invalid.push({ idx: idx + 1, name: s.name || '(unnamed)', errs: errs });
            } else {
                valid.push(_sanitiseSpell(s));
            }
        });

        if (invalid.length) {
            var msgs = invalid.map(function (e) {
                return '#' + e.idx + ' "' + e.name + '": ' + e.errs.join(', ');
            }).join('\n');
            _setImportStatus('⚠️ ' + invalid.length + ' entries have errors and were skipped:\n' + msgs, 'warn');
        }

        if (!valid.length) {
            _setImportStatus('No valid spells to import after validation.', 'err');
            return;
        }

        // Build lookup of existing spells for duplicate detection
        var existingKeys = {};
        _spells.forEach(function (s) {
            existingKeys[(s.name || '').toLowerCase() + '|' + s.sourceBook] = s.id;
        });

        // Split into new and duplicate
        var toAdd     = [];
        var toUpdate  = [];
        var skipped   = 0;

        valid.forEach(function (s) {
            var key = s.name.toLowerCase() + '|' + s.sourceBook;
            if (existingKeys[key]) {
                if (overwrite) {
                    toUpdate.push({ id: existingKeys[key], data: s });
                } else {
                    skipped++;
                }
            } else {
                toAdd.push(s);
            }
        });

        var total = toAdd.length + toUpdate.length;
        if (!total) {
            _setImportStatus('All ' + skipped + ' spells already exist — nothing to import. Enable "Overwrite" to update them.', 'warn');
            return;
        }

        // Show progress bar
        _setImportProgress(0, total);

        var done   = 0;
        var errors = 0;

        // Batch writes (max 499 per batch)
        var CHUNK = 499;
        var allOps = [];
        toAdd.forEach(function (s)    { allOps.push({ type: 'add',    data: s }); });
        toUpdate.forEach(function (u) { allOps.push({ type: 'update', id: u.id, data: u.data }); });

        for (var i = 0; i < allOps.length; i += CHUNK) {
            var chunk = allOps.slice(i, i + CHUNK);
            var batch = _db.batch();
            var now   = _ts();

            chunk.forEach(function (op) {
                op.data.updatedBy = _user ? _user.uid : 'import';
                op.data.updatedAt = now;
                if (op.type === 'add') {
                    op.data.createdBy = _user ? _user.uid : 'import';
                    op.data.createdAt = now;
                    batch.set(_db.collection('compendium').doc(), op.data);
                } else {
                    batch.update(_db.collection('compendium').doc(op.id), op.data);
                }
            });

            try {
                await batch.commit();
                done += chunk.length;
            } catch (e) {
                errors += chunk.length;
                console.error('Import batch error:', e);
            }
            _setImportProgress(done + errors, total);
        }

        // Final status
        var parts = [];
        if (toAdd.length)    parts.push(toAdd.length + ' added');
        if (toUpdate.length) parts.push(toUpdate.length + ' updated');
        if (skipped)         parts.push(skipped + ' skipped (already exist)');
        if (invalid.length)  parts.push(invalid.length + ' invalid (see above)');
        if (errors)          parts.push(errors + ' batch errors');

        _setImportStatus('✓ Import complete — ' + parts.join(', ') + '.', errors ? 'warn' : 'ok');
        _setImportProgress(total, total);
    }

    function _validateSpell(s) {
        var errs = [];
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

    function _sanitiseSpell(s) {
        return {
            name:                 String(s.name).trim(),
            sourceBook:           s.sourceBook,
            sourcePage:           parseInt(s.sourcePage) || null,
            primaryArcanum:       s.primaryArcanum,
            primaryArcanumLevel:  parseInt(s.primaryArcanumLevel) || 1,
            secondaryArcanum:     (s.secondaryArcanum && VALID_ARCANA.indexOf(s.secondaryArcanum) !== -1) ? s.secondaryArcanum : null,
            secondaryArcanumLevel:s.secondaryArcanum ? (parseInt(s.secondaryArcanumLevel) || 1) : null,
            practice:             s.practice,
            primaryFactor:        s.primaryFactor,
            withstand:            String(s.withstand || '').trim(),
            description:          String(s.description || '').trim(),
            reachOptions:         Array.isArray(s.reachOptions)
                                    ? s.reachOptions.filter(function (o) { return o && o.effect; })
                                                    .map(function (o) { return { cost: parseInt(o.cost)||1, effect: String(o.effect).trim() }; })
                                    : [],
            optionalArcana:       Array.isArray(s.optionalArcana)
                                    ? s.optionalArcana.filter(function (o) { return o && o.arcanum && VALID_ARCANA.indexOf(o.arcanum) !== -1; })
                                                      .map(function (o) { return { arcanum: o.arcanum, level: parseInt(o.level)||1, effect: String(o.effect||'').trim() }; })
                                    : [],
            defaults: {
                potency:             parseInt((s.defaults||{}).potency)  || 1,
                useAdvancedPotency:  false,
                yantraDice:          0,
                durationIndex:       0,
                useAdvancedDuration: false,
                scaleIndex:          0,
                useAdvancedScale:    false,
                scaleType:           'subjects',
                range:               (['self','touch','aimed','sensory'].indexOf((s.defaults||{}).range) !== -1)
                                        ? s.defaults.range : 'touch',
                castingTime:         'ritual'
            }
        };
    }

    function _setImportStatus(msg, type) {
        var el = document.getElementById('adminImportStatus');
        if (!el) return;
        el.textContent  = msg;
        el.className    = 'import-status ' + (type || 'ok');
        el.style.display = 'block';
        el.style.whiteSpace = 'pre-wrap';
    }

    function _setImportProgress(done, total) {
        var wrap = document.getElementById('adminImportProgress');
        var fill = document.getElementById('adminImportFill');
        var txt  = document.getElementById('adminImportProgressText');
        if (!wrap) return;
        wrap.style.display = 'block';
        var pct = total > 0 ? Math.round((done / total) * 100) : 0;
        if (fill) fill.style.width = pct + '%';
        if (txt)  txt.textContent  = done + ' / ' + total + ' spells processed (' + pct + '%)';
    }

    // ── Static event wiring (runs once on init) ───────────────────────────
    function _wireStaticEvents() {
        _on('addLibModalClose',   'click', _closeAddModal);
        _on('addLibCancelBtn',    'click', _closeAddModal);
        _on('addLibConfirmBtn',   'click', _confirmAdd);

        document.querySelectorAll('.add-to-lib-type-btn').forEach(function (b) {
            b.onclick = function () { if (!b.disabled) _selectType(b.dataset.type); };
        });

        _on('compEdModalClose',     'click', _closeEditor);
        _on('btnCompEditorCancel',  'click', _closeEditor);
        _on('btnCompEditorSave',    'click', _saveEditor);
        _on('btnCompEditorDelete',  'click', _deleteEditor);
        _on('btnCompEdAddReach',    'click', function () { _addReachRow(1, ''); });
        _on('btnCompEdAddOptArc',   'click', function () { _addOptArcRow('prime', 1, ''); });

        _on('suggestionsModalClose','click', _closeSuggestions);
        _on('btnCloseSuggestions',  'click', _closeSuggestions);

        _on('adminPanelClose',          'click', _closeAdminPanel);
        _on('btnAdminClose',            'click', _closeAdminPanel);
        _on('btnAdminGrant',            'click', _grantRole);
        _on('btnAdminDownloadTemplate', 'click', _downloadTemplate);
        _on('btnAdminImport',           'click', _triggerImport);
        var fileInput = document.getElementById('adminImportFileInput');
        if (fileInput) fileInput.addEventListener('change', _handleImportFile);
    }

    function _on(id, evt, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(evt, fn);
        else console.warn('Compendium: element not found:', id);
    }

    // ── Utilities ─────────────────────────────────────────────────────────
    function _cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
    function _esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function _refreshIfActive() {
        var api = window.spellLibraryAPI;
        if (!api) return;
        var tab = api.getCurrentTab ? api.getCurrentTab() : '';
        if (tab === 'compendium') {
            renderTab();
        } else if (api.renderLibrary) {
            // Re-render personal library so the 💡 suggest button appears/disappears
            // when sign-in state changes
            api.renderLibrary();
        }
    }

    // ── Public API ────────────────────────────────────────────────────────
    window.initCompendium      = init;
    window.renderCompendiumTab = renderTab;

    // Thin interface for index.html to call back into the compendium module
    window.compendiumModule = {
        isSignedIn:      function () { return !!_user; },
        suggestFromSpell: _openEditorWithData
    };

})();
