# Klar — Help Centre FAQ (Final Draft)

*Updated 27 Aug 2026 — supersedes the draft in klar-support-readiness-and-faq.md now that the account-deletion billing warning has shipped and Crisp staffing status is known. Written for two audiences at once: a human reading a help page, and an AI support tool (e.g. Help Scout AI Answers) trained on this content to draft/resolve email replies. One topic per answer, no internal notes, no unresolved placeholders — every answer is a safe, publishable default.*

---

**Is my financial data safe?**
Yes. Your data is encrypted in transit (TLS) and stored with row-level access security on Supabase. Klar is local-first by default — your data stays on your device unless you turn on cloud sync. We never sell your data. Third-party services (Supabase for cloud backup, Groq for the AI advisor, Lemon Squeezy for payments, Crisp for support chat) only ever see data relevant to the specific feature you're using, and only when you use it.

**What's the difference between local and cloud data?**
By default, everything you enter stays only in your browser on this device. If you turn on cloud sync (Settings), an encrypted backup is also stored on Supabase so you can access your data from another device. You can turn cloud sync off at any time and delete just the cloud copy without touching what's on your device.

**How do I delete my data or my account?**
In Settings → Privacy & Data Rights you can: export everything as JSON, edit any record directly, delete only your local on-device data, or delete your cloud backup. "Delete account permanently" removes your cloud data **and** your login itself — this is immediate and cannot be undone. Your local, on-device data is not affected by cloud or account deletion.

**If I delete my account, does that cancel my subscription too?**
No — deleting your account does **not** automatically cancel an active subscription. Please cancel it first via Settings → Subscription & Billing → "Manage Subscription & Billing," or your card will keep being charged even after your account and login are gone. The app will warn you about this if you have an active paid plan when you try to delete your account, but cancelling first is the safest order of operations.

**How do I cancel my subscription?**
From Settings → Subscription & Billing, tap "Manage Subscription & Billing" to open your Lemon Squeezy customer portal, where you can cancel or change plans at any time. You keep access until the end of your current billing period.

**Does the AI advisor give financial advice?**
No. Klar's AI advisor (powered by Groq) gives informational summaries and suggestions based on your data — it is not a regulated financial adviser, and its responses don't constitute personalised financial advice under FCA (UK) or FSCA (South Africa) rules. For advice specific to your circumstances, consult an authorised financial adviser.

**What does the AI advisor actually see about my finances?**
For general chat, it sees a financial summary only (average income/expenses, account count, region) — never raw transaction data. Two specific features work differently: "Explain transaction" sends that one transaction's description and amount, and the month-end checklist sends your upcoming bill names and amounts. Both only fire when you actively use those features. Your account numbers are never sent to the AI under any feature.

**Which banks/regions does Klar support?**
UK users can connect banks directly via Salt Edge open banking (available on paid plans). South African users currently import transactions manually via CSV — direct SA bank connections are on the roadmap. Everyone, in any region, can use manual entry and CSV import.

**I'm outside the UK or South Africa — can I still use Klar?**
Klar is built and priced around the UK and South Africa specifically (currency, tax tools, bank connections). You can still use manual tracking, budgeting, and the AI advisor from anywhere, but region-specific features like bank feeds and local tax calculators won't apply outside those two markets.

**What's included free vs. paid?**
The free plan covers transaction tracking, CSV import, and spending breakdowns — no card required. Paid plans add net worth tracking, the AI advisor, savings goals, bank feeds (UK), and unlimited accounts. See the pricing page for current tiers and prices in your local currency.

**Something looks wrong / a number doesn't match — what do I do?**
First, check Settings → Privacy & Data Rights → "Export JSON" to see exactly what data Klar has stored. If something still looks off, contact us at hello@klarmoney.app with what you were doing when you noticed it — the more detail, the faster we can help.

**How do I report a bug?**
Email hello@klarmoney.app with a description of what happened and, if possible, a screenshot.

**Who can see my data — do you sell it?**
No, Klar never sells your data. Data only goes to the specific service tied to a feature you actively use: Supabase (cloud backup, opt-in), Groq (AI advisor, opt-in), Lemon Squeezy (only when you subscribe), and Crisp (only when you open a support chat). Full details are in Settings → Privacy & Data Rights → Third-Party Processors.

**How do I contact support?**
Email **hello@klarmoney.app** — this is the fastest, most reliable way to reach us right now. We aim to respond within one business day.

---

## Notes for whoever sets up the AI tool (not part of the public FAQ)

- **Crisp chat is currently unstaffed** — as of this draft, do not point users to live chat as a working channel. The "How do I contact support?" answer above deliberately says email only for that reason. Update it once chat is genuinely staffed.
- The two founder-input items from the earlier draft are now resolved: subscription cancellation is answered directly above (confirmed via the actual `delete-account` Edge Function — it never touches Lemon Squeezy), and out-of-region support now has a real published answer instead of a placeholder.
- If Help Scout (or similar) is adopted, this file's Q&A section is the training content — paste it in directly, or point the tool at wherever this ends up published (landing page FAQ section and/or a dedicated help page).
