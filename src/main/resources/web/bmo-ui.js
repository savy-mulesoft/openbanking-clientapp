(function () {
    'use strict';

    var LS_KEY = 'ob_external_connection_v1';
    var SESS_PENDING_BANK = 'ob_pending_bank_choice_v1';

    function clearPendingBankChoice() {
        try {
            sessionStorage.removeItem(SESS_PENDING_BANK);
        } catch (e) { /* ignore */ }
    }

    function setPendingBankChoice(name) {
        try {
            sessionStorage.setItem(SESS_PENDING_BANK, String(name || '').trim());
        } catch (e) { /* ignore */ }
    }

    function peekPendingBankChoice() {
        try {
            return (sessionStorage.getItem(SESS_PENDING_BANK) || '').trim();
        } catch (e) {
            return '';
        }
    }

    /** Normalize API / OS quirks (snake_case, missing bank on redirect). */
    function sessionBankFields(d) {
        if (!d || typeof d !== 'object') {
            return { bankName: '', bankDisplayName: null, bankBrand: null };
        }
        var bn = d.bankName != null ? String(d.bankName).trim() : '';
        if (!bn && d.bank_name != null) bn = String(d.bank_name).trim();
        var bd = d.bankDisplayName != null ? String(d.bankDisplayName).trim() : '';
        if (!bd && d.bank_display_name != null) bd = String(d.bank_display_name).trim();
        var br = d.bankBrand != null ? d.bankBrand : d.bank_brand;
        return { bankName: bn, bankDisplayName: bd || null, bankBrand: br != null ? br : null };
    }

    function bankFromQueryParams(params) {
        var raw = params.get('bank');
        if (raw == null || raw === '') return '';
        try {
            return decodeURIComponent(String(raw).replace(/\+/g, ' ')).trim();
        } catch (e) {
            return String(raw).trim();
        }
    }

    /** Hosted bank marks (user-supplied URLs). */
    var BANK_LOGO_URLS = {
        bmo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQzORj-pntKNyeDmHO2_fHysJz1lzwZOL2F4g&s',
        rbc: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSxnYZQANBWQdJQ9IWBEppHxJFAUpC1W00yyQ&s',
        td: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Toronto-Dominion_Bank_logo.svg',
        scotia: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSc3vraaVxRZK-kXdRhvSrdiGxvvkfZxw296A&s',
        cibc: 'https://reseaucapital.com/wp-content/uploads/2017/10/unnamed.png'
    };

    function coerceArray(v) {
        if (v == null) return [];
        if (Array.isArray(v)) return v;
        return [v];
    }

    /**
     * FDX DataCluster codes — must match Auth0 API permissions exactly.
     * Labels mirror Auth0 permission descriptions (FDX-aligned cluster names).
     */
    var FDX_SCOPE_MAP = {
        ACCOUNT_BASIC:    'View basic account details and balances',
        TRANSACTIONS:     'View account transaction history',
        CUSTOMER_CONTACT: 'View verified contact information'
    };

    /** Consent checkboxes: only scopes defined on the Auth0 Resource Server API. */
    var FDX_CONSENT_SCOPES = [
        { code: 'ACCOUNT_BASIC',    preselected: true },
        { code: 'TRANSACTIONS',     preselected: true },
        { code: 'CUSTOMER_CONTACT', preselected: false }
    ];

    function fdxHumanLabel(code) {
        var c = String(code || '').trim().toUpperCase();
        return FDX_SCOPE_MAP[c] || null;
    }

    function decodeJwtPayload(token) {
        if (!token || typeof token !== 'string') return null;
        var parts = token.split('.');
        if (parts.length !== 3) return null;
        try {
            var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            var json = atob(b64);
            return JSON.parse(json);
        } catch (e) {
            return null;
        }
    }

    function bankNameFromJwtAud(token) {
        var claims = decodeJwtPayload(token);
        if (!claims) return '';
        var audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        for (var i = 0; i < audiences.length; i++) {
            var a = String(audiences[i] || '').toLowerCase();
            if (a.indexOf('tdbank') !== -1 || a.indexOf(':td') !== -1) return 'TD';
            if (a.indexOf('rbc') !== -1 || a.indexOf('royal') !== -1) return 'RBC';
            if (a.indexOf('scotia') !== -1) return 'Scotiabank';
            if (a.indexOf('cibc') !== -1) return 'CIBC';
            if (a.indexOf('bmo') !== -1) return 'BMO';
        }
        return '';
    }

    function scopesFromClaims(claims) {
        if (!claims || typeof claims !== 'object') return [];
        var out = [];
        if (claims.scope != null) {
            out = out.concat(String(claims.scope).split(/\s+/).filter(Boolean));
        }
        if (Array.isArray(claims.scp)) {
            out = out.concat(claims.scp.map(String));
        }
        if (Array.isArray(claims.permissions)) {
            out = out.concat(claims.permissions.map(String));
        }
        return out;
    }

    function uniqueStrings(arr) {
        var seen = {};
        var r = [];
        (arr || []).forEach(function (s) {
            var k = String(s).trim();
            if (!k || seen[k]) return;
            seen[k] = true;
            r.push(k);
        });
        return r;
    }

    function mergeAllScopes(conn) {
        var base = conn.scopes || [];
        var accClaims = decodeJwtPayload(conn.accessToken);
        var idClaims = decodeJwtPayload(conn.idToken);
        return uniqueStrings(
            base.concat(scopesFromClaims(accClaims)).concat(scopesFromClaims(idClaims))
        );
    }

    function hasFdxScope(conn, code) {
        if (!conn) return false;
        var want = String(code || '').trim().toUpperCase();
        return mergeAllScopes(conn).some(function (s) {
            return String(s).trim().toUpperCase() === want;
        });
    }

    /** True if JWT / stored scopes include FDX-style transaction access (Auth0: TRANSACTIONS). */
    function hasTransactionsPermission(conn) {
        if (!conn) return false;
        return mergeAllScopes(conn).some(function (s) {
            var u = String(s).trim().toUpperCase();
            return u === 'TRANSACTIONS' || u.endsWith(':TRANSACTIONS') || u.indexOf('TRANSACTIONS') !== -1;
        });
    }

    /**
     * Pull latest tokens and scopes from the server Object Store into localStorage so UI matches
     * what /api/td/* uses. Fixes missing linked tab when scopes only exist on the JWT.
     */
    function syncOAuthSessionToLocal() {
        return fetch('/api/oauth/session')
            .then(function (res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function (data) {
                if (!data || !data.access_token || data.error) {
                    localStorage.removeItem(LS_KEY);
                    renderExternalConnections();
                    return null;
                }
                var sb = sessionBankFields(data);
                var tech = coerceArray(data.scopes_technical);
                if (!tech.length) {
                    tech = (data.requested_scopes || '')
                        .split(',')
                        .map(function (s) {
                            return s.trim();
                        })
                        .filter(Boolean);
                }
                if (!tech.length) {
                    tech = scopesFromClaims(decodeJwtPayload(data.access_token));
                }
                var cur = getStoredConnection();
                var isGeneric = function (n) {
                    return !n || n === 'External bank' || n === 'default';
                };
                var resolvedName =
                    (!isGeneric(sb.bankName) ? sb.bankName : null) ||
                    (cur && !isGeneric(cur.bankName) ? cur.bankName : null) ||
                    peekPendingBankChoice() ||
                    bankNameFromJwtAud(data.access_token) ||
                    'External bank';
                var human = coerceArray(data.scopes_human);
                if (!human.length && tech.length) {
                    human = tech.map(function (t) {
                        return fdxHumanLabel(t) || t;
                    });
                }
                var resolvedDisplay =
                    (!isGeneric(sb.bankDisplayName) ? sb.bankDisplayName : null) ||
                    (cur && !isGeneric(cur.bankDisplayName) ? cur.bankDisplayName : null) ||
                    null;
                saveConnection({
                    accessToken: data.access_token,
                    idToken: data.id_token || null,
                    tokenType: data.token_type || 'Bearer',
                    bankName: resolvedName,
                    bankDisplayName: resolvedDisplay,
                    bankBrand: sb.bankBrand != null ? sb.bankBrand : data.bankBrand,
                    scopes: tech,
                    scopesTechnical: tech,
                    scopesHuman: human,
                    sessionId: data.session_id || null,
                    connectedAt: (cur && cur.connectedAt) || new Date().toISOString(),
                    tokenShape: data.access_token_format || null
                });
                renderExternalConnections();
                return getStoredConnection();
            })
            .catch(function () {
                return getStoredConnection();
            });
    }

    function linkedBankShortLabel(conn) {
        if (!conn) return 'Linked';
        var brand = effectiveBankBrand(conn);
        var displayMap = { td: 'TD Canada Trust', rbc: 'Royal Bank of Canada', scotia: 'Scotiabank', cibc: 'CIBC', bmo: 'BMO' };
        if (displayMap[brand]) return displayMap[brand];
        var dn = conn.bankDisplayName;
        if (dn && dn !== 'External bank') return dn;
        return conn.bankName || 'Linked bank';
    }

    function formatMoneyCAD(n) {
        var x = Number(n);
        if (isNaN(x)) return '—';
        return '$' + x.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' CAD';
    }

    var _bmoAccountsData = [];
    var _tdAccountsData = [];
    var _bmoTxnsData = [];
    var _tdTxnsRows = [];

    function sumBmoBalances(accounts) {
        return (accounts || []).reduce(function (sum, a) {
            if (a.currentBalance != null && !isNaN(Number(a.currentBalance))) {
                return sum + Number(a.currentBalance);
            }
            return sum + (Number(a.availableBalance) || 0);
        }, 0);
    }

    function sumTdCashBalances(accounts) {
        return (accounts || []).reduce(function (sum, a) {
            if (a.currentBalance != null && !isNaN(Number(a.currentBalance))) {
                return sum + Number(a.currentBalance);
            }
            return sum + (Number(a.availableBalance) || 0);
        }, 0);
    }

    /** Server may send bankBrand \"default\"; that is truthy in JS and blocked inferring from bankName. */
    function effectiveBankBrand(obj) {
        if (!obj) return 'default';
        var raw = obj.bankBrand;
        var s = raw != null && raw !== '' ? String(raw).trim().toLowerCase() : '';
        if (s && s !== 'default') return s;
        var k = bankBrandKey(obj.bankName);
        if (k !== 'default') return k;
        return bankBrandKey(obj.bankDisplayName);
    }

    function normalizeConnectionForSave(obj) {
        var name = obj.bankName || obj.bankDisplayName || '';
        var brand = effectiveBankBrand(obj);
        if (brand === 'default' && name) {
            brand = bankBrandKey(name);
        }
        if (!name || name === 'External bank') {
            name = bankDisplayName(name, brand) || name || 'External bank';
        }
        var rawDisplay = obj.bankDisplayName;
        var display =
            (rawDisplay && rawDisplay !== 'External bank' ? rawDisplay : null) ||
            bankDisplayName(name, brand) ||
            name;
        var scopesTech = coerceArray(obj.scopesTechnical);
        if (!scopesTech.length && obj.scopes && obj.scopes.length) {
            scopesTech = obj.scopes.map(String);
        }
        var scopesHuman = coerceArray(obj.scopesHuman).map(String);
        if (!scopesHuman.length && scopesTech.length) {
            scopesHuman = scopesTech.map(function (t) {
                return fdxHumanLabel(t) || t;
            });
        }
        if (!scopesHuman.length) {
            scopesHuman = mergeAllScopes(obj).map(function (c) {
                return fdxHumanLabel(c) || c;
            });
        }
        return {
            accessToken: obj.accessToken,
            idToken: obj.idToken || null,
            tokenType: obj.tokenType || 'Bearer',
            bankName: name,
            bankDisplayName: display,
            bankBrand: brand,
            scopes: scopesTech.length ? scopesTech : obj.scopes || [],
            scopesHuman: scopesHuman,
            scopesTechnical: scopesTech,
            sessionId: obj.sessionId || null,
            connectedAt: obj.connectedAt || new Date().toISOString(),
            tokenShape: obj.tokenShape || null
        };
    }

    function getStoredConnection() {
        try {
            var raw = localStorage.getItem(LS_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function saveConnection(conn) {
        localStorage.setItem(LS_KEY, JSON.stringify(normalizeConnectionForSave(conn)));
    }

    /** Re-save if bankBrand/bankName can be inferred better (e.g. old \"default\" + TD display name). */
    function maybeMigrateStoredConnection() {
        try {
            var raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            var cur = JSON.parse(raw);
            var next = normalizeConnectionForSave(cur);
            var pick = function (x) {
                return {
                    bankName: x.bankName,
                    bankBrand: x.bankBrand,
                    bankDisplayName: x.bankDisplayName
                };
            };
            if (JSON.stringify(pick(cur)) !== JSON.stringify(pick(next))) {
                localStorage.setItem(LS_KEY, JSON.stringify(next));
            }
        } catch (e) {
            /* ignore */
        }
    }

    function bankBrandKey(bankName) {
        var n = String(bankName || '')
            .trim()
            .toUpperCase();
        if (n === 'BMO' || n.indexOf('BMO') !== -1 || n.indexOf('BANK OF MONTREAL') !== -1) return 'bmo';
        if (n === 'RBC' || n.indexOf('ROYAL') !== -1) return 'rbc';
        if (n === 'TD' || n.indexOf('TD') !== -1) return 'td';
        if (n === 'SCO' || n.indexOf('SCOTIA') !== -1 || n.indexOf('SCO') !== -1) return 'scotia';
        if (n === 'CIBC' || n.indexOf('CIBC') !== -1 || n.indexOf('CIB') === 0) return 'cibc';
        return 'default';
    }

    function bankDisplayName(bankName, key) {
        var map = {
            bmo: 'BMO',
            rbc: 'Royal Bank of Canada',
            td: 'TD Canada Trust',
            scotia: 'Scotiabank',
            cibc: 'CIBC',
            default: null
        };
        if (map[key]) return map[key];
        return bankName || 'External bank';
    }

    function bankLogoSvgHtml(key) {
        var k = String(key == null ? 'default' : key)
            .trim()
            .toLowerCase();
        var svgStart = '<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
        var rect = function (fill, label) {
            return (
                svgStart +
                '<rect fill="' +
                fill +
                '" width="56" height="56" rx="14"/>' +
                '<text x="28" y="36" text-anchor="middle" fill="#fff" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="16">' +
                label +
                '</text></svg>'
            );
        };
        switch (k) {
            case 'bmo':
                return rect('#007078', 'BMO');
            case 'td':
                return rect('#53B700', 'TD');
            case 'rbc':
                return rect('#0051A5', 'RBC');
            case 'scotia':
                return rect('#EC111A', 'SCO');
            case 'cibc':
                return rect('#B82025', 'CIB');
            default:
                return rect('#007078', 'OB');
        }
    }

    function bankLogoFillContainer(container, brand, altText) {
        if (!container) return;
        container.innerHTML = '';
        var k = String(brand == null ? 'default' : brand)
            .trim()
            .toLowerCase();
        var url = BANK_LOGO_URLS[k];
        if (!url) {
            container.innerHTML = bankLogoSvgHtml(k);
            return;
        }
        var img = document.createElement('img');
        img.src = url;
        img.alt = altText || '';
        img.loading = 'lazy';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.display = 'block';
        img.addEventListener('error', function onLogoErr() {
            img.removeEventListener('error', onLogoErr);
            container.innerHTML = bankLogoSvgHtml(k);
        });
        container.appendChild(img);
    }

    function renderExternalConnections() {
        var conn = getStoredConnection();
        var countEl = document.getElementById('accountCount');
        var descEl = document.getElementById('externalCardDesc');
        var card = document.getElementById('externalConnectionsCard');
        var body = document.getElementById('externalCardBody');

        if (!countEl || !descEl || !card) return;

        var n = conn ? 1 : 0;
        countEl.textContent = String(n);
        descEl.textContent = n ? '1 active connection' : 'No connections yet';
        card.classList.toggle('card--interactive', n > 0);

        if (body) {
            body.setAttribute('aria-expanded', 'false');
            if (n > 0) {
                body.setAttribute('role', 'button');
                body.setAttribute('tabindex', '0');
                body.setAttribute('aria-controls', 'externalDetailModal');
            } else {
                body.removeAttribute('role');
                body.removeAttribute('tabindex');
                body.removeAttribute('aria-controls');
            }
        }

        if (!n) {
            closeExternalDetailModal();
        }
    }

    function closeExternalDetailModal() {
        var m = document.getElementById('externalDetailModal');
        var body = document.getElementById('externalCardBody');
        if (m) {
            m.classList.remove('is-open');
            m.style.display = 'none';
            m.setAttribute('aria-hidden', 'true');
        }
        if (body) body.setAttribute('aria-expanded', 'false');
        syncModalOpenBodyClass();
    }

    function syncModalOpenBodyClass() {
        var conn = document.getElementById('connectionModal');
        var ext = document.getElementById('externalDetailModal');
        var cash = document.getElementById('cashBreakdownModal');
        var admin = document.getElementById('adminHubModal');
        var advisor = document.getElementById('advisorModal');
        var open =
            (conn && conn.classList.contains('is-open')) ||
            (admin && admin.classList.contains('is-open')) ||
            (advisor && advisor.classList.contains('is-open')) ||
            (ext && ext.classList.contains('is-open')) ||
            (cash && cash.classList.contains('is-open'));
        if (open) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    }

    function openExternalDetailModal() {
        var conn = getStoredConnection();
        if (!conn) return;

        window.closeConnectionModal();
        closeCashBreakdownModal();
        closeAdminHub();

        var m = document.getElementById('externalDetailModal');
        if (!m) return;

        populateExternalDetailModal(conn);

        m.style.display = 'flex';
        m.classList.add('is-open');
        m.setAttribute('aria-hidden', 'false');
        syncModalOpenBodyClass();

        var body = document.getElementById('externalCardBody');
        if (body) body.setAttribute('aria-expanded', 'true');
    }

    function openCashBreakdownModal() {
        window.closeConnectionModal();
        closeExternalDetailModal();
        renderCashBreakdown();
        var m = document.getElementById('cashBreakdownModal');
        if (!m) return;
        m.style.display = 'flex';
        m.classList.add('is-open');
        m.setAttribute('aria-hidden', 'false');
        syncModalOpenBodyClass();
    }

    function closeCashBreakdownModal() {
        var m = document.getElementById('cashBreakdownModal');
        if (m) {
            m.classList.remove('is-open');
            m.style.display = 'none';
            m.setAttribute('aria-hidden', 'true');
        }
        syncModalOpenBodyClass();
    }

    function populateExternalDetailModal(conn) {
        var rows = document.getElementById('externalAccountsRows');
        if (!rows) return;
        rows.innerHTML = '';

        var brand = effectiveBankBrand(conn);
        var tags = coerceArray(conn.scopesHuman).filter(Boolean);
        if (!tags.length) {
            var tech = coerceArray(conn.scopesTechnical);
            if (!tech.length && conn.scopes) tech = coerceArray(conn.scopes);
            tags = tech.map(function (t) {
                return fdxHumanLabel(t) || String(t);
            });
        }

        var row = document.createElement('div');
        row.className = 'external-account-row';

        var logo = document.createElement('div');
        logo.className = 'external-detail-logo row-logo';
        logo.setAttribute('title', conn.bankDisplayName || conn.bankName || '');
        bankLogoFillContainer(logo, brand, conn.bankDisplayName || conn.bankName || '');

        var scopeWrap = document.createElement('div');
        scopeWrap.className = 'external-detail-scopes row-scopes';
        if (!tags.length) {
            var empty = document.createElement('span');
            empty.className = 'scope-chip';
            empty.textContent = 'No scopes listed';
            scopeWrap.appendChild(empty);
        } else {
            tags.forEach(function (label) {
                var sp = document.createElement('span');
                sp.className = 'scope-chip';
                sp.textContent = label;
                scopeWrap.appendChild(sp);
            });
        }

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'row-delete';
        del.textContent = 'Delete';
        del.addEventListener('click', function (e) {
            e.stopPropagation();
            disconnectExternal();
        });

        row.appendChild(logo);
        row.appendChild(scopeWrap);
        row.appendChild(del);
        rows.appendChild(row);
    }

    function disconnectExternal() {
        localStorage.removeItem(LS_KEY);
        _tdAccountsData = [];
        _tdTxnsRows = [];
        closeExternalDetailModal();
        renderExternalConnections();
        updateCashTotalDisplay();
        renderCashBreakdown();
        hideExtTab();
        appendTdTxnRows(document.getElementById('txnListExt'), []);
        showNotification('Connection removed. Connect again to link your bank.', 'success');
        fetch('/api/oauth/disconnect', { method: 'POST' }).catch(function () { /* ignore */ });
    }

    function handleOAuthReturn() {
        var params = new URLSearchParams(window.location.search);
        var status = params.get('status');
        if (status === 'error') {
            var err = params.get('error') || 'unknown';
            clearPendingBankChoice();
            showNotification('Connection failed: ' + err, 'warn');
            window.history.replaceState({}, '', '/');
            return Promise.resolve();
        }
        if (status !== 'success') return Promise.resolve();

        var bankFromUrl = bankFromQueryParams(params);
        var scopesFromUrl = (params.get('scopes') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        var pendingPick = peekPendingBankChoice();

        return fetch('/api/oauth/session')
            .then(function (res) {
                return res.json().then(function (data) {
                    return { res: res, data: data };
                });
            })
            .then(function (o) {
                if (!o.res.ok || !o.data.access_token) {
                    clearPendingBankChoice();
                    showNotification('Could not read session from server. Try Connect again.', 'warn');
                    window.history.replaceState({}, '', '/');
                    return;
                }
                var sb = sessionBankFields(o.data);
                var tech = coerceArray(o.data.scopes_technical);
                if (!tech.length) {
                    tech = (o.data.requested_scopes || '')
                        .split(',')
                        .map(function (s) {
                            return s.trim();
                        })
                        .filter(Boolean);
                }
                if (!tech.length) tech = scopesFromUrl;
                var human = coerceArray(o.data.scopes_human);
                var resolvedName = bankFromUrl || sb.bankName || pendingPick || 'External bank';
                saveConnection({
                    accessToken: o.data.access_token,
                    idToken: o.data.id_token || null,
                    tokenType: o.data.token_type || 'Bearer',
                    bankName: resolvedName,
                    bankDisplayName: sb.bankDisplayName || null,
                    bankBrand: sb.bankBrand != null ? sb.bankBrand : o.data.bankBrand,
                    scopes: tech,
                    scopesTechnical: tech,
                    scopesHuman: human,
                    sessionId: o.data.session_id || null,
                    connectedAt: new Date().toISOString(),
                    tokenShape: o.data.access_token_format || null
                });
                clearPendingBankChoice();
                showNotification('Bank connected successfully.', 'success');
                window.history.replaceState({}, '', '/');
            })
            .catch(function (e) {
                clearPendingBankChoice();
                showNotification('Could not complete connection: ' + (e.message || String(e)), 'warn');
                window.history.replaceState({}, '', '/');
            });
    }

    function tryHydrateConnectionFromServer() {
        if (getStoredConnection()) return Promise.resolve();
        return fetch('/api/oauth/session')
            .then(function (res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function (data) {
                if (!data || !data.access_token) return;
                var sb = sessionBankFields(data);
                var tech = coerceArray(data.scopes_technical);
                if (!tech.length) {
                    tech = (data.requested_scopes || '')
                        .split(',')
                        .map(function (s) {
                            return s.trim();
                        })
                        .filter(Boolean);
                }
                var resolvedName = sb.bankName || peekPendingBankChoice() || 'External bank';
                saveConnection({
                    accessToken: data.access_token,
                    idToken: data.id_token || null,
                    tokenType: data.token_type || 'Bearer',
                    bankName: resolvedName,
                    bankDisplayName: sb.bankDisplayName || null,
                    bankBrand: sb.bankBrand != null ? sb.bankBrand : data.bankBrand,
                    scopes: tech,
                    scopesTechnical: tech,
                    scopesHuman: coerceArray(data.scopes_human),
                    sessionId: data.session_id || null,
                    connectedAt: new Date().toISOString(),
                    tokenShape: data.access_token_format || null
                });
                clearPendingBankChoice();
            })
            .catch(function () { /* ignore */ });
    }

    function updateCashTotalDisplay() {
        var bmo = sumBmoBalances(_bmoAccountsData);
        var td = sumTdCashBalances(_tdAccountsData);
        var total = bmo + td;
        var tb = document.getElementById('totalBalance');
        if (tb) {
            tb.textContent = formatMoneyCAD(total);
        }
        /* Cash card description removed — info tooltip handles context */
    }

    function renderCashDrillRow(name, amountText) {
        var row = document.createElement('div');
        row.className = 'cash-drill-row';
        var n = document.createElement('span');
        n.className = 'cash-drill-row__name';
        n.textContent = name;
        var a = document.createElement('span');
        a.className = 'cash-drill-row__amt';
        a.textContent = amountText;
        row.appendChild(n);
        row.appendChild(a);
        return row;
    }

    function renderCashBreakdown() {
        var bmoBox = document.getElementById('cashDrillBmoBox');
        if (bmoBox) {
            bmoBox.innerHTML = '';
            if (!_bmoAccountsData.length) {
                bmoBox.appendChild(renderCashDrillRow('No BMO accounts loaded', '—'));
            } else {
                _bmoAccountsData.forEach(function (acc) {
                    var label = acc.nickname || ((acc.accountCategory || 'Account') + ' (' + (acc.accountId || '—') + ')');
                    bmoBox.appendChild(renderCashDrillRow(label, formatMoneyCAD(acc.currentBalance != null ? acc.currentBalance : acc.availableBalance)));
                });
            }
        }

        var conn = getStoredConnection();
        var extSec = document.getElementById('cashDrillExtSection');
        var extBox = document.getElementById('cashDrillExtBox');
        var extLbl = document.getElementById('cashExtBankLabel');
        var showExt = conn && hasFdxScope(conn, 'ACCOUNT_BASIC');
        if (extSec) {
            extSec.style.display = showExt ? '' : 'none';
        }
        if (extLbl && conn) {
            extLbl.textContent = linkedBankShortLabel(conn);
        }
        if (extBox && showExt) {
            extBox.innerHTML = '';
            if (!_tdAccountsData.length) {
                var hint = document.createElement('div');
                hint.className = 'cash-drill-row';
                var hintSpan = document.createElement('span');
                hintSpan.className = 'cash-drill-row__name';
                hintSpan.style.whiteSpace = 'normal';
                hintSpan.style.color = 'var(--text-muted)';
                hintSpan.textContent =
                    'Use Sync or refresh Cash on the overview card to load linked balances.';
                hint.appendChild(hintSpan);
                extBox.appendChild(hint);
            } else {
                _tdAccountsData.forEach(function (acc) {
                    var label = acc.nickname || acc.accountId || 'Account';
                    var bal = acc.currentBalance != null ? acc.currentBalance : acc.availableBalance;
                    extBox.appendChild(renderCashDrillRow(String(label), formatMoneyCAD(bal)));
                });
            }
        }
    }

    function refreshCashBalances() {
        return syncOAuthSessionToLocal().then(function () {
            var conn = getStoredConnection();
            var accReq = fetch('/fdx/v6/accounts').then(function (r) {
                return r.json();
            });
            var tdReq = Promise.resolve({ ok: false, data: null });
            if (conn && hasFdxScope(conn, 'ACCOUNT_BASIC')) {
                tdReq = fetch('/api/td/accounts')
                    .then(function (r) {
                        return r
                            .json()
                            .then(function (j) {
                                return { ok: r.ok, data: j };
                            })
                            .catch(function () {
                                return { ok: false, data: null };
                            });
                    })
                    .catch(function () {
                        return { ok: false, data: null };
                    });
            }
            return Promise.all([accReq, tdReq])
                .then(function (results) {
                    var accData = results[0];
                    var tdRes = results[1];
                    if (accData && accData.accounts) {
                        _bmoAccountsData = accData.accounts;
                    } else {
                        _bmoAccountsData = [];
                    }
                    if (tdRes.ok && tdRes.data && tdRes.data.accounts) {
                        _tdAccountsData = tdRes.data.accounts;
                    } else {
                        _tdAccountsData = [];
                    }
                    updateCashTotalDisplay();
                    renderCashBreakdown();
                })
                .catch(function () {
                    showNotification('Could not refresh cash balances.', 'warn');
                });
        });
    }

    function formatBmoTxnDate(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return String(iso);
            return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            return String(iso);
        }
    }

    function fdxSignedAmount(t) {
        var a = Number(t.amount);
        if (isNaN(a)) return 0;
        var memo = String(t.debitCreditMemo || '').toUpperCase();
        if (memo === 'DEBIT') return -Math.abs(a);
        if (memo === 'CREDIT') return Math.abs(a);
        return a;
    }

    function appendBmoTxnRows(container, list) {
        if (!container) return;
        container.innerHTML = '';
        if (!list.length) {
            var empty = document.createElement('div');
            empty.className = 'txn-empty';
            empty.textContent = 'No transactions.';
            container.appendChild(empty);
            return;
        }
        list.forEach(function (t) {
            var row = document.createElement('div');
            row.className = 'txn-row';
            var top = document.createElement('div');
            top.className = 'txn-row__top';
            var desc = document.createElement('span');
            desc.className = 'txn-row__desc';
            desc.textContent = t.description || 'Transaction';
            var amt = document.createElement('span');
            amt.className = 'txn-row__amt';
            var num = fdxSignedAmount(t);
            if (num < 0) amt.classList.add('txn-row__amt--neg');
            if (num > 0) amt.classList.add('txn-row__amt--pos');
            amt.textContent = formatMoneyCAD(num);
            top.appendChild(desc);
            top.appendChild(amt);
            var meta = document.createElement('div');
            meta.className = 'txn-row__meta';
            var ts = t.postedTimestamp || t.date || '';
            meta.textContent = [formatBmoTxnDate(ts), t.debitCreditMemo, t.payee].filter(Boolean).join(' · ');
            row.appendChild(top);
            row.appendChild(meta);
            container.appendChild(row);
        });
    }

    function tdTxnSignedAmount(tx) {
        var a = Number(tx.amount);
        if (isNaN(a)) return 0;
        var memo = String(tx.debitCreditMemo || '').toUpperCase();
        if (memo === 'DEBIT') return -Math.abs(a);
        if (memo === 'CREDIT') return Math.abs(a);
        return a;
    }

    function appendTdTxnRows(container, rows) {
        if (!container) return;
        container.innerHTML = '';
        if (!rows.length) {
            var empty = document.createElement('div');
            empty.className = 'txn-empty';
            empty.textContent = 'No transactions.';
            container.appendChild(empty);
            return;
        }
        rows.forEach(function (item) {
            var t = item.raw;
            var row = document.createElement('div');
            row.className = 'txn-row';
            var top = document.createElement('div');
            top.className = 'txn-row__top';
            var desc = document.createElement('span');
            desc.className = 'txn-row__desc';
            desc.textContent = t.description || t.payee || 'Transaction';
            var amt = document.createElement('span');
            amt.className = 'txn-row__amt';
            var signed = tdTxnSignedAmount(t);
            if (signed < 0) amt.classList.add('txn-row__amt--neg');
            if (signed > 0) amt.classList.add('txn-row__amt--pos');
            amt.textContent = formatMoneyCAD(signed);
            top.appendChild(desc);
            top.appendChild(amt);
            var meta = document.createElement('div');
            meta.className = 'txn-row__meta';
            var when = t.postedTimestamp || t.transactionTimestamp || '';
            meta.textContent = [item.acctLabel, formatBmoTxnDate(when)].filter(Boolean).join(' · ');
            row.appendChild(top);
            row.appendChild(meta);
            container.appendChild(row);
        });
    }

    function setTxnTabActive(which) {
        var tabBmo = document.getElementById('txnTabBmo');
        var tabExt = document.getElementById('txnTabExt');
        var panelBmo = document.getElementById('txnPanelBmo');
        var panelExt = document.getElementById('txnPanelExt');
        var isExt = which === 'ext';
        if (isExt && tabExt && tabExt.hidden) {
            isExt = false;
        }
        if (tabBmo) {
            tabBmo.setAttribute('aria-selected', (!isExt).toString());
        }
        if (tabExt && !tabExt.hidden) {
            tabExt.setAttribute('aria-selected', isExt.toString());
        }
        if (panelBmo) {
            panelBmo.classList.toggle('is-active', !isExt);
        }
        if (panelExt) {
            panelExt.classList.toggle('is-active', isExt);
        }
    }

    function loadBmoTransactions() {
        return fetch('/fdx/v6/accounts/all/transactions')
            .then(function (r) {
                return r.json();
            })
            .then(function (data) {
                _bmoTxnsData = data.transactions || [];
                appendBmoTxnRows(document.getElementById('txnListBmo'), _bmoTxnsData);
            })
            .catch(function () {
                _bmoTxnsData = [];
                appendBmoTxnRows(document.getElementById('txnListBmo'), []);
            });
    }

    function fetchTdTransactionsMerged() {
        return fetch('/api/td/accounts')
            .then(function (r) {
                if (!r.ok) throw new Error('accounts ' + r.status);
                return r.json();
            })
            .then(function (data) {
                var accs = data.accounts || [];
                return Promise.all(
                    accs.map(function (acc) {
                        var id = acc.accountId;
                        var label = acc.nickname || id;
                        return fetch('/api/td/accounts/' + encodeURIComponent(id) + '/transactions')
                            .then(function (r) {
                                if (!r.ok) return [];
                                return r
                                    .json()
                                    .then(function (j) {
                                        return (j.transactions || []).map(function (tx) {
                                            return { acctLabel: label, raw: tx };
                                        });
                                    })
                                    .catch(function () {
                                        return [];
                                    });
                            })
                            .catch(function () {
                                return [];
                            });
                    })
                );
            })
            .then(function (arrays) {
                var merged = [];
                arrays.forEach(function (a) {
                    merged = merged.concat(a);
                });
                merged.sort(function (x, y) {
                    var ta = new Date(x.raw.postedTimestamp || 0).getTime();
                    var tb = new Date(y.raw.postedTimestamp || 0).getTime();
                    return tb - ta;
                });
                return merged;
            });
    }

    function extTabBankLabel(conn) {
        if (!conn) return 'Linked';
        var brand = effectiveBankBrand(conn);
        if (brand === 'default' && conn.bankName) brand = bankBrandKey(conn.bankName);
        var shortMap = { td: 'TD', rbc: 'RBC', scotia: 'Scotiabank', cibc: 'CIBC', bmo: 'BMO' };
        if (shortMap[brand]) return shortMap[brand];
        return conn.bankDisplayName || conn.bankName || 'Linked';
    }

    function showExtTab(conn) {
        var tabExt = document.getElementById('txnTabExt');
        if (!tabExt) return;
        tabExt.textContent = extTabBankLabel(conn);
        tabExt.removeAttribute('hidden');
    }

    function hideExtTab() {
        var tabExt = document.getElementById('txnTabExt');
        if (tabExt) tabExt.setAttribute('hidden', 'hidden');
        setTxnTabActive('bmo');
    }

    function showExtTxnError(msg) {
        var el = document.getElementById('txnListExt');
        if (!el) return;
        el.innerHTML = '<div class="txn-error">' + (msg || 'Error loading transactions.') + '</div>';
    }

    /**
     * Refresh: load BMO txns, then check if external connection exists.
     * If connection exists → show the tab with bank name. Actual TD API call
     * happens when the user clicks that tab (lazy-load).
     */
    function refreshAllTransactions() {
        _tdTxnsRows = [];
        return syncOAuthSessionToLocal().then(function () {
            return loadBmoTransactions().then(function () {
                var conn = getStoredConnection();
                if (!conn) {
                    hideExtTab();
                    return;
                }
                showExtTab(conn);
                var el = document.getElementById('txnListExt');
                if (el) {
                    el.innerHTML = '<div class="txn-empty">Click the ' +
                        extTabBankLabel(conn) + ' tab to load transactions.</div>';
                }
            });
        });
    }

    /**
     * Called when user clicks the external tab. Makes the actual API call.
     * If no TRANSACTIONS scope or API fails → shows helpful error.
     */
    function loadExtTransactionsOnTabClick() {
        var conn = getStoredConnection();
        if (!conn) {
            showExtTxnError('No external bank connected. Use "Connect external bank" to link your account.');
            return Promise.resolve();
        }
        if (!hasTransactionsPermission(conn)) {
            showExtTxnError(
                'Your ' + extTabBankLabel(conn) + ' connection does not include Transactions access. ' +
                'Please reconnect and select the Transactions permission.'
            );
            return Promise.resolve();
        }
        if (_tdTxnsRows.length) {
            appendTdTxnRows(document.getElementById('txnListExt'), _tdTxnsRows);
            return Promise.resolve();
        }
        var el = document.getElementById('txnListExt');
        if (el) el.innerHTML = '<div class="txn-empty">Loading transactions…</div>';
        return fetchTdTransactionsMerged()
            .then(function (rows) {
                _tdTxnsRows = rows;
                if (!rows.length) {
                    showExtTxnError('No transactions found for your ' + extTabBankLabel(conn) + ' accounts.');
                } else {
                    appendTdTxnRows(document.getElementById('txnListExt'), rows);
                    showNotification('Linked transactions loaded.', 'success');
                }
            })
            .catch(function () {
                _tdTxnsRows = [];
                showExtTxnError(
                    'Could not load ' + extTabBankLabel(conn) + ' transactions. ' +
                    'Ensure your connection includes the Transactions permission and try again.'
                );
            });
    }

    function loadAccountData() {
        return refreshCashBalances();
    }

    window.openConnectionModal = function () {
        var el = document.getElementById('connectionModal');
        if (!el) return;
        clearPendingBankChoice();
        closeExternalDetailModal();
        closeCashBreakdownModal();
        closeAdminHub();
        el.style.display = 'flex';
        el.classList.add('is-open');
        syncModalOpenBodyClass();
        var bs = document.getElementById('bankSelection');
        var ss = document.getElementById('scopeSelection');
        var cs = document.getElementById('connectionStatus');
        if (bs) bs.style.display = 'block';
        if (ss) ss.style.display = 'none';
        if (cs) cs.style.display = 'none';
    };

    window.closeConnectionModal = function () {
        var el = document.getElementById('connectionModal');
        if (!el) return;
        el.classList.remove('is-open');
        el.style.display = 'none';
        syncModalOpenBodyClass();
    };

    var _selectedBank = '';

    window.selectBank = function (bankName) {
        _selectedBank = bankName;

        var bs = document.getElementById('bankSelection');
        var ss = document.getElementById('scopeSelection');
        var cs = document.getElementById('connectionStatus');
        if (bs) bs.style.display = 'none';
        if (cs) cs.style.display = 'none';
        if (ss) ss.style.display = 'block';

        var bankLabel = document.getElementById('scopeBankName');
        if (bankLabel) bankLabel.textContent = bankName;

        var checklist = document.getElementById('scopeChecklist');
        if (checklist) {
            checklist.innerHTML = '';
            FDX_CONSENT_SCOPES.forEach(function (s) {
                var label = document.createElement('label');
                label.className = 'scope-item';

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = s.code;
                cb.checked = !!s.preselected;

                var textDiv = document.createElement('div');
                textDiv.className = 'scope-item-text';

                var nameSpan = document.createElement('div');
                nameSpan.className = 'scope-item-label';
                nameSpan.textContent = FDX_SCOPE_MAP[s.code] || s.code;

                var codeSpan = document.createElement('div');
                codeSpan.className = 'scope-item-code';
                codeSpan.textContent = s.code;

                textDiv.appendChild(nameSpan);
                textDiv.appendChild(codeSpan);
                label.appendChild(cb);
                label.appendChild(textDiv);
                checklist.appendChild(label);
            });
        }
    };

    function proceedWithScopes() {
        var checklist = document.getElementById('scopeChecklist');
        var selected = [];
        if (checklist) {
            checklist.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) {
                selected.push(cb.value);
            });
        }
        if (!selected.length) {
            showNotification('Select at least one data scope to continue.', 'warn');
            return;
        }

        var ss = document.getElementById('scopeSelection');
        var cs = document.getElementById('connectionStatus');
        if (ss) ss.style.display = 'none';
        if (cs) cs.style.display = 'block';

        var statusIcon = document.getElementById('statusIcon');
        var statusTitle = document.getElementById('statusTitle');
        var statusMessage = document.getElementById('statusMessage');

        if (statusIcon) {
            statusIcon.innerHTML = '\u23f3';
            statusIcon.className = 'status-icon status-loading';
        }
        if (statusTitle) statusTitle.textContent = 'Connecting\u2026';
        if (statusMessage) statusMessage.textContent = 'Securely authenticating with ' + _selectedBank + '\u2026';

        setTimeout(function () {
            if (statusIcon) {
                statusIcon.innerHTML = '\ud83d\udd10';
                statusIcon.className = 'status-icon status-loading';
            }
            if (statusTitle) statusTitle.textContent = 'Authenticating';
            if (statusMessage) statusMessage.textContent = 'Redirecting to ' + _selectedBank + ' OAuth flow\u2026';

            setPendingBankChoice(_selectedBank);

            var oauthUrl =
                '/api/auth/connect?bank=' + encodeURIComponent(_selectedBank) +
                '&access_types=' + encodeURIComponent(selected.join(','));

            setTimeout(function () {
                window.location.href = oauthUrl;
            }, 1000);
        }, 1000);
    }

    function scopeGoBack() {
        var bs = document.getElementById('bankSelection');
        var ss = document.getElementById('scopeSelection');
        if (ss) ss.style.display = 'none';
        if (bs) bs.style.display = 'block';
    }

    window.closeExternalDetailModal = closeExternalDetailModal;

    function showNotification(message, type) {
        var host = document.getElementById('toastHost');
        if (!host) return;
        var n = document.createElement('div');
        n.className = 'toast' + (type === 'success' ? '' : ' toast--warn');
        n.textContent = message;
        host.innerHTML = '';
        host.appendChild(n);
        requestAnimationFrame(function () {
            host.classList.add('is-visible');
        });
        setTimeout(function () {
            host.classList.remove('is-visible');
            setTimeout(function () {
                if (host.firstChild) host.removeChild(host.firstChild);
            }, 400);
        }, 3200);
    }

    function openAdminHub() {
        window.closeConnectionModal();
        closeExternalDetailModal();
        closeCashBreakdownModal();

        var m = document.getElementById('adminHubModal');
        if (!m) return;
        m.style.display = 'flex';
        m.classList.add('is-open');
        m.setAttribute('aria-hidden', 'false');
        syncModalOpenBodyClass();

        var statusDot = document.getElementById('adminHubDot');
        var statusText = document.getElementById('adminHubStatusText');
        var tokenBox = document.getElementById('adminHubTokenBox');
        var claimsDiv = document.getElementById('adminHubClaims');
        var copyBtn = document.getElementById('adminHubCopyBtn');

        if (statusDot) { statusDot.className = 'admin-hub-status__dot admin-hub-status__dot--inactive'; }
        if (statusText) { statusText.textContent = 'Checking session\u2026'; }
        if (tokenBox) { tokenBox.className = 'admin-hub-token-box admin-hub-token-box--empty'; tokenBox.textContent = 'Loading\u2026'; }
        if (claimsDiv) { claimsDiv.innerHTML = ''; }
        if (copyBtn) { copyBtn.disabled = true; copyBtn._jwt = ''; }

        fetch('/api/oauth/session')
            .then(function (res) {
                return res.json().then(function (data) { return { ok: res.ok, data: data }; });
            })
            .then(function (o) {
                if (!o.ok || !o.data.access_token) {
                    if (statusDot) statusDot.className = 'admin-hub-status__dot admin-hub-status__dot--inactive';
                    if (statusText) statusText.textContent = 'No active session';
                    if (tokenBox) { tokenBox.className = 'admin-hub-token-box admin-hub-token-box--empty'; tokenBox.textContent = 'No external bank connection. Connect your bank to generate a JWT.'; }
                    return;
                }

                var jwt = o.data.access_token;
                if (statusDot) statusDot.className = 'admin-hub-status__dot admin-hub-status__dot--active';
                if (statusText) statusText.textContent = 'Active session \u2014 ' + (o.data.bankDisplayName || o.data.bankName || 'External Bank');
                if (tokenBox) { tokenBox.className = 'admin-hub-token-box'; tokenBox.textContent = jwt; }
                if (copyBtn) { copyBtn.disabled = false; copyBtn._jwt = jwt; }

                if (o.data.access_token_format === 'jwt' && claimsDiv) {
                    try {
                        var parts = jwt.split('.');
                        var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                        var keys = ['sub', 'iss', 'aud', 'azp', 'scope', 'exp', 'iat'];
                        var html = '<table class="admin-hub-claims-table"><thead><tr><th>Claim</th><th>Value</th></tr></thead><tbody>';
                        keys.forEach(function (k) {
                            if (payload[k] !== undefined) {
                                var val = payload[k];
                                if (k === 'exp' || k === 'iat') {
                                    val = new Date(val * 1000).toLocaleString() + ' (' + val + ')';
                                } else if (Array.isArray(val)) {
                                    val = val.join(', ');
                                }
                                html += '<tr><td>' + k + '</td><td>' + String(val) + '</td></tr>';
                            }
                        });
                        html += '</tbody></table>';
                        claimsDiv.innerHTML = html;
                    } catch (e) { /* non-decodable token */ }
                }
            })
            .catch(function () {
                if (statusDot) statusDot.className = 'admin-hub-status__dot admin-hub-status__dot--inactive';
                if (statusText) statusText.textContent = 'Error loading session';
                if (tokenBox) { tokenBox.className = 'admin-hub-token-box admin-hub-token-box--empty'; tokenBox.textContent = 'Failed to reach server.'; }
            });
    }

    function closeAdminHub() {
        var m = document.getElementById('adminHubModal');
        if (m) {
            m.classList.remove('is-open');
            m.style.display = 'none';
            m.setAttribute('aria-hidden', 'true');
        }
        syncModalOpenBodyClass();
    }

    function openAdvisorModal() {
        window.closeConnectionModal();
        closeExternalDetailModal();
        closeCashBreakdownModal();
        closeAdminHub();

        var scopeList = document.getElementById('advisorScopeList');
        if (scopeList) {
            scopeList.innerHTML = '';
            var advisorScopes = [
                { code: 'ACCOUNT_BASIC', preselected: true },
                { code: 'TRANSACTIONS', preselected: true }
            ];
            advisorScopes.forEach(function (s) {
                var label = document.createElement('label');
                label.className = 'scope-item';
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = s.code;
                cb.checked = true;
                cb.disabled = true;
                var textDiv = document.createElement('div');
                textDiv.className = 'scope-item-text';
                var nameSpan = document.createElement('div');
                nameSpan.className = 'scope-item-label';
                nameSpan.textContent = FDX_SCOPE_MAP[s.code] || s.code;
                var codeSpan = document.createElement('div');
                codeSpan.className = 'scope-item-code';
                codeSpan.textContent = s.code;
                textDiv.appendChild(nameSpan);
                textDiv.appendChild(codeSpan);
                label.appendChild(cb);
                label.appendChild(textDiv);
                scopeList.appendChild(label);
            });
        }

        var m = document.getElementById('advisorModal');
        if (!m) return;
        m.style.display = 'flex';
        m.classList.add('is-open');
        m.setAttribute('aria-hidden', 'false');
        syncModalOpenBodyClass();

        var badge = document.getElementById('notifBadge');
        var btn = document.getElementById('notifBtn');
        if (badge) badge.style.display = 'none';
        if (btn) btn.classList.remove('has-alert');
    }

    function closeAdvisorModal() {
        var m = document.getElementById('advisorModal');
        if (m) {
            m.classList.remove('is-open');
            m.style.display = 'none';
            m.setAttribute('aria-hidden', 'true');
        }
        syncModalOpenBodyClass();
    }

    function advisorAuthorize() {
        closeAdvisorModal();
        _selectedBank = 'TD';
        setPendingBankChoice('TD');
        var scopes = ['ACCOUNT_BASIC', 'TRANSACTIONS'];
        var oauthUrl =
            '/api/auth/connect?bank=' + encodeURIComponent('TD') +
            '&access_types=' + encodeURIComponent(scopes.join(','));
        window.location.href = oauthUrl;
    }

    function wireDom() {
        var qlToggle = document.getElementById('quickLinksToggle');
        var qlDropdown = document.getElementById('quickLinksDropdown');
        var qlConnectBtn = document.getElementById('quickLinksConnectBtn');
        var userBtn = document.getElementById('userMenuBtn');
        var userDropdown = document.getElementById('userMenuDropdown');
        var notifBtn = document.getElementById('notifBtn');
        var notifDropdown = document.getElementById('notifDropdown');
        var notifItem1 = document.getElementById('notifItem1');

        function closeQuickLinksDropdown() {
            if (!qlToggle || !qlDropdown) return;
            qlToggle.setAttribute('aria-expanded', 'false');
            qlDropdown.hidden = true;
        }

        function closeNotifDropdown() {
            if (!notifBtn || !notifDropdown) return;
            notifBtn.setAttribute('aria-expanded', 'false');
            notifDropdown.hidden = true;
        }

        function closeUserMenu() {
            if (!userBtn || !userDropdown) return;
            userBtn.setAttribute('aria-expanded', 'false');
            userDropdown.hidden = true;
        }

        function closeAllHeaderDropdowns() {
            closeUserMenu();
            closeQuickLinksDropdown();
            closeNotifDropdown();
        }

        function toggleQuickLinksDropdown() {
            if (!qlToggle || !qlDropdown) return;
            var open = qlDropdown.hidden;
            closeUserMenu();
            closeNotifDropdown();
            qlToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            qlDropdown.hidden = !open;
        }

        function toggleNotifDropdown() {
            if (!notifBtn || !notifDropdown) return;
            var open = notifDropdown.hidden;
            closeUserMenu();
            closeQuickLinksDropdown();
            notifBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            notifDropdown.hidden = !open;
        }

        function toggleUserMenu() {
            if (!userBtn || !userDropdown) return;
            var open = userDropdown.hidden;
            closeQuickLinksDropdown();
            closeNotifDropdown();
            userBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            userDropdown.hidden = !open;
        }

        if (qlToggle && qlDropdown) {
            qlToggle.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleQuickLinksDropdown();
            });
            qlDropdown.addEventListener('click', function (e) {
                e.stopPropagation();
            });
        }

        if (qlConnectBtn) {
            qlConnectBtn.addEventListener('click', function () {
                closeQuickLinksDropdown();
                if (typeof window.openConnectionModal === 'function') {
                    window.openConnectionModal();
                }
            });
        }

        var qlAdminBtn = document.getElementById('quickLinksAdminHubBtn');
        if (qlAdminBtn) {
            qlAdminBtn.addEventListener('click', function () {
                closeQuickLinksDropdown();
                openAdminHub();
            });
        }

        var scopeBackBtn = document.getElementById('scopeBackBtn');
        if (scopeBackBtn) {
            scopeBackBtn.addEventListener('click', function () {
                scopeGoBack();
            });
        }

        var scopeProceedBtn = document.getElementById('scopeProceedBtn');
        if (scopeProceedBtn) {
            scopeProceedBtn.addEventListener('click', function () {
                proceedWithScopes();
            });
        }

        if (notifBtn && notifDropdown) {
            notifBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleNotifDropdown();
            });
            notifDropdown.addEventListener('click', function (e) {
                e.stopPropagation();
            });
        }

        if (notifItem1) {
            notifItem1.addEventListener('click', function () {
                closeNotifDropdown();
                openAdvisorModal();
            });
        }

        var extPlus = document.getElementById('externalCardPlusBtn');
        if (extPlus) {
            extPlus.addEventListener('click', function (e) {
                e.stopPropagation();
                if (typeof window.openConnectionModal === 'function') {
                    window.openConnectionModal();
                }
            });
        }

        if (userBtn && userDropdown) {
            userDropdown.addEventListener('click', function (e) {
                e.stopPropagation();
            });
            userBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleUserMenu();
            });
            userDropdown.querySelectorAll('[data-demo-action]').forEach(function (item) {
                item.addEventListener('click', function () {
                    var act = item.getAttribute('data-demo-action');
                    var labels = {
                        preferences: 'Preferences (demo)',
                        security: 'Security (demo)',
                        help: 'Help & support (demo)',
                        signout: 'Sign out (demo)'
                    };
                    showNotification(labels[act] || 'Action (demo)', 'success');
                    closeUserMenu();
                });
            });
        }

        document.addEventListener('click', function () {
            closeAllHeaderDropdowns();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var adminM = document.getElementById('adminHubModal');
                if (adminM && adminM.classList.contains('is-open')) {
                    closeAdminHub();
                    return;
                }
                var cashM = document.getElementById('cashBreakdownModal');
                if (cashM && cashM.classList.contains('is-open')) {
                    closeCashBreakdownModal();
                    return;
                }
                closeAllHeaderDropdowns();
            }
        });

        var connModal = document.getElementById('connectionModal');
        if (connModal) {
            connModal.addEventListener('click', function (e) {
                if (e.target.id === 'connectionModal') {
                    window.closeConnectionModal();
                }
            });
        }

        var extModal = document.getElementById('externalDetailModal');
        if (extModal) {
            extModal.addEventListener('click', function (e) {
                if (e.target.id === 'externalDetailModal') {
                    closeExternalDetailModal();
                }
            });
        }

        var adminModal = document.getElementById('adminHubModal');
        if (adminModal) {
            adminModal.addEventListener('click', function (e) {
                if (e.target.id === 'adminHubModal') {
                    closeAdminHub();
                }
            });
        }

        var adminClose = document.getElementById('adminHubCloseBtn');
        if (adminClose) {
            adminClose.addEventListener('click', function () {
                closeAdminHub();
            });
        }

        var adminCopy = document.getElementById('adminHubCopyBtn');
        if (adminCopy) {
            adminCopy.addEventListener('click', function () {
                var jwt = adminCopy._jwt;
                if (!jwt) return;
                navigator.clipboard.writeText(jwt).then(function () {
                    adminCopy.textContent = 'Copied!';
                    setTimeout(function () { adminCopy.textContent = 'Copy JWT'; }, 1800);
                }).catch(function () {
                    showNotification('Clipboard copy failed', 'warn');
                });
            });
        }

        var cashModal = document.getElementById('cashBreakdownModal');
        if (cashModal) {
            cashModal.addEventListener('click', function (e) {
                if (e.target.id === 'cashBreakdownModal') {
                    closeCashBreakdownModal();
                }
            });
        }

        var cashClose = document.getElementById('cashBreakdownCloseBtn');
        if (cashClose) {
            cashClose.addEventListener('click', function () {
                closeCashBreakdownModal();
            });
        }

        var cashCard = document.getElementById('cashCard');
        if (cashCard) {
            cashCard.addEventListener('click', function (e) {
                if (e.target.closest('.card-refresh-btn')) return;
                openCashBreakdownModal();
            });
        }

        var cashRefresh = document.getElementById('cashRefreshBtn');
        if (cashRefresh) {
            cashRefresh.addEventListener('click', function (e) {
                e.stopPropagation();
                loadAccountData();
            });
        }

        var cashDrillSyncTd = document.getElementById('cashDrillSyncTdBtn');
        if (cashDrillSyncTd) {
            cashDrillSyncTd.addEventListener('click', function (e) {
                e.stopPropagation();
                refreshCashBalances().then(function () {
                    showNotification('Linked balances refreshed.', 'success');
                });
            });
        }

        var txnRefresh = document.getElementById('txnRefreshBtn');
        if (txnRefresh) {
            txnRefresh.addEventListener('click', function () {
                refreshAllTransactions();
            });
        }

        var txnTabBmo = document.getElementById('txnTabBmo');
        if (txnTabBmo) {
            txnTabBmo.addEventListener('click', function () {
                setTxnTabActive('bmo');
            });
        }
        var txnTabExt = document.getElementById('txnTabExt');
        if (txnTabExt) {
            txnTabExt.addEventListener('click', function () {
                if (txnTabExt.hidden) return;
                setTxnTabActive('ext');
                loadExtTransactionsOnTabClick();
            });
        }

        var extClose = document.getElementById('externalDetailCloseBtn');
        if (extClose) {
            extClose.addEventListener('click', function () {
                closeExternalDetailModal();
            });
        }

        var extBody = document.getElementById('externalCardBody');
        if (extBody) {
            extBody.addEventListener('click', function () {
                if (getStoredConnection()) {
                    openExternalDetailModal();
                }
            });
            extBody.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (getStoredConnection()) {
                        openExternalDetailModal();
                    }
                }
            });
        }

        function wireInfoBtn(btnId, tipId) {
            var btn = document.getElementById(btnId);
            var tip = document.getElementById(tipId);
            if (!btn || !tip) return;
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                tip.classList.toggle('is-visible');
            });
        }
        wireInfoBtn('overviewInfoBtn', 'overviewInfoTip');
        wireInfoBtn('cashInfoBtn', 'cashInfoTip');
        wireInfoBtn('txnInfoBtn', 'txnInfoTip');

        var advisorCloseBtn = document.getElementById('advisorCloseBtn');
        if (advisorCloseBtn) advisorCloseBtn.addEventListener('click', closeAdvisorModal);
        var advisorDeclineBtn = document.getElementById('advisorDeclineBtn');
        if (advisorDeclineBtn) advisorDeclineBtn.addEventListener('click', function () {
            closeAdvisorModal();
            showNotification('You can authorize this later from Quick Links.', 'warn');
        });
        var advisorAuthBtn = document.getElementById('advisorAuthorizeBtn');
        if (advisorAuthBtn) advisorAuthBtn.addEventListener('click', advisorAuthorize);
        var advisorOverlay = document.getElementById('advisorModal');
        if (advisorOverlay) advisorOverlay.addEventListener('click', function (e) {
            if (e.target.id === 'advisorModal') closeAdvisorModal();
        });

    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireDom);
    } else {
        wireDom();
    }

    window.addEventListener('load', function () {
        handleOAuthReturn()
            .then(function () {
                return tryHydrateConnectionFromServer();
            })
            .then(function () {
                return syncOAuthSessionToLocal();
            })
            .then(function () {
                maybeMigrateStoredConnection();
                renderExternalConnections();
                var conn = getStoredConnection();
                if (conn) {
                    showExtTab(conn);
                } else {
                    hideExtTab();
                }
                setTimeout(function () {
                    loadAccountData();
                    loadBmoTransactions();
                }, 300);
            })
            .catch(function (err) {
                console.error('BMO UI bootstrap error', err);
            });
    });
})();
