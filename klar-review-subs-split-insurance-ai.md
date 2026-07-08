# Klar Code Review — rSubs / Split Bills / rInsurance / AI Advisor

**Reviewed:** 2026-06-18
**Scope:** rSubs (line 8130), saveSub (8207), delSub (8208), confirmDetectedSub (8179), dismissDetectedSub (8192), Split Bills modal helpers (openSplitBills 9666 – sbCopySettlement 9844), saveInsurance (10165), rInsurance (10181), delInsurance (10213), sendChat (11918), autoMoSummary (6056), generateMonthChecklist (11905), explainTxn (11894), klClearChatHistory (11956).

---

## rSubs (line 8130) — mostly clean

- [MINOR] **line 8207 — `saveSub` pushes to `S.subscriptions` without a null guard.** `confirmDetectedSub` (line 8184) correctly guards with `if(!S.subscriptions) S.subscriptions=[]`, but `saveSub` skips the guard and calls `S.subscriptions.push(...)` directly. The default data shape initialises this to `[]`, so it will not crash on fresh data, but legacy/corrupted state without the field would throw `TypeError: Cannot read properties of undefined`. Low probability, but inconsistent with surrounding code.

- [MINOR] **line 8207 — `saveSub` appends the *user-typed name* (not a transaction key) to `S._dismissedSubs`.** The intent is to auto-suppress a detected subscription after the user manually adds it. However, `_dismissedSubs` is compared against `detectSubscriptions()` keys (normalised transaction descriptions), not user-chosen display names. The name the user typed may not match any detection key, so the suppression silently fails and the same merchant may still appear in auto-detected suggestions.

---

## Split Bills modal helpers (openSplitBills, sbSave, sbCopySettlement — lines 9666–9844) — one WARNING, one MINOR

- [WARNING] **lines 9838–9840 — `sbCopySettlement` hardcodes `R` as currency symbol** in the clipboard text it builds for WhatsApp sharing.

  ```js
  txns.forEach(t => lines.push(`${t.from} pays ${t.to}: R${t.amount.toFixed(2)}`));
  lines.push('', `_Total spent: R${total.toFixed(2)} · via Klar_`);
  ```

  UK users see `R` in the pasted WhatsApp message instead of `£` (or whatever `S.prefs.cur` is set to). Should be `${S.prefs.cur}${t.amount.toFixed(2)}`.

- [MINOR] **line 9691 — `sp.people` joined with `, ` in the group list row without `esc()`.**

  ```js
  <div ...>${(sp.people||[]).join(', ')} · ...
  ```

  Person names are user-supplied strings inserted into `innerHTML` without `esc()`. A name containing `<`, `>`, or `"` would break the rendered HTML. The inline `_sbRenderPeople` correctly wraps names in `esc()`, but the list-view row does not.

---

## rInsurance / saveInsurance (lines 10158–10213) — two WARNINGs

- [WARNING] **line 10211 — "Upcoming renewals" filter includes already-expired policies.**

  ```js
  const due = policies.filter(p => p.renewal && _daysUntil(p.renewal) <= 90)
  ```

  `_daysUntil` returns negative values for past dates. The filter `<=90` therefore passes expired renewals (e.g., `-120`), which then show in the "due in the next 90 days" section with confusing negative day counts like `-120d`. The filter should be `_daysUntil(p.renewal) >= 0 && _daysUntil(p.renewal) <= 90`.

- [WARNING] **line 10174–10178 — renewal date is re-read from the DOM *after* `closeModal()` is called.**

  ```js
  save(); closeModal('m-add-insurance'); rInsurance(); notify('Policy saved','ok');
  const renewal = document.getElementById('ins-renewal').value; // ← after close
  ```

  `closeModal` only removes the `.open` CSS class — the DOM element is not destroyed — so the value is still readable in current implementation. However, the read happens after `rInsurance()` runs, which does not touch this input, so it is safe today. This is fragile: if `closeModal` is ever changed to detach or reset the modal content, the renewal-reminder logic would silently stop creating reminders. The `renewal` variable should be captured before `closeModal` is called, alongside the other fields at the top of the function.

- [MINOR] **line 10177 — `S.reminders` accessed via `(S.reminders).some(...)` immediately after the `if(!S.reminders)` guard.**

  ```js
  if(!S.reminders) S.reminders = [];
  const already = (S.reminders).some(r => r.desc.includes(insurer) && r.date === renewal);
  ```

  This is functionally correct. However `r.desc.includes(insurer)` is a substring match: if the insurer name is something short like "Old" it would match any reminder whose description contains the word "Old". A more reliable guard would be an exact prefix match, e.g. `r.desc === \`${insurer} policy renewal\``.

---

## AI Advisor — sendChat / autoMoSummary / generateMonthChecklist (lines 6056, 11905, 11918)

- [WARNING] **line 6080 — `autoMoSummary` system prompt is hardcoded to "South African" regardless of region.**

  ```js
  { role: 'system', content: 'You are a concise South African personal finance advisor.' }
  ```

  UK users receive SA-specific advice (TFSA, SARS, rands) even when `S.prefs.region === 'uk'`. `sendChat` (line 11934) correctly injects `region` into its context string; `autoMoSummary` does not. Should use the same region-conditional the main chat does.

- [WARNING] **line 11911 — `generateMonthChecklist` hardcodes `R${b.amount}` and hardcodes "South African user" in the prompt.**

  ```js
  const bills = (S.calBills||[]).filter(b=>b.day).map(b=>`${b.name} R${b.amount} day ${b.day}`).join(', ');
  const prompt = `Generate a concise 5-item month-end financial checklist for a South African user with: ...`;
  ```

  Two issues: (1) the bills string uses a bare `R` instead of `S.prefs.cur`; (2) the prompt instructs the model to generate SA-specific advice for all users. UK users get a prompt that misrepresents their currency and region. Fix: use `S.prefs.cur` in the bills string, and replace "South African user" with `Region: ${S.prefs.region==='uk'?'UK':'SA'}`.

- [WARNING] **line 11940 — `sendChat` does not check `res.ok` before calling `res.json()`.**

  ```js
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { ... });
  const data = await res.json();
  ```

  If Groq returns a non-JSON error body (e.g., a 502/504 HTML page), `res.json()` throws and the `catch` block at 11949 displays "Connection error". This is technically handled, but the loading spinner `div` at `loadingId` is correctly removed in the `catch`, and `btn.disabled=false` runs at 11953 (outside try/catch), so the button re-enables correctly. The failure mode is acceptable but a `if(!res.ok) throw new Error(...)` check before `res.json()` would give a clearer error message than a JSON parse error.

- [MINOR] **line 11910 — `generateMonthChecklist` calls `S.debts.reduce(...)` without `||[]` guard.**

  ```js
  const debts = S.debts.reduce((s,d) => s+d.minPmt, 0);
  ```

  `S.debts` is `[]` in the default data shape (line 4818), so this is safe on fresh data. Old localStorage data predating the `debts` field introduction would throw `TypeError: Cannot read properties of undefined`. Low probability, but `(S.debts||[]).reduce(...)` is the safer pattern consistent with the rest of the codebase.

- [MINOR] **line 11868 — Chat history is restored to the UI using `esc()` on AI reply content, then `.replace(/\n/g,'<br>')` on the *already-escaped* string — but only when first rendering from `S.chatHistory` in `updSnap`.**

  ```js
  msgs.innerHTML = (S.chatHistory||[]).map(h =>
    h.role === 'user'
      ? `<div class="chat-user">${esc(h.content)}</div>`
      : `<div class="chat-ai">${esc(h.content).replace(/\n/g,'<br>')}</div>`
  ).join('');
  ```

  This is safe (user content is escaped, AI content is escaped). However, the *live* display path in `sendChat` (line 11944) uses the same pattern. Consistent and not a bug — noting for completeness.

- [MINOR] **line 14215 — Push notification for subscription renewal hardcodes `R` as currency symbol.**

  ```js
  klNotify(`🔁 ${sub.name} ${when}`, `R${sub.amount || ''} ${sub.cycle || 'monthly'} renewal`, {tag});
  ```

  UK users see `R` in their notification body. Should be `${S.prefs.cur || 'R'}${sub.amount || ''}`.

- [MINOR] **line 14202 — Push notification for bill reminders hardcodes `R` as currency symbol.**

  ```js
  klNotify(`📅 ${b.name} ${when}`, b.amount ? `R${b.amount} scheduled on day ${b.day}` : ..., {tag});
  ```

  Same issue as above — not currency-aware. (These are in the service-worker/notification scheduling section, not a named render function, but referenced here as they surface through the subscriptions and bills subsystems.)

---

## Summary table

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | WARNING | sbCopySettlement (9838–9840) | Hardcoded `R` in WhatsApp settlement text |
| 2 | WARNING | rInsurance (10211) | Past-renewal policies shown in "next 90 days" section |
| 3 | WARNING | saveInsurance (10174) | Renewal date re-read from DOM after closeModal (fragile ordering) |
| 4 | WARNING | autoMoSummary (6080) | System prompt hardcoded to "South African" for all regions |
| 5 | WARNING | generateMonthChecklist (11911) | Hardcoded `R` in bills string and "South African user" in prompt |
| 6 | WARNING | sendChat (11940) | `res.ok` not checked before `res.json()` |
| 7 | MINOR | sbRenderList (9691) | Person names not `esc()`'d in group list row |
| 8 | MINOR | saveInsurance (10177) | Reminder duplicate-check uses substring match on insurer name |
| 9 | MINOR | saveSub (8207) | Missing `||[]` guard on `S.subscriptions` before `.push()` |
| 10 | MINOR | saveSub (8207) | Dismissal key is user-typed name, not normalised detection key — suppression may silently fail |
| 11 | MINOR | generateMonthChecklist (11910) | `S.debts.reduce(...)` missing `||[]` guard |
| 12 | MINOR | Push notifications (14202, 14215) | Hardcoded `R` in bill and subscription notification bodies |
