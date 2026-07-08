# Klar Code Review — rAccounts, rBudProg, rBudget, Tax Functions, Onboarding

Reviewed functions: `rAccounts` (6134), `rAccReconQuick` (6213), `editAccount` (6251), `saveAccountEdit` (6305), `delAccount` (6345), `rBudProg` (7365), `rBudget` (8250), `calcTax` (11566), `calcTFSA` (11589), `calcItr12` (9850), `itr12AutoFill` (9918), `rItr12Checklist` (9901), `calcCGT` (11651), `calcRA` (11684), `calcCIT` (12789), `calcTrustTax` (12830), `calcDWT` (12816), `renderProvTax` (12825), `renderTrustCompliance` (12852), `setTaxView` (12779), `rISA` (13308), `showOnboarding` (12686), `_obGoStep` (12695), `obChoosePlatform` (12705), `obNext` (12716), `obSkip` (12754), `obImport` (12767).

---

## rAccounts (line 6134)

- [WARNING] line 6147–6148 — `isForex` logic hardcodes ZAR as base currency: `const isForex = cur !== 'ZAR'`. For a UK user with a non-GBP account (e.g. USD), the fallback label on line 6166 reads `≈ ZAR ${fmt(...)}` — showing "ZAR" to a UK user is wrong. The label should read `≈ ${S.prefs.cur || 'R'} ${fmt(...)}` (or the local-base currency), not always ZAR.

- [WARNING] line 6164 — `${isForex?cur+' ':''}` renders `cur` (from `acc.currency`) directly into HTML without `esc()`. Currency codes like "ZAR" are safe in practice, but the field is user-editable (the edit form allows a free-text `acc-currency` select). If a malicious or corrupted value were stored, it would be injected unescaped.

- [MINOR] line 6155 — `${typeLabels[acc.type]||acc.type}` renders `acc.type` raw (no `esc()`) when it doesn't match a known type key. If an unknown type is stored (e.g., from a direct edit of localStorage), it would be injected as raw HTML. Low risk but inconsistent with the surrounding `esc()` usage.

- [MINOR] line 6166 — The ZAR conversion label `≈ ZAR ...` is shown unconditionally for any account whose currency is not "ZAR", even for UK users. The summary block (line 6187-6188) also calls the converted value `zarBal` and the `toZar` helper always divides/multiplies against `acc.zarRate`. For UK users this is semantically confusing — the "ZAR total" is meaningless.

---

## rAccReconQuick (line 6213)

No critical issues found. `esc()` is used on `acc.name` (line 6235), `fmt()` used for amounts, and `S.accounts||[]` guard is present.

---

## rBudProg (line 7365)

- [WARNING] line 7367 — `const keys=Object.keys(S.budgets)` — no `||{}` guard on `S.budgets`. `S.budgets` is initialised as `{}` in `DEF()`, but if loaded state somehow has `budgets: null` (corrupt localStorage), `Object.keys(null)` throws a TypeError crash. Recommend: `Object.keys(S.budgets||{})`.

- [MINOR] line 7369 — `pct` is only computed when `lim>0`, so no division-by-zero. Fine. But when `lim===0` (a budget set to zero), `pct=0` and `over=act>0` (any spending is "over"). This is arguably correct behaviour but may surprise users with a R0 budget entry.

---

## rBudget (line 8250)

- [WARNING] line 8271 — same `S.budgets` issue as rBudProg: `const keys=Object.keys(S.budgets)` — no `||{}` guard.

- [MINOR] line 8266 — `Set ${S.prefs.cur||'R'}${s.rounded}` — the button label correctly uses `S.prefs.cur` with a ZA fallback ('R'), which is fine. However, the number `s.rounded` is rendered directly as a bare integer with no `fmt()` formatting, so for large numbers (e.g., a UK user with £1,500 limit) it would render as `Set £1500` instead of `Set £1,500`. Minor UX issue.

- [MINOR] line 8297 — `const totB=keys.reduce((s,k)=>s+(S.budgets[k]+getRolloverBonus(k)),0)` — if `S.budgets[k]` is `undefined` (a key that exists in `keys` but was deleted externally), `undefined + getRolloverBonus(k)` = `NaN`, causing the total to silently become `NaN`. In normal use this cannot happen (keys come from `Object.keys(S.budgets)`), but defensive coding would add `||0`.

---

## calcTax (line 11566)

- [MINOR] line 11566 — `calcTax` contains ZA SARS 2025/26 individual income-tax brackets but has no `S.prefs.region` guard inside the function. The page is nav-gated (`data-region-only="za"` on line 1507), so a UK user should never reach it through normal navigation. However there is no internal guard preventing a direct call or a future refactor from exposing ZA-specific calculations to UK users.

- [MINOR] line 11582 — Medical Aid Tax Credit formula: `(Math.min(med,2)*364 + Math.max(med-2,0)*246)*12`. Per SARS 2025/26: main member R364, first dependant R364, additional dependants R246 each. This formula gives `(1*364)*12 = R4,368` for 1 member (correct). For 2 members: `(2*364)*12 = R8,736` (correct). For 3 members: `(2*364 + 1*246)*12 = R11,688` (correct). No bug here.

- [MINOR] line 11579 — `ageRebate` for `'under65'` falls through to `0`, meaning `rebate = 17,235`. This matches SARS 2025/26 correctly. No bug.

---

## calcItr12 / itr12AutoFill (lines 9850 / 9918)

- [CRITICAL] line 9920 — `itr12AutoFill` uses wrong tax year boundary. It filters transactions by: `y===yr || y===yr-1` (calendar years). The SA tax year is **1 March – last day of February** (e.g. 2025/26 runs 1 Mar 2025 – 28 Feb 2026). The current filter includes Jan 2025 and Feb 2025 (which belong to the **2024/25** tax year, not 2025/26) and would include all of calendar year `yr-1` (i.e., Jan–Dec 2024), which spans **two** SA tax years. The correct approach is to use a date-range filter like `t.date >= taxYrStart && t.date < taxYrEnd`, where `taxYrStart` is derived from `now.getMonth()>=2 ? YYYY-03-01 : (YYYY-1)-03-01` (as already done correctly in `rTfsa` on line 10014). This will cause auto-filled ITR12 totals to be materially wrong — wrong income and deduction figures pre-populated.

- [MINOR] line 9919 — `itr12AutoFill` accesses `S.transactions` directly without `||[]` guard. Low risk given state init.

- [MINOR] line 9862 — `calcItr12` uses `travDeduction=tkm>0?Math.min(bkm/tkm,1)*trav:0` — if `tkm>0` this is safe. If both `bkm` and `tkm` are 0, the `tkm>0` guard prevents division by zero. Fine.

---

## calcCGT (line 11651)

- [MINOR] line 11666–11667 — `cgTax=includedGain*(mtr/100)` — if `mtr=0` (user hasn't entered their marginal rate), `cgTax=0`. This is handled: line 11679 shows a warning banner when `!mtr`. No bug.

- [MINOR] line 11667 — `effectiveRate=grossGain>0?(cgTax/grossGain)*100:0` — division-by-zero protected. Fine.

---

## calcRA (line 11684)

- [WARNING] line 11725 — Hardcoded "R350,000/yr" and "R3,000/mo" in the RA benefit tip. The SARS tax page is ZA-gated so these won't appear for UK users, but the R3,000 reference is a static illustrative amount. The `fmt()` call for the tax saving is correct. Minor inconsistency in ZA-only context.

- [MINOR] line 11698 — `monthlyAnnuity` uses a hardcoded 20-year annuity at 6.5%. These assumptions are not disclosed to the user in the output. The note on line 11706 only shows "years · 10% assumed" for the projection, not the annuity rate. The annuity estimate shown could be materially different from reality. Minor UX/transparency issue.

---

## calcCIT (line 12789)

- [MINOR] line 12789 — No `S.prefs.region` guard; the tax page is ZA-gated via nav, so no cross-region issue in practice.

- [MINOR] lines 12798–12801 — SBC (Small Business Corporation) tax brackets appear to match SARS 2024/25 thresholds (R95,750 / R365,000 / R550,000). These should be verified against 2025/26 SARS tables — no change was announced but worth confirming annually.

---

## calcTrustTax (line 12830)

- [MINOR] line 12843–12845 — Special Trust calculation applies individual tax brackets then `tax=Math.max(0,tax-17235)`. The primary rebate deduction for a Special Trust (Type A) is correct per SARS rules. Protected by `Math.max`. No division-by-zero. No bug.

---

## rISA (line 13308)

- [MINOR] line 13309 — `if(S.prefs.region !== 'uk') return;` — correctly UK-gated. No cross-region issue.

- [MINOR] line 13318 — `'£'+total.toLocaleString('en-GB',...)` — hardcoded `£` symbol. This is correct for the UK ISA page. However it does not use `S.prefs.cur`, so if the user has manually overridden their currency symbol (e.g. to `$` while still having region `uk`), the ISA display would show `£` while other parts of the app show `$`. Inconsistency rather than a bug.

- [MINOR] line 13359 — UK tax year boundary: `_now >= new Date(_now.getFullYear(), 3, 6)`. In JavaScript, `new Date(year, 3, 6)` = April 6 at midnight local time. The UK tax year officially starts on 6 April. Comparing a `new Date()` (which includes time) against midnight April 6 means that on April 6 at 00:00:00.001, the new tax year is correctly detected. This is fine.

---

## showOnboarding / obNext / obChoosePlatform (lines 12686–12776)

- [WARNING] line 12736 — `setObRegion('sa')` is called unconditionally as the default when the user reaches step 4 (account setup). `setObRegion` only populates the bank dropdown (`ob-acc-bank`) with SA banks, but does NOT set `S.prefs.region`. The actual region selection happens later via `klSelectRegion` (line 14557) through a separate region-gate UI. If a UK user dismisses the onboarding early (via `obSkip`, line 12754) before selecting their region, `S.prefs.region` remains unset, which triggers `klCheckRegion()` on load. This is by design. No bug, but the SA bank default in the onboarding account step is slightly misleading for UK users who see SA banks before completing the region gate.

- [MINOR] line 12727-12729 — `S.prefs.userName = name` — the name is not sanitised, but it's stored and displayed with `textContent` (line 12731), which is XSS-safe. Fine.

- [MINOR] line 12743 — `const defAcc=S.accounts.find(a=>a.id==='default')` — no `||[]` guard on `S.accounts`. The state init always has `[DEF_ACCOUNT]` so this is safe in practice. If `defAcc` is not found (unexpected state), it silently skips the account update with no error.

---

## exportCsv — t.desc bug (line 10536, out-of-scope but flagged)

- [WARNING] line 10536 — `exportCsv` uses `t.desc` instead of `t.description`. The transaction object stores text in `t.description` (as used everywhere else in the codebase). This means the exported CSV "Description" column is **always blank** — every exported transaction will have an empty description field. This is out-of-scope for the current function list but is a data-integrity bug that affects all users who export CSV.

---

## Summary Table

| Severity | Count | Functions |
|----------|-------|-----------|
| CRITICAL | 1 | `itr12AutoFill` — wrong SA tax year filter |
| WARNING | 5 | `rAccounts` (ZAR hardcode, unescaped `cur`), `rBudProg`/`rBudget` (`S.budgets` no `\|\|{}`), `exportCsv` (`t.desc` typo) |
| MINOR | 12 | Various — see details above |

## Priority fix order

1. **`itr12AutoFill` line 9920** — replace calendar-year filter with the same `taxYrStart` date-string comparison already used in `rTfsa`.
2. **`rBudProg` line 9367 / `rBudget` line 8271** — add `||{}` guards: `Object.keys(S.budgets||{})`.
3. **`rAccounts` line 6166** — replace hardcoded `ZAR` label with `S.prefs.cur || 'R'` or a region-aware currency label.
4. **`exportCsv` line 10536** — change `t.desc` to `t.description`.
5. **`rAccounts` line 6155** — wrap `acc.type` fallback in `esc()`.
