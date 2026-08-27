# Klar — P&L Projection, Cash Flow Forecast & Management Accounting Structure

*Prepared 27 Aug 2026 by the Finance & Ops Lead. Builds directly on `klar-financial-model.html` (growth/pricing engine) and `klar-unit-economics-check.md` (infra cost figures) — read-only on both, no edits made. This is the first actual financial management structure (P&L, cash flow, chart of accounts, close process) built for Klar; none existed previously in this codebase.*

**Currency: GBP is primary throughout this document**, matching Klar's home market and the existing financial model. ZAR (South Africa) pricing exists (R69/R149 tiers) but is a secondary market — not modeled as a parallel currency track here, per task scope. FX used for USD infra costs: **$1 = £0.74** (GBP/USD ≈ 1.35, spot Aug 2026). All projections are **forward-looking estimates, not actuals** — Klar is pre-revenue with $0 booked revenue to date.

---

## 0. Key assumptions and one data-quality flag carried forward

- **Growth engine**: this document uses `klar-financial-model.html`'s **Base Case** live JavaScript formula (not the prose "Key Milestones" copy elsewhere on that page) — see below.
- **Blended ARPU**: £6.00/paying user/month (Base Case), churn 5%/month, tier mix normalized from the model's stated Essential 30% / Pro 55% / Family 15% *user* split into a *revenue* split (Essential 15.9%, Pro 58.3%, Family 25.8%) so that tier revenue sums to the model's own £6.00 blended ARPU. Table headers below use rounded 16% / 58% / 26%.
- **Cost figures**: reused as-is from `klar-unit-economics-check.md` — Groq ≈£0.03/paying user/mo, Salt Edge ≈$0.75/linked-account/mo **[ESTIMATE — quote-only vendor]**, Lemon Squeezy 5.5% + $0.50/transaction, Supabase step-cost bands ($25→$200+).
- **Salt Edge phasing refined**: the unit-economics doc applied Salt Edge cost at every milestone. This model instead gates it to **Month 18+**, matching the financial model's own roadmap line ("M18: Open Banking fully live") and applies it only to Pro+Family users (assumed to be the only tiers with bank-sync), ramping 33% → 66% → 100% of that base over M18–M20.
- **Founder compensation**: **£4,000/month is an illustrative placeholder only** — not a real disbursement unless/until the founder actually draws it. It is shown as a separate P&L line so both "cash-realistic" and "fully-loaded" profitability can be read directly.

### 🚩 Flag: the model's own narrative milestones don't reconcile with its own formula engine

`klar-financial-model.html`'s "Key Milestones" section states M9 = 200 paid users/£1,200 MRR and M22 = 13,900 users/£1M ARR/£83,400 MRR. Running the page's **actual embedded JS growth formula** (the one that drives its live chart and table, reproduced faithfully below) instead produces **M9 = 142 users/£852 MRR** and **M22 = 11,074 users/£797K ARR/£66,444 MRR** — roughly 20–30% lower than the narrative copy at every checkpoint past Month 8. The formula, not the prose, is what actually computes; this document uses the formula, since it's the only reproducible source of truth in the file. **Recommend reconciling this before the next investor conversation** — either the milestone copy needs updating to match the formula, or the formula's growth constants need retuning to hit the stated 13,900-user/£1M ARR target. This is a new finding, separate from the three flags already raised in `klar-unit-economics-check.md` §5.

---

## 1. Monthly P&L Projection — Base Case, Months 1–24

Revenue by tier is the model's blended £6 ARPU split proportionally across Essential/Pro/Family list prices. Cost of Revenue = Groq + Salt Edge + Lemon Squeezy (these scale with usage/revenue). Operating Expenses = Supabase (step-cost) + Software/Tools + Professional Services/Legal (small recurring placeholders — no line item for either was found elsewhere in the codebase) + **Founder Compensation (illustrative only)**.

| Month | Paid Users | Essential Rev | Pro Rev | Family Rev | Total Revenue | Groq | Salt Edge | Payment Proc. (LS) | Total CoR | Gross Profit | GM% | Supabase | Tools | Legal/Prof | Founder Comp* | Net Income (excl. founder) | Net Income (incl. founder)* |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | 3 | £3 | £10 | £5 | £18 | £0.09 | £0 | £2 | £2 | £16 | 87.8% | £20 | £30 | £100 | £4,000 | -£134 | -£4,134 |
| M2 | 7 | £7 | £24 | £11 | £42 | £0.21 | £0 | £5 | £5 | £37 | 87.8% | £20 | £30 | £100 | £4,000 | -£113 | -£4,113 |
| M3 | 12 | £11 | £42 | £19 | £72 | £0.36 | £0 | £8 | £9 | £63 | 87.8% | £20 | £30 | £100 | £4,000 | -£87 | -£4,087 |
| M4 | 18 | £17 | £63 | £28 | £108 | £0.54 | £0 | £13 | £13 | £95 | 87.8% | £20 | £30 | £100 | £4,000 | -£55 | -£4,055 |
| M5 | 26 | £25 | £91 | £40 | £156 | £0.78 | £0 | £18 | £19 | £137 | 87.8% | £20 | £30 | £100 | £4,000 | -£13 | -£4,013 |
| M6 | 36 | £34 | £126 | £56 | £216 | £1.08 | £0 | £25 | £26 | £190 | 87.8% | £20 | £30 | £100 | £4,000 | £40 | -£3,960 |
| M7 | 48 | £46 | £168 | £74 | £288 | £1.44 | £0 | £34 | £35 | £253 | 87.8% | £20 | £30 | £100 | £4,000 | £103 | -£3,897 |
| M8 | 65 | £62 | £227 | £101 | £390 | £1.95 | £0 | £46 | £47 | £343 | 87.8% | £20 | £30 | £100 | £4,000 | £193 | -£3,807 |
| M9 | 142 | £135 | £497 | £220 | £852 | £4.26 | £0 | £99 | £104 | £748 | 87.8% | £30 | £30 | £100 | £4,000 | £588 | -£3,412 |
| M10 | 315 | £300 | £1,101 | £489 | £1,890 | £9.45 | £0 | £220 | £230 | £1,660 | 87.8% | £30 | £30 | £100 | £4,000 | £1,500 | -£2,500 |
| M11 | 579 | £551 | £2,025 | £898 | £3,474 | £17.37 | £0 | £405 | £423 | £3,051 | 87.8% | £45 | £30 | £100 | £4,000 | £2,876 | -£1,124 |
| M12 | 930 | £886 | £3,252 | £1,442 | £5,580 | £27.90 | £0 | £651 | £679 | £4,901 | 87.8% | £45 | £30 | £100 | £4,000 | £4,726 | **£726** |
| M13 | 1,364 | £1,299 | £4,770 | £2,115 | £8,184 | £40.92 | £0 | £955 | £996 | £7,188 | 87.8% | £45 | £30 | £100 | £4,000 | £7,013 | £3,013 |
| M14 | 1,896 | £1,805 | £6,630 | £2,941 | £11,376 | £56.88 | £0 | £1,327 | £1,384 | £9,992 | 87.8% | £45 | £30 | £100 | £4,000 | £9,817 | £5,817 |
| M15 | 2,581 | £2,458 | £9,025 | £4,003 | £15,486 | £77.43 | £0 | £1,807 | £1,884 | £13,602 | 87.8% | £90 | £30 | £100 | £4,000 | £13,382 | £9,382 |
| M16 | 3,412 | £3,249 | £11,931 | £5,292 | £20,472 | £102.36 | £0 | £2,388 | £2,491 | £17,981 | 87.8% | £90 | £30 | £100 | £4,000 | £17,761 | £13,761 |
| M17 | 4,381 | £4,172 | £15,319 | £6,795 | £26,286 | £131.43 | £0 | £3,067 | £3,198 | £23,088 | 87.8% | £90 | £30 | £100 | £4,000 | £22,868 | £18,868 |
| M18 | 5,482 | £5,220 | £19,169 | £8,503 | £32,892 | £164.46 | £852 | £3,837 | £4,854 | £28,038 | 85.2% | £90 | £30 | £100 | £4,000 | £27,818 | £23,818 |
| M19 | 6,708 | £6,387 | £23,457 | £10,404 | £40,248 | £201.24 | £2,086 | £4,696 | £6,982 | £33,266 | 82.7% | £150 | £30 | £100 | £4,000 | £32,986 | £28,986 |
| M20 | 8,053 | £7,668 | £28,160 | £12,490 | £48,318 | £241.59 | £3,793 | £5,637 | £9,672 | £38,646 | 80.0% | £150 | £30 | £100 | £4,000 | £38,366 | £34,366 |
| M21 | 9,510 | £9,055 | £33,255 | £14,750 | £57,060 | £285.30 | £4,480 | £6,657 | £11,422 | £45,638 | 80.0% | £150 | £30 | £100 | £4,000 | £45,358 | £41,358 |
| M22 | 11,074 | £10,545 | £38,724 | £17,175 | £66,444 | £332.22 | £5,216 | £7,752 | £13,300 | £53,144 | 80.0% | £150 | £30 | £100 | £4,000 | £52,864 | £48,864 |
| M23 | 12,740 | £12,131 | £44,549 | £19,760 | £76,440 | £382.20 | £6,002 | £8,918 | £15,302 | £61,138 | 80.0% | £150 | £30 | £100 | £4,000 | £60,858 | £56,858 |
| M24 | 14,503 | £13,810 | £50,714 | £22,494 | £87,018 | £435.09 | £6,832 | £10,152 | £17,419 | £69,599 | 80.0% | £150 | £30 | £100 | £4,000 | £69,319 | £65,319 |

*\*Founder Compensation is illustrative only — a placeholder for founder time/opportunity cost, not a committed or currently-paid salary. It exists so the table shows both a cash-realistic view (excl. founder) and a fully-loaded economic view (incl. founder).*

### Profitability summary

- **Gross margin** starts near 88% and settles at **~80%** once Salt Edge activates at M18 — still comfortably above the "≈82%" figure the existing financial model claims, and confirms the unit-economics doc's read that Salt Edge is the only cost line that meaningfully compresses margin, not Groq or Supabase.
- **Profitable on a pure cash-cost basis (excl. founder comp) from Month 6** — MRR of £216 already covers Supabase + Groq + Lemon Squeezy + tools + legal at that scale. This confirms and sharpens the unit-economics doc's finding that infra breakeven is a non-issue.
- **Profitable on a fully-loaded basis (incl. £4,000/mo illustrative founder comp) from Month 12** — 930 paid users / £5,580 MRR is the point where revenue covers everything including a modest founder draw.
- Net income accelerates sharply from M18 as the Post-raise/Flywheel growth phases compound, reaching **~£65K/month fully-loaded net income by M24** on Base Case assumptions — though see the flag in §0 about the underlying growth formula undershooting the model's own headline £1M ARR target by M22.

---

## 2. Cash Flow Forecast

**Starting cash position: UNKNOWN — founder input needed.** This forecast assumes £0 starting cash (i.e., Klar is funding itself purely from the revenue and any raise modeled below); if real bank cash exists today, add it to every cumulative-cash figure below. **All figures here are projections built on the assumptions above, not real bank or payment-processor data** — Klar has no connected banking or payment feeds to source actuals from yet.

### Cash collection timing (Lemon Squeezy)

Lemon Squeezy holds net sales for **13 days**, then pays out twice monthly (on the 1st and 15th, covering sales up to the 14th/28th) via Stripe-powered bank transfer, typically arriving 1–5 days after that. Net effect: roughly half of any given month's sales land as cash in that same month, and the second half slips into the following month. This forecast models **Cash In (Month M) = 50% of Month M revenue + 50% of Month M-1 revenue** to reflect that lag. *(Source: Lemon Squeezy "Getting Paid" documentation, docs.lemonsqueezy.com.)*

### Cash out components

Cash Out = Cost of Revenue (Groq + Salt Edge + Lemon Squeezy fees, same as the P&L) + fixed OpEx (Supabase + Tools + Legal/Prof) + scenario-dependent founder draw + scenario-dependent growth/marketing spend (drawn down from any raise, since the £200K allocation table in `klar-financial-model.html` §06 earmarks 45% to paid acquisition, 15% SEO, 20% infra/tooling, 20% part-time dev contractor, 6% legal/compliance — spread here as an even £/month draw-down over an assumed 18 months post-raise for modeling simplicity).

### Four scenarios, monthly cumulative cash

| Month | Cash In | A: No Funding, Founder £0 draw (cum.) | B: No Funding, Founder draws £4k/mo from M1 (cum.) | C: £100K raised @ M9 (cum.) | D: £200K raised @ M9 — full Seedrs target (cum.) |
|---|---|---|---|---|---|
| M1 | £9 | -£143 | -£4,143 | -£143 | -£143 |
| M2 | £30 | -£268 | -£8,268 | -£268 | -£268 |
| M3 | £57 | -£370 | -£12,370 | -£370 | -£370 |
| M4 | £90 | -£443 | -£16,443 | -£443 | -£443 |
| M5 | £132 | **-£480** | -£20,480 | -£480 | -£480 |
| M6 | £186 | -£470 | -£24,470 | -£470 | -£470 |
| M7 | £252 | -£403 | -£28,404 | -£403 | -£403 |
| M8 | £339 | -£262 | -£32,262 | -£262 | -£262 |
| M9 | £621 | £95 | -£35,905 | £92,040 | £184,984 |
| M10 | £1,371 | £1,076 | -£38,924 | £84,965 | £170,854 |
| M11 | £2,682 | £3,161 | -£40,839 | £78,994 | £157,827 |
| M12 | £4,527 | £6,834 | **-£41,166** | £74,612 | £146,389 |
| M13 | £6,882 | £12,545 | -£39,455 | £72,267 | £136,990 |
| M14 | £9,780 | £20,766 | -£35,234 | £72,433 | £130,099 |
| M15 | £13,431 | £32,093 | -£27,907 | £75,704 | £126,315 |
| M16 | £17,979 | £47,361 | -£16,639 | £82,917 | £126,472 |
| M17 | £23,379 | £67,322 | -£678 | £94,822 | £131,322 |
| M18 | £29,589 | £91,837 | £19,837 | £111,282 | £140,726 |
| M19 | £36,570 | £121,145 | £45,145 | £132,533 | £154,922 |
| M20 | £44,283 | £155,475 | £75,475 | £158,809 | £174,142 |
| M21 | £52,689 | £196,462 | £112,462 | £191,740 | £200,018 |
| M22 | £61,752 | £244,634 | £156,634 | £231,856 | £233,078 |
| M23 | £71,442 | £300,494 | £208,494 | £279,661 | £273,827 |
| M24 | £81,729 | £364,524 | £268,524 | £335,635 | £322,746 |

### Reading the four scenarios

- **Scenario A (no funding, founder takes no salary)**: infra/operating costs alone create only a **trivial ~£480 trough at Month 5**, then the business is cash-flow self-sustaining from Month 6 onward, growing to +£365K cumulative by M24 purely from reinvested revenue. This confirms the unit-economics doc's conclusion that infra is not a real financial risk at any modeled scale — but it assumes the founder draws zero income the entire time.
- **Scenario B (no funding, founder draws £4,000/mo from Month 1)**: this is the realistic "what if the raise never happens and I need to pay myself" case. Cumulative deficit peaks at **-£41,166 around Month 12**, only turning cash-positive around **Month 18**. **This is the real personal-runway number**: a founder self-funding Klar without external capital needs on the order of **£40–45K in personal savings or other income** to bridge to self-sufficiency under Base Case growth — and that's on the model's *optimistic* organic-growth curve; if organic growth undershoots to something closer to the model's own Conservative case, this trough would be deeper and later.
- **Scenario C (£100K raised at Month 9)**: matches the timing of the model's own "RAISE" milestone. Never approaches zero after the raise lands — minimum cash of £72K at M14 — but note this assumes only a partial (£100K, not £200K) raise, with founder draw and growth spend scaled down proportionally.
- **Scenario D (£200K raised at Month 9 — the actual Seedrs target from `klar-pitch-materials.md`)**: comfortably funds the full founder-comp + growth-spend allocation with cash never dropping below £126K post-raise. This is the scenario the existing pitch materials and financial model are implicitly built around.

**Bottom line for the founder**: the £200K raise target isn't needed to keep the *infrastructure* running — that's nearly free. It's needed to (a) pay the founder a living wage and (b) fund the £90K/£30K/£40K acquisition/SEO/dev-contractor spend baked into the model's own growth curve. Without it, self-funding the founder's time alone requires roughly **£40–45K of bridge capital** to reach Month 18 self-sufficiency — a materially smaller and more fundable number than the full £200K ask, worth knowing if a bridge/friends-and-family round is ever considered as a fallback to the Seedrs campaign. Per current 2026 runway benchmarks, 12–18 months of runway at close is considered the healthy minimum for pre-seed/seed-stage companies — Scenario D's ~18-month drawdown-and-recover shape sits inside that norm.

---

## 3. Lightweight Management Accounting Structure

### 3.1 Proposed chart of accounts

A pre-revenue SaaS/fintech at Klar's stage doesn't need a large ledger — this is deliberately minimal, expandable later as real transactions accrue.

**Revenue (4000s)**
| Code | Account |
|---|---|
| 4010 | Subscription Revenue — Essential |
| 4020 | Subscription Revenue — Pro |
| 4030 | Subscription Revenue — Family |
| 4090 | Other/Deferred Revenue Recognized |

**Cost of Revenue (5000s)**
| Code | Account |
|---|---|
| 5010 | Groq API (AI advisor inference) |
| 5020 | Salt Edge (bank feed aggregation) |
| 5030 | Payment Processing Fees (Lemon Squeezy) |

**Operating Expenses (6000s)**
| Code | Account |
|---|---|
| 6010 | Hosting & Infrastructure (Supabase, Cloudflare) |
| 6020 | Software & Tools (domain, analytics, misc SaaS subscriptions) |
| 6030 | Professional Services — Legal & Compliance (FCA filing, contracts) |
| 6040 | Professional Services — Accounting/Bookkeeping |
| 6050 | Founder Compensation (draw/salary once instituted) |
| 6060 | Marketing & Acquisition (paid social, SEO/content, referral costs) |
| 6070 | Contractor/Development Costs |

**Balance Sheet — Assets (1000s)**
| Code | Account |
|---|---|
| 1010 | Cash — Operating Account |
| 1020 | Accounts Receivable (n/a today — Lemon Squeezy is the merchant of record and collects directly; relevant only if invoicing B2B/white-label customers directly in future) |
| 1030 | Prepaid Expenses (e.g. annual software licences) |

**Balance Sheet — Liabilities (2000s)**
| Code | Account |
|---|---|
| 2010 | Accounts Payable |
| 2020 | Deferred Revenue — Annual Subscriptions (unearned portion of annual-plan cash collected upfront; recognize 1/12 per month) |
| 2030 | Accrued Expenses |

**Balance Sheet — Equity (3000s)**
| Code | Account |
|---|---|
| 3010 | Founder's Capital / Equity |
| 3020 | Raised Capital (Seedrs / SEIS-EIS round, when closed) |
| 3030 | Retained Earnings / Accumulated Deficit |

### 3.2 Recommended bookkeeping setup

For a solo founder at pre-revenue/soft-launch stage, **cloud bookkeeping software is the right tool category — not a bookkeeper or accountant hire.** Based on current UK options for a solo founder:

- **FreeAgent** is the strongest fit if Klar opens a business account with NatWest, RBS, Ulster Bank, or Mettle — it's free for life with those banks and is purpose-built for UK sole traders/small companies with clean tax-return-ready output.
- **Xero** (from ~£16–35/month) is the market-leading alternative if no qualifying bank account is used — best ecosystem of UK add-ons and bank-feed reconciliation, worth it once transaction volume grows past what a spreadsheet-adjacent tool comfortably handles.
- **Wave** or **Zoho Books** (free tier) are viable stopgaps for the first few months of real transaction volume if minimizing cost is the priority pre-revenue.

**Recommendation**: start with **FreeAgent if a qualifying UK business bank account is opened** (effectively £0 fixed cost, real double-entry books, direct UK Corporation Tax/VAT-ready output); fall back to **Xero Starter** otherwise. Either choice is a single connected tool a solo founder can run monthly without external bookkeeping help until transaction complexity (e.g. multi-currency ZAR settlement, real payroll) justifies bringing in outside help — not needed at current scale.

### 3.3 Monthly financial close checklist

A lightweight 5–8 item close appropriate for this stage — expand as real bank/payment feeds come online:

1. **Reconcile Lemon Squeezy payout report against booked subscription revenue** by tier (once real transactions exist) — confirm the 13-day hold/twice-monthly payout pattern matches what landed in the bank.
2. **Pull actual Groq, Supabase, and Salt Edge invoices** and post against 5010/5020/6010 — compare to this document's modeled estimates and flag variances >20%.
3. **Update Deferred Revenue (2020)** for any annual-plan subscribers — recognize 1/12 of each annual payment as revenue for the month, carry the rest as a liability.
4. **Review Accounts Payable / any outstanding vendor invoices** (legal, contractor, tooling) and confirm nothing is overdue.
5. **Update cash position** against this cash flow forecast — note actual vs. projected cash-in/cash-out and investigate any month where actual differs from modeled by more than ~15%.
6. **Snapshot paid-user count and MRR by tier** from the app/database and reconcile against Lemon Squeezy's subscriber count — catch sync issues between the product and the payment processor early.
7. **File/diarize any SEIS-EIS, FCA, or Companies House compliance deadlines** due in the following 30 days (advance assurance status, annual confirmation statement, etc.).
8. **One-line close summary**: revenue, gross margin %, net income (both bases), cash position, and runway-to-date — a 5-minute founder-readable snapshot, not a full report.

---

*This document is a projection exercise built on `klar-financial-model.html`'s own growth engine and `klar-unit-economics-check.md`'s cost figures. It contains no real transactions, no connected bank/payment data, and should not be treated as actual financial statements. All USD-to-GBP conversions use a single spot rate (£1 = $1.35, Aug 2026) and will drift with FX movements. Salt Edge pricing remains the single largest unverified input in the entire cost stack — see `klar-unit-economics-check.md` §1 and §4.*
