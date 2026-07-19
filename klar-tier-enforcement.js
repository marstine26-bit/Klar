/**
 * Klar — Server-side tier enforcement patch
 * ═══════════════════════════════════════════════════════════════════════════
 * Drop this <script> block immediately before </body> in Klar Rebrand.html.
 *
 * What this does:
 *  1. klVerifyTier()   — calls the get-tier Edge Function and writes the
 *                        authoritative tier back to S.prefs.tier + save()
 *  2. Hooks into:
 *       • SIGNED_IN auth state change  (login)
 *       • DOMContentLoaded + existing session  (app start)
 *       • Paddle checkout.completed  (post-purchase)
 *  3. Hardens klHasTier() so an unauthenticated user always gets 'free'
 *     regardless of what's in localStorage.
 *  4. Patches klSubscribe() to pass supabase_user_id as Paddle custom_data
 *     so the webhook can link the subscription to the Supabase user.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function klTierEnforcement() {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  const GET_TIER_URL = 'https://msaktocpuidvqtohpqqn.supabase.co/functions/v1/get-tier';
  const TIER_ORDER   = ['free', 'essential', 'pro', 'family'];

  // Minimum ms between server verifications (5 minutes).
  // Prevents hammering the function on every save() call.
  const VERIFY_THROTTLE_MS = 5 * 60 * 1000;
  let _lastVerifyAt = 0;
  let _verifying    = false;

  // ── klVerifyTier ──────────────────────────────────────────────────────────
  /**
   * Calls the get-tier Edge Function with the current user's JWT.
   * On success, updates S.prefs.tier to the server-authoritative value.
   * Non-blocking — never delays app startup or UI interactions.
   *
   * @param {boolean} [force=false]  Skip throttle check (use after checkout)
   */
  window.klVerifyTier = async function klVerifyTier(force = false) {
    // Guard: must have Supabase client and an authenticated user
    if (typeof _sb === 'undefined' || !_sb) return;
    if (typeof _sbUser === 'undefined' || !_sbUser) {
      // No user → enforce free locally
      _applyTier('free', null, null);
      return;
    }

    // Throttle — don't re-verify if we verified recently, unless forced
    const now = Date.now();
    if (!force && (now - _lastVerifyAt) < VERIFY_THROTTLE_MS) return;
    if (_verifying) return;

    _verifying = true;
    try {
      // Get fresh session JWT
      const { data: { session } } = await _sb.auth.getSession();
      if (!session?.access_token) {
        _applyTier('free', null, null);
        return;
      }

      const res = await fetch(GET_TIER_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
      });

      if (!res.ok) {
        console.warn('[Klar] get-tier returned', res.status, '— keeping cached tier');
        return; // Keep whatever is in S.prefs.tier; don't downgrade on network error
      }

      const body = await res.json();
      _lastVerifyAt = Date.now();
      _applyTier(body.tier || 'free', body.status || null, body.expires || null);

    } catch (err) {
      // Network failure — silently keep cached value. This is intentional:
      // failing open (keeping existing tier) is safer UX than hard-locking
      // a paying user because of a momentary network blip.
      console.warn('[Klar] Tier verification failed (network?):', err.message);
    } finally {
      _verifying = false;
    }
  };

  // ── Apply tier to local state ─────────────────────────────────────────────
  function _applyTier(tier, status, expires) {
    if (typeof S === 'undefined') return;

    const validTiers = ['free', 'essential', 'pro', 'family'];
    const safeTier   = validTiers.includes(tier) ? tier : 'free';

    const changed = S.prefs.tier !== safeTier;
    S.prefs.tier = safeTier;

    // Store expiry for local display (not used for gating)
    if (expires !== null) S.prefs._tierExpires = expires;
    if (status  !== null) S.prefs._tierStatus  = status;

    if (changed) {
      console.info('[Klar] Tier updated from server:', safeTier);
      // Persist and re-render so UI reflects the correct plan
      if (typeof save === 'function') save();
      if (typeof renderAll === 'function') renderAll();
      if (typeof rSettingsPlanTiles === 'function') rSettingsPlanTiles();
    }

    if (status === 'tester') {
      _renderTesterSwitcher();
      _updateTesterSwitcherActive();
    } else {
      _removeTesterSwitcher();
    }
  }

  // ── QA tester tier switcher ─────────────────────────────────────────────
  // Only ever shown to accounts with a tester_overrides row (see get-tier),
  // which only a service-role process can create — a normal signup can never
  // make this appear for themselves.
  function _renderTesterSwitcher() {
    if (document.getElementById('kl-tester-switcher')) return;
    const el = document.createElement('div');
    el.id = 'kl-tester-switcher';
    el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;background:#0D0D14;border:1px solid #9B7FD4;border-radius:12px;padding:10px 12px;display:flex;gap:6px;align-items:center;font:600 11px system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4)';

    const label = document.createElement('span');
    label.textContent = 'QA tier';
    label.style.cssText = 'color:#8A8A98;letter-spacing:.05em;text-transform:uppercase;font-size:9px;margin-right:2px';
    el.appendChild(label);

    TIER_ORDER.forEach((t) => {
      const btn = document.createElement('button');
      btn.textContent = t;
      btn.dataset.tier = t;
      btn.type = 'button';
      btn.style.cssText = 'border:1px solid #1E1E2E;background:#161622;color:#F0F0EE;border-radius:6px;padding:4px 8px;cursor:pointer;text-transform:capitalize;font:inherit';
      btn.addEventListener('click', () => _switchTesterTier(t));
      el.appendChild(btn);
    });

    document.body.appendChild(el);
  }

  function _updateTesterSwitcherActive() {
    const el = document.getElementById('kl-tester-switcher');
    if (!el) return;
    const cur = S?.prefs?.tier;
    el.querySelectorAll('button').forEach((b) => {
      const active = b.dataset.tier === cur;
      b.style.background = active ? '#9B7FD4' : '#161622';
      b.style.color      = active ? '#fff' : '#F0F0EE';
    });
  }

  function _removeTesterSwitcher() {
    const el = document.getElementById('kl-tester-switcher');
    if (el) el.remove();
  }

  async function _switchTesterTier(tier) {
    if (typeof _sb === 'undefined' || !_sb) return;
    if (typeof _sbUser === 'undefined' || !_sbUser) return;
    const { error } = await _sb.from('tester_overrides').update({ tier }).eq('user_id', _sbUser.id);
    if (error) {
      console.warn('[Klar] tester tier switch failed:', error.message);
      if (typeof notify === 'function') notify('Could not switch tier', 'err');
      return;
    }
    await window.klVerifyTier(true);
  }

  // ── Harden klHasTier ─────────────────────────────────────────────────────
  /**
   * Overrides the existing klHasTier() so that:
   *  • An unauthenticated user always gets 'free', regardless of localStorage.
   *  • A cancelled+expired subscription is treated as 'free'.
   */
  // Wait until the original is defined, then override
  function _patchKlHasTier() {
    if (typeof klHasTier !== 'function') {
      setTimeout(_patchKlHasTier, 100);
      return;
    }
    // Keep original for reference (not used, but helps debugging)
    window._klHasTierOriginal = window.klHasTier;

    window.klHasTier = function klHasTier(required) {
      // If no authenticated user, always enforce free — never trust localStorage alone
      if (typeof _sbUser === 'undefined' || !_sbUser) {
        return TIER_ORDER.indexOf('free') >= TIER_ORDER.indexOf(required);
      }

      // Check server-reported expiry
      const expires = S?.prefs?._tierExpires;
      const status  = S?.prefs?._tierStatus;
      if (expires && status === 'cancelled' && new Date(expires) < new Date()) {
        return TIER_ORDER.indexOf('free') >= TIER_ORDER.indexOf(required);
      }

      const tier = S?.prefs?.tier || 'free';
      return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(required);
    };
  }
  _patchKlHasTier();

  // ── Patch Supabase auth state listener ───────────────────────────────────
  /**
   * Hooks into the Supabase onAuthStateChange listener that already exists
   * in _initSupabase(). We wait for the Supabase client to be ready, then
   * add our own listener alongside the existing one.
   */
  function _attachAuthListener() {
    if (typeof _sb === 'undefined' || !_sb) {
      setTimeout(_attachAuthListener, 200);
      return;
    }
    _sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Non-blocking; verify tier after the existing sync logic runs
        setTimeout(() => window.klVerifyTier(true), 500);
      }
      if (event === 'SIGNED_OUT') {
        // Clear cached tier data — revert to free
        if (typeof S !== 'undefined' && S.prefs) {
          S.prefs.tier         = 'free';
          S.prefs._tierExpires = null;
          S.prefs._tierStatus  = null;
          _lastVerifyAt = 0;
        }
        _removeTesterSwitcher();
      }
    });
  }

  // ── Check for existing session on app start ───────────────────────────────
  function _verifyOnStart() {
    if (typeof _sb === 'undefined' || !_sb) {
      setTimeout(_verifyOnStart, 300);
      return;
    }
    _sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Already logged in — verify tier in the background
        window.klVerifyTier();
      }
    });
  }

  // ── Patch Paddle checkout.completed ──────────────────────────────────────
  /**
   * The existing Paddle eventCallback already sets S.prefs.tier client-side.
   * We add a server verification after checkout to get the canonical value
   * from the DB (webhook may have beaten us to it, or may arrive shortly after).
   *
   * We also patch Paddle.Initialize so klSubscribe() passes supabase_user_id
   * as custom_data — this is what lets the paddle-webhook identify the user.
   */
  function _patchPaddleInit() {
    if (typeof window.Paddle === 'undefined') {
      setTimeout(_patchPaddleInit, 500);
      return;
    }

    const _origInit = window.Paddle.Initialize.bind(window.Paddle);
    window.Paddle.Initialize = function(opts) {
      const _userCallback = opts.eventCallback;

      opts.eventCallback = function(ev) {
        // Run the original callback first
        if (typeof _userCallback === 'function') _userCallback(ev);

        if (ev.name === 'checkout.completed') {
          // After Paddle checkout, wait briefly for the webhook to arrive,
          // then force-verify so the DB value wins over the client-side guess.
          setTimeout(() => window.klVerifyTier(true), 3000);
          // Also retry at 8 s in case webhook processing was slow
          setTimeout(() => window.klVerifyTier(true), 8000);
        }
      };

      return _origInit(opts);
    };
  }

  // ── Patch klSubscribe to inject custom_data ───────────────────────────────
  /**
   * Paddle's checkout.open() accepts a `customData` field. We use this to pass
   * the Supabase user_id so the server-side webhook can upsert the subscription
   * row without needing a separate user lookup.
   *
   * The existing klSubscribe() function closes over Paddle.Checkout.open().
   * We patch it after DOMContentLoaded when both Paddle and _sbUser are available.
   */
  function _patchKlSubscribe() {
    if (typeof window.klSubscribe !== 'function') {
      setTimeout(_patchKlSubscribe, 500);
      return;
    }
    if (window._klSubscribePatched) return;
    window._klSubscribePatched = true;

    const _origSubscribe = window.klSubscribe;
    window.klSubscribe = function klSubscribe(planId, billingCycle) {
      // Inject supabase_user_id into Paddle checkout custom_data
      // We do this by monkey-patching Paddle.Checkout.open temporarily.
      if (window.Paddle?.Checkout?.open && typeof _sbUser !== 'undefined' && _sbUser?.id) {
        const _origOpen = window.Paddle.Checkout.open.bind(window.Paddle.Checkout);
        window.Paddle.Checkout.open = function(opts) {
          opts = opts || {};
          opts.customData = Object.assign({}, opts.customData, {
            supabase_user_id: _sbUser.id,
          });
          // Restore immediately so we don't permanently wrap it
          window.Paddle.Checkout.open = _origOpen;
          return _origOpen(opts);
        };
      }
      return _origSubscribe.apply(this, arguments);
    };
  }

  // ── Boot sequence ─────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      _attachAuthListener();
      _verifyOnStart();
      _patchPaddleInit();
      _patchKlSubscribe();
    });
  } else {
    // DOM already ready (script loaded late)
    _attachAuthListener();
    _verifyOnStart();
    _patchPaddleInit();
    _patchKlSubscribe();
  }

})();
