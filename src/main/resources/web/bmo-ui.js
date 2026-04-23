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

    /** Promo + advisor unread state is in-memory only → every full page load shows 2 until opened. */
    var _notifPromoRead = false;
    var _notifAdvisorRead = false;
    /** true = user has read the smart-offers notification (third row). */
    var _notifSmartOffersRead = true;
    /** Demo: smart offers are not persisted; session-only flags. */
    var _smartOffersShownThisSession = false;
    var _smartOffersBannerDismissed = false;
    var _smartOffersEligibleAtMs = null;
    var _demoObsoleteLsPurged = false;

    function purgeDemoObsoleteLocalKeysOnce() {
        if (_demoObsoleteLsPurged) {
            return;
        }
        _demoObsoleteLsPurged = true;
        try {
            [
                'ob_notif_read_v3',
                'ob_notif_read_v2',
                'ob_notif_read_v1',
                'ob_notif_smart_row_v1',
                'ob_smart_offers_shown_v1',
                'ob_smart_offers_eligible_at_ms',
                'ob_smart_offers_banner_dismissed_v1'
            ].forEach(function (k) {
                localStorage.removeItem(k);
            });
        } catch (e) { /* ignore */ }
    }

    function getNotifReadState() {
        purgeDemoObsoleteLocalKeysOnce();
        return {
            advisor: _notifAdvisorRead,
            promo: _notifPromoRead,
            smartOffers: _notifSmartOffersRead
        };
    }

    function markNotifRead(which) {
        if (which === 'advisor') {
            _notifAdvisorRead = true;
        }
        if (which === 'promo') {
            _notifPromoRead = true;
        }
        if (which === 'smartOffers') {
            _notifSmartOffersRead = true;
        }
        refreshNotifUi();
    }

    function refreshNotifUi() {
        var s = getNotifReadState();
        var itemOffers = document.getElementById('notifItemSmartOffers');
        var offersUnread = itemOffers ? !s.smartOffers : false;
        var unread = (!s.advisor ? 1 : 0) + (!s.promo ? 1 : 0) + (offersUnread ? 1 : 0);
        var badge = document.getElementById('notifBadge');
        var btn = document.getElementById('notifBtn');
        var itemA = document.getElementById('notifItemAdvisor');
        var itemP = document.getElementById('notifItemPromo');
        if (itemA) {
            itemA.classList.toggle('notif-entry--unread', !s.advisor);
            itemA.classList.toggle('notif-entry--read', s.advisor);
        }
        if (itemP) {
            itemP.classList.toggle('notif-entry--unread', !s.promo);
            itemP.classList.toggle('notif-entry--read', s.promo);
        }
        if (itemOffers) {
            itemOffers.classList.toggle('notif-entry--unread', !s.smartOffers);
            itemOffers.classList.toggle('notif-entry--read', s.smartOffers);
        }
        if (badge) {
            badge.removeAttribute('style');
            badge.textContent = String(unread);
            if (unread === 0) {
                badge.setAttribute('hidden', '');
            } else {
                badge.removeAttribute('hidden');
            }
        }
        if (btn) {
            if (unread === 0) {
                btn.classList.remove('has-alert');
                btn.setAttribute('aria-label', 'Notifications');
            } else {
                btn.classList.add('has-alert');
                btn.setAttribute('aria-label', 'Notifications, ' + unread + ' unread');
            }
        }
    }

    function getUserFirstName() {
        var el = document.querySelector('.header-user-btn__name');
        if (!el || !el.textContent) return 'there';
        var parts = String(el.textContent).trim().split(/\s+/);
        return parts[0] || 'there';
    }

    function scheduleSmartOffersReveal() {
        if (_smartOffersShownThisSession) {
            return;
        }
        _smartOffersEligibleAtMs = Date.now() + 15000;
    }

    function clearSmartOffersSchedule() {
        _smartOffersEligibleAtMs = null;
    }

    function maybeRevealSmartOffers() {
        if (_smartOffersShownThisSession) {
            return;
        }
        if (!_smartOffersEligibleAtMs) {
            return;
        }
        var conn = getStoredConnection();
        if (!conn) {
            clearSmartOffersSchedule();
            return;
        }
        var wait = _smartOffersEligibleAtMs - Date.now();
        if (wait > 0) {
            setTimeout(maybeRevealSmartOffers, Math.min(wait + 50, 2147483647));
            return;
        }
        revealSmartOffersUi();
    }

    function revealSmartOffersUi() {
        _smartOffersShownThisSession = true;
        clearSmartOffersSchedule();

        var banner = document.getElementById('smartOffersBanner');
        var name = getUserFirstName();
        var line = document.getElementById('smartOffersBannerLine');
        if (line) {
            line.textContent = 'New offers unlocked for you, ' + name + '!';
        }
        if (banner) {
            banner.hidden = _smartOffersBannerDismissed;
        }

        _notifSmartOffersRead = false;
        ensureSmartOffersNotifRow();
        refreshNotifUi();
    }

    function dismissSmartOffersBanner() {
        var banner = document.getElementById('smartOffersBanner');
        if (banner) {
            banner.hidden = true;
        }
        _smartOffersBannerDismissed = true;
    }

    function removeSmartOffersNotifRow() {
        var el = document.getElementById('notifItemSmartOffers');
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }

    function resetSmartOffersSessionState() {
        clearSmartOffersSchedule();
        _smartOffersShownThisSession = false;
        _smartOffersBannerDismissed = false;
        _notifSmartOffersRead = true;
        removeSmartOffersNotifRow();
        var banner = document.getElementById('smartOffersBanner');
        if (banner) {
            banner.hidden = true;
        }
        refreshNotifUi();
    }

    function openSmartOffersModal() {
        var m = document.getElementById('smartOffersModal');
        if (!m) return;
        markNotifRead('smartOffers');
        if (typeof window.closeConnectionModal === 'function') {
            window.closeConnectionModal();
        }
        closePromoModal();
        closeAdvisorModal();
        m.style.display = 'flex';
        m.classList.add('is-open');
        m.setAttribute('aria-hidden', 'false');
        syncModalOpenBodyClass();
    }

    function closeSmartOffersModal() {
        var m = document.getElementById('smartOffersModal');
        if (m) {
            m.classList.remove('is-open');
            m.style.display = 'none';
            m.setAttribute('aria-hidden', 'true');
        }
        syncModalOpenBodyClass();
    }

    /**
     * Smart-offers notification row is not in the static HTML—it is injected only when
     * the one-time reveal runs (~15s after OAuth success) or when restoring after reload.
     */
    function ensureSmartOffersNotifRow() {
        var existing = document.getElementById('notifItemSmartOffers');
        if (existing) return existing;
        var drop = document.getElementById('notifDropdown');
        if (!drop) return null;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'notifItemSmartOffers';
        btn.className = 'notif-entry notif-entry--unread';
        btn.setAttribute('role', 'menuitem');
        btn.innerHTML =
            '<span class="notif-entry__icon notif-entry__icon--promo" aria-hidden="true" style="font-size:11px;">%</span>' +
            '<span class="notif-entry__body">' +
            '<span class="notif-entry__title">New offers unlocked</span>' +
            '<span class="notif-entry__meta">Personalized for you based on your linked data</span>' +
            '</span>';
        drop.appendChild(btn);
        return btn;
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
        var ex = d.externalBankId != null ? String(d.externalBankId).trim() : '';
        if (!ex && d.external_bank_id != null) {
            ex = String(d.external_bank_id).trim();
        }
        return {
            bankName: bn,
            bankDisplayName: bd || null,
            bankBrand: br != null ? br : null,
            externalBankId: ex || null
        };
    }

    /** Loaded from /web/bank-brands.json (primary bank + fictional external institutions). */
    var BRANDS = null;
    var _brandsReady = null;
    var _uiBrandingApplied = false;

    var DEFAULT_BRANDS = {
        pageTitle: 'Synapse Bank Open Banking',
        primary: {
            displayName: 'Synapse Bank',
            shortName: 'Synapse',
            legalName: 'Synapse Bank Inc.',
            appTitle: 'Open Banking',
            appSubtitle: 'Proof of concept',
            logoUrl: '/web/images/logo_synapse_new.png',
            logoAlt: 'Synapse Bank',
            advisorAffiliation: 'Synapse Private Banking',
            cashbackPromotionUrl: 'https://www.synapsebank.com/promotions/100-cashback',
            openBankingPrivacyPolicyUrl: 'https://www.synapsebank.com/legal/open-banking-privacy'
        },
        advisorExternalBankId: 'summit_first',
        externalBanks: [
            {
                id: 'summit_first',
                displayName: 'Summit First Bank',
                shortName: 'Summit',
                tagline: 'Everyday personal & business banking',
                oauthBankCode: 'TD',
                logoSvg:
                    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#2d6a4f'/><text x='32' y='42' text-anchor='middle' fill='#fff' font-family='system-ui,sans-serif' font-size='14' font-weight='700'>SF</text></svg>"
            },
            {
                id: 'wealth_financial',
                displayName: 'W. Wealth Financial',
                shortName: 'Wealth',
                tagline: 'Private wealth & investing',
                oauthBankCode: 'TD',
                logoSvg:
                    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#2c1810'/><text x='32' y='42' text-anchor='middle' fill='#f5f0e6' font-family='Georgia,serif' font-size='18' font-weight='700'>W</text></svg>"
            },
            {
                id: 'harborline_cu',
                displayName: 'Harborline Credit Union',
                shortName: 'Harborline',
                tagline: 'Coastal community banking',
                oauthBankCode: 'TD',
                logoSvg:
                    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#1e6091'/><text x='32' y='42' text-anchor='middle' fill='#fff' font-family='system-ui,sans-serif' font-size='11' font-weight='700'>HL</text></svg>"
            },
            {
                id: 'northstar_direct',
                displayName: 'NorthStar Direct Bank',
                shortName: 'NorthStar',
                tagline: 'Digital-first everyday banking',
                oauthBankCode: 'TD',
                logoSvg:
                    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#0f172a'/><text x='32' y='42' text-anchor='middle' fill='#38bdf8' font-family='system-ui,sans-serif' font-size='12' font-weight='700'>NS</text></svg>"
            },
            {
                id: 'maple_one',
                displayName: 'Maple One Financial',
                shortName: 'Maple One',
                tagline: 'Canadian roots, modern tools',
                oauthBankCode: 'TD',
                logoSvg:
                    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#14532d'/><text x='32' y='42' text-anchor='middle' fill='#86efac' font-family='system-ui,sans-serif' font-size='11' font-weight='700'>M1</text></svg>"
            },
            {
                id: 'civic_trust',
                displayName: 'Civic Trust Bank',
                shortName: 'Civic',
                tagline: 'Public sector and professional banking',
                oauthBankCode: 'TD',
                logoSvg:
                    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#1e3a5f'/><text x='32' y='42' text-anchor='middle' fill='#e2e8f0' font-family='system-ui,sans-serif' font-size='12' font-weight='700'>CV</text></svg>"
            },
            {
                id: 'brightway_cu',
                displayName: 'Brightway Credit Union',
                shortName: 'Brightway',
                tagline: 'Member rewards and low-fee accounts',
                oauthBankCode: 'TD',
                logoSvg:
                    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#f59e0b'/><text x='32' y='42' text-anchor='middle' fill='#fff' font-family='system-ui,sans-serif' font-size='11' font-weight='700'>BW</text></svg>"
            },
            {
                id: 'acme_trust',
                displayName: 'Acme Community Trust',
                shortName: 'Acme',
                tagline: 'Member-owned banking for your neighbourhood',
                oauthBankCode: 'TD',
                logoSvg:
                    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#1d3557'/><text x='32' y='42' text-anchor='middle' fill='#f1faee' font-family='system-ui,sans-serif' font-size='14' font-weight='700'>AC</text></svg>"
            }
        ]
    };

    function ensureBrands() {
        if (_brandsReady) {
            return _brandsReady;
        }
        _brandsReady = fetch('/web/bank-brands.json')
            .then(function (res) {
                if (!res.ok) {
                    throw new Error('brands');
                }
                return res.json();
            })
            .then(function (j) {
                BRANDS = j;
            })
            .catch(function () {
                BRANDS = DEFAULT_BRANDS;
            });
        return _brandsReady;
    }

    function getExternalBank(id) {
        if (!BRANDS || !BRANDS.externalBanks || !id) {
            return null;
        }
        var sid = String(id).trim();
        for (var i = 0; i < BRANDS.externalBanks.length; i++) {
            if (BRANDS.externalBanks[i].id === sid) {
                return BRANDS.externalBanks[i];
            }
        }
        return null;
    }

    function svgToDataUri(svg) {
        if (!svg) {
            return '';
        }
        try {
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        } catch (e) {
            return '';
        }
    }

    function initBrandingOnce() {
        if (_uiBrandingApplied || !BRANDS) {
            return;
        }
        _uiBrandingApplied = true;
        applyPrimaryBranding();
        renderConnectBankList();
        populateAdvisorModalStatic();
    }

    function applyPrimaryBranding() {
        if (!BRANDS || !BRANDS.primary) {
            return;
        }
        var p = BRANDS.primary;
        document.title = BRANDS.pageTitle || p.displayName + ' Open Banking';
        var wrap = document.getElementById('primaryLogoWrap');
        var img = document.getElementById('primaryLogoImg');
        if (wrap) {
            wrap.setAttribute('aria-label', p.logoAlt || p.displayName || 'Bank');
        }
        if (img) {
            if (p.logoUrl) {
                img.src = p.logoUrl;
                img.alt = p.logoAlt || p.displayName || '';
                img.style.display = 'block';
                img.onerror = function () {
                    img.style.display = 'none';
                    if (wrap && !wrap.querySelector('.primary-logo-fallback')) {
                        var sp = document.createElement('span');
                        sp.className = 'primary-logo-fallback';
                        sp.style.cssText = 'font-size:14px;font-weight:800;color:#fff';
                        sp.textContent = p.shortName || p.displayName || 'B';
                        wrap.appendChild(sp);
                    }
                };
            } else {
                img.style.display = 'none';
            }
        }
        var t = document.getElementById('primaryAppTitle');
        if (t) {
            t.textContent = p.appTitle || 'Open Banking';
        }
        var st = document.getElementById('primaryAppSubtitle');
        if (st) {
            st.textContent = p.appSubtitle || '';
        }
        var txnTab = document.getElementById('txnTabBmo');
        if (txnTab) {
            txnTab.textContent = p.shortName || p.displayName || 'Primary';
        }
        var cashName = document.getElementById('cashPrimaryBankName');
        if (cashName) {
            cashName.textContent = p.shortName || p.displayName || 'Primary';
        }
        var aff = document.getElementById('advisorPrimaryAffiliation');
        if (aff) {
            aff.textContent = p.advisorAffiliation || p.displayName + ' Wealth';
        }
        var scopePri = document.getElementById('scopePrimaryName');
        if (scopePri) {
            scopePri.textContent = p.displayName || 'your bank';
        }
        var ov = document.getElementById('overviewInfoTip');
        if (ov) {
            ov.textContent =
                'Link external accounts to see balances and transactions alongside your ' +
                (p.displayName || 'primary bank') +
                ' relationship, all in one place.';
        }
        var cashTip = document.getElementById('cashInfoTip');
        if (cashTip) {
            cashTip.textContent =
                '360 Account information. Total amount across ' +
                (p.displayName || 'your bank') +
                ' and other connected bank accounts.';
        }
        var cashLead = document.getElementById('cashDrillLead');
        if (cashLead) {
            cashLead.textContent =
                (p.displayName || 'Primary bank') +
                ' balances from the demo Accounts API; linked institution balances load when you refresh Cash and your connection allows account access.';
        }
    }

    function escapeHtml(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function renderConnectBankList(filterText) {
        var root = document.getElementById('connectBankList');
        if (!root || !BRANDS || !BRANDS.externalBanks) {
            return;
        }
        var q = (filterText != null ? String(filterText) : '').trim().toLowerCase();
        root.innerHTML = '';
        var matched = 0;
        BRANDS.externalBanks.forEach(function (b) {
            if (q) {
                var hay = (
                    (b.displayName || '') +
                    ' ' +
                    (b.shortName || '') +
                    ' ' +
                    (b.tagline || '')
                ).toLowerCase();
                if (hay.indexOf(q) === -1) {
                    return;
                }
            }
            var opt = document.createElement('div');
            opt.className = 'bank-option';
            opt.setAttribute('role', 'button');
            opt.setAttribute('tabindex', '0');
            opt.addEventListener('click', function () {
                selectBank(b.id);
            });
            opt.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectBank(b.id);
                }
            });
            var icon = document.createElement('div');
            icon.className = 'bank-icon';
            icon.setAttribute('aria-hidden', 'true');
            if (b.logoSvg) {
                var im = document.createElement('img');
                im.src = svgToDataUri(b.logoSvg);
                im.alt = '';
                im.width = 48;
                im.height = 48;
                icon.appendChild(im);
            }
            var col = document.createElement('div');
            var nm = document.createElement('div');
            nm.className = 'bank-name';
            nm.textContent = b.shortName || b.displayName;
            var sub = document.createElement('div');
            sub.className = 'bank-sub';
            sub.textContent =
                b.displayName && b.shortName && b.displayName !== b.shortName
                    ? b.displayName
                    : b.tagline || '';
            col.appendChild(nm);
            col.appendChild(sub);
            opt.appendChild(icon);
            opt.appendChild(col);
            root.appendChild(opt);
            matched++;
        });
        if (!matched) {
            var empty = document.createElement('div');
            empty.className = 'bank-list-empty';
            empty.style.cssText =
                'grid-column: 1 / -1; text-align: center; padding: 20px 12px; font-size: 14px; color: var(--text-muted);';
            empty.textContent = 'No banks match your search.';
            root.appendChild(empty);
        }
    }

    function renderStandardScopeStep(b) {
        var std = document.getElementById('scopeLeadStandard');
        var pro = document.getElementById('scopeLeadPromo');
        var trust = document.getElementById('scopePromoTrust');
        if (std) std.style.display = '';
        if (pro) {
            pro.style.display = 'none';
            pro.innerHTML = '';
        }
        if (trust) {
            trust.style.display = 'none';
            trust.innerHTML = '';
        }
        var promoHint = document.getElementById('scopePromoRequiredHint');
        if (promoHint) {
            promoHint.style.display = 'none';
            promoHint.textContent = '';
        }

        var st = document.getElementById('scopeModalTitle');
        if (st) st.textContent = 'Authorize data access';

        var bankLabel = document.getElementById('scopeBankName');
        if (bankLabel) bankLabel.textContent = b.displayName;

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
    }

    function renderPromoScopeStep(b) {
        var p = BRANDS.primary || {};
        var syn = p.shortName || p.displayName || 'Synapse';
        var bankShort = b.shortName || b.displayName;

        var std = document.getElementById('scopeLeadStandard');
        var pro = document.getElementById('scopeLeadPromo');
        var trust = document.getElementById('scopePromoTrust');
        var promoHint = document.getElementById('scopePromoRequiredHint');
        if (std) std.style.display = 'none';
        if (pro) {
            pro.style.display = 'block';
            pro.innerHTML =
                'To unlock your <strong>$100 Cashback</strong> and power your Smart Budgeting dashboard, please review and select the data you want to share from <strong>' +
                escapeHtml(bankShort) +
                '</strong>.';
        }
        if (promoHint) {
            promoHint.style.display = 'block';
            promoHint.textContent =
                'Required permissions: turning off Account Details or Transaction History below may disqualify you from the $100 cashback offer.';
        }

        var st = document.getElementById('scopeModalTitle');
        if (st) st.textContent = 'Connect your ' + bankShort + ' Account';

        var policyUrl = (p.openBankingPrivacyPolicyUrl || '').trim() || '#';
        if (trust) {
            trust.style.display = 'block';
            trust.innerHTML =
                '<h4>How we protect your data:</h4>' +
                '<ul>' +
                '<li><strong>Read-Only Access:</strong> We cannot move money out of your ' +
                escapeHtml(bankShort) +
                ' account.</li>' +
                '<li><strong>Automated Processing:</strong> Your ' +
                escapeHtml(bankShort) +
                ' data is processed securely by our automated systems to give you budgeting insights and retail offers. It is not shared with human wealth advisors without your separate permission.</li>' +
                '<li><strong>No Passwords:</strong> We never see or store your ' +
                escapeHtml(bankShort) +
                ' login credentials.</li>' +
                '</ul>' +
                '<div>Read our full <a id="scopePrivacyLink" href="' +
                escapeHtml(policyUrl) +
                '" target="_blank" rel="noopener noreferrer">Open Banking Privacy Policy</a>.</div>';
        }

        var checklist = document.getElementById('scopeChecklist');
        if (checklist) {
            checklist.innerHTML = '';
            var rows = [
                {
                    code: 'ACCOUNT_BASIC',
                    title: 'Account Details',
                    desc:
                        'Includes account names, types, and real-time balances.'
                },
                {
                    code: 'TRANSACTIONS',
                    title: 'Transaction History',
                    desc:
                        'Includes up to 12 months of spending history to power your budgeting insights and qualify you for personalized ' +
                        syn +
                        ' promotions.'
                }
            ];
            rows.forEach(function (r) {
                var wrap = document.createElement('div');
                wrap.className = 'scope-promo-row';

                var label = document.createElement('label');
                label.className = 'scope-promo-label';

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = r.code;
                cb.checked = true;

                var col = document.createElement('div');
                var title = document.createElement('div');
                title.className = 'scope-promo-row-title';
                title.innerHTML =
                    escapeHtml(r.title) + ' <span class="req-pill">Required</span>';

                var desc = document.createElement('div');
                desc.className = 'scope-promo-row-desc';
                desc.textContent = r.desc;

                var warn = document.createElement('div');
                warn.className = 'scope-promo-row-warn';
                warn.setAttribute('role', 'tooltip');
                warn.textContent = 'Required to claim your $100 cashback';

                cb.addEventListener('change', function () {
                    warn.style.display = cb.checked ? 'none' : 'block';
                });

                col.appendChild(title);
                col.appendChild(desc);
                col.appendChild(warn);
                label.appendChild(cb);
                label.appendChild(col);
                wrap.appendChild(label);
                checklist.appendChild(wrap);
            });
        }
    }

    function renderAdvisorScopeStep(b) {
        var p = BRANDS.primary || {};
        var syn = p.shortName || p.displayName || 'Synapse';
        var bankShort = b.shortName || b.displayName;
        var aff = (p.advisorAffiliation || 'your advisory team').trim();

        var std = document.getElementById('scopeLeadStandard');
        var pro = document.getElementById('scopeLeadPromo');
        var trust = document.getElementById('scopePromoTrust');
        var promoHint = document.getElementById('scopePromoRequiredHint');
        if (std) std.style.display = 'none';
        if (pro) {
            pro.style.display = 'block';
            pro.innerHTML =
                'Your advisor suggested linking an external account for a fuller picture of your finances. Review and choose the data you want to share from <strong>' +
                escapeHtml(bankShort) +
                '</strong>. This is <strong>not</strong> the $100 cashback offer—it is only for advisory support through ' +
                escapeHtml(syn) +
                '.';
        }
        if (promoHint) {
            promoHint.style.display = 'block';
            promoHint.style.color = '';
            promoHint.style.background = '';
            promoHint.style.border = '';
            promoHint.textContent =
                'Turning off Account Details or Transaction History may limit the guidance ' +
                aff +
                ' can provide. You can still continue with the permissions you select.';
        }

        var st = document.getElementById('scopeModalTitle');
        if (st) st.textContent = 'Connect your ' + bankShort + ' account for your advisor';

        var policyUrl = (p.openBankingPrivacyPolicyUrl || '').trim() || '#';
        if (trust) {
            trust.style.display = 'block';
            trust.innerHTML =
                '<h4>How we protect your data:</h4>' +
                '<ul>' +
                '<li><strong>Read-Only Access:</strong> We cannot move money out of your ' +
                escapeHtml(bankShort) +
                ' account.</li>' +
                '<li><strong>Advisor use:</strong> Data you approve may be used by ' +
                escapeHtml(aff) +
                ' to prepare guidance, subject to your advisory agreement. It is processed through secure, automated systems.</li>' +
                '<li><strong>No Passwords:</strong> We never see or store your ' +
                escapeHtml(bankShort) +
                ' login credentials.</li>' +
                '</ul>' +
                '<div>Read our full <a id="scopePrivacyLinkAdvisor" href="' +
                escapeHtml(policyUrl) +
                '" target="_blank" rel="noopener noreferrer">Open Banking Privacy Policy</a>.</div>';
        }

        var checklist = document.getElementById('scopeChecklist');
        if (checklist) {
            checklist.innerHTML = '';
            var rows = [
                {
                    code: 'ACCOUNT_BASIC',
                    title: 'Account Details',
                    desc: 'Includes account names, types, and real-time balances.'
                },
                {
                    code: 'TRANSACTIONS',
                    title: 'Transaction History',
                    desc:
                        'Includes up to 12 months of activity so your advisor can understand cash flow alongside your ' +
                        syn +
                        ' relationship.'
                }
            ];
            rows.forEach(function (r) {
                var wrap = document.createElement('div');
                wrap.className = 'scope-promo-row';

                var label = document.createElement('label');
                label.className = 'scope-promo-label';

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = r.code;
                cb.checked = true;

                var col = document.createElement('div');
                var title = document.createElement('div');
                title.className = 'scope-promo-row-title';
                title.innerHTML =
                    escapeHtml(r.title) + ' <span class="rec-pill">Recommended</span>';

                var desc = document.createElement('div');
                desc.className = 'scope-promo-row-desc';
                desc.textContent = r.desc;

                var warn = document.createElement('div');
                warn.className = 'scope-promo-row-warn scope-promo-row-warn--soft';
                warn.setAttribute('role', 'tooltip');
                warn.textContent =
                    'Recommended so your advisor can give you consolidated guidance—not required to continue.';

                cb.addEventListener('change', function () {
                    warn.style.display = cb.checked ? 'none' : 'block';
                });

                col.appendChild(title);
                col.appendChild(desc);
                col.appendChild(warn);
                label.appendChild(cb);
                label.appendChild(col);
                wrap.appendChild(label);
                checklist.appendChild(wrap);
            });
        }
    }

    function populateAdvisorModalStatic() {
        if (!BRANDS) {
            return;
        }
        var b = getExternalBank(BRANDS.advisorExternalBankId);
        if (!b) {
            return;
        }
        var nm = document.getElementById('advisorBankNameInMsg');
        if (nm) {
            nm.textContent = b.displayName;
        }
        var title = document.getElementById('advisorBankTitle');
        if (title) {
            title.textContent = b.displayName;
        }
        var aimg = document.getElementById('advisorBankLogoImg');
        if (aimg && b.logoSvg) {
            aimg.src = svgToDataUri(b.logoSvg);
            aimg.alt = b.displayName;
            aimg.style.display = 'block';
        }
    }

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
                var resolvedExtId =
                    (sb.externalBankId != null && String(sb.externalBankId).trim() !== ''
                        ? sb.externalBankId
                        : null) ||
                    (cur && cur.externalBankId) ||
                    null;
                saveConnection({
                    accessToken: data.access_token,
                    idToken: data.id_token || null,
                    tokenType: data.token_type || 'Bearer',
                    bankName: resolvedName,
                    bankDisplayName: resolvedDisplay,
                    bankBrand: sb.bankBrand != null ? sb.bankBrand : data.bankBrand,
                    externalBankId: resolvedExtId,
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
        var eb =
            conn.externalBankId != null && String(conn.externalBankId).trim() !== ''
                ? getExternalBank(String(conn.externalBankId).trim())
                : null;
        if (eb) {
            return eb.shortName || eb.displayName || 'Linked';
        }
        return conn.bankName || conn.bankDisplayName || 'Linked bank';
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
        var ebId =
            obj.externalBankId != null && String(obj.externalBankId).trim() !== ''
                ? String(obj.externalBankId).trim()
                : null;
        var eb = ebId ? getExternalBank(ebId) : null;
        if (eb) {
            display = eb.displayName || display;
            name = eb.shortName || eb.displayName || name;
        }
        return {
            accessToken: obj.accessToken,
            idToken: obj.idToken || null,
            tokenType: obj.tokenType || 'Bearer',
            bankName: name,
            bankDisplayName: display,
            bankBrand: brand,
            externalBankId: obj.externalBankId != null && String(obj.externalBankId).trim() !== '' ? String(obj.externalBankId).trim() : null,
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
                    bankDisplayName: x.bankDisplayName,
                    externalBankId: x.externalBankId
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
        if (BRANDS && BRANDS.primary && key === 'bmo') {
            return BRANDS.primary.displayName || 'Primary bank';
        }
        return bankName || 'External bank';
    }

    /** Compact initials for primary-bank SVG fallback when logo image fails to load. */
    function primaryMarkFallbackLabel() {
        var s = (BRANDS && BRANDS.primary && (BRANDS.primary.shortName || BRANDS.primary.displayName)) || 'OB';
        s = String(s).trim();
        if (!s) return 'OB';
        if (s.length <= 4) return s.toUpperCase();
        return s.slice(0, 3).toUpperCase();
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
                return rect('#007078', primaryMarkFallbackLabel());
            case 'td':
                return rect('#334155', 'OB');
            case 'rbc':
                return rect('#334155', 'OB');
            case 'scotia':
                return rect('#334155', 'OB');
            case 'cibc':
                return rect('#334155', 'OB');
            default:
                return rect('#007078', 'OB');
        }
    }

    function bankLogoFillContainer(container, brand, altText, opts) {
        opts = opts || {};
        if (!container) return;
        container.innerHTML = '';
        var extId = opts.externalBankId;
        if (extId) {
            var eb = getExternalBank(extId);
            if (eb && eb.logoSvg) {
                var imgEx = document.createElement('img');
                imgEx.src = svgToDataUri(eb.logoSvg);
                imgEx.alt = altText || eb.displayName || '';
                imgEx.loading = 'lazy';
                imgEx.style.width = '100%';
                imgEx.style.height = '100%';
                imgEx.style.objectFit = 'contain';
                imgEx.style.display = 'block';
                container.appendChild(imgEx);
                return;
            }
        }
        var k = String(brand == null ? 'default' : brand)
            .trim()
            .toLowerCase();
        if (k === 'bmo' && BRANDS && BRANDS.primary && BRANDS.primary.logoUrl) {
            var imgB = document.createElement('img');
            imgB.src = BRANDS.primary.logoUrl;
            imgB.alt = altText || BRANDS.primary.logoAlt || '';
            imgB.loading = 'lazy';
            imgB.style.width = '100%';
            imgB.style.height = '100%';
            imgB.style.objectFit = 'contain';
            imgB.style.display = 'block';
            imgB.addEventListener('error', function onBmoLogoErr() {
                imgB.removeEventListener('error', onBmoLogoErr);
                container.innerHTML = bankLogoSvgHtml('bmo');
            });
            container.appendChild(imgB);
            return;
        }
        container.innerHTML = bankLogoSvgHtml(k);
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
        var promo = document.getElementById('promoModal');
        var smartOffers = document.getElementById('smartOffersModal');
        var open =
            (conn && conn.classList.contains('is-open')) ||
            (admin && admin.classList.contains('is-open')) ||
            (promo && promo.classList.contains('is-open')) ||
            (advisor && advisor.classList.contains('is-open')) ||
            (ext && ext.classList.contains('is-open')) ||
            (cash && cash.classList.contains('is-open')) ||
            (smartOffers && smartOffers.classList.contains('is-open'));
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
        closeSmartOffersModal();

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
        closeSmartOffersModal();
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
        bankLogoFillContainer(logo, brand, conn.bankDisplayName || conn.bankName || '', {
            externalBankId: conn.externalBankId
        });

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
        resetSmartOffersSessionState();
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

    function friendlyOAuthErrorMessage(code) {
        var c = String(code || '')
            .trim()
            .toLowerCase();
        var map = {
            missing_code:
                'External bank authorization did not complete. If you cancelled or closed the bank sign-in, you can try connecting again when you are ready.',
            access_denied:
                'External bank authorization was declined or cancelled. You can connect again from External accounts whenever you like.',
            consent_denied:
                'External bank authorization was declined or cancelled. You can connect again from External accounts whenever you like.',
            token_exchange_failed:
                'We could not finish linking your external bank. Please try connecting again.',
            internal_error:
                'Something went wrong while connecting your external bank. Please try again later.',
            missing_parameters:
                'The connection request was incomplete. Please start over from Connect external bank.',
            invalid_scope: 'The selected permissions were not accepted. Please try again and keep the required options on.'
        };
        if (map[c]) {
            return map[c];
        }
        return 'External bank authorization failed. Please try again when you are ready.';
    }

    function handleOAuthReturn() {
        var params = new URLSearchParams(window.location.search);
        var status = params.get('status');
        if (status === 'error') {
            var err = params.get('error') || 'unknown';
            clearPendingBankChoice();
            showNotification(friendlyOAuthErrorMessage(err), 'warn');
            window.history.replaceState({}, '', '/');
            return Promise.resolve();
        }
        if (status !== 'success') return Promise.resolve();

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
                var resolvedName = sb.bankName || pendingPick || bankNameFromJwtAud(o.data.access_token) || 'External bank';
                saveConnection({
                    accessToken: o.data.access_token,
                    idToken: o.data.id_token || null,
                    tokenType: o.data.token_type || 'Bearer',
                    bankName: resolvedName,
                    bankDisplayName: sb.bankDisplayName || null,
                    bankBrand: sb.bankBrand != null ? sb.bankBrand : o.data.bankBrand,
                    externalBankId: sb.externalBankId || null,
                    scopes: tech,
                    scopesTechnical: tech,
                    scopesHuman: human,
                    sessionId: o.data.session_id || null,
                    connectedAt: new Date().toISOString(),
                    tokenShape: o.data.access_token_format || null
                });
                clearPendingBankChoice();
                scheduleSmartOffersReveal();
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
                var resolvedName = sb.bankName || peekPendingBankChoice() || bankNameFromJwtAud(data.access_token) || 'External bank';
                saveConnection({
                    accessToken: data.access_token,
                    idToken: data.id_token || null,
                    tokenType: data.token_type || 'Bearer',
                    bankName: resolvedName,
                    bankDisplayName: sb.bankDisplayName || null,
                    bankBrand: sb.bankBrand != null ? sb.bankBrand : data.bankBrand,
                    externalBankId: sb.externalBankId || null,
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
                var priName =
                    BRANDS && BRANDS.primary
                        ? BRANDS.primary.shortName || BRANDS.primary.displayName || 'Primary'
                        : 'Primary';
                bmoBox.appendChild(renderCashDrillRow('No ' + priName + ' accounts loaded', '—'));
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
        return linkedBankShortLabel(conn);
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
     * Refresh: load primary-bank txns, then check if external connection exists.
     * If connection exists → show the tab with bank name. Linked institution API calls
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

    var _connectionUiMode = 'standard';

    function setPromoConnectDisclaimerVisible(show) {
        var d = document.getElementById('promoConnectDisclaimer');
        if (!d) return;
        d.style.display = show ? 'block' : 'none';
    }

    function setAdvisorConnectDisclaimerVisible(show) {
        var d = document.getElementById('advisorConnectDisclaimer');
        if (!d) return;
        d.style.display = show ? 'block' : 'none';
    }

    function hideConnectionFlowDisclaimers() {
        setPromoConnectDisclaimerVisible(false);
        setAdvisorConnectDisclaimerVisible(false);
    }

    window.openConnectionModal = function (opts) {
        opts = opts || {};
        if (opts.promo === true) {
            _connectionUiMode = 'promo';
        } else if (opts.advisor === true) {
            _connectionUiMode = 'advisor';
        } else {
            _connectionUiMode = 'standard';
        }

        var el = document.getElementById('connectionModal');
        if (!el) return;
        clearPendingBankChoice();
        closeExternalDetailModal();
        closeCashBreakdownModal();
        closeAdminHub();
        closePromoModal();
        closeAdvisorModal();
        closeSmartOffersModal();

        if (_connectionUiMode === 'promo' && opts.markPromoRead === true) {
            markNotifRead('promo');
        }
        if (_connectionUiMode === 'advisor' && opts.markAdvisorRead === true) {
            markNotifRead('advisor');
        }

        var mt = document.getElementById('modalTitle');
        var bl = document.getElementById('bankSelectionLead');
        if (mt && bl) {
            if (_connectionUiMode === 'promo') {
                mt.textContent = 'Unlock your $100 cashback';
                bl.textContent =
                    'Choose your financial institution to link and qualify. Search below as we add more partners.';
            } else if (_connectionUiMode === 'advisor') {
                mt.textContent = 'Link an account for your advisor';
                bl.textContent =
                    'Search and select your institution—no specific bank is required. You choose what data is shared; this is not the cashback promotion.';
            } else {
                mt.textContent = 'Connect your bank';
                bl.textContent = 'Choose your financial institution to securely link your accounts.';
            }
        }

        var search = document.getElementById('connectBankSearch');
        if (search) search.value = '';
        renderConnectBankList('');

        el.style.display = 'flex';
        el.classList.add('is-open');
        syncModalOpenBodyClass();
        var bs = document.getElementById('bankSelection');
        var ss = document.getElementById('scopeSelection');
        var cs = document.getElementById('connectionStatus');
        if (bs) bs.style.display = 'block';
        if (ss) ss.style.display = 'none';
        if (cs) cs.style.display = 'none';
        setPromoConnectDisclaimerVisible(_connectionUiMode === 'promo');
        setAdvisorConnectDisclaimerVisible(_connectionUiMode === 'advisor');
    };

    window.closeConnectionModal = function () {
        var el = document.getElementById('connectionModal');
        if (!el) return;
        _connectionUiMode = 'standard';
        hideConnectionFlowDisclaimers();
        el.classList.remove('is-open');
        el.style.display = 'none';
        syncModalOpenBodyClass();
    };

    var _selectedOAuthCode = '';
    var _selectedDisplayName = '';
    var _selectedExternalId = '';

    window.selectBank = function (externalBankId) {
        var b = getExternalBank(externalBankId);
        if (!b) {
            showNotification('Unknown institution.', 'warn');
            return;
        }
        _selectedOAuthCode = b.oauthBankCode;
        _selectedDisplayName = b.displayName;
        _selectedExternalId = b.id;

        var bs = document.getElementById('bankSelection');
        var ss = document.getElementById('scopeSelection');
        var cs = document.getElementById('connectionStatus');
        if (bs) bs.style.display = 'none';
        if (cs) cs.style.display = 'none';
        if (ss) ss.style.display = 'block';

        if (_connectionUiMode === 'promo') {
            renderPromoScopeStep(b);
        } else if (_connectionUiMode === 'advisor') {
            renderAdvisorScopeStep(b);
        } else {
            renderStandardScopeStep(b);
        }

        var pr = document.getElementById('scopeProceedBtn');
        if (pr) {
            if (_connectionUiMode === 'promo' || _connectionUiMode === 'advisor') {
                var bn = b.shortName || b.displayName;
                pr.textContent = 'Agree & Continue to ' + bn;
            } else {
                pr.textContent = 'Authorize & connect';
            }
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

        /* Promo / advisor: in-row warnings only; user may continue with chosen scopes. */
        hideConnectionFlowDisclaimers();

        var ss = document.getElementById('scopeSelection');
        var cs = document.getElementById('connectionStatus');
        if (ss) ss.style.display = 'none';
        if (cs) cs.style.display = 'block';

        var statusIcon = document.getElementById('statusIcon');
        var statusTitle = document.getElementById('statusTitle');
        var statusMessage = document.getElementById('statusMessage');

        if (statusIcon) {
            statusIcon.innerHTML = '<span class="css-spinner"></span>';
            statusIcon.className = 'status-icon status-loading';
        }
        if (statusTitle) statusTitle.textContent = 'Connecting\u2026';
        if (statusMessage) statusMessage.textContent = 'Securely authenticating with ' + _selectedDisplayName + '\u2026';

        setTimeout(function () {
            if (statusIcon) {
                statusIcon.innerHTML = '<span class="css-lock"></span>';
                statusIcon.className = 'status-icon status-loading';
            }
            if (statusTitle) statusTitle.textContent = 'Authenticating';
            if (statusMessage) statusMessage.textContent = 'Redirecting to ' + _selectedDisplayName + ' OAuth flow\u2026';

            setPendingBankChoice(_selectedOAuthCode);

            var oauthUrl =
                '/api/auth/connect?bank=' +
                encodeURIComponent(_selectedOAuthCode) +
                '&bank_display=' +
                encodeURIComponent(_selectedDisplayName) +
                '&external_bank_id=' +
                encodeURIComponent(_selectedExternalId) +
                '&access_types=' +
                encodeURIComponent(selected.join(','));

            setTimeout(function () {
                window.location.href = oauthUrl;
            }, 1000);
        }, 1000);
    }

    function scopeGoBack() {
        var std = document.getElementById('scopeLeadStandard');
        var pro = document.getElementById('scopeLeadPromo');
        var trust = document.getElementById('scopePromoTrust');
        if (std) std.style.display = '';
        if (pro) {
            pro.style.display = 'none';
            pro.innerHTML = '';
        }
        if (trust) {
            trust.style.display = 'none';
            trust.innerHTML = '';
        }
        var promoHintBack = document.getElementById('scopePromoRequiredHint');
        if (promoHintBack) {
            promoHintBack.style.display = 'none';
            promoHintBack.textContent = '';
        }
        var bs = document.getElementById('bankSelection');
        var ss = document.getElementById('scopeSelection');
        if (ss) ss.style.display = 'none';
        if (bs) bs.style.display = 'block';
        setPromoConnectDisclaimerVisible(_connectionUiMode === 'promo');
        setAdvisorConnectDisclaimerVisible(_connectionUiMode === 'advisor');
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
        closePromoModal();
        closeAdvisorModal();
        closeSmartOffersModal();

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
                var hubConn = {
                    bankDisplayName: o.data.bankDisplayName,
                    bankName: o.data.bankName,
                    externalBankId: o.data.externalBankId || o.data.external_bank_id || null
                };
                if (statusText) {
                    statusText.textContent = 'Active session \u2014 ' + linkedBankShortLabel(hubConn);
                }
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
        closePromoModal();
        closeSmartOffersModal();

        populateAdvisorModalStatic();

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

        markNotifRead('advisor');
    }

    function closePromoModal() {
        var m = document.getElementById('promoModal');
        if (m) {
            m.classList.remove('is-open');
            m.style.display = 'none';
            m.setAttribute('aria-hidden', 'true');
        }
        syncModalOpenBodyClass();
    }

    function openPromoModal() {
        window.closeConnectionModal();
        closeExternalDetailModal();
        closeCashBreakdownModal();
        closeAdminHub();
        closeAdvisorModal();
        closeSmartOffersModal();

        var m = document.getElementById('promoModal');
        if (!m) {
            return;
        }
        m.style.display = 'flex';
        m.classList.add('is-open');
        m.setAttribute('aria-hidden', 'false');
        syncModalOpenBodyClass();
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
        var b = getExternalBank(BRANDS && BRANDS.advisorExternalBankId);
        if (!b) {
            showNotification('Advisor flow is not configured.', 'warn');
            return;
        }
        _selectedOAuthCode = b.oauthBankCode;
        _selectedDisplayName = b.displayName;
        _selectedExternalId = b.id;
        setPendingBankChoice(_selectedOAuthCode);
        var scopes = ['ACCOUNT_BASIC', 'TRANSACTIONS'];
        var oauthUrl =
            '/api/auth/connect?bank=' +
            encodeURIComponent(_selectedOAuthCode) +
            '&bank_display=' +
            encodeURIComponent(_selectedDisplayName) +
            '&external_bank_id=' +
            encodeURIComponent(_selectedExternalId) +
            '&access_types=' +
            encodeURIComponent(scopes.join(','));
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
        var notifItemAdvisor = document.getElementById('notifItemAdvisor');
        var notifItemPromo = document.getElementById('notifItemPromo');

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

        var connectionModalCancelBtn = document.getElementById('connectionModalCancelBtn');
        if (connectionModalCancelBtn) {
            connectionModalCancelBtn.addEventListener('click', function () {
                if (typeof window.closeConnectionModal === 'function') {
                    window.closeConnectionModal();
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
                if (e.target.closest('#notifItemSmartOffers')) {
                    closeNotifDropdown();
                    openSmartOffersModal();
                }
            });
        }

        if (notifItemAdvisor) {
            notifItemAdvisor.addEventListener('click', function () {
                closeNotifDropdown();
                window.openConnectionModal({ advisor: true, markAdvisorRead: true });
            });
        }

        var smartOffersBannerOpen = document.getElementById('smartOffersBannerOpen');
        if (smartOffersBannerOpen) {
            smartOffersBannerOpen.addEventListener('click', function () {
                openSmartOffersModal();
            });
        }
        var smartOffersBannerClose = document.getElementById('smartOffersBannerClose');
        if (smartOffersBannerClose) {
            smartOffersBannerClose.addEventListener('click', function (e) {
                e.stopPropagation();
                dismissSmartOffersBanner();
            });
        }
        var smartOffersModalClose = document.getElementById('smartOffersModalClose');
        if (smartOffersModalClose) {
            smartOffersModalClose.addEventListener('click', closeSmartOffersModal);
        }
        var smartOffersOverlay = document.getElementById('smartOffersModal');
        if (smartOffersOverlay) {
            smartOffersOverlay.addEventListener('click', function (e) {
                if (e.target.id === 'smartOffersModal') closeSmartOffersModal();
            });
        }

        var cta1 = document.getElementById('smartOfferCta1');
        var cta2 = document.getElementById('smartOfferCta2');
        var cta3 = document.getElementById('smartOfferCta3');
        if (cta1) {
            cta1.addEventListener('click', function () {
                showNotification('Pre-approved offer accepted (demo).', 'success');
                closeSmartOffersModal();
            });
        }
        if (cta2) {
            cta2.addEventListener('click', function () {
                showNotification('Savings transfer flow started (demo).', 'success');
                closeSmartOffersModal();
            });
        }
        if (cta3) {
            cta3.addEventListener('click', function () {
                showNotification('Loan terms sent to your messages (demo).', 'success');
                closeSmartOffersModal();
            });
        }

        if (notifItemPromo) {
            notifItemPromo.addEventListener('click', function () {
                closeNotifDropdown();
                window.openConnectionModal({ promo: true, markPromoRead: true });
            });
        }

        var connectBankSearch = document.getElementById('connectBankSearch');
        if (connectBankSearch) {
            connectBankSearch.addEventListener('input', function () {
                renderConnectBankList(this.value);
            });
        }

        var extPlus = document.getElementById('externalCardPlusBtn');
        if (extPlus) {
            extPlus.addEventListener('click', function (e) {
                e.stopPropagation();
                if (typeof window.openConnectionModal === 'function') {
                    window.openConnectionModal({ promo: true });
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
                if (typeof window._agentChatHandleEscape === 'function' && window._agentChatHandleEscape()) {
                    return;
                }
                var connM = document.getElementById('connectionModal');
                if (connM && connM.classList.contains('is-open')) {
                    window.closeConnectionModal();
                    return;
                }
                var promoM = document.getElementById('promoModal');
                if (promoM && promoM.classList.contains('is-open')) {
                    closePromoModal();
                    return;
                }
                var advM = document.getElementById('advisorModal');
                if (advM && advM.classList.contains('is-open')) {
                    closeAdvisorModal();
                    return;
                }
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
                var smartM = document.getElementById('smartOffersModal');
                if (smartM && smartM.classList.contains('is-open')) {
                    closeSmartOffersModal();
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

        var promoCloseBtn = document.getElementById('promoCloseBtn');
        if (promoCloseBtn) promoCloseBtn.addEventListener('click', closePromoModal);
        var promoDismissBtn = document.getElementById('promoDismissBtn');
        if (promoDismissBtn) {
            promoDismissBtn.addEventListener('click', function () {
                closePromoModal();
            });
        }
        var promoOfferBtn = document.getElementById('promoOfferBtn');
        if (promoOfferBtn) {
            promoOfferBtn.addEventListener('click', function () {
                closePromoModal();
                window.openConnectionModal({ promo: true });
            });
        }
        var promoOverlay = document.getElementById('promoModal');
        if (promoOverlay) {
            promoOverlay.addEventListener('click', function (e) {
                if (e.target.id === 'promoModal') closePromoModal();
            });
        }

        refreshNotifUi();
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function () {
                refreshNotifUi();
            });
        }
        window.addEventListener('pageshow', function () {
            refreshNotifUi();
        });

        initAgentChat();
    }

    /** Strip /.well-known/agent-card.json (or agent.json) if user pasted full discovery URL. */
    function normalizeBrokerInputUrl(url) {
        var s = String(url || '').trim();
        if (!s) return '';
        s = s.replace(/\/\.well-known\/agent-card\.json\/?$/i, '');
        s = s.replace(/\/\.well-known\/agent\.json\/?$/i, '');
        // Do not strip trailing slashes with a lone /\/+$/ regex: it turns "https://" into "https:".
        while (s.length > 8 && s.charAt(s.length - 1) === '/') {
            s = s.slice(0, -1);
        }
        return s;
    }

    /** In-memory chat per agent key; lost on full page reload (by design). */
    function initAgentChat() {
        var panel = document.getElementById('agentChatPanel');
        var fab = document.getElementById('agentChatFab');
        if (!panel || !fab) return;

        var histories = {};
        var activeKey = '_legacy';
        var brokers = [];
        var defaultBrokerId = null;
        var brokerWaitActive = false;
        var brokerWaitPhraseTimer = null;
        var pendingFiles = [];
        var AGENT_WAIT_PHRASES = [
            'Starting conversation with the agent...',
            'Searching...',
            'Gathering info...',
            'Evaluating...',
            'Organizing...',
            'Analyzing...',
            'Summarizing responses...',
            'Processing...',
            'Generating a response...',
            'Coordinating with downstream tools...',
            'Almost there...',
            'Finalizing the answer...'
        ];

        function histKeyForSelect() {
            var sel = document.getElementById('agentChatAgentSelect');
            var v = sel ? sel.value : '_legacy';
            return v || '_legacy';
        }

        function brokerDisplayName(b) {
            if (!b) return 'Agent';
            var a = b.alias;
            if (a != null && String(a).trim() !== '') return String(a).trim();
            if (b.name != null && String(b.name).trim() !== '') return String(b.name).trim();
            return String(b.id || 'Agent');
        }

        function monogramFromName(name) {
            var s = String(name || '').trim();
            if (!s) return '•';
            var parts = s.split(/\s+/).filter(function (x) { return x.length; });
            if (parts.length >= 2) {
                var x = (parts[0][0] || '') + (parts[1][0] || '');
                return x.toUpperCase();
            }
            if (s.length >= 2) return s.substring(0, 2).toUpperCase();
            return s.charAt(0).toUpperCase();
        }

        function cardIconUrl(card) {
            if (!card || typeof card !== 'object') return '';
            if (card.image) return String(card.image);
            if (card.iconUrl) return String(card.iconUrl);
            if (card.icon) return String(card.icon);
            if (card.provider && card.provider.image) return String(card.provider.image);
            return '';
        }

        function getAgentVisualForKey(k) {
            if (k === '_legacy') {
                return { monogram: 'AI', iconUrl: '' };
            }
            var b = null;
            for (var i = 0; i < brokers.length; i++) {
                if (brokers[i].id === k) {
                    b = brokers[i];
                    break;
                }
            }
            if (!b) {
                return { monogram: '!', iconUrl: '' };
            }
            return {
                monogram: monogramFromName(brokerDisplayName(b)),
                iconUrl: cardIconUrl(b.card)
            };
        }

        function updateChatHeader() {
            var k = histKeyForSelect();
            var vis = getAgentVisualForKey(k);
            var mg = document.getElementById('agentChatHeadMonogram');
            var img = document.getElementById('agentChatHeadLogoImg');
            if (mg) {
                mg.textContent = vis.monogram;
            }
            if (img) {
                if (vis.iconUrl) {
                    img.onerror = function () {
                        img.setAttribute('hidden', '');
                        img.removeAttribute('src');
                        if (mg) mg.removeAttribute('hidden');
                    };
                    img.onload = function () {
                        img.removeAttribute('hidden');
                        if (mg) mg.setAttribute('hidden', '');
                    };
                    if (img.getAttribute('src') !== vis.iconUrl) {
                        img.setAttribute('src', vis.iconUrl);
                    } else {
                        if (img.complete && img.naturalWidth > 0) {
                            img.removeAttribute('hidden');
                            if (mg) mg.setAttribute('hidden', '');
                        } else {
                            img.setAttribute('hidden', '');
                            if (mg) mg.removeAttribute('hidden');
                        }
                    }
                } else {
                    img.setAttribute('hidden', '');
                    img.removeAttribute('src');
                    if (mg) mg.removeAttribute('hidden');
                }
            }
        }

        function renderFileChips() {
            var wrap = document.getElementById('agentChatFileChips');
            if (!wrap) return;
            wrap.innerHTML = '';
            if (!pendingFiles.length) {
                wrap.setAttribute('hidden', '');
                return;
            }
            wrap.removeAttribute('hidden');
            pendingFiles.forEach(function (f) {
                var s = document.createElement('span');
                s.className = 'agent-chat-file-chip';
                s.textContent = f.name;
                wrap.appendChild(s);
            });
        }

        function ensureHistory(key) {
            if (!histories[key]) histories[key] = [];
            return histories[key];
        }

        function stopBrokerWaitPhrases() {
            if (brokerWaitPhraseTimer) {
                clearInterval(brokerWaitPhraseTimer);
                brokerWaitPhraseTimer = null;
            }
        }

        function startBrokerWaitPhrases() {
            stopBrokerWaitPhrases();
            var msgEl = document.getElementById('agentChatWaitMsg');
            if (!msgEl) return;
            var idx = 0;
            msgEl.textContent = AGENT_WAIT_PHRASES[0];
            brokerWaitPhraseTimer = setInterval(function () {
                idx = (idx + 1) % AGENT_WAIT_PHRASES.length;
                var el = document.getElementById('agentChatWaitMsg');
                if (el) el.textContent = AGENT_WAIT_PHRASES[idx];
            }, 4000);
        }

        function createAgentChatAssistantAvatar(key) {
            var vis = getAgentVisualForKey(key);
            var av = document.createElement('div');
            av.className = 'agent-chat-bubble-avatar agent-chat-bubble-avatar--glyph';
            av.setAttribute('aria-hidden', 'true');
            av.textContent = vis.monogram;
            return av;
        }

        function renderMessages() {
            var key = histKeyForSelect();
            var wrap = document.getElementById('agentChatMsgs');
            if (!wrap) return;
            wrap.innerHTML = '';
            var list = ensureHistory(key);
            list.forEach(function (m) {
                var row = document.createElement('div');
                var isUser = m.role === 'user';
                row.className = 'agent-chat-row agent-chat-row--' + (isUser ? 'user' : 'assistant');
                var bubble = document.createElement('div');
                bubble.className = 'agent-chat-bubble agent-chat-bubble--' + (isUser ? 'user' : 'assistant');
                var inner = document.createElement('div');
                inner.className = 'agent-chat-bubble__inner';
                var bodyText = typeof m.content === 'string' ? m.content : '';
                if (m.debug) {
                    var p = document.createElement('p');
                    p.className = 'agent-chat-bubble__text';
                    p.textContent = bodyText || '';
                    inner.appendChild(p);
                    var dbgWrap = document.createElement('div');
                    dbgWrap.className = 'agent-chat-error-debug';
                    var dbgToolbar = document.createElement('div');
                    dbgToolbar.className = 'agent-chat-error-debug__toolbar';
                    var dbgBtn = document.createElement('button');
                    dbgBtn.type = 'button';
                    dbgBtn.className = 'agent-chat-error-debug__toggle';
                    dbgBtn.textContent = 'Debug';
                    dbgBtn.setAttribute('aria-expanded', 'false');
                    var copyBtn = document.createElement('button');
                    copyBtn.type = 'button';
                    copyBtn.className = 'agent-chat-error-debug__copy';
                    copyBtn.setAttribute('aria-label', 'Copy debug details');
                    copyBtn.title = 'Copy debug details';
                    copyBtn.innerHTML =
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                    var dbgPre = document.createElement('pre');
                    dbgPre.className = 'agent-chat-error-debug__panel';
                    dbgPre.hidden = true;
                    var dbgCopyText = '';
                    try {
                        dbgCopyText = JSON.stringify(m.debug, null, 2);
                    } catch (e) {
                        dbgCopyText = String(m.debug);
                    }
                    dbgPre.textContent = dbgCopyText;
                    dbgBtn.addEventListener('click', function () {
                        var open = dbgPre.hidden;
                        dbgPre.hidden = !open;
                        dbgBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
                    });
                    copyBtn.addEventListener('click', function () {
                        var text = dbgCopyText;
                        var p = null;
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            p = navigator.clipboard.writeText(text);
                        } else {
                            p = new Promise(function (resolve, reject) {
                                var ta = document.createElement('textarea');
                                ta.value = text;
                                ta.setAttribute('readonly', '');
                                ta.style.position = 'fixed';
                                ta.style.left = '-9999px';
                                document.body.appendChild(ta);
                                ta.select();
                                try {
                                    document.execCommand('copy');
                                    document.body.removeChild(ta);
                                    resolve();
                                } catch (err) {
                                    document.body.removeChild(ta);
                                    reject(err);
                                }
                            });
                        }
                        p.then(function () {
                            showNotification('Debug details copied', 'success');
                        }).catch(function () {
                            showNotification('Could not copy', 'warn');
                        });
                    });
                    dbgToolbar.appendChild(dbgBtn);
                    dbgToolbar.appendChild(copyBtn);
                    dbgWrap.appendChild(dbgToolbar);
                    dbgWrap.appendChild(dbgPre);
                    inner.appendChild(dbgWrap);
                } else {
                    inner.textContent = bodyText || '';
                }
                bubble.appendChild(inner);
                if (isUser) {
                    row.appendChild(bubble);
                } else {
                    row.appendChild(createAgentChatAssistantAvatar(key));
                    row.appendChild(bubble);
                }
                wrap.appendChild(row);
            });
            if (brokerWaitActive) {
                var wrow = document.createElement('div');
                wrow.className = 'agent-chat-row agent-chat-row--assistant';
                var wdiv = document.createElement('div');
                wdiv.className = 'agent-chat-bubble agent-chat-bubble--assistant agent-chat-bubble--waiting';
                wdiv.setAttribute('role', 'status');
                wdiv.setAttribute('aria-live', 'polite');
                var innerW = document.createElement('div');
                innerW.className = 'agent-chat-wait-row';
                var spin = document.createElement('span');
                spin.className = 'agent-chat-wait-spin';
                spin.setAttribute('aria-hidden', 'true');
                var mspan = document.createElement('span');
                mspan.className = 'agent-chat-wait-msg';
                mspan.id = 'agentChatWaitMsg';
                mspan.textContent = AGENT_WAIT_PHRASES[0];
                innerW.appendChild(spin);
                innerW.appendChild(mspan);
                wdiv.appendChild(innerW);
                wrow.appendChild(createAgentChatAssistantAvatar(key));
                wrow.appendChild(wdiv);
                wrap.appendChild(wrow);
            }
            wrap.scrollTop = wrap.scrollHeight;
        }

        function syncAgentChatMinimizeButton() {
            var minimized = panel.classList.contains('agent-chat-panel--minimized');
            var btn = document.getElementById('agentChatMinimizeBtn');
            if (!btn) return;
            var minSvg = btn.querySelector('.agent-chat-icon-minimize');
            var maxSvg = btn.querySelector('.agent-chat-icon-maximize');
            btn.setAttribute('aria-label', minimized ? 'Maximize' : 'Minimize');
            btn.setAttribute('title', minimized ? 'Maximize' : 'Minimize');
            if (minSvg) {
                if (minimized) minSvg.setAttribute('hidden', '');
                else minSvg.removeAttribute('hidden');
            }
            if (maxSvg) {
                if (minimized) maxSvg.removeAttribute('hidden');
                else maxSvg.setAttribute('hidden', '');
            }
        }

        function openPanel() {
            panel.classList.remove('agent-chat-panel--minimized');
            panel.removeAttribute('hidden');
            requestAnimationFrame(function () {
                panel.classList.add('is-open');
            });
            fab.setAttribute('hidden', '');
            syncAgentChatMinimizeButton();
            updateChatHeader();
            renderMessages();
        }

        function closePanel() {
            panel.classList.remove('is-open');
            setTimeout(function () {
                if (!panel.classList.contains('is-open')) {
                    panel.setAttribute('hidden', '');
                }
            }, 220);
            fab.removeAttribute('hidden');
        }

        function setAddBrokerFormOpen(open) {
            var el = document.getElementById('addBrokerForm');
            var headBtn = document.getElementById('toggleAddFormBtn');
            if (!el) return;
            if (open) {
                el.classList.remove('is-hidden');
                if (headBtn) {
                    headBtn.setAttribute('aria-expanded', 'true');
                    headBtn.classList.add('is-active');
                }
                requestAnimationFrame(function () {
                    var u = document.getElementById('agentChatBrokerUrl');
                    if (u) u.focus();
                });
            } else {
                el.classList.add('is-hidden');
                if (headBtn) {
                    headBtn.setAttribute('aria-expanded', 'false');
                    headBtn.classList.remove('is-active');
                }
            }
        }

        function showSettings(show) {
            var main = document.getElementById('agentChatMain');
            var st = document.getElementById('agentChatSettings');
            if (!main || !st) return;
            if (show) {
                main.classList.add('is-hidden');
                st.classList.add('is-visible');
                setAddBrokerFormOpen(false);
            } else {
                st.classList.remove('is-visible');
                main.classList.remove('is-hidden');
                setAddBrokerFormOpen(false);
            }
        }

        function refreshBrokerListUi() {
            var grid = document.getElementById('agentChatBrokerList');
            if (!grid) return;
            grid.innerHTML = '';
            if (!brokers.length) {
                var empty = document.createElement('div');
                empty.className = 'broker-grid__empty';
                empty.textContent = 'No brokers yet. Use Add broker above to connect one.';
                grid.appendChild(empty);
            }
            brokers.forEach(function (b) {
                var card = document.createElement('button');
                card.type = 'button';
                card.className = 'broker-tile' + (b.id === defaultBrokerId ? ' is-default' : '');
                var display = brokerDisplayName(b);
                var fullName = (b.card && b.card.name) ? String(b.card.name) : String(b.name || b.id || '');
                var fullVersion = (b.card && b.card.version) ? String(b.card.version) : String(b.version || '');
                if (!String(fullName).trim()) {
                    fullName = '—';
                }
                var verStr = fullVersion && String(fullVersion).trim() ? String(fullVersion).trim() : '';
                if (verStr && !/^v\d/i.test(verStr)) {
                    verStr = 'v' + verStr;
                }
                card.setAttribute('aria-label', 'Open details for ' + display);
                if (b.id === defaultBrokerId) {
                    var badge = document.createElement('span');
                    badge.className = 'badge';
                    badge.textContent = 'Default';
                    card.appendChild(badge);
                }
                var l1 = document.createElement('div');
                l1.className = 'tile-alias';
                l1.textContent = display;
                l1.title = display;
                var l2 = document.createElement('div');
                l2.className = 'tile-meta';
                l2.textContent = fullName;
                l2.title = fullName;
                var l3 = document.createElement('div');
                l3.className = 'tile-desc';
                l3.textContent = verStr || '—';
                var actions = document.createElement('div');
                actions.className = 'broker-tile__actions';
                var defB = document.createElement('button');
                defB.type = 'button';
                defB.className = 'broker-tile__link';
                defB.textContent = b.id === defaultBrokerId ? 'Clear default' : 'Set default';
                defB.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (b.id === defaultBrokerId) {
                        setDefaultBroker(null);
                    } else {
                        setDefaultBroker(b.id);
                    }
                });
                var rm = document.createElement('button');
                rm.type = 'button';
                rm.className = 'broker-tile__remove';
                rm.textContent = 'Remove';
                rm.addEventListener('click', function (e) {
                    e.stopPropagation();
                    removeBroker(b.id);
                });
                card.appendChild(l1);
                card.appendChild(l2);
                card.appendChild(l3);
                actions.appendChild(defB);
                actions.appendChild(rm);
                card.appendChild(actions);
                card.addEventListener('click', function () {
                    showBrokerDetailModal(b);
                });
                grid.appendChild(card);
            });
        }

        function escapeHtml(s) {
            var d = document.createElement('div');
            d.textContent = s;
            return d.innerHTML;
        }

        function buildAgentCardHtml(card, chatUrl, brokerRow) {
            card = card || {};
            var aliasBlock = (brokerRow && brokerRow.alias != null && String(brokerRow.alias).trim() !== '')
                ? ('<dt>Alias</dt><dd>' + escapeHtml(String(brokerRow.alias).trim()) + '</dd>')
                : '';
            var skills = Array.isArray(card.skills) ? card.skills : [];
            var skillBlocks = skills.map(function (sk) {
                return (
                    '<div class="agent-broker-skill"><strong>' + escapeHtml(String(sk.name || sk.id || 'Skill')) + '</strong>' +
                    '<p class="agent-broker-skill-desc">' + escapeHtml(String(sk.description || '')) + '</p></div>'
                );
            }).join('');
            var inModes = (card.defaultInputModes || []).join(', ');
            var outModes = (card.defaultOutputModes || []).join(', ');
            return (
                '<dl class="agent-broker-dl">' +
                aliasBlock +
                '<dt>Protocol</dt><dd>' + escapeHtml(String(card.protocolVersion || '—')) + '</dd>' +
                '<dt>Name</dt><dd>' + escapeHtml(String(card.name || '—')) + '</dd>' +
                '<dt>Version</dt><dd>' + escapeHtml(String(card.version || '—')) + '</dd>' +
                '<dt>Description</dt><dd>' + escapeHtml(String(card.description || '—')) + '</dd>' +
                '<dt>Card URL</dt><dd class="agent-broker-url">' + escapeHtml(String(card.url || '')) + '</dd>' +
                '<dt>Chat URL</dt><dd class="agent-broker-url">' + escapeHtml(String(chatUrl || '')) + '</dd>' +
                '<dt>Input modes</dt><dd>' + escapeHtml(inModes || '—') + '</dd>' +
                '<dt>Output modes</dt><dd>' + escapeHtml(outModes || '—') + '</dd>' +
                '</dl>' +
                (skillBlocks ? '<h5 class="agent-broker-skills-h">Skills</h5>' + skillBlocks : '')
            );
        }

        function closeAllAgentBrokerModals() {
            var a = ['agentBrokerPreviewModal', 'agentBrokerDetailModal'];
            for (var i = 0; i < a.length; i++) {
                var m = document.getElementById(a[i]);
                if (m) m.setAttribute('hidden', '');
            }
        }

        function showPreviewCardModal(title, innerHtml) {
            var body = document.getElementById('agentBrokerPreviewModalBody');
            var tt = document.getElementById('agentBrokerPreviewModalTitle');
            if (tt) tt.textContent = title || 'Agent card preview';
            if (body) body.innerHTML = innerHtml;
            var modal = document.getElementById('agentBrokerPreviewModal');
            if (modal) modal.removeAttribute('hidden');
        }

        function showBrokerDetailModal(b) {
            var titleEl = document.getElementById('agentBrokerDetailModalTitle');
            var body = document.getElementById('agentBrokerDetailModalBody');
            if (titleEl) titleEl.textContent = b ? brokerDisplayName(b) : 'Agent details';
            if (body) body.innerHTML = buildAgentCardHtml((b && b.card) || {}, b && b.chatUrl, b);
            var modal = document.getElementById('agentBrokerDetailModal');
            if (modal) modal.removeAttribute('hidden');
        }

        function wireAgentBrokerModalsOnce() {
            function wireClose(id, fn) {
                var el = document.getElementById(id);
                if (el && !el._agentBrokerWired) {
                    el._agentBrokerWired = true;
                    el.addEventListener('click', fn);
                }
            }
            wireClose('agentBrokerPreviewModalClose', closeAllAgentBrokerModals);
            wireClose('agentBrokerPreviewModalBackdrop', closeAllAgentBrokerModals);
            wireClose('agentBrokerDetailModalClose', closeAllAgentBrokerModals);
            wireClose('agentBrokerDetailModalBackdrop', closeAllAgentBrokerModals);
        }
        wireAgentBrokerModalsOnce();

        var brokerUrlHelpBtn = document.getElementById('agentChatBrokerUrlHelpBtn');
        var brokerUrlHelpBlock = document.getElementById('agentChatBrokerUrlHelpBlock');
        if (brokerUrlHelpBtn && brokerUrlHelpBlock) {
            brokerUrlHelpBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (brokerUrlHelpBlock.hasAttribute('hidden')) {
                    brokerUrlHelpBlock.removeAttribute('hidden');
                    brokerUrlHelpBtn.setAttribute('aria-expanded', 'true');
                } else {
                    brokerUrlHelpBlock.setAttribute('hidden', '');
                    brokerUrlHelpBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        function populateAgentSelect() {
            var sel = document.getElementById('agentChatAgentSelect');
            if (!sel) return;
            var cur = sel.value;
            sel.innerHTML = '';
            var o0 = document.createElement('option');
            o0.value = '_legacy';
            o0.textContent = 'Default assistant (legacy)';
            sel.appendChild(o0);
            brokers.forEach(function (b) {
                var o = document.createElement('option');
                o.value = b.id;
                o.textContent = brokerDisplayName(b);
                sel.appendChild(o);
            });
            if (cur && Array.prototype.some.call(sel.options, function (opt) { return opt.value === cur; })) {
                sel.value = cur;
            } else {
                var hasDef = defaultBrokerId && Array.prototype.some.call(brokers, function (b) { return b.id === defaultBrokerId; });
                if (hasDef) {
                    sel.value = defaultBrokerId;
                } else {
                    sel.value = '_legacy';
                }
            }
            activeKey = sel.value || '_legacy';
            updateChatHeader();
        }

        function loadBrokers() {
            return fetch('/api/agent/brokers')
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    brokers = data.brokers || [];
                    if (data.defaultBrokerId != null && data.defaultBrokerId !== '') {
                        defaultBrokerId = data.defaultBrokerId;
                    } else {
                        defaultBrokerId = null;
                    }
                    populateAgentSelect();
                    refreshBrokerListUi();
                })
                .catch(function () {
                    brokers = [];
                    defaultBrokerId = null;
                    populateAgentSelect();
                    refreshBrokerListUi();
                });
        }

        function setDefaultBroker(brokerId) {
            if (!brokerId) {
                return fetch('/api/agent/brokers/default', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: null })
                }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
                    .then(function (res) {
                        if (res.ok) {
                            defaultBrokerId = null;
                            showNotification('Default agent cleared', 'success');
                            return loadBrokers();
                        }
                        showNotification((res.j && res.j.error) || 'Could not clear default', 'warn');
                    });
            }
            return fetch('/api/agent/brokers/default', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: brokerId })
            })
                .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
                .then(function (res) {
                    if (res.ok) {
                        defaultBrokerId = (res.j && res.j.defaultBrokerId) != null ? res.j.defaultBrokerId : brokerId;
                        showNotification('Default agent updated', 'success');
                        return loadBrokers();
                    }
                    showNotification((res.j && (res.j.error || res.j.message)) || 'Could not set default', 'warn');
                })
                .catch(function () {
                    showNotification('Could not set default', 'warn');
                });
        }

        function removeBroker(id) {
            if (!id) return;
            fetch('/api/agent/brokers/' + encodeURIComponent(id), { method: 'DELETE' })
                .then(function (r) {
                    if (!r.ok) throw new Error('delete failed');
                    delete histories[id];
                    return loadBrokers();
                })
                .then(function () {
                    showNotification('Broker removed', 'success');
                })
                .catch(function () {
                    showNotification('Could not remove broker', 'warn');
                });
        }

        fab.addEventListener('click', function () {
            openPanel();
            loadBrokers();
        });

        var closeBtn = document.getElementById('agentChatCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);

        var settingsBtn = document.getElementById('agentChatSettingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', function () {
                panel.classList.remove('agent-chat-panel--minimized');
                showSettings(true);
                loadBrokers();
            });
        }
        var backBtn = document.getElementById('agentChatSettingsBackBtn');
        if (backBtn) backBtn.addEventListener('click', function () { showSettings(false); });

        var toggleAddFormBtn = document.getElementById('toggleAddFormBtn');
        if (toggleAddFormBtn) {
            toggleAddFormBtn.addEventListener('click', function () {
                var form = document.getElementById('addBrokerForm');
                var open = form && !form.classList.contains('is-hidden');
                setAddBrokerFormOpen(!open);
            });
        }
        var cancelAddBtn = document.getElementById('cancelAddBtn');
        if (cancelAddBtn) {
            cancelAddBtn.addEventListener('click', function () {
                setAddBrokerFormOpen(false);
            });
        }

        var sel = document.getElementById('agentChatAgentSelect');
        if (sel) {
            sel.addEventListener('change', function () {
                activeKey = sel.value || '_legacy';
                updateChatHeader();
                renderMessages();
            });
        }

        var minBtn = document.getElementById('agentChatMinimizeBtn');
        if (minBtn) {
            minBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                panel.classList.toggle('agent-chat-panel--minimized');
                syncAgentChatMinimizeButton();
            });
        }
        syncAgentChatMinimizeButton();

        var fInput = document.getElementById('agentChatFileInput');
        var attachBtn = document.getElementById('agentChatAttachBtn');
        if (attachBtn && fInput) {
            attachBtn.addEventListener('click', function () { fInput.click(); });
        }
        if (fInput) {
            fInput.addEventListener('change', function () {
                if (!fInput.files || !fInput.files.length) return;
                for (var fi = 0; fi < fInput.files.length; fi++) {
                    pendingFiles.push(fInput.files[fi]);
                }
                fInput.value = '';
                renderFileChips();
            });
        }

        var previewBtn = document.getElementById('agentChatPreviewBtn');
        if (previewBtn) {
            previewBtn.addEventListener('click', function () {
                var urlEl = document.getElementById('agentChatBrokerUrl');
                var pv = document.getElementById('agentChatCardPreview');
                var url = normalizeBrokerInputUrl(urlEl && urlEl.value);
                if (!url) {
                    showNotification('Enter a broker base URL', 'warn');
                    return;
                }
                fetch('/api/agent/brokers/preview?url=' + encodeURIComponent(url))
                    .then(function (r) {
                        return r.text().then(function (txt) {
                            var data = null;
                            try {
                                data = JSON.parse(txt);
                            } catch (e) {
                                data = { valid: false, error: 'Invalid response (' + r.status + ')' };
                            }
                            if (!r.ok || (data && data.valid === false)) {
                                console.warn('[agent broker] preview', r.status, url, data || txt);
                            } else {
                                console.log('[agent broker] preview ok', r.status, url);
                            }
                            return data;
                        });
                    })
                    .then(function (data) {
                        if (data.valid) {
                            var c = data.card || {};
                            showPreviewCardModal('Agent card preview', buildAgentCardHtml(c, data.chatUrl));
                            if (pv) {
                                pv.setAttribute('hidden', '');
                                pv.textContent = '';
                            }
                        } else {
                            showPreviewCardModal('Preview failed', '<p class="agent-broker-skill-desc">' + escapeHtml(data.error || 'Invalid card') + '</p>');
                            if (pv) {
                                pv.removeAttribute('hidden');
                                pv.textContent = data.error || 'Invalid card';
                            }
                        }
                    })
                    .catch(function (err) {
                        console.error('[agent broker] preview network error', err);
                        showPreviewCardModal('Preview failed', '<p class="agent-broker-skill-desc">' + escapeHtml(String(err && err.message ? err.message : 'Network error')) + '</p>');
                    });
            });
        }

        var addBtn = document.getElementById('agentChatAddBrokerBtn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                var urlEl = document.getElementById('agentChatBrokerUrl');
                var aliasEl = document.getElementById('agentChatBrokerAlias');
                var url = normalizeBrokerInputUrl(urlEl && urlEl.value);
                var alias = aliasEl && String(aliasEl.value || '').trim() ? String(aliasEl.value).trim() : '';
                if (!url) {
                    showNotification('Enter a broker base URL', 'warn');
                    return;
                }
                if (!alias) {
                    showNotification('Enter a display name (alias) for this broker', 'warn');
                    return;
                }
                console.log('[agent broker] POST /api/agent/brokers', { baseUrl: url, alias: alias });
                fetch('/api/agent/brokers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ baseUrl: url, alias: alias })
                })
                    .then(function (r) {
                        return r.text().then(function (txt) {
                            var j = null;
                            try {
                                j = txt ? JSON.parse(txt) : {};
                            } catch (e) {
                                j = { error: txt ? txt.slice(0, 200) : 'Empty response' };
                            }
                            if (!r.ok) {
                                console.warn('[agent broker] add broker response', r.status, j, txt ? txt.slice(0, 500) : '');
                            } else {
                                console.log('[agent broker] add broker ok', r.status, j);
                            }
                            return { ok: r.ok, status: r.status, body: j };
                        });
                    })
                    .then(function (res) {
                        if (!res.ok) {
                            var msg = (res.body && (res.body.error || res.body.message)) ? (res.body.error || res.body.message) : ('Could not add broker (' + res.status + ')');
                            showNotification(msg, 'warn');
                            return;
                        }
                        showNotification('Broker added', 'success');
                        closeAllAgentBrokerModals();
                        if (urlEl) urlEl.value = '';
                        if (aliasEl) aliasEl.value = '';
                        setAddBrokerFormOpen(false);
                        var pv = document.getElementById('agentChatCardPreview');
                        if (pv) {
                            pv.setAttribute('hidden', '');
                            pv.textContent = '';
                        }
                        return loadBrokers();
                    })
                    .catch(function (err) {
                        console.error('[agent broker] add broker network error', err);
                        showNotification('Could not add broker', 'warn');
                    });
            });
        }

        function buildOpenAiMessages(key) {
            var list = ensureHistory(key);
            return list.map(function (m) {
                return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content || '' };
            });
        }

        function sendChat() {
            var input = document.getElementById('agentChatInput');
            var key = histKeyForSelect();
            var userText = input ? String(input.value || '').trim() : '';
            var names = pendingFiles.map(function (f) { return f.name; });
            var fileLine = names.length ? ('[Attached: ' + names.join(', ') + ']') : '';
            var text = (userText + (fileLine ? (userText ? '\n\n' : '') + fileLine : '')).trim();
            if (!text) return;
            pendingFiles = [];
            renderFileChips();
            var sendBtn = document.getElementById('agentChatSendBtn');
            if (sendBtn) sendBtn.disabled = true;

            brokerWaitActive = key !== '_legacy';

            ensureHistory(key).push({ role: 'user', content: text });
            if (input) input.value = '';
            renderMessages();
            if (brokerWaitActive) {
                startBrokerWaitPhrases();
            }

            var messages = buildOpenAiMessages(key);
            var body = { messages: messages };
            if (key !== '_legacy') {
                body.agentId = key;
            }

            fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
                .then(function (r) {
                    return r.text().then(function (txt) {
                        var data = null;
                        try {
                            data = txt ? JSON.parse(txt) : null;
                        } catch (e) {
                            data = null;
                        }
                        return { ok: r.ok, status: r.status, data: data, raw: txt || '' };
                    });
                })
                .then(function (res) {
                    var data = res.data;
                    var reply = (data && data.reply) ? String(data.reply) : '';
                    var debug = data && data.debug ? data.debug : null;
                    var friendlyDefault =
                        'There was an issue processing the response. Please try again in a moment.';
                    if (!res.ok) {
                        var detail = res.raw ? res.raw.slice(0, 2000) : '';
                        ensureHistory(key).push({
                            role: 'assistant',
                            content: friendlyDefault,
                            debug: {
                                httpStatus: res.status,
                                detail: detail || ('HTTP ' + res.status),
                                parseError: data ? null : 'Response was not valid JSON'
                            }
                        });
                        return;
                    }
                    if (data == null && res.raw) {
                        ensureHistory(key).push({
                            role: 'assistant',
                            content: friendlyDefault,
                            debug: {
                                httpStatus: res.status,
                                detail: res.raw.slice(0, 2000),
                                parseError: 'Response was not valid JSON'
                            }
                        });
                        return;
                    }
                    if (data && data.error && !reply) {
                        reply = 'Error: ' + (data.errorType || data.error || 'unknown');
                    }
                    if (!reply && data && !data.error) {
                        reply = '(no reply)';
                    }
                    if (data && data.error && !debug) {
                        debug = {
                            errorType: data.errorType || null,
                            serverReply: reply,
                            hint:
                                key !== '_legacy'
                                    ? 'If this persists, confirm the A2A broker URL in Agent settings and check server logs.'
                                    : null
                        };
                        if (/^Error:/i.test(reply) || /Could not complete A2A/i.test(reply)) {
                            reply = friendlyDefault;
                        }
                    }
                    ensureHistory(key).push({
                        role: 'assistant',
                        content: reply || '(no reply)',
                        debug: debug || undefined
                    });
                })
                .catch(function (err) {
                    ensureHistory(key).push({
                        role: 'assistant',
                        content:
                            'There was an issue processing the response. Please try again in a moment.',
                        debug: {
                            networkError: true,
                            detail: (err && err.message) ? String(err.message) : 'Request failed'
                        }
                    });
                })
                .finally(function () {
                    brokerWaitActive = false;
                    stopBrokerWaitPhrases();
                    if (sendBtn) sendBtn.disabled = false;
                    renderMessages();
                });
        }

        var sendBtn = document.getElementById('agentChatSendBtn');
        if (sendBtn) sendBtn.addEventListener('click', sendChat);
        var inputEl = document.getElementById('agentChatInput');
        if (inputEl) {
            inputEl.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                }
            });
        }

        var clearCur = document.getElementById('agentChatClearCurrentBtn');
        if (clearCur) {
            clearCur.addEventListener('click', function () {
                var key = histKeyForSelect();
                histories[key] = [];
                renderMessages();
                showNotification('Active agent history cleared', 'success');
            });
        }
        var clearAll = document.getElementById('agentChatClearAllBtn');
        if (clearAll) {
            clearAll.addEventListener('click', function () {
                histories = {};
                renderMessages();
                showNotification('All chat history cleared', 'success');
            });
        }

        window._agentChatHandleEscape = function () {
            if (!panel.classList.contains('is-open')) return false;
            var pm = document.getElementById('agentBrokerPreviewModal');
            var dm = document.getElementById('agentBrokerDetailModal');
            if (pm && !pm.hasAttribute('hidden')) {
                closeAllAgentBrokerModals();
                return true;
            }
            if (dm && !dm.hasAttribute('hidden')) {
                closeAllAgentBrokerModals();
                return true;
            }
            var st = document.getElementById('agentChatSettings');
            if (st && st.classList.contains('is-visible')) {
                showSettings(false);
                return true;
            }
            closePanel();
            return true;
        };

        var salesforceLogoEl = document.getElementById('agentChatSalesforceLogo');
        if (salesforceLogoEl) {
            try {
                salesforceLogoEl.src = new URL('web/images/sf_logo.png?v=20250422', window.location.href).href;
            } catch (e) {
                /* keep template src */
            }
            var sfTriedPlain = false;
            salesforceLogoEl.addEventListener('error', function onSfLogoErr() {
                if (!sfTriedPlain) {
                    sfTriedPlain = true;
                    try {
                        salesforceLogoEl.src = new URL('web/images/sf_logo.png', window.location.href).href;
                    } catch (e2) {
                        salesforceLogoEl.setAttribute('hidden', '');
                        salesforceLogoEl.removeEventListener('error', onSfLogoErr);
                    }
                    return;
                }
                salesforceLogoEl.setAttribute('hidden', '');
                salesforceLogoEl.removeEventListener('error', onSfLogoErr);
            });
        }
    }

    function startWire() {
        ensureBrands()
            .then(function () {
                initBrandingOnce();
                wireDom();
            })
            .catch(function () {
                BRANDS = DEFAULT_BRANDS;
                initBrandingOnce();
                wireDom();
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startWire);
    } else {
        startWire();
    }

    window.addEventListener('load', function () {
        ensureBrands()
            .then(function () {
                initBrandingOnce();
                return handleOAuthReturn();
            })
            .catch(function () {
                BRANDS = DEFAULT_BRANDS;
                initBrandingOnce();
                return handleOAuthReturn();
            })
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
                maybeRevealSmartOffers();
                refreshNotifUi();
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
