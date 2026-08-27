# Klar — Open Banking & Compliance Roadmap

**Prepared by:** Risk & Compliance Lead (AI-assisted review)
**Date:** 2026-08-27
**Status:** Working doc — needs founder sign-off on legal-entity questions flagged below.

---

## 1. Current state (confirmed by reading the code, not assumed)

The "no Open Banking" narrative in the competitive brief is **out of date**. Klar already has a working Salt Edge integration, not just a stub:

- `klBankConnect()` / `klBankSync()` (Klar Rebrand.html, ~L12309–12471) call two **live Supabase Edge Functions** (`saltedge-connect`, `saltedge-sync` at `msaktocpuidvqtohpqqn.supabase.co`) that are not in this repo (hosted separately) — so the actual OAuth/token handling with Salt Edge happens server-side, which is the right architecture. I could not audit that server code; it's outside this repo.
- The flow is real: opens a Salt Edge Connect widget popup, handles the `bank_connected` / `bank_error` redirect, imports transactions tagged with `saltedge_id` to dedupe, shows connected banks/balances in a "Bank Feeds" screen.
- **Gated to UK region only.** For SA (`_bfRegion==='za'`) the UI explicitly shows "SA Bank Feeds — Coming Soon... integrating with South African banks via Stitch" (L12380–12396) — i.e. Stitch is *planned*, not built. "Other" regions get "not yet available."
- Gated to the **Essential paid tier + signed-in cloud-sync user** — free/guest users don't get it.
- Pricing page copy already says "Bank Feeds (UK, via Salt Edge)" (L15990), so the marketing claim matches the code.

**Bottom line:** Klar has a live, UK-only, tier-gated bank-feed integration via Salt Edge as an aggregator. It is **not** FCA-authorised in its own right, and there is no evidence in this codebase of a signed AISP/agent agreement — that's a legal/commercial fact only the founder can confirm (see §4). The correct investor framing is "we integrate via a regulated Open Banking aggregator" — not "no Open Banking," and not "we are FCA-regulated."

## 2. FCA AISP landscape for a small UK fintech (2026)

Two routes exist to legally pull bank data under UK Open Banking / PSD2-derived rules:

### Route A — Direct FCA authorisation (RAISP or full AISP)
- Registering as a **RAISP** (Registered AIS Provider) is the lightest direct route: you may *only* provide account information services, plus you need professional indemnity insurance (or equivalent) and to pass FCA fit-and-proper/governance checks via the Connect portal.
- **Timeline:** FCA's own published target is ~3 months for a complete RAISP application, but in practice the clock stops every time the FCA sends questions, and total elapsed time commonly runs 4–6 months, sometimes toward a year for AISP with add-on permissions.
- **Cost:** FCA application fee is small for RAISP (roughly £250–500 bracket), but the real cost is preparation — legal/compliance advisory, PI insurance, governance docs, wind-down plan. Industry estimates for a small firm's total pre-authorisation spend run **£50,000–£200,000**, plus the founder or a named individual acting as compliance officer/MLRO.
- Not realistic for a solo pre-revenue founder on the current timeline.

### Route B — Become an Agent of an existing regulated AISP (recommended)
- Under PSD2/UK retained law, a regulated AISP (e.g. TrueLayer, Yapily, Salt Edge) can register **agents** with the FCA who operate under the principal's permissions. The agent is listed on the FCA Register but isn't separately authorised.
- **Timeline:** commonly weeks (4–6 weeks cited by aggregators), not months.
- **Cost:** materially cheaper — commercial/API fees to the aggregator (Salt Edge already has a per-connection or subscription pricing model; exact Klar contract terms weren't in this codebase) plus limited legal review of the agent agreement, no PI insurance or FCA authorisation fee of your own.
- **This is very likely what Klar's existing Salt Edge integration already assumes** — Salt Edge is one of the providers that lets clients operate under its licence. **Needs founder confirmation:** is there a signed agreement with Salt Edge that includes agent registration with the FCA, or is Klar currently using Salt Edge purely as a data API without that formal FCA agent status? If the latter, Klar is technically pulling UK bank data without being on the FCA Register in any capacity — a real compliance gap to close before the raise, not after.

### Recommendation
Do **not** pursue direct FCA authorisation before/during this raise — it's the wrong cost/timeline trade for a pre-revenue solo founder. Instead:
1. Confirm with Salt Edge whether Klar is (or can become) a registered **agent** under their AISP permission — this is the fast, cheap, credible path.
2. Get written confirmation (or the existing contract) showing Klar's FCA status via that route, and get Klar listed on the FCA Register as an agent if not already.
3. If Salt Edge won't offer agent status (some aggregators keep clients as mere API consumers, not FCA-registered agents), evaluate switching/dual-sourcing to Yapily or TrueLayer, both of which are commonly cited as offering agent registration.

## 3. Rough cost & timeline summary

| Path | Timeline | Cost (rough) | Verdict |
|---|---|---|---|
| Direct RAISP/AISP authorisation | 4–6 months (up to ~12) | £50k–£200k+ prep, plus FCA fees & PI insurance | Not viable pre-raise |
| Agent of existing AISP (Salt Edge/Yapily/TrueLayer) | 4–8 weeks | Low — mostly aggregator commercial fees + light legal review | **Do this** |
| Status quo (undocumented aggregator use, no FCA record) | N/A | N/A | Risk — close this gap regardless of raise timing |

## 4. What to tell investors before this is fully resolved

Honest, defensible framing for the deck/data room:

> "Klar already has live UK Open Banking connectivity via Salt Edge, a regulated Open Banking data provider — bank linking, balance and transaction sync are shipped and working today, gated to our paid tier. We operate under Salt Edge's regulatory permissions [as a registered agent — pending confirmation] rather than seeking our own FCA authorisation, which is the standard, capital-efficient path smaller fintechs take (this is how most UK budgeting apps below Series A operate). Direct FCA authorisation is a Series-A-stage decision, not a pre-seed one."

**Do not claim "we don't need FCA involvement at all"** — that's not accurate; being an agent still means being on the FCA Register through the principal. If the agent-registration status isn't yet formalised, say "in progress with our Open Banking provider" rather than implying it's done — an investor's technical diligence (or a lawyer) can and will check the FCA Register.

**Founder action item, flagged not assumed:** confirm Salt Edge contract terms and FCA agent-registration status directly — I could not verify this from the codebase or public sources, and it materially changes what's safe to say to investors.

## 5. POPIA/GDPR consent flow — quick gap-check (code only, no fixes made)

Read `kl-region-gate`, `kl-privacy-gate`, and the consent functions (~L4451–4520, L16196–16340, L17000–17085).

**What's solid:**
- Versioned consent (`PRIVACY_VERSION`, `privacyConsentVersion`) that re-prompts on bump — good practice.
- Consent gate is a genuine blocker before region/currency selection, not just a footer link.
- Real data-deletion path exists: `klDeleteAccount()` calls a `delete-account` Edge Function that deletes both data rows and the Supabase Auth identity server-side (comments in the code note this was added specifically to fix an earlier version that only wiped data but left the login/identity behind — good sign of iterative compliance hardening).
- Consent copy explicitly names Supabase (EU-hosted) and says data is never sold.

**Gaps a compliance reviewer would flag:**
1. **Consent record is not a dedicated, auditable entry — it's a field inside a generic JSON blob.** Contrary to the "client-side only, never persisted server-side" assumption in the task brief: for signed-in users, `S.prefs` (including `privacyConsented`, `privacyConsentDate`, `privacyConsentVersion`) *is* pushed to Supabase via `sbPushSync()` → `push_klar_sync` RPC into the `klar_syncs` table, debounced 1.5s after every `save()` (L15436–15547). So there is a server copy for signed-in users — but it's buried inside the same opaque `data` JSON column as the user's transactions/budgets, not a queryable, timestamped consent-events table. That's a real gap: you can't easily produce "show me proof user X consented to version Y on date Z" for a regulator without parsing JSON blobs, and there's no immutable audit trail (a later local edit + resync overwrites the same field).
2. **Guest/local-only users have zero server-side consent record.** Anyone using the app without signing in (`klAgGuest()`, `localStorage.setItem('kl_guest','1')`) only ever writes consent to `localStorage`. If that's cleared, or if regulators ever ask for consent evidence for a non-signed-in user, there's nothing to produce. Given the region gate and privacy gate both apply to guests too, most early users will fall into this bucket.
3. **No server-side enforcement.** Consent gating is entirely client-side JavaScript (`needsConsent` checks, gate visibility toggles). Nothing stops a modified client, or a direct API call to the Supabase functions (`saltedge-connect`, `get-tier`, etc.), from bypassing the UI gate entirely — there's no evidence any Edge Function checks a consent flag before acting. Bank-linking in particular should arguably require server-side consent verification given it triggers third-party data sharing with Salt Edge.
4. **No IP address, user-agent, or consent-mechanism metadata captured** — only a timestamp and version number. POPIA/GDPR audits often expect more context on how/where consent was obtained.
5. Minor: the debounce/race on `sbPushSync` (1.5s timer, cancels/reschedules on rapid saves) means a consent acceptance immediately followed by other actions is not guaranteed to be the first thing persisted — low risk, but worth knowing if consent timestamp precision ever matters.

None of this requires a redesign before soft-launch — POPIA/GDPR consent capture with reasonable evidence trail is the norm at this stage — but items 1–3 are the kind of thing a serious compliance or investor technical review will surface, and are worth a small, contained fix (a dedicated `consent_events` table written by a server function) before scaling signed-in users materially.

---

## Open questions for the founder (not guessed at)

- Is there a signed commercial agreement with Salt Edge, and does it include FCA agent registration, or is Klar currently just consuming their API without formal Open Banking regulatory status?
- What entity is Klar operating as (UK Ltd, SA Pty, sole trader) — this determines who would actually be the FCA registrant/agent?
- Is the Stitch (SA) integration under any contract yet, or still exploratory?
