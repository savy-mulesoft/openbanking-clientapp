(function () {
    'use strict';

    var LS_KEY = 'ob_external_connection_v1';

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

    /** FDX consent scopes — human-readable (aligned with server /api/auth/connect mapping) */
    function fdxHumanLabel(code) {
        var c = String(code || '')
            .trim()
            .toUpperCase();
        var map = {
            ACCOUNT_BASIC: 'Account balances',
            TRANSACTIONS: 'Transactions',
            CUSTOMER_CONTACT: 'Contact details'
        };
        return map[c] || null;
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

    function normalizeConnectionForSave(obj) {
        var bankBrand = obj.bankBrand || bankBrandKey(obj.bankName);
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
            bankName: obj.bankName || 'External bank',
            bankDisplayName: obj.bankDisplayName || bankDisplayName(obj.bankName, bankBrand),
            bankBrand: bankBrand,
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
        switch (key) {
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
        var url = BANK_LOGO_URLS[brand];
        if (!url) {
            container.innerHTML = bankLogoSvgHtml(brand);
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
            container.innerHTML = bankLogoSvgHtml(brand);
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
        var open =
            (conn && conn.classList.contains('is-open')) ||
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
        var m = document.getElementById('cashBreakdownModal');
        if (!m) return;
        m.style.display = 'flex';
        m.classList.add('is-open');
        m.setAttribute('aria-hidden', 'false');
        syncModalOpenBodyClass();
        loadAccountData();
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

        var brand = conn.bankBrand || bankBrandKey(conn.bankName);
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
        fetch('/api/oauth/disconnect', { method: 'POST' }).catch(function () { /* ignore */ });
        closeExternalDetailModal();
        renderExternalConnections();
        showNotification('Connection removed. Connect again to link your bank.', 'success');
    }

    function handleOAuthReturn() {
        var params = new URLSearchParams(window.location.search);
        var status = params.get('status');
        if (status === 'error') {
            var err = params.get('error') || 'unknown';
            showNotification('Connection failed: ' + err, 'warn');
            window.history.replaceState({}, '', '/');
            return Promise.resolve();
        }
        if (status !== 'success') return Promise.resolve();

        var bankFromUrl = params.get('bank') || '';
        var scopesFromUrl = (params.get('scopes') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);

        return fetch('/api/oauth/session')
            .then(function (res) {
                return res.json().then(function (data) {
                    return { res: res, data: data };
                });
            })
            .then(function (o) {
                if (!o.res.ok || !o.data.access_token) {
                    showNotification('Could not read session from server. Try Connect again.', 'warn');
                    window.history.replaceState({}, '', '/');
                    return;
                }
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
                saveConnection({
                    accessToken: o.data.access_token,
                    idToken: o.data.id_token || null,
                    tokenType: o.data.token_type || 'Bearer',
                    bankName: bankFromUrl || o.data.bankName || 'External bank',
                    bankDisplayName: o.data.bankDisplayName || null,
                    bankBrand: o.data.bankBrand || null,
                    scopes: tech,
                    scopesTechnical: tech,
                    scopesHuman: human,
                    sessionId: o.data.session_id || null,
                    connectedAt: new Date().toISOString(),
                    tokenShape: o.data.access_token_format || null
                });
                showNotification('Bank connected successfully.', 'success');
                window.history.replaceState({}, '', '/');
            })
            .catch(function (e) {
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
                var tech = coerceArray(data.scopes_technical);
                if (!tech.length) {
                    tech = (data.requested_scopes || '')
                        .split(',')
                        .map(function (s) {
                            return s.trim();
                        })
                        .filter(Boolean);
                }
                saveConnection({
                    accessToken: data.access_token,
                    idToken: data.id_token || null,
                    tokenType: data.token_type || 'Bearer',
                    bankName: data.bankName || 'External bank',
                    bankDisplayName: data.bankDisplayName || null,
                    bankBrand: data.bankBrand || null,
                    scopes: tech,
                    scopesTechnical: tech,
                    scopesHuman: coerceArray(data.scopes_human),
                    sessionId: data.session_id || null,
                    connectedAt: new Date().toISOString(),
                    tokenShape: data.access_token_format || null
                });
            })
            .catch(function () { /* ignore */ });
    }

    function testEndpoint(endpoint, type) {
        var loadingEl = document.getElementById(type + '-loading');
        var resultsEl = document.getElementById(type + '-results');
        if (!loadingEl || !resultsEl) return Promise.resolve();

        loadingEl.style.display = 'block';
        resultsEl.style.display = 'none';

        return fetch(endpoint)
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                resultsEl.textContent = JSON.stringify(data, null, 2);
                resultsEl.style.display = 'block';
                if (type === 'accounts') {
                    updateOverview(data);
                }
            })
            .catch(function (error) {
                resultsEl.textContent = 'Error: ' + error.message;
                resultsEl.style.display = 'block';
            })
            .then(function () {
                loadingEl.style.display = 'none';
            });
    }

    function updateOverview(accountsData) {
        var cashDesc = document.getElementById('cashCardDesc');
        if (accountsData && accountsData.accounts) {
            var accounts = accountsData.accounts;
            var totalBalance = accounts.reduce(function (sum, acc) {
                return sum + acc.balance;
            }, 0);
            var tb = document.getElementById('totalBalance');
            if (tb) {
                tb.textContent = '$' + totalBalance.toLocaleString('en-CA') + ' CAD';
            }
            if (cashDesc) {
                cashDesc.textContent = 'Total across all linked accounts';
            }
        }
    }

    function loadAccountData() {
        return testEndpoint('/api/accounts', 'accounts');
    }

    window.openConnectionModal = function () {
        var el = document.getElementById('connectionModal');
        if (!el) return;
        closeExternalDetailModal();
        closeCashBreakdownModal();
        el.style.display = 'flex';
        el.classList.add('is-open');
        syncModalOpenBodyClass();
        var bs = document.getElementById('bankSelection');
        var cs = document.getElementById('connectionStatus');
        if (bs) bs.style.display = 'block';
        if (cs) cs.style.display = 'none';
    };

    window.closeConnectionModal = function () {
        var el = document.getElementById('connectionModal');
        if (!el) return;
        el.classList.remove('is-open');
        el.style.display = 'none';
        syncModalOpenBodyClass();
    };

    window.selectBank = function (bankName) {
        var bs = document.getElementById('bankSelection');
        var cs = document.getElementById('connectionStatus');
        if (bs) bs.style.display = 'none';
        if (cs) cs.style.display = 'block';

        var statusIcon = document.getElementById('statusIcon');
        var statusTitle = document.getElementById('statusTitle');
        var statusMessage = document.getElementById('statusMessage');

        if (statusIcon) {
            statusIcon.innerHTML = '\u23f3';
            statusIcon.className = 'status-icon status-loading';
        }
        if (statusTitle) statusTitle.textContent = 'Connecting\u2026';
        if (statusMessage) statusMessage.textContent = 'Securely authenticating with ' + bankName + '\u2026';

        setTimeout(function () {
            if (statusIcon) {
                statusIcon.innerHTML = '\ud83d\udd10';
                statusIcon.className = 'status-icon status-loading';
            }
            if (statusTitle) statusTitle.textContent = 'Authenticating';
            if (statusMessage) statusMessage.textContent = 'Redirecting to ' + bankName + ' OAuth flow\u2026';

            var oauthUrl =
                '/api/auth/connect?bank=' + encodeURIComponent(bankName) + '&access_types=ACCOUNT_BASIC,TRANSACTIONS';

            setTimeout(function () {
                window.location.href = oauthUrl;
            }, 1000);
        }, 1000);
    };

    window.testEndpoint = testEndpoint;
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
                showNotification(
                    'Important message from your Advisor — Authorize Account Consolidation',
                    'warn'
                );
                closeNotifDropdown();
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

        var cashRefresh = document.getElementById('cashRefreshBtn');
        if (cashRefresh) {
            cashRefresh.addEventListener('click', function (e) {
                e.stopPropagation();
                openCashBreakdownModal();
            });
        }

        var cashDrillSyncTd = document.getElementById('cashDrillSyncTdBtn');
        if (cashDrillSyncTd) {
            cashDrillSyncTd.addEventListener('click', function () {
                showNotification('TD balances sync queued (demo).', 'success');
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
                renderExternalConnections();
                setTimeout(function () {
                    loadAccountData();
                }, 500);
            })
            .catch(function (err) {
                console.error('BMO UI bootstrap error', err);
            });
    });
})();
