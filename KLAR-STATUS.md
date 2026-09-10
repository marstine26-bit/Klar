# Klar — Status Tracker

*Kept up to date by Claude as work progresses. Last updated: 2026-09-10.*

---

## 🔴 Blocking / needs your action

| Item | Status | Next step |
|---|---|---|
| **Payment processor** | Lemon Squeezy rejected the account entirely ("nature of business"). Applied to **Startbutton Africa** and **Dodo Payments** (both pending). Applying to a **3rd** now — in progress. | Wait for approvals. Once one confirms, tell Claude — the webhook handler (`functions/paddle-webhook`) and checkout flow (`klSubscribe()`) need a real rewrite for whichever processor's actual API, not a quick config swap. |
| **Domain** | `klarmoney.app` is **not actually yours** (was a placeholder/false assumption, corrected). Candidates checked as likely-available: `useklar.app`, `klarapp.co`, `klarfinance.app`, `tryklar.app`, `klarmoney.co`. None purchased yet. | Pick one, confirm real availability + price at an actual registrar (Cloudflare Registrar/Namecheap/Porkbun), buy it. Once bought: DNS steps + full codebase URL/support-email update (currently `hello@klarmoney.app` is baked into Settings, Help Centre, `privacy.html`, `terms.html`, campaign drafts — all pointing at a domain nobody here owns). |
| **Supabase: leaked-password protection** | Still disabled | Dashboard → Auth → Policies → enable. Dashboard-only toggle, can't be done via API. |
| **`LEMONSQUEEZY_API_KEY` secret** | Not added (may become moot depending on new processor choice) | Hold until payment processor decision is final — no point adding an LS-specific secret if LS is being replaced entirely. |

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

**Running bug tally this review cycle (2026-09-05 → present): 16 real bugs found and fixed** across 15 specialist passes.

---

*This file is excluded from public serving via `.assetsignore`, same as other internal docs.*
