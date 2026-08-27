# Klar Legal Docs Review — privacy.html & terms.html vs. actual code

**Not legal advice.** This is an internal engineering/product review comparing the
consumer-facing legal text against what the app code actually does, plus a completeness
check against standard consumer SaaS/fintech ToS expectations. Every item below should go
to a solicitor qualified in UK and South African law before launch — several items
(ICO/POPIA registration status, AISP status, the PostHog gap) are compliance-relevant, not
just wording nits.

Reviewed: `privacy.html`, `terms.html`, `Klar Rebrand.html` (as of this review). No files
were edited.

---

## 1. Most consequential finding: PostHog receives PII despite "anonymised" claims

`privacy.html` describes PostHog analytics as anonymised and containing no personal data:

- §3: *"Analytics (optional): We use PostHog (EU-hosted) to collect anonymised usage events... No financial data is included."*
- §4 processor table: data sent = *"Anonymised events, region, plan tier"*
- §13 (Cookies): *"we use PostHog in cookieless, memory-only mode (no persistent cookie, no cross-site tracking, PECR compliant). **No personal data is included in analytics events.**"*

The code contradicts this. In `Klar Rebrand.html` at the Supabase auth-state listener:

```js
if(_sbUser && event === 'SIGNED_IN'){
  sbPullAndMerge();
  klTrack(_sbPendingSignup?'signed_up':'signed_in');
  _sbPendingSignup = false;
  if(typeof posthog!=='undefined'&&posthog.identify) posthog.identify(_sbUser.id, {email:_sbUser.email});
}
```
(around line 15299)

`posthog.identify(_sbUser.id, {email:_sbUser.email})` sends the Supabase user UUID and the
user's **email address** to PostHog on every sign-in, and `person_profiles:'identified_only'`
(line 15270) means PostHog will build a persistent, identified person profile from that
point on — the opposite of "anonymised" and "no personal data." The rest of the PostHog
config (`autocapture:false`, `capture_pageview:false`, `persistence:'memory'`) is genuinely
privacy-conscious, and consent-gating via `_klMaybeInitPostHog()` is real (confirmed —
it only fires after `S.prefs.privacyConsented`), so this isn't a wholesale
fabrication — but the email/UID identify call is a specific, real gap between the
policy text and the code that a regulator or a user reading the source would catch.

**Recommendation to flag to the founder:** either stop sending email/UID to PostHog
(identify with a non-reversible ID only, or drop `identify()` entirely), or update
privacy.html §3/§4/§13 to disclose that signed-in users' email and account ID are sent to
PostHog for identification purposes. Right now the code and the policy actively disagree.

---

## 2. Everything else that *does* check out

Cross-referencing each named processor against the code confirmed genuine, non-placeholder
usage in all cases:

- **Supabase** — real project (`msaktocpuidvqtohpqqn.supabase.co`), used for auth + Postgres sync + Edge Functions (`saltedge-connect`, `saltedge-sync`). Matches privacy.html §3/§4/§9.
- **Groq** — `api.groq.com/openai/v1/chat/completions`, `llama-3.3-70b-versatile`, key stored client-side only, sent directly to Groq (line ~3508). Financial-summary-only framing is echoed in the UI copy itself ("GROQ · LLAMA · FINANCIAL SUMMARY ONLY — NO RAW TRANSACTIONS SENT", line 3040) — consistent with privacy.html §3.
- **Lemon Squeezy** — `lemon.js` SDK loaded, real store slugs (`klarmoney`, `klaruk`), checkout URLs, "Manage Subscription & Billing" links to `app.lemonsqueezy.com/my-orders`. Matches terms.html §5 and privacy.html §3/§4.
- **Salt Edge** — real Edge Function calls (`saltedge-connect`, `saltedge-sync`), consistently scoped to **UK only** in both the code (line 8545: "Auto-import transactions from your UK bank account via Salt Edge") and both legal docs. No SA bank-feed claim anywhere to contradict.
- **Crisp** — real website ID hardcoded (`5a23dbc4-b5bd-4159-a7f6-41d27ccb05a7`, line 1612), not the `YOUR_CRISP_WEBSITE_ID` placeholder the surrounding comment initially suggested — it's genuinely wired up. Only loads on first support-chat open (lazy script injection), matching privacy.html §3's "When chat opened."
- **Frankfurter** (FX rates) — real API calls, no personal data, matches the processor table.
- **Region/privacy consent gate** (`kl-region-gate`, `kl-rg-privacy-consent`) — genuinely blocks progression until the checkbox is ticked (`klSelectRegion`, ~line 17023–17039), sets `privacyConsented`/`privacyConsentDate`/`privacyConsentVersion`, and only *then* triggers `_klMaybeInitPostHog()`. This matches privacy.html's TL;DR and §12's version-bump-triggers-reconsent model (`PRIVACY_VERSION` constant + `needsConsent` check at line 16342 comparing stored version against current). Genuinely implemented, not decorative.
- **Free plan "6 months history, local only"** (terms.html §6) — matches the plan feature list in code (line 15998: `'6 months history','Manual CSV import','Local device only'`).

---

## 3. Naming / branding consistency

- No occurrences of "ClearLedger" (the old project name) anywhere in `privacy.html`,
  `terms.html`, or `Klar Rebrand.html`. Rebrand is clean on this front.
- Company name is consistently "Klar Money" across both docs and the in-app consent
  copy. No stray "Klar Inc.", "Klar Ltd.", etc.

---

## 4. Gap: no registered legal entity details anywhere

Neither `terms.html` nor `privacy.html` states a company registration number, registered
office/address, or country of incorporation for "Klar Money" — just the trading name and
an email address. This is worth a solicitor's attention because:

- terms.html §15 picks **England and Wales** as governing law and references UK courts,
  which normally pairs with a registered-company disclosure (standard under the UK
  Electronic Commerce (EC Directive) Regulations 2002, and expected practice for
  Companies House-registered UK businesses).
- privacy.html §5 UK GDPR section says: *"As a data controller, we are assessing our ICO
  registration obligations. If you have questions about our regulatory status, please
  contact us..."* — this is an honest disclosure, not a placeholder, but it's a live
  compliance gap (undetermined ICO registration) sitting in a published, consumer-facing
  policy. Flag for the founder as a to-do, not just a documentation issue.
- POPIA: §11 names "Klar Money" as responsible party but gives no South African entity
  detail (no registration number, no physical address in SA), and there's no explicit
  statement of Information Officer as POPIA requires responsible parties to register one
  with the Information Regulator.

---

## 5. terms.html: subscription/billing and jurisdiction coverage — solid, a few notes

- **Billing/cancellation/refunds** correctly names Lemon Squeezy (not a generic
  "our payment processor" placeholder) as Merchant of Record, gives concrete UK
  (Consumer Contracts Regulations 2013) and SA (Consumer Protection Act 68 of 2008)
  refund-rights citations, and a specific liability cap (£50 / R1,000) — good practice,
  not boilerplate. §5's "Bill Hub is not a payment processor" carve-out is consistent with
  privacy.html §3's identical framing.
- **Dual UK/SA jurisdiction handling** — actually done, not the common single-region gap:
  plan pricing table has both £ and R columns (§5); §12 liability cap is stated in both
  currencies; §15 governing law is England & Wales but explicitly preserves SA consumer
  protection law and SA court/National Consumer Commission recourse; §9 (AI disclaimer)
  cites both FSMA 2000 (UK) and FAIS Act 37 of 2002 (SA). This is above the median for
  fintech ToS reviewed elsewhere.
- **Liability limitations** — present, with a carve-out for death/personal injury/fraud
  and non-excludable consumer-protection liability (§12), which is required for
  enforceability in both jurisdictions — good.
- **Minor gap:** §10 discloses "Klar itself is not currently FCA-authorised; our own
  Account Information Service Provider (AISP) registration is in progress and not yet
  complete." That's a significant regulatory admission to have sitting in a live ToS —
  confirm with the Risk & Compliance roadmap that this is deliberate and current, since it
  materially affects what Salt Edge bank-feed claims the company can legally make.

---

## 6. privacy.html: third-party naming — good, one omission

privacy.html names all seven processors individually in a table (§4: Supabase, Groq,
Lemon Squeezy, Saltedge, Frankfurter, Crisp, PostHog EU) rather than hiding behind
generic "third-party service providers" language — this is exactly what's expected and
better than most.

One omission: the processor table doesn't list what PostHog *actually* receives on
sign-in (email + Supabase UID via `identify()`) — see Finding #1. Once that's fixed in
code or disclosed in copy, the table should be updated to match.

---

## 7. Placeholder text / TODO markers / dates

- No `TODO`, `FIXME`, "Lorem ipsum", or `XXX` markers found in either legal doc.
- Both docs are dated "Effective 14 June 2026 / Last updated 14 June 2026", Version 1 /
  1.0 — internally consistent with each other, and both predate today's date (27 Aug
  2026), so no future-dated inconsistency.
- `PRIVACY_VERSION` in code is hardcoded to `1` (line 16212), consistent with "Version 1"
  shown in privacy.html's meta badge — these two would need to be bumped together if the
  policy text changes; worth a comment/process note so a future policy edit doesn't get
  made without the version bump (which is what actually triggers re-consent).

---

## Summary for the founder

The most consequential issue: **privacy.html tells users PostHog analytics are
anonymised with "no personal data included," but the code calls
`posthog.identify(_sbUser.id, {email:_sbUser.email})` on every sign-in — sending a real
email address and user ID to PostHog and creating an identified person profile there.**
That's a direct contradiction between the published policy and shipped code, not a
wording nit, and should be fixed (stop sending email/UID, or disclose it) before launch.
Everything else checked out better than typical for a soft-launch: all seven named
third parties (Supabase, Groq, Lemon Squeezy, Salt Edge, Frankfurter, Crisp, PostHog) are
genuinely wired up and named individually rather than hidden behind generic language, the
consent gate genuinely blocks PostHog init until the user ticks the box, there's no
leftover "ClearLedger" branding anywhere, and terms.html is unusually good about covering
both UK and SA jurisdictions concretely (dual pricing, dual consumer-protection citations,
dual liability-cap currency). The remaining gaps are administrative rather than technical:
no registered company number/address anywhere in either document (odd given the doc picks
England & Wales law), and both docs candidly admit ICO registration and FCA/AISP
authorisation are still pending — worth confirming with the founder that shipping those
admissions in a live public ToS/privacy policy is intentional and current.
