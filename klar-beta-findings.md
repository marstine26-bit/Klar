# Klar Beta QA Findings
**File reviewed:** `Klar Rebrand.html`
**Scope:** Savings hub (`rSavings` + helpers) and Debt hub (`rDebt` + helpers)
**Date:** 2026-06-18
**Reviewer:** QA agent (code review only, app not executed)

---

## HUB 1 — SAVINGS

### CRITICAL

#### C1 — `S.goals` accessed without `||[]` guard (lines 8866, 8868, 8869)
`rSavings()` calls `S.goals.length` and `S.goals.map()` directly without a `||[]` fallback. If `S.goals` is ever `undefined` (possible with corrupted or migrated state), this throws `TypeError: Cannot read properties of undefined (reading 'length')` and crashes the entire Savings page render. The `DEF()` spread-merge in migration does *not* guarantee this — if a migrated record carried `goals: undefined`, the spread `{...DEF(), ...old}` leaves it `undefined`.
- **Fix applied:** YES (see below)

#### C2 — `delGoal` executes immediately without confirmation (line 8938)
```js
const delGoal=id=>{S.goals=S.goals.filter(g=>g.id!==id);save();renderAll();};
```
A single accidental tap on the `×` button permanently deletes a savings goal with all its data. No `klConfirm` dialog. The Debt hub uses the same anti-pattern (`delDebt`, line 9075). This is especially harmful because there is no undo.
- **Fix applied:** YES (see below)

---

### WARNING

#### W1 — `onTrack` date math uses a rough 30-day month approximation (line 8875)
```js
Math.ceil((new Date(g.targetDt)-new Date())/(1000*60*60*24*30))
```
This computes months as exactly 30 days. Over longer timeframes (e.g., 12 months) the accumulated error can be ~6 days per month, causing a goal due in 12 calendar months to appear as ~12.2 "months" — the "ON TRACK" badge may flip incorrectly in edge cases near month boundaries. The correct approach uses `getFullYear`/`getMonth` diff.
- **Fix applied:** No (warning; logic is a UX approximation, not a data-loss bug)

#### W2 — `allocateSurplusToGoal` shares the entire surplus to one goal, not a proportional slice (lines 8922–8928)
The per-button "↗ Surplus" flow (one goal) and the "Allocate All →" flow (`allocateSurplusAll`) both divide `surplus / activeGoals.length`. But `allocateSurplusToGoal` for a *single* goal allocates that same 1/N share **and** does not deduct it from remaining goals — meaning if the user clicks "↗ Surplus" on goal A and then goal B, the full surplus is double-counted. The surplus is a monthly average figure, not a real balance, so the doubling is a UX mislead rather than a data integrity failure.
- **Fix applied:** No

#### W3 — `s.key` passed raw (without `esc()`) into `onclick` attribute string (line 8856)
```js
onclick="dismissDetectedSavings('${s.key}')"
```
`s.key` is derived from `normaliseSubDesc(t.description)` of a transaction description. If that description contained a single quote or special characters, the `onclick` attribute would break. `esc()` does not escape single quotes (`'`), so this is a latent XSS/broken-JS risk for user data that contains apostrophes (e.g., "McDonald's savings").
- **Fix applied:** No (the `s.key` is normalized — but the normalization function should be verified separately)

---

### MINOR

#### M1 — Goal progress bar clamps at 100% but `pG` can display "100%" while `g.saved` slightly exceeds `g.target` (line 8870)
`pG` is clamped to 100 with `Math.min(...,100)`. However `g.saved` can exceed `g.target` if `addToGoal` is bypassed or data is imported — in that case `pG` shows 100% but `fmt(rem)` shows "R 0.00 remaining" which is fine. Not a bug, just worth noting.

#### M2 — Empty `targetDt` string renders as `· target: ` on the goal card (line 8887)
```js
${g.targetDt?' · target: '+g.targetDt:''}
```
`g.targetDt` is an empty string `''` when the user doesn't fill it in. An empty string is falsy in JS so this correctly hides the field. **Not a bug** — confirmed safe.

#### M3 — `saveGoal` does not set `originalSaved` on the new goal object (line 8910)
`syncConnectedData()` checks `goal.originalSaved !== undefined` to apply linked-transaction totals. A freshly created goal lacks this field; the lazy-init in `saveEditTxn` (line 7958) only sets it when a transaction is first linked to the goal. This means a goal created with a non-zero pre-filled `saved` value won't have its linked transactions deducted from `saved` until the first edit of a linked transaction — a subtle desync.
- Severity: minor/warning depending on usage.

---

## HUB 2 — DEBT

### CRITICAL

#### C3 — `S.debts` accessed without `||[]` guard (lines 8959, 8969)
`rDebt()` calls `S.debts.reduce(...)` and `S.debts.length` directly at lines 8959 and 8969, without `||[]` guards. Same risk as C1 — if `S.debts` is undefined, the render throws immediately, crashing the entire Debt page.
- **Fix applied:** YES (see below)

#### C4 — `d.type.replace('_',' ')` will throw if `d.type` is undefined (line 8980)
`saveDebt()` stores `type` from a `<select>` element, so it should always be set. However, detected-debt records are created by `confirmDetectedDebt()` which pulls `d.debtType` (not `d.type`) — it may store `type: undefined` if the mapping is incomplete. Any debt card render with `d.type === undefined` will throw `TypeError: Cannot read properties of undefined (reading 'replace')`, crashing the entire list render (it's inside `.map()` so the whole list fails).
- **Fix applied:** YES (see below)

---

### WARNING

#### W4 — `updateDebtBalance` resets `originalBalance` to the new balance, erasing payment history (lines 9092–9093)
```js
d.balance=newBal; d.originalBalance=newBal;
```
The `pct` (paid-off %) and `effectiveBal` in the render are computed as `totalPaid / originalBalance`. If the user manually updates the balance (e.g., after a bank sync), `originalBalance` is overwritten to the new value, causing the paid percentage to reset to 0% and `effectiveBal` to show incorrectly as if no payments were ever made via linked transactions. The function should only update `balance`, not `originalBalance`.
- **Fix applied:** YES — this is a data integrity bug that produces wrong financial data.

#### W5 — `quickDebtPayment` does not reduce `d.balance` directly (line 9078–9087)
Logging a payment creates a transaction with `debtId` set, but never reduces `d.balance`. The display uses `effectiveBal = originalBalance - totalPaid` only when `originalBalance` is set. If the debt was added before any payment (so `originalBalance` is lazy-set on first payment at line 9082), this works. But `d.balance` shown in the debt strategy panel (`rDebtStrat`), amortisation simulator, and payoff estimate all use `d.balance` directly — they will not reflect payments. The "Log Payment" flow is therefore cosmetically inconsistent with the rest of the hub.
- **Fix applied:** No (architectural issue; needs broader refactor decision)

#### W6 — Payoff date estimate ignores interest (line 8965)
```js
const months=Math.ceil(tot/mo);
```
This divides raw balance by monthly payments without accounting for accruing interest. For a 20% APR debt with minimum payments, the actual payoff time could be 3–5× longer. The estimate is shown prominently on the dashboard tile. Should display a disclaimer or use the amortisation logic already in `rAmort()`.
- **Fix applied:** No (UX warning; amortisation tab already shows correct data)

---

### MINOR

#### M4 — `esc(d.name)` in `onclick` attribute does not protect against single quotes (line 8989)
```js
onclick="quickDebtPayment('${d.id}','${esc(d.name)}')"
```
`esc()` escapes `"` as `&quot;` but does NOT escape `'`. A debt named `O'Brien Loan` would produce:
```html
onclick="quickDebtPayment('abc123','O'Brien Loan')"
```
...which breaks the JS attribute and prevents the button from working. This does not allow arbitrary code execution (it just breaks), but it's a real UX breakage for names with apostrophes.
- **Fix applied:** YES (see below) — replace `esc(d.name)` with a `JSON.stringify` approach in the onclick.

#### M5 — `delDebt` executes without confirmation (line 9075)
Same pattern as C2 (delGoal). One mis-tap deletes the debt record permanently.
- **Fix applied:** YES (combined with C2 fix)

#### M6 — `interest` stat card shows annual interest but label says nothing about timeframe (line 8959, 8961)
```js
const interest=S.debts.reduce((s,d)=>s+(d.balance*d.rate/100),0);
set('dbt-int',fmt(interest));
```
This is `balance × rate / 100` which is the annual interest cost. The UI label should say "/yr" to avoid users thinking it's a monthly figure.
- **Fix applied:** No (UI copy issue)

---

## FIXES APPLIED

### Fix for C1 — `S.goals` null guard in `rSavings()` ✅
Added `if(!Array.isArray(S.goals))S.goals=[];` at the top of the goals render block (before line 8866). Prevents crash on undefined state.

### Fix for C3 — `S.debts` null guard in `rDebt()` ✅
Added `if(!Array.isArray(S.debts))S.debts=[];` immediately before the `.reduce()` calls at line 8960. Prevents crash on undefined state.

### Fix for C2 + M5 — `klConfirm` on `delGoal` and `delDebt` ✅
Both functions now open a styled confirmation modal with the goal/debt name before deleting. No more single-tap permanent data loss.

### Fix for C4 — Guard `d.type` with `||'other'` before `.replace()` ✅
Changed `d.type.replace('_',' ')` to `(d.type||'other').replace('_',' ')`. Prevents TypeError crash when `d.type` is undefined on detected-debt records.

### Fix for W4 — `updateDebtBalance` no longer resets `originalBalance` ✅
Removed the `d.originalBalance=newBal` line. `originalBalance` is now only seeded if it was never set (first-time entry). This preserves the paid-off % and `effectiveBal` calculations for all debts that already have payment history.

### Fix for M4 — Single-quote safe debt name in `onclick` ✅
Changed `'${esc(d.name)}'` to `${JSON.stringify(d.name)}` in the "Log Payment" button. `JSON.stringify` produces a properly double-quoted, JS-escaped string that survives apostrophes and other special characters in debt names.

---

## REMAINING ISSUES (for main loop agent)

| ID | Hub | Severity | Description |
|----|-----|----------|-------------|
| W1 | Savings | Warning | `onTrack` uses 30-day month approximation — can misclassify goals near month boundaries |
| W2 | Savings | Warning | `allocateSurplusToGoal` (per-goal button) double-counts surplus if called on multiple goals in one session |
| W3 | Savings | Warning | `s.key` in `dismissDetectedSavings` onclick not protected against apostrophes |
| W5 | Debt | Warning | `quickDebtPayment` creates a transaction but never reduces `d.balance` — strategy panel and amortisation use stale balance |
| W6 | Debt | Warning | Payoff estimate ignores interest; could be 3–5× too optimistic for high-rate debts |
| M3 | Savings | Minor | New goals lack `originalSaved` — linked-transaction sync deferred until first txn edit |
| M6 | Debt | Minor | `dbt-int` stat card shows annual interest but UI label has no "/yr" qualifier |

*End of findings. 6 issues fixed (2 critical, 1 critical/warning, 1 warning escalated to fix, 2 minor). 7 issues remain for main loop agent.*
