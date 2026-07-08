# Klar Code Review — rProperty, rPortfolio / saveHolding, rNetWorth, Onboarding

Reviewed: `Klar Rebrand.html` (~14,800 lines)
Date: 2026-06-18

---

## rProperty (line 10118) + openAddProperty (line 10088) + saveProperty (line 10109)

- [CRITICAL] line 10135–10136 — **Division by zero when `p.marketValue === 0`.**
  Both the progress-bar width (`equity/p.marketValue*100`) and the equity-percentage label (`Math.round(equity/p.marketValue*100)`) divide by `p.marketValue` without a guard. A property saved with a `0` market value (the field is `||0` in `saveProperty`) produces `Infinity`/`NaN`, which sets the bar to `NaN%` and prints `NaN% equity` in the card.
  Fix: guard with `p.marketValue > 0 ? ... : 0`.

- [WARNING] line 10116 — **`saveProperty` does not call `rNetWorth()` or `renderAll()`.**
  After saving, only `rProperty()` is called. If the net-worth page is open in the background it is stale. Standard pattern elsewhere is `save(); renderAll()`. The same applies to `delProperty` at line 10158 which calls `rProperty()` only.
  Note: `saveHolding` and `delHolding` use `renderAll()` — this inconsistency means property mutations are less aggressively propagated.

- [WARNING] line 10155 — **Amortisation loop iteration bound uses `bp.bondBalance / bp.repayment`.**
  The loop runs `for(let i=0; i<Math.min(12, bp.bondBalance/bp.repayment); i++)`. If `bp.repayment` is very small (e.g. R1) and `bp.bondBalance` is large (e.g. R2,000,000) the `Math.min(12, ...)` cap saves the loop. However, if `bp.repayment` is exactly `0` the find at line 10153 already requires `p.repayment > 0`, so a true zero is filtered. Still, a repayment that is smaller than one month's interest (`interest >= repayment`) produces a non-positive `principal`, meaning `bal` never decreases or can even increase, and the table will show a balance that grows or stays flat — silently misleading rather than erroring.

- [MINOR] line 10113 — **`dataset.editId` used as edit-mode signal but never explicitly cleared on a fresh "Add" open.**
  `openAddProperty(id)` sets `dataset.editId = id || ''`. An empty string is falsy, so `saveProperty` checks `if(editId)` and skips the branch correctly. No bug, but worth noting for clarity.

- [MINOR] line 10158 — **`notify('Property removed')` omits type argument.**
  All other `notify` calls in scope pass a second argument (`'ok'`, `'err'`). Omitting it causes the toast to use whatever the default fallback is. Cosmetic only.

---

## rPortfolio (line 10617) + saveHolding (line 10659) + openAddHolding (line 10658)

- [WARNING] line 10658 — **`openAddHolding()` does not reset form fields.**
  The function only calls `classList.add('open')`. If a user adds a holding, closes the modal, then reopens it, the `h-name`, `h-cost`, `h-val`, and `h-prov` fields still hold the previous values. `openAddProperty` correctly resets all its fields; `openAddHolding` does not.

- [WARNING] line 10659 — **`saveHolding` does not support editing existing holdings.**
  It always pushes a new holding (`S.holdings.push(...)`). There is no edit path. Users can only delete and re-add. Compare with `saveProperty` which supports an edit-id round-trip. The "Add Holding" modal title never changes to "Edit Holding" and no edit button exists in the portfolio list (only a delete `×` button), so this is currently by design, but means fixing a typo in a holding name requires deletion and re-entry.

- [WARNING] line 10631 — **`t.description` used directly without `.trim()` or esc; sliced to 40 chars and injected into a button `onclick` attribute at line 10647.**
  ```js
  onclick="addHoldingFromTx('${s.tx.id}','${s.tx.accId}','${esc(s.name)}','${s.type}')"
  ```
  `s.name` comes from `t.description.slice(0,40)` (line 10631). The `esc()` call at line 10647 HTML-escapes the value, but it is embedded inside a JS string literal inside an `onclick` attribute, not in HTML content. A description containing a single-quote `'` will break the JS string and could inject arbitrary onclick code. Example: description `O'Brien Investments` → `onclick="addHoldingFromTx(...,'O'Brien Investments','unit_trust')"` — syntax error at minimum, potential injection.
  Fix: use a `data-*` attribute approach or JSON-encode the name instead of string-interpolating into the onclick.

- [WARNING] line 10656 — **Benchmark returns are hardcoded.**
  `const jse=12.4,sp500=24.1;` These are static literals shown to users as "JSE Top 40 (1yr)" and "S&P 500 (1yr)" benchmarks with no date reference. They will silently become stale. Minor UX risk but no crash.

- [MINOR] line 10653 — **Return percentage calculated with `h.cost > 0` guard but denominator is `h.cost`, not `h.currentVal`.**
  `const r = h.cost>0 ? (((h.currentVal-h.cost)/h.cost)*100) : 0;` — this is the correct unrealised-gain formula `(current - cost) / cost * 100`. No bug; just confirming it is correct.

- [MINOR] line 10666 — **`addHoldingFromTx` sets `currentVal = cost` (the transaction amount).**
  This is intentional (stated in the notify: "update current value when known"), but the portfolio total immediately reflects the transaction cost as current value, which may over- or under-state holdings value until the user manually updates it. No bug — just a data-quality concern.

---

## rNetWorth (line 7969) + calcCurrentNW (line 9575)

- [CRITICAL] line 9575–9584 — **`calcCurrentNW()` (used by `takeNwSnapshot`) omits property values entirely.**
  `rNetWorth` (the display function) includes `propVal` and `propBond` in assets and liabilities respectively. `calcCurrentNW` (used to record the monthly history snapshot) does not include either. Users with properties will see a higher net worth displayed on the page than what is recorded in their history chart, and the discrepancy grows with property value. This makes the history chart systematically understate net worth for property owners.
  Fix: add `propVal` and `propBond` to `calcCurrentNW`, mirroring lines 7981–7984 of `rNetWorth`.

- [CRITICAL] line 7976 — **`liveTotalPos` silently ignores overdrawn non-credit accounts.**
  ```js
  const liveTotalPos = liveAccBals.filter(b=>b>0).reduce(...);
  ```
  Non-credit accounts with a negative balance (e.g. an overdraft facility on a cheque account) are filtered out: they are not added to assets (correct) but also not added to liabilities (incorrect). The result is that overdrawn cheque/savings accounts are completely invisible in the net-worth calculation.
  Compare: `calcCurrentNW` correctly uses `liquid` (all balances, including negatives) and lets the formula absorb the negative.
  Fix: add `const liveNegTotal = liveAccBals.filter(b=>b<0).reduce((s,b)=>s+Math.abs(b),0)` and include it in `totL`.

- [WARNING] line 8008 — **`S.transactions` accessed without `||[]` guard.**
  ```js
  const txnCount = S.transactions.filter(t=>t.accountId===acc.id).length;
  ```
  All other accesses to `S.transactions` in the codebase use `(S.transactions||[])`. The `DEF()` initialiser sets it, but a failed migration (line 4893 force-resets to `DEF_ACCOUNT` only, not DEF()) could leave `S.transactions` undefined, causing a `TypeError` that breaks the entire `rNetWorth` render.

- [WARNING] line 7983 — **Savings goals `saved` amounts not included in net worth.**
  The spec for this app states net worth = cash accounts + savings goals saved + holdings value + property equity − debts. Goals' `saved` amounts are funded from account balances already included via `liveTotalPos`, so double-counting them would be wrong. However, if goals use a separate "pot" ledger rather than sharing the account balance, they would be missed. As-implemented the formula is consistent with goals living inside account balances — this is a design note, not a confirmed bug. No change needed unless goals are tracked as independent balances.

- [WARNING] line 7990–7991 — **Debt-to-asset ratio clamps at 0 when `totA === 0` but shows 0% (green) when there are liabilities and no assets.**
  `const ratio = totA>0 ? Math.round((totL/totA)*100) : 0;` — a user with only liabilities and no assets gets `0%` ratio displayed in green, which is misleading (should arguably show 100%+ or "∞"). Not a crash but a display logic issue.

- [MINOR] line 7993 — **`nw-liab-sub` subtitle says "CC + liabilities" even when `ccTotal === 0`.**
  Cosmetic only — the subtitle should arguably suppress "CC" when no credit card exists, similar to how `nw-assets-sub` conditionally adds "+ portfolio" and "+ property".

---

## Onboarding — obNext (line 12722) + obChoosePlatform (line 12711) + setObRegion (line 10726)

- [CRITICAL] line 12749 — **`S.accounts.find(...)` called without `||[]` guard.**
  ```js
  const defAcc = S.accounts.find(a=>a.id==='default');
  ```
  This is the only place in the entire file where `S.accounts` is called without `(S.accounts||[])`. If a migration path returns a state with `S.accounts` undefined (e.g. the v52 migration at line 4893 explicitly sets `accounts:[DEF_ACCOUNT]` but other paths return `DEF()` which sets `accounts:[DEF_ACCOUNT]` — low risk, but not guaranteed in all edge cases), this throws `TypeError: Cannot read properties of undefined (reading 'find')`, crashing the entire step-4 → step-5 onboarding transition.

- [CRITICAL] line 12742 — **`setObRegion('sa')` is called unconditionally on entering step 4, hardcoding South Africa as the default region.**
  The onboarding bank select is always pre-populated with SA banks regardless of any prior region selection. If a UK user had previously set `S.prefs.region = 'uk'` (via the region gate shown before onboarding), the step-4 bank dropdown will still default to SA banks. More importantly, `setObRegion` only populates the dropdown — it never writes to `S.prefs.region`. The region toggle buttons in step 4 also never call `S.prefs.region = ...` or `save()`. So a user who clicks "🌍 International" in step 4 does not persist their region choice — `S.prefs.region` remains whatever the region gate set (or unset).
  Fix: `setObRegion` should read `S.prefs.region` to choose the initial bank list, and the `ob-region-btn` click handlers should write back to `S.prefs.region` + `save()`.

- [WARNING] line 12722 — **`obNext` handles steps 1, 'platform', 3, 4 but has no handler for step 2 → 3 without platform selection.**
  If `obChoosePlatform` is never called (user clicks neither card) and user somehow calls `obNext(2)` directly (not exposed in UI), there is no `from===2` handler and the function silently returns without advancing. The UI currently only exposes "Skip — I'll decide later" (which calls `obNext('platform')`) from step 2, so this is not reachable in practice but is a fragile gap.

- [WARNING] line 12742 — **`obNext(from===3)` always calls `setObRegion('sa')` even when `S.prefs.region === 'uk'`.**
  When `obNext(3)` fires (entering step 4), it runs:
  ```js
  setTimeout(() => { setObRegion('sa'); ... }, 200);
  ```
  This overwrites the bank dropdown with SA banks for all users, including those who had already selected 'uk' in the region gate before onboarding. A UK user would see SA banks (FNB, Capitec, etc.) as options.
  Fix: `setObRegion(S.prefs.region === 'uk' ? 'intl' : 'sa')`.

- [WARNING] — **`obFinish` and `obPrev` do not exist.**
  The review scope specified these functions, but neither is defined anywhere in the file. The onboarding has no back-navigation (there is no "Previous" button in the HTML) and no `obFinish` — completion is handled by `obSkip()` and `obImport()`. This is not a bug in itself, but any future caller of `obFinish()` or `obPrev()` would silently fail (undefined function).

- [MINOR] line 12715 — **`obChoosePlatform('personal')` sets `S.prefs.mode = 'personal'` but never writes it to `S.prefs.mode` — it sets it to `'corporate'` for business, or leaves it as `'personal'`.**
  Actually the code is: `S.prefs.mode = mode==='business' ? 'corporate' : 'personal'`. This is correct. Noted as clean.

- [MINOR] line 14296–14305 — **Step-4 bank `<select>` in the HTML has hardcoded SA-only options.**
  The `<select id="ob-acc-bank">` in the static HTML contains only SA banks (FNB, ABSA, etc.). When `setObRegion('sa')` runs, it replaces `innerHTML` with `SA_BANK_OPTS`, which is the same list. When `setObRegion('intl')` runs, it replaces with `INTL_BANK_OPTS`. But if JS fails to initialise before the user interacts, the fallback is the hardcoded SA-only list — minor resilience concern only.

---

## Summary of Critical Issues

| # | Location | Issue |
|---|----------|-------|
| 1 | `calcCurrentNW` (line 9575) | Property equity/bond excluded from NW history snapshots |
| 2 | `rNetWorth` (line 7976) | Overdrawn non-credit accounts excluded from liabilities |
| 3 | `rProperty` (line 10135) | Division by zero when marketValue = 0 |
| 4 | `obNext` (line 12749) | `S.accounts.find` without `\|\|[]` guard |
| 5 | `obNext` (line 12742) | SA banks hardcoded as default; region not persisted from step-4 toggle |
