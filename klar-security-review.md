# Klar Security Review — Read-Only Static Audit

Scope: `Klar Rebrand.html` (~17,835 lines), `functions/{get-tier,paddle-webhook,delete-account}`, `_headers`, `netlify.toml`, `privacy.html`, `terms.html`. Static code review only — nothing executed against production.

---

## Medium

### M1 — Privacy policy overstates what the AI Advisor keeps private
- **File:** `privacy.html:272` claims: *"a financial summary only ... is sent to Groq Inc's API. Raw transactions, descriptions, names, and account numbers are **never** transmitted to Groq."*
- **Contradicted by:** `Klar Rebrand.html:13883-13894` (`explainTxn`) — the "Explain transaction" quick action builds a chat prompt containing the **raw transaction description** (`t.description`) and amount, and sends it to Groq via `sendChat()`. Similarly `generateMonthChecklist()` (`Klar Rebrand.html:13897-13909`) includes user-entered **bill names** (`b.name`) in the prompt sent to Groq.
- Only `autoMoSummary()` (line 7037) is a true aggregate-only summary; the other two AI entry points send user-entered free text.
- **Impact:** This is a factual misstatement in a document users rely on for consent (POPIA/GDPR-adjacent). Not an exploit, but a compliance/trust risk for a finance app — a regulator or a privacy-conscious user could reasonably call this misleading.
- **Fix suggestion:** Either strip descriptions/bill names before sending (send category+amount only), or correct the privacy policy wording to say descriptions *can* be sent when you use "Explain transaction" / "Month checklist" (and consider a per-feature consent toggle).

---

## Low

### L1 — Groq API key stored in plaintext in `localStorage`
- **File:** `Klar Rebrand.html:5357` (`prefs.groqKey`), persisted via `localStorage.setItem('cl_v55', ...)` at `Klar Rebrand.html:5436`.
- The key is never sent anywhere but `https://api.groq.com/...` (`Klar Rebrand.html:7062`, `17920`-area) — confirmed no other exfiltration path — and it is explicitly excluded from cloud sync (`Klar Rebrand.html:15455`, `15511`). So exposure is limited to local device compromise or an XSS on this origin (none found in this review).
- **Fix suggestion:** Low priority for a client-only architecture; note the risk to users ("don't use Klar on a shared/public machine with AI features enabled") or key off browser session storage rather than persistent localStorage.

### L2 — App PIN lock is a cosmetic overlay, not a real access boundary
- **File:** `Klar Rebrand.html:16381-16460`. The "PIN" is a non-cryptographic rolling checksum (`_klHashPin`, line 16381-16386) gating a `display:none/flex` toggle on `#kl-pin-lock` (line 16441, 16459). All underlying app data and DOM remain present/queryable; anyone with devtools access (or who edits `localStorage`) bypasses it trivially.
- Privacy policy (`privacy.html:394`) recommends the PIN lock "if you share a device," which somewhat overstates its protection.
- **Fix suggestion:** No change needed for a convenience feature, but soften the privacy-policy wording so it isn't read as a real access control, or gate app-shell rendering behind it rather than an overlay.

### L3 — `esc()` helper doesn't escape single quotes
- **File:** `Klar Rebrand.html:6100`: `esc = s => (s||'').replace(/&/…).replace(/</…).replace(/>/…).replace(/"/…)` — no `'` → `&#39;` mapping.
- Spot-checked ~10 innerHTML sites (transactions `Klar Rebrand.html:8771-8773`, goals `10327-10332`, debts `10432` region, subscriptions `9493`) — all consistently wrap user strings in `esc()`, and all interpolate into **double-quoted** HTML attributes, so a bare `'` cannot break attribute context today. No exploitable path found. This is purely latent — a future edit that puts `esc()`'d text inside a single-quoted attribute or inline `onclick('...')` argument would reopen an injection.
- **Fix suggestion:** Add `'` → `&#39;` to `esc()` for defense in depth; no urgency.

### L4 — CORS `Access-Control-Allow-Origin: *` on all three Edge Functions
- **Files:** `functions/get-tier/index.ts:34,141`, `functions/delete-account/index.ts:39,91`, (paddle-webhook has no CORS headers needed — server-to-server webhook, no browser preflight).
- All state-changing calls (`get-tier`, `delete-account`) require a valid Supabase user JWT in the `Authorization` header, which a wildcard-origin page cannot silently attach (unlike cookies) — a malicious site would need the user's token already, which defeats the purpose of stealing it via CORS. So the practical risk is low, but wildcard CORS is broader than necessary.
- **Fix suggestion:** Scope `Access-Control-Allow-Origin` to the app's real origins (`https://klarmoney.app`, `https://*.netlify.app` as needed) instead of `*`.

### L5 — Function file naming/comments say "Paddle" but implementation is Lemon Squeezy
- **File:** `functions/paddle-webhook/index.ts:1-21` — folder and header comment say "paddle-webhook" / "Paddle" in places, but the code verifies Lemon Squeezy (`LEMONSQUEEZY_WEBHOOK_SECRET`, `X-Signature` HMAC) events only. Purely a naming/maintainability issue, not a vulnerability — flagging so it isn't mistaken for an active Paddle integration during a future audit.
- **Fix suggestion:** Rename folder/comments to `lemonsqueezy-webhook` for clarity.

---

## Not a finding (verified clean)

- **Groq key exfiltration:** only sent to `api.groq.com`, confirmed at all 3 fetch call sites (`Klar Rebrand.html:7062`, and the `sendChat`/AI-advisor call site near 17920).
- **`eval(`:** zero occurrences in the file.
- **Hardcoded secrets:** none found beyond the Supabase **anon/publishable** key (`Klar Rebrand.html:15248-15249`), which is safe to ship client-side by design (protected by Postgres RLS, not a secret).
- **Edge Functions auth:** `get-tier` and `delete-account` both verify the caller's Supabase JWT server-side before doing anything user-scoped; `delete-account` never takes a target user id from the request body — always from the verified token (`functions/delete-account/index.ts:63-74`). `paddle-webhook` (Lemon Squeezy) verifies an HMAC-SHA256 signature with a constant-time comparison (`functions/paddle-webhook/index.ts:58-87`) before trusting any payload.
- **Tier tampering:** cloud sync explicitly refuses to trust a `tier` value round-tripped through the client-writable `klar_syncs` blob; it's always re-verified server-side via `get-tier` (`Klar Rebrand.html:15503-15511`, well-commented).
- **CSP:** `_headers` and `netlify.toml` are identical. No `unsafe-eval`, no wildcard `script-src`/`connect-src` — both are explicit allowlists (Lemon Squeezy, jsDelivr, Cloudflare Insights/CDN, Supabase, Groq, PostHog, Crisp, Saltedge, Frankfurter). `'unsafe-inline'` is present for script/style, which is expected/necessary given this is a single-file app with inline `<script>`/`onclick=` handlers, and is a materially smaller risk than `unsafe-eval` or a wildcard source.
- **innerHTML/`esc()` spot-check (10 sites):** transactions, goals, debts, subscriptions, delete-confirmation dialogs all consistently escape user-entered `name`/`description`/`note` fields before interpolation; `klConfirm`/`notify` use `.textContent`, not `innerHTML`, so confirm-dialog messages carrying raw names are inherently safe regardless of `esc()`.
- **localStorage contents:** the full app state `S` (transactions, balances, goals, debts, prefs) is stored as plaintext JSON under `cl_v55` — expected for a declared "local-first" app and disclosed in `privacy.html:264,437`. No secrets found there beyond the Groq key (see L1).

---

## Summary for the founder

The most important finding is a **Medium**: `privacy.html` states raw transaction descriptions are "never" sent to Groq, but the "Explain transaction" and "Month checklist" AI features do send them (aggregate-only is true for the automatic month summary, not for these two) — this is a compliance/trust gap worth fixing either by scrubbing that data before it's sent or correcting the policy language. Everything else found is Low severity: the Groq key sits in plaintext localStorage but never leaves the browser except to Groq itself, the app's "PIN lock" is a cosmetic overlay rather than a real access boundary and shouldn't be described as one, and the Edge Functions (`get-tier`, `delete-account`, the Lemon-Squeezy webhook) are all soundly built — proper JWT verification, HMAC signature checks, and no client-controllable tier escalation path. No critical or high-severity issues, no hardcoded secrets, no `eval`, and the CSP and `esc()`-based HTML escaping are consistently applied across the ~10 innerHTML sites spot-checked.
