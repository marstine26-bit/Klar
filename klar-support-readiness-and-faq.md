# Klar — Support Readiness Assessment & Draft FAQ

Scope: read-only review of `Klar Rebrand.html`, `klarmoney-landing.html`, and
`functions/delete-account/index.ts`. No code changed.

## 1. What exists today in the app (Klar Rebrand.html)

Better than expected — there is a real, built-out support surface. It lives in
**Settings → Help & Support** and **Settings → Privacy & Data Rights**, not
anywhere a struggling user is likely to be at the moment they hit a problem
(see gaps below).

- **Help & Support card** (lines 3654–3666): a "Chat with support" button and
  an "Email us" button, plus links to Terms and Privacy Policy.
- **`klOpenSupport()`** (lines 16243–16251): tries Crisp chat first
  (`window.$crisp.push(['do','chat:open'])`), falling back to
  `mailto:hello@klarmoney.app?subject=Klar Support` if Crisp isn't configured.
- **Crisp is actually wired up**, not a stub. Line 1612 sets
  `window.CRISP_WEBSITE_ID = '5a23dbc4-b5bd-4159-a7f6-41d27ccb05a7'` — a real
  website ID, not the `'YOUR_CRISP_WEBSITE_ID'` placeholder the comment at
  1602–1616 describes as the "not configured" state. The script is loaded
  lazily by `_klLoadCrisp()` only when support is opened (privacy-friendly:
  no third-party request until the user asks for chat), and it identifies the
  user by email if known (line 1624). Crisp is also listed in the app's own
  data-processors table as "Support chat · EU · When chat opened" (line 4591).
  **Open question for the founder: is that Crisp account live, and is anyone
  actually monitoring it?** If not, the "Chat with support" button silently
  fails the user (chat window with no one behind it) rather than falling back
  to email.
- **Privacy & Data Rights card** (lines 3669–3712) gives users self-service
  buttons for: Export JSON, edit records ("go to Transactions"), Delete local
  data, Delete cloud data, and Delete account permanently — each with a
  confirm dialog (`klConfirm`) describing the consequence in plain language.
  This is a genuinely solid self-service data-rights UI.
- **AI advisor disclaimer** (lines 3022–3023): "Klar is not a regulated
  financial adviser... For regulated advice, consult an authorised financial
  adviser," referencing FCA (UK) and FSCA (SA). Present in-app, not just in
  marketing copy.
- **Billing**: "Manage Subscription & Billing ↗" links out to
  `https://app.lemonsqueezy.com/my-orders` (line 3632) — Lemon Squeezy's
  self-service customer portal, where users can presumably cancel/manage
  payment method. The app itself doesn't have its own cancel-subscription UI;
  it delegates entirely to Lemon Squeezy's hosted portal.

**What a user experiencing a problem would actually see/do right now:** if
something breaks mid-flow (e.g. a failed sync, a broken import), there is
**no contextual "something wrong? get help" link** at the point of failure —
I did not find toast/error notifications wired to `klOpenSupport()`. The user
would have to know to navigate to Settings and find the Help & Support card
buried below Category Rules, Subscription & Billing, and Referral cards. That
is a real but fixable gap — the support mechanism exists, it's just not
surfaced where the pain happens.

## 2. What exists on the landing page (klarmoney-landing.html)

- **FAQ section** (`#faq`, lines 903–934) with 5 questions: cancel anytime,
  data safety, supported banks, free plan contents, AI advisor cost. Good
  content, but thin (5 Qs) and doesn't cover account deletion, data export,
  or what happens if something goes wrong.
- **Founder-direct contact**: "Questions? Reach the founder directly —
  `hello@klarmoney.app`" (line 976), and the same address in the footer
  "Contact" link (line 991). This is the *same* address `klOpenSupport()`
  falls back to in-app — good consistency, one inbox to monitor.
- No contact form, no separate support/help-centre page — email only, which
  is appropriate for a solo founder at this stage.

## 3. Cross-check against `functions/delete-account/index.ts`

The Edge Function is well-built and matches what the in-app copy promises:

- Requires a valid bearer JWT; the target user is always derived from the
  verified token server-side — a user can only delete their own account
  (lines 12–15, 49–66).
- Deletes every owned row across `klar_syncs`, `klar_bill_payments`,
  `klar_bank_connections`, `subscriptions`, `tester_overrides` (lines 26–32,
  73–76), **then** deletes the Supabase Auth user record itself (line 78) —
  so it genuinely removes login credentials, not just data rows. This closes
  a real gap the code comments describe: the older `klDeleteCloudData()`
  client function only wiped data and signed the user out, leaving the Auth
  identity on the server indefinitely.
- **Deletion is immediate and irreversible** — no grace period, no
  confirmation email, no async queue. This matches the in-app confirm-dialog
  copy exactly: "This cannot be undone; there is no recovery" (line 16284).
  So the FAQ answer below can state this as fact, not a guess.
- One thing the function does *not* do: it doesn't touch anything outside
  the `OWNED_TABLES` list or outside Supabase — e.g. it has no visibility
  into a live Lemon Squeezy subscription. **Open question for the founder:**
  if a user with an active paid subscription deletes their account, does
  anything cancel the Lemon Squeezy subscription, or would they keep being
  billed after their login is gone? I found no code here or in the client
  that calls Lemon Squeezy's API on account deletion. This should be
  verified before soft-launch — it's a billing-dispute risk, not just a UX
  gap.

## 4. Priority gaps for a solo founder about to have real users

1. **No contextual help at the point of failure.** The support entry points
   (Chat/Email) only live in Settings. A user who hits a sync error, a
   failed CSV import, or an AI advisor error has no visible "something
   wrong?" link in that moment. Lowest-effort fix: add a small "Contact
   support" affordance to error toasts/notify() calls, or at minimum to any
   full-screen error state.
2. **Unverified whether Crisp is actually staffed.** The widget is wired to
   a real website ID, but nothing in the code confirms a human is behind it.
   If it's not actively monitored, it's worse than no chat button — a user
   opens a chat window and gets silence. Verify this before launch, or
   consider removing the Crisp entry point until it's staffed and route
   everything to the monitored inbox instead.
3. **Account deletion vs. active subscription is unclear.** As above —
   confirm whether deleting the account also cancels/refunds an active
   Lemon Squeezy subscription, or document that users must cancel billing
   separately first. This is the single highest-risk unknown found in this
   review — get it answered before real paying users start deleting
   accounts.
4. **Landing-page FAQ is thin (5 Qs) and doesn't cover data deletion,
   export, or "what do I do if something looks wrong."** Early users will
   ask these before they ever open the app. Addressed by the drafted FAQ
   below — recommend adding it to the landing page and/or linking it from
   the in-app Help & Support card.
5. **No visible bug-report path distinct from general support.** Chat/email
   work for both, which is fine at this scale, but there's no lightweight
   "report a bug" affordance (e.g. screenshot + description) that would
   make triage easier as volume grows. Not urgent at soft-launch volume —
   flagging as a next-stage improvement, not a launch blocker.

## 5. Recommended support channel (cheapest realistic option)

**Use the existing setup, don't build anything new:**

- **Primary: `hello@klarmoney.app`**, monitored directly by the founder.
  It's already the fallback in `klOpenSupport()`, already on the landing
  page, and already consistent across both surfaces — zero new
  infrastructure required, just discipline about checking it (e.g. a phone
  notification rule or a daily check-in).
- **Secondary: the existing Crisp widget**, *if and only if* the founder
  confirms the account is live and someone will actually see incoming chats
  (Crisp has a free tier and a mobile app for exactly this). If it can't be
  reliably staffed yet, either mute it (`klOpenSupport()` already falls back
  to email automatically when `CRISP_WEBSITE_ID` is the placeholder — could
  temporarily revert to the placeholder value to force the email-only path)
  or accept slower response times on chat until support volume justifies
  daily monitoring.
- Do not stand up a ticketing system, helpdesk SaaS, or a new contact-form
  backend at this stage — email plus the Crisp widget (once verified staffed)
  covers soft-launch volume for a solo founder.

---

## Draft FAQ (for landing page and/or in-app Help & Support)

*Every answer below is grounded in what the code actually does. Items marked
**[VERIFY]** are open questions for the founder — do not publish those
answers until confirmed.*

**1. Is my financial data safe?**
Your data is encrypted in transit (TLS) and stored with row-level access
security on Supabase infrastructure. Klar is local-first by default — your
data stays on your device unless you turn on cloud sync. We never sell your
data. Third-party processors (Supabase for cloud backup, Groq for the AI
advisor, Lemon Squeezy for payments, Crisp for support chat) only see data
relevant to the feature you're using, and only when you use it.

**2. What's the difference between local and cloud data?**
By default, everything you enter stays only in your browser on this device.
If you turn on cloud sync (Settings), an encrypted backup is also stored on
Supabase so you can access your data from another device. You can turn cloud
sync off at any time and delete just the cloud copy without touching what's
on your device.

**3. How do I delete my data or my account?**
In Settings → Privacy & Data Rights you have four options: export everything
as JSON, edit any record directly, delete only your local on-device data, or
delete your cloud backup. There's also "Delete account permanently," which
removes your cloud data **and** your login itself — this is immediate and
cannot be undone or recovered once confirmed. Your local, on-device data is
not affected by cloud/account deletion.

**4. If I delete my account, does that cancel my subscription too? [VERIFY]**
*(Founder: please confirm before publishing.)* The account-deletion process
removes your Klar login and cloud data, but we could not confirm from the
code whether it also cancels an active Lemon Squeezy subscription. Until
this is confirmed, the safe published answer is: "Please cancel your
subscription via Manage Subscription & Billing (or contact us) before
deleting your account, to make sure billing stops."

**5. How do I cancel my subscription?**
From Settings → Subscription & Billing, tap "Manage Subscription & Billing"
to open your Lemon Squeezy customer portal, where you can cancel or change
plans at any time. You keep access until the end of your current billing
period — no partial refund for the remaining days unless stated otherwise
by Lemon Squeezy's policy. [VERIFY: confirm refund policy if asked.]

**6. Does the AI advisor give financial advice?**
No. Klar's AI advisor (powered by Groq) gives informational summaries and
suggestions based on your data — it is not a regulated financial adviser,
and its responses don't constitute personalised financial advice under FCA
(UK) or FSCA (South Africa) rules. For advice specific to your
circumstances, consult an authorised financial adviser.

**7. Which banks/regions does Klar support?**
UK users can connect 2,000+ banks via Salt Edge open banking (available on
paid plans). South African users currently import transactions manually
(CSV); direct SA bank connections are on the roadmap. Everyone can use
manual entry and CSV import regardless of region.

**8. What's included free vs. paid?**
The free plan covers transaction tracking, CSV import, and spending
breakdowns — no card required. Paid plans (starting at Essential) add net
worth tracking, the AI advisor, savings goals, and unlimited accounts. See
the pricing page for current tiers and prices in your local currency.

**9. Something looks wrong / a number doesn't match — what do I do?**
First, check Settings → Privacy & Data Rights → "Export JSON" to confirm
what data Klar actually has stored. If something still looks off, contact
us — Settings → Help & Support → "Chat with support" or email
hello@klarmoney.app — and include what you were doing when you noticed it.
We usually respond within a few hours.

**10. How do I report a bug?**
Same as above for now: email hello@klarmoney.app with a description of what
happened and, if possible, a screenshot. [Founder note: consider a
dedicated lightweight bug-report flow once volume grows past what email can
triage comfortably.]

**11. Who can see my data — do you sell it?**
No, Klar does not sell your data. Data only goes to the specific processor
tied to a feature you actively use: Supabase (cloud backup, opt-in), Groq
(AI advisor, opt-in), Lemon Squeezy (only when you subscribe), and Crisp
(only when you open a support chat). Full details are listed in Settings →
Privacy & Data Rights → Third-Party Processors.

**12. I'm outside the UK/South Africa — can I still use Klar?**
[VERIFY with founder.] The app has explicit UK/SA region handling (currency,
bank connections, regulator references), but nothing in the reviewed code
appeared to hard-block other regions. Confirm intended scope before
publishing an answer either way — publishing an incorrect "yes" could create
support burden from users in unsupported regions with broken bank-connection
expectations.
