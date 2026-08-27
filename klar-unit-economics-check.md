# Klar — Infra Cost vs. Revenue Reality Check
*Companion to `klar-financial-model.html` (June 2026 model). Read-only cross-check — does not edit or replace it.*

Prepared: 27 Aug 2026. All infra pricing below is current-year (2026) as found via web search; anything unverifiable is marked **[ESTIMATE — confirm with vendor]**.

---

## 1. What each vendor actually costs right now

| Vendor | Plan / rate | Source confidence |
|---|---|---|
| **Cloudflare Workers** (static hosting) | Free tier: static asset requests are free and unlimited even on the free plan; only Worker *invocations* are capped at 100k/day. At Klar's current scale this is **$0/month**. | Verified (Cloudflare docs) |
| **Supabase** (Auth + Postgres + Edge Functions) | Pro plan: **$25/month base**, which includes a $10/month compute credit (covers one Micro instance), 8GB DB storage, 100GB file storage, 100k MAU. Overages billed per GB/MAU beyond that. Real-world small apps typically land **$35–75/month** once modest overage hits. | Verified (multiple 2026 pricing breakdowns) |
| **Groq API** (LLaMA inference for AI advisor) | Token-priced, model-dependent. Llama 3.3 70B: $0.59/M input, $0.79/M output tokens. Cheaper models (Llama 4 Scout): $0.11/$0.34 per M. No monthly fee. | Verified (Groq pricing pages), model choice not confirmed — using 70B as a conservative "good quality advisor" assumption |
| **Lemon Squeezy** (payments, MoR) | **5% + $0.50 per transaction**, plus **+0.5%** for recurring/subscription billing. So an effective subscription rate of **~5.5% + $0.50/charge**. No monthly fee. | Verified (Lemon Squeezy 2026 pricing) |
| **Salt Edge** (bank feed aggregation) | **No public pricing — enterprise/quote-only.** Feature- and volume-based, custom contracts. | **[ESTIMATE — confirm with vendor]**: modeled below at $0.50–$1.00 per linked account/month, in line with comparable open banking aggregators (TrueLayer/Plaid-class). Some providers in this space also carry a **monthly minimum ($500–$2,000)** regardless of volume — Klar has not confirmed whether Salt Edge does. This is the single biggest unknown in the whole cost stack. |

---

## 2. Per-user cost assumptions used below

- **Groq**: ~30 AI-advisor queries/user/month (Pro/Family tier only), ~1,500 input + 500 output tokens/query → **≈ $0.038/paying user/month** at 70B pricing (≈$0.006 if Klar ships on the cheaper Scout model instead — confirm which model is live in prod).
- **Salt Edge**: 1 linked bank account per paying user (Free tier assumed *not* to get live bank sync — confirm this gating decision, it matters a lot) → **$0.50–$1.00/paying user/month [ESTIMATE]**.
- **Lemon Squeezy**: only levied on actual subscription revenue, not a per-user infra cost — modeled separately against revenue.
- **Supabase**: fixed monthly base + step-function overage, not linear per-user — modeled as a step cost at each milestone.

---

## 3. Unit economics at three user-count milestones

Assuming the model's own blended paid conversion (~8% free→paid, existing model's base case) and blended ARPU of £6.00/paid user (existing model's figure).

| Milestone | Total users | Paying users (~8%) | Supabase (fixed) | Groq (variable) | Salt Edge (variable, est.) | **Total infra/mo** | Revenue/mo (£6 ARPU) | Infra as % of revenue |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 100 | 8 | $25 | $0.30 | $4–8 | **≈$29–33** | £48 (~$61) | ~48–54% |
| 1,000 | 1,000 | 80 | $35–50 | $3 | $40–80 | **≈$78–133** | £480 (~$610) | ~13–22% |
| 10,000 | 10,000 | 800 | $100–200* | $30 | $400–800 | **≈$530–1,030** | £4,800 (~$6,100) | ~9–17% |

\* At 10k users Supabase Pro will likely be hitting MAU/storage overage tiers well above the $25 base; $100–200/mo is a rough band, not a quote. If growth continues past ~20–50k users the $599/mo Team plan becomes relevant.

**Reading this**: infra cost as a share of revenue *falls* as Klar scales (fixed Supabase cost amortizes, Groq is trivially cheap), UNLESS Salt Edge pricing turns out to carry a large per-account or minimum-contract cost — in which case the 100-user and 1,000-user milestones look far worse than shown, since a $500–2,000/month minimum would dwarf every other line item pre-scale.

---

## 4. Where does Klar break even on pure infra costs?

At 100 users, monthly infra is ~$30–33 (≈£24–26). At £6 blended ARPU, **that's covered by roughly 5–6 paying subscribers** — trivial, reached in the model's own Month 1–2. Pure-infra breakeven is not a meaningful constraint at any realistic milestone in the existing model; Supabase and Groq costs are close to rounding errors against even modest subscription revenue.

The one scenario where this changes: if Salt Edge charges a flat enterprise minimum (common in open banking data contracts) rather than true per-account pricing, breakeven could require **50–300+ paying users** just to cover that one line, depending on the minimum. This should be confirmed with Salt Edge before the "gross margin ~82%" figure in the existing model is treated as reliable pre-scale (it's very likely fine at 10k+ users; it's genuinely uncertain at 100–1,000 users if a fixed minimum applies).

---

## 5. Flags against `klar-financial-model.html`

1. **Bank aggregation cost is absent from the unit-economics section.** The existing model's Gross Margin card (~82%, "SaaS infra + Supabase") lists only Supabase as a cost driver and doesn't mention Salt Edge at all, despite Open Banking / bank feed sync being a named feature (Section 09, "Open Banking fully live" at M18). Given Salt Edge is quote-only and potentially minimum-billed, this margin figure should be treated as **unverified until a vendor quote is in hand** — it could still land near 82%, or could be meaningfully lower pre-scale.
2. **AI advisor cost is genuinely negligible** (≈$0.01–0.04/paying user/month) — the existing model doesn't call this out explicitly, but there's no need to worry about it; Groq is not a cost risk at any scale modeled here, even at 10x the assumed query volume.
3. **Cloudflare migration doesn't change the model's economics** — hosting was already assumed cheap/free-ish in spirit, and this confirms it's actually $0 at current scale. No adjustment needed to the model's cost assumptions on this line.
4. **Lemon Squeezy's ~5.5%+$0.50/transaction fee isn't broken out anywhere in the model's ARPU/margin math.** At £3.99 Essential, a single monthly charge costs ~$0.72 in LS fees (~18% of that specific transaction before FX); at £7.99 Pro it's ~$0.94 (~15%). This is worth adding as an explicit line if the model's gross-margin figure is meant to be net of payment processing — right now it reads as infra-only margin, not fully-loaded margin. Annual billing (which the model already promotes for churn reasons) also meaningfully dilutes this fee's monthly-equivalent impact, which is a real synergy worth naming.

---

## 6. Bottom line

Infra costs (Cloudflare + Supabase + Groq) are not a threat to Klar's unit economics at any milestone tested — they're small and shrink as a share of revenue with scale. The **one open question that actually matters** is Salt Edge pricing, which is not public. Getting a real quote (even a ballpark) before the next investor conversation would close the only real gap between this reality check and the existing financial model's 82% gross margin assumption.
