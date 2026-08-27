# Klar Analytics Instrumentation Audit

Source file: `Klar Rebrand.html` (17,821 lines). Tracking wrapper: `klTrack(event, props)`, defined at **line 15265**, which calls `posthog.capture()`. PostHog is initialized lazily via `_klMaybeInitPostHog()` (line 15259), gated on `S.prefs.privacyConsented` — no events fire pre-consent, by design.

## 1. Complete Event Inventory (as of this audit)

Only **5 distinct events** are tracked, from **6 call sites**, in a 17.8k-line app with ~44 pages/features:

| Event | Line | Function | Fires when |
|---|---|---|---|
| `$pageview` | 6315 | `goPg(id)` | Every in-app navigation to any of the 44 pages in the `PAGES` array (dashboard, transactions, savings, debt, ai, subs, invest, tax, etc.) — `props: {page}` |
| `signed_in` | 15288 | `_sb.auth.onAuthStateChange` handler (`SIGNED_IN`) | Fires for **both** login and signup (signup auto-signs-in at line 15405, which re-triggers `SIGNED_IN`) — no way to distinguish new-account creation from a returning login |
| `signed_out` | 15291 | same handler (`SIGNED_OUT`) | User signs out |
| `region_selected` | 17027 | `klSelectRegion(region)` | User picks SA/UK/Other in the region gate — `props: {region}` |
| `plan_selected` | 17189 | `klSelectPlan(planId)` | User clicks a plan card in the paywall (`klar-plan-gate`), **including the "free" tier button** — `props: {plan, billing}` |

Additionally, `posthog.identify(_sbUser.id, {email})` fires alongside `signed_in` (line 15289), so events after login are attributable to a person — but only from that point forward.

There is no other call to `klTrack`, `posthog.capture`, or any analogous tracking mechanism anywhere else in the file. Every `klTrack()` call in the codebase is listed above in full.

## 2. What's Missing

### A. Onboarding funnel — 0% instrumented
The 5-step onboarding flow (`showOnboarding()` line 14890, `_obGoStep(n)` line 14899, `obNext(from)` line 14927, `obPrev()` line 14969, `obSkip()` line 14979, `obImport()` line 14996) fires **no events at any step**:
- Step 1→2 (platform choice, `obChoosePlatform` line 14909)
- Step 2→3 (name entry, `obNext(from='platform')`)
- Step 3→4 (name saved, `obNext(from=3)`)
- Step 4→5 (account/bank saved, `obNext(from=4)`)
- Completion via `obSkip()` (sets `onboardingComplete=true`) or `obImport()` (same, then opens import)
- `obPrev()` — back navigation / potential confusion signal

You cannot currently answer "where do people abandon onboarding?" at all — not even a start/complete pair exists.

### B. Signup vs. login — conflated
`signed_in` fires identically for a brand-new account and a returning session (`_sbMode==='signup'` is known at the call site, line 15393, but never passed through). You cannot compute signup conversion or new-user counts from PostHog today — only total sign-in events.

### C. Activation funnel — not instrumented
No event exists for:
- First transaction added (`saveTxn()`, line 9139)
- First budget/category limit set
- First savings goal created
- First debt account added (`saveDebt()`, line 10574)
- Return-visit / day-2/7/30 retention (no session-start or "returning user" marker beyond raw `$pageview`, and PostHog persistence is disabled — see note below)

**Note on retention measurement:** `posthog.init()` is called with `persistence:'memory', disable_persistence:true` (line 15262) — no cookies/localStorage persistence for the PostHog distinct ID. Combined with no explicit `identify()` call until sign-in, anonymous session stitching across visits is effectively broken; day-2/7/30 retention cannot be reliably measured pre-login even if events are added. This is worth flagging on its own, independent of the event gaps below.

### D. Core feature adoption — only inferred indirectly via `$pageview`
Visiting `/savings`, `/debt`, `/ai`, `/subs`, `/invest` etc. produces a `$pageview{page:'savings'}` etc., but there's no event for the actual action: goal created, debt logged, AI advisor message sent, subscription added/tracked. Page views conflate "looked at the tab" with "used the feature."

### E. Monetization funnel — half-instrumented, and the important half is missing
- `klShowPlanGate()` (line 17167), which auto-opens the paywall 8 seconds after a new user's first region-ready render (line 17264, `S.prefs.tier` unset) — **the paywall being shown is not tracked at all.**
- `klSelectPlan()` **is** tracked (`plan_selected`), but since "paywall shown" isn't, you cannot compute a view→select conversion rate — only which plan was picked among those who picked one.
- No event for "actually completed checkout/upgrade" (vs. merely clicking a plan card, which for paid tiers likely hands off to a payment step before completion — worth confirming against the code path after line 17189, but no `klTrack` appears anywhere past that point in the plan flow).
- No event for hitting a feature that's gated behind Pro and getting blocked (no `requiresPro`/`isPro()`/tier-check gating function was found in the file at all — if paywalling of individual features isn't implemented yet, that's a separate product question, but it also means there's no "hit a paywall organically" signal to add even if you wanted one).

## 3. Prioritized Gap List

Ranked by signal-value-per-line-of-code for a founder deciding "is the soft launch working." All of these are a single `klTrack()` call at an existing, already-located code point — no new instrumentation architecture needed.

| Priority | Event to add | Where (existing code point) | Why it matters | Cost |
|---|---|---|---|---|
| 1 | `onboarding_started` / `onboarding_step` (with step number) / `onboarding_completed` / `onboarding_skipped` | `showOnboarding()` L14890, `_obGoStep(n)` L14899, `obSkip()` L14979, `obImport()` L14996 | Onboarding is the #1 pre-launch question ("where do people quit before they even see the app?") and currently has zero visibility | 4 calls, all at points that already run on every step transition |
| 2 | `paywall_shown` | `klShowPlanGate()` L17167 (top of function) | Without this, `plan_selected` is unreadable — no denominator, no conversion rate | 1 call |
| 3 | Distinguish signup from login: `signed_up` vs `signed_in` | `_sbSubmitAuth`-equivalent flow around L15393 — `_sbMode==='signup'` is already known there; pass it through the `SIGNED_IN` handler (e.g. a one-time flag) or fire directly after the successful `signUp()` branch (L15402-15406) | Cannot currently tell a new user from a returning one — the single most basic soft-launch metric (new signups/day) is unavailable | 1 call, minor plumbing (a flag or firing at the signup success branch instead of relying on the shared auth-state-change handler) |
| 4 | `transaction_added` (first-of-session or a `isFirstTxn` prop) | `saveTxn()` L9139, at the success path (non-edit branch) | Core activation moment — "did they actually put their money into the app" | 1 call |
| 5 | `goal_created` (savings), `debt_added` | `saveDebt()` L10574 success path; equivalent savings-goal save function (locate the goal-save handler analogous to `saveDebt`) | Core feature adoption for two of the four named features (savings goals, debt tracking) | 1 call each |
| 6 | `ai_advisor_used` | Wherever the AI advisor page (`#pg-ai`, L3019) sends a message/query — locate its submit handler | Differentiates "viewed AI tab" from "used AI advisor," a flagship feature worth knowing adoption on | 1 call |
| 7 | `subscription_tracked` | Wherever the subs-add handler lives (page `subs`) | Fourth named core feature; same page-view-vs-action gap as above | 1 call |
| 8 (structural, not a call) | Fix PostHog persistence | `posthog.init(...)` L15262 — currently `persistence:'memory', disable_persistence:true` | Without persistent distinct IDs, day-2/7/30 retention can't be computed even after adding all events above; this is a config decision (privacy-consent trade-off), not a `klTrack()` call, so flag for the founder to decide, don't just flip it | Config change + privacy-policy consideration, not a drop-in call |

## Not in scope of this audit
No code was written or modified. Every line reference above points to the exact existing function/location where a single `klTrack(...)` call could be inserted; none of these require new UI, new state, or architectural changes — they read from data/control flow that already exists at that line.
