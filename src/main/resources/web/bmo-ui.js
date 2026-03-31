(function () {
    'use strict';

    var LS_KEY = 'ob_external_connection_v1';

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
        localStorage.setItem(LS_KEY, JSON.stringify(conn));
    }

    function bankLogoLabel(bankName) {
        var n = (bankName || '').toUpperCase();
        if (n.indexOf('RBC') !== -1 || n.indexOf('ROYAL') !== -1) return 'RBC';
        if (n.indexOf('TD') !== -1) return 'TD';
        if (n.indexOf('SCOTIA') !== -1 || n.indexOf('SCO') !== -1) return 'SCO';
        if (n.indexOf('CIBC') !== -1 || n.indexOf('CIB') !== -1) return 'CIB';
        return (bankName || 'BANK').slice(0, 3).toUpperCase();
    }

    function renderExternalConnections() {
        var conn = getStoredConnection();
        var countEl = document.getElementById('accountCount');
        var descEl = document.getElementById('externalCardDesc');
        var card = document.getElementById('externalConnectionsCard');
        var panel = document.getElementById('externalConnectionPanel');

        if (!countEl || !descEl || !card || !panel) return;

        var n = conn ? 1 : 0;
        countEl.textContent = String(n);
        descEl.textContent = n ? '1 active connection' : 'No connections yet';
        card.classList.toggle('card--interactive', n > 0);
        card.setAttribute('aria-expanded', n ? 'false' : 'false');

        if (!conn) {
            panel.hidden = true;
            return;
        }

        document.getElementById('detailBankLogo').textContent = bankLogoLabel(conn.bankName);
        document.getElementById('detailBankName').textContent = conn.bankName || 'External bank';
        var ul = document.getElementById('detailScopesList');
        ul.innerHTML = '';
        (conn.scopes || []).forEach(function (s) {
            var li = document.createElement('li');
            li.className = 'scope-chip';
            li.textContent = s;
            ul.appendChild(li);
        });
    }

    function toggleExternalPanel() {
        var conn = getStoredConnection();
        if (!conn) return;
        var panel = document.getElementById('externalConnectionPanel');
        var card = document.getElementById('externalConnectionsCard');
        var open = panel.hidden;
        panel.hidden = !open;
        card.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function disconnectExternal() {
        localStorage.removeItem(LS_KEY);
        fetch('/api/oauth/disconnect', { method: 'POST' }).catch(function () { /* ignore */ });
        var panel = document.getElementById('externalConnectionPanel');
        var card = document.getElementById('externalConnectionsCard');
        if (panel) panel.hidden = true;
        if (card) card.setAttribute('aria-expanded', 'false');
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
            .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
            .then(function (o) {
                if (!o.res.ok || !o.data.access_token) {
                    showNotification('Could not read session from server. Try Connect again.', 'warn');
                    window.history.replaceState({}, '', '/');
                    return;
                }
                var scopes = scopesFromUrl.length ? scopesFromUrl : (o.data.requested_scopes || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                saveConnection({
                    accessToken: o.data.access_token,
                    idToken: o.data.id_token || null,
                    tokenType: o.data.token_type || 'Bearer',
                    bankName: bankFromUrl || o.data.bankName || 'External bank',
                    scopes: scopes,
                    sessionId: o.data.session_id || null,
                    connectedAt: new Date().toISOString()
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
                var scopes = (data.requested_scopes || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                saveConnection({
                    accessToken: data.access_token,
                    idToken: data.id_token || null,
                    tokenType: data.token_type || 'Bearer',
                    bankName: data.bankName || 'External bank',
                    scopes: scopes,
                    sessionId: data.session_id || null,
                    connectedAt: new Date().toISOString()
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
            .then(function (response) { return response.json(); })
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
            var totalBalance = accounts.reduce(function (sum, acc) { return sum + acc.balance; }, 0);
            var tb = document.getElementById('totalBalance');
            if (tb) {
                tb.textContent = '$' + totalBalance.toLocaleString('en-CA') + ' CAD';
            }
            if (cashDesc) {
                cashDesc.textContent = 'Total across ' + accounts.length + ' BMO demo accounts';
            }
        }
    }

    function loadAccountData() {
        return testEndpoint('/api/accounts', 'accounts');
    }

    window.openConnectionModal = function () {
        var el = document.getElementById('connectionModal');
        if (!el) return;
        el.style.display = 'flex';
        el.classList.add('is-open');
        document.body.classList.add('modal-open');
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
        document.body.classList.remove('modal-open');
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

            var oauthUrl = '/api/auth/connect?bank=' + encodeURIComponent(bankName) + '&access_types=ACCOUNT_BASIC,TRANSACTIONS';

            setTimeout(function () {
                window.location.href = oauthUrl;
            }, 1000);
        }, 1000);
    };

    window.testEndpoint = testEndpoint;

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
        var modal = document.getElementById('connectionModal');
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target.id === 'connectionModal') {
                    window.closeConnectionModal();
                }
            });
        }
        var ext = document.getElementById('externalConnectionsCard');
        if (ext) {
            ext.addEventListener('click', function () {
                toggleExternalPanel();
            });
            ext.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExternalPanel();
                }
            });
        }
        var btn = document.getElementById('btnDisconnectConnection');
        if (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                disconnectExternal();
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
            .then(function () { return tryHydrateConnectionFromServer(); })
            .then(function () {
                renderExternalConnections();
                setTimeout(function () { loadAccountData(); }, 500);
            })
            .catch(function (err) {
                console.error('BMO UI bootstrap error', err);
            });
    });
})();
