# Klar — Status Tracker

*Kept up to date by Claude as work progresses. Last updated: 2026-09-24.*

*Note: there was a ~2-week session gap between 2026-09-10 and 2026-09-24. The 🔴 items below reflect state as of 09-10 and may be stale — confirm current status with the founder before assuming anything below is still accurate.*

---

## 🔴 Blocking / needs your action

| Item | Status | Next step |
|---|---|---|
| **Payment processor — Dodo integration built, needs 3 things from you** | ✅ Dodo Payments approved (09-24). Full backend + client rewrite shipped same day: new `dodo-webhook` and `dodo-create-checkout` Edge Functions deployed, `delete-account` cancellation updated, client-side checkout flow rewritten (`klOpenDodoCheckout`), `subscriptions` table columns renamed processor-agnostic, all Lemon Squeezy references removed from every customer-facing surface (app UI, `privacy.html`, `terms.html`, `klar-help.html`, CSP headers, service worker). **Startbutton still pending**, a 3rd application was also in progress as of the last update. | **You need to do 4 things before checkout actually works**: (1) create 12 products in Dodo's dashboard — Essential/Pro/Family × Monthly/Annual × GBP/ZAR, mirroring the old Lemon Squeezy setup; (2) paste each product's id into the `DODO_PRODUCTS` map in `functions/dodo-create-checkout/index.ts` AND the matching `DODO_PRODUCT_TO_PLAN` map in `functions/dodo-webhook/index.ts` (same ids, both places), then redeploy both; (3) register `dodo-webhook`'s URL as a webhook endpoint in Dodo's dashboard, generate the signing secret, add it as `DODO_WEBHOOK_SECRET` in Supabase → Edge Functions → Secrets; (4) add a `DODO_API_KEY` secret (used by both checkout creation and delete-account cancellation) — same Dashboard → Secrets page. Fire one real test event from Dodo's dashboard afterward and check the `dodo-webhook` function logs — the webhook payload's exact field names were not confirmed against a live event when this was built, so double-check they match (defensive fallbacks are in place, but verify). |
| **Domain** | `klarmoney.app` is **not actually yours** (was a placeholder/false assumption, corrected). Candidates checked as likely-available: `useklar.app`, `klarapp.co`, `klarfinance.app`, `tryklar.app`, `klarmoney.co`. None purchased yet. | Pick one, confirm real availability + price at an actual registrar (Cloudflare Registrar/Namecheap/Porkbun), buy it. Once bought: DNS steps + full codebase URL/support-email update (currently `hello@klarmoney.app` is baked into Settings, Help Centre, `privacy.html`, `terms.html`, campaign drafts — all pointing at a domain nobody here owns). |
| **Supabase: leaked-password protection** | Still disabled | Dashboard → Auth → Policies → enable. Dashboard-only toggle, can't be done via API. |

## 🟡 Open, not blocking

| Item | Status |
|---|---|
| `klar_bill_payments` table missing a DELETE RLS policy | Found by a security review pass. "Delete cloud data" button silently doesn't delete rows in this one table (0 rows affected, no error). The separate `delete-account` function is unaffected (uses service-role key, bypasses RLS correctly). Needs a founder decision — it's a live DB security change. |
| Moneyhub-shutdown campaign (Reddit post + 4 outreach emails) | Fully drafted (`klar-moneyhub-campaign-drafts.md`), nothing sent/posted. Held for your review/approval. |
| Cosmetic: `paddle-webhook` function slug still misnamed (it's Lemon Squeezy code, soon to be neither) | Low priority — will get resolved naturally once the processor migration happens anyway. |
| Cosmetic: wildcard CORS (`Access-Control-Allow-Origin: *`) on 3 edge functions | Low severity per security review (all still require a valid JWT). Optional tightening. |
| No CI/build gate before deploy | Nothing currently blocks a broken commit from reaching production automatically. Worth considering, not urgent for a single-file static app. |

## 🟢 Recently shipped (this review cycle, 2026-09-05 → present)

**13 real bugs found and fixed** — every one required actually driving the live app, not just reading code:
1. Stokvels page had no UK region guard
2. ISA Tracker — typing was silently destroyed (focus-loss bug)
3. UK Student Loan Tracker — same bug
4. Investment Hub allocations — same bug
5. Forex page's SARB-allowance banner never updated for UK users
6. Editing a transaction → "Make recurring" toggle silently did nothing
7. Recurring Templates tab — new templates invisible until you switched tabs away and back
8. Split Bills — group cards unreachable by keyboard
9. Split Bills — remove-participant chip unreachable by keyboard
10. Command palette (Ctrl/Cmd+K) — untrapped on the very first open each session (race condition)
11. Settings → Region toggle — could re-trigger the first-launch privacy consent modal or notification nudge
12. Budget-exceeded alerts went completely silent for anyone without browser notification permission (the common case)
13. *(architecture)* Modal focus-trap now covers any dynamically-created modal automatically, not just ones present at page load

**Also shipped:**
- Consent audit trail (`consent_events` table + `log-consent` Edge Function) — live and verified
- Subscription-cancellation-on-account-deletion code — deployed, waiting on the new processor's API key to actually do anything
- Merchant autofill on Add Transaction
- Real undo on bulk transaction delete (was an unrecoverable "cannot be undone" dialog)
- Removed 2 render-blocking scripts from initial page load (performance)
- Public Help Centre page (`klar-help.html`)
- Error-state "Get help" links on every toast/error surface in the app

**Verified clean, no bug found (so you know what was actually checked, not skipped):**
- Data export (CSV/JSON/XLS/backup) — real file content inspected, all valid
- Onboarding flow — full fresh-guest walkthrough
- 13 SA/UK tax calculators swept for the same input-focus-loss bug class — none affected
- Live regression sweep of all 13 fixes above, directly against production

## 📌 Reference — real numbers, checked directly against the database (2026-09-10)

Worth knowing before making any claim about traction: **4 total auth users, 0 subscriptions ever, 3 sync rows.** No evidence of real external paying customers yet — likely just QA/test accounts. This is why "Beta Testing" was the honest answer on the payment applications, not "Live with customers."

## 🔵 In progress right now

- Payment processor: applied to Startbutton Africa and Dodo Payments (both pending), applying to a 3rd now.
- New third-party tool being set up: OpenDesign (open-source Claude Design alternative) — mid-install (`pnpm install` running), unrelated to Klar itself.

## ✅ Also shipped since last update

- **Mobile/responsive layout audit** — 3 real bugs found and fixed: Money Ledger stat numbers clipped at ≤400px width, the floating "+" button rendering on top of (and blocking taps on) modal Save buttons, and undersized delete-button touch targets on 2 Business-mode pages (~11px, now ~40px).
- **Financial calculation correctness audit** — verified by hand-calculation against real app output: debt payoff (Avalanche/Snowball), net worth, budget rollover, and currency conversion all check out mathematically correct. **Clean bill of health, no bugs found.** (One labeled "Est." combined-debt approximation is 2-5% off a true cascade in edge cases — inherent to being an estimate, not treated as a bug.)
- **Real user count check**: only 4 total auth users, 0 subscriptions ever recorded — no evidence of real paying customers yet. This is why "Beta Testing" (not "Live with customers") was submitted on payment applications.
- **Correction**: `klarmoney.app` is confirmed NOT the founder's domain (was a false assumption, corrected before it caused any real damage — a code change pointing at it was made and fully reverted, never reached production).


- **XSS/injection audit — clean.** Every user-text field (transactions, accounts, debts, goals, split bills, stokvels, AI chat replies, business settings) live-tested with real payloads (`<img onerror=alert()>`, `<svg onload=>`) — all correctly escaped, nothing executed. One minor consistency note (not a bug): custom category names use a character-strip approach instead of the standard `esc()` helper used everywhere else — currently safe, just inconsistent style, low priority.
- **Tier/plan-gating audit — 1 real revenue-leak bug found and fixed (commit `9f024b8`).** Cloud sync (push/pull to Supabase) had **zero tier check** — any signed-in free-tier user could sync their full dataset to the cloud for free, despite it being marketed Essential+. Fixed with the same `klHasTier('essential')` gate used elsewhere (server-hardened, can't be bypassed by tampering with local storage). Also flagged (not fixed — needs a product decision, not a bug fix): a handful of marketing-copy-vs-code mismatches where a few Essential/Pro-marketed features (Portfolio tracker, Spending Anomaly Detection, Receipt photos, ISA/TFSA tracker) are actually free in code, and some Pro/Family-tier marketed features (Annual tax export, Family multi-member seats) don't exist in the codebase at all.

- **Error-handling/resilience audit (2026-09-24) — 2 real bugs found and fixed.** AI chat showed raw HTTP status codes / browser error strings instead of actionable messages (invalid Groq key now says exactly that and where to fix it). Cloud sync's "Sync now" button showed a false "Synced ✓" toast even when the sync had actually failed or hit a version conflict — the honest "Sync failed" toast was getting silently overwritten a moment later. Exchange-rate fallback already handled correctly, no fix needed there.

**Running bug tally this review cycle (2026-09-05 → 09-24): 20 real bugs found and fixed** across 19 specialist passes.

**19th specialist — month-overflow date drift (2026-09-24, commit `f70bba4`, live on `main`):** found a real, live-verified bug in recurring-transaction/subscription/reminder date advancement — native `Date.setMonth()` silently overflows into the next month when the current day doesn't exist there (Jan 31 + 1 month → Mar 3, skipping Feb). This caused permanent drift: a recurring template anchored on the 31st, after crossing a Feb boundary once, would keep firing on the 3rd of every month forever. Fixed with a shared `addMonthsClamped()` helper (clamps to the target month's last day, the standard billing-system approach) across `checkRecurringDue`, `skipRecurring`, `advanceSubDate`, `doneReminder`, and the debt-payoff calculator's month-label projection.

## 🎉 PAYMENT PROCESSOR: Dodo Payments APPROVED (2026-09-24)

Startbutton still pending/unknown. Dodo Payments came back approved — this is now the active integration target. See below for build status.

**Security review of the Dodo migration code (2026-09-24, commit `6e394da`, live on `main`):** found and fixed 3 real gaps — (1) `dodo-webhook` had no replay-protection window, so a captured valid webhook signature could be replayed indefinitely; added the Standard Webhooks spec's 5-minute timestamp-tolerance check. (2) `klOpenDodoCheckout()`'s `window.open(checkoutUrl, '_blank')` had no `noopener,noreferrer` — reverse-tabnabbing gap, fixed. (3) `klDeleteAccount()` silently dropped `delete-account`'s `subscriptionCancelError` response field — a user could delete their account while Dodo kept billing them and never be told; now shows a warning pointing them at customer.dodopayments.com. Everything else in the migration (HMAC signing/verification, checkout-creation input validation, CSP, delete-account's best-effort cancellation design) was reviewed and confirmed correct, no changes needed.

**Dodo product creation (2026-09-24, in progress via Browser pane, founder logged in themselves):** 6 of 8 real products confirmed created — Essential Monthly/Annual GBP, Pro Monthly/Annual GBP, Essential Monthly/Annual ZAR. Product 7 (Pro Monthly ZAR, R89) was mid-submission when the browser session dropped (environment reset) — unconfirmed whether it saved. Product 8 (Pro Annual ZAR, R899) not yet started. Once all 8 exist, still need: paste product ids into `DODO_PRODUCTS` (`dodo-create-checkout`) and `DODO_PRODUCT_TO_PLAN` (`dodo-webhook`), redeploy both, register the webhook URL + secret, add `DODO_API_KEY`.

---

*This file is excluded from public serving via `.assetsignore`, same as other internal docs.*
