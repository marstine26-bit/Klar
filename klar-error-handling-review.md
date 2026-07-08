# Klar Error Handling Review
Generated: 2026-06-18

---

## 1. Groq AI API Failures

**Functions reviewed:** `sendChat` (~line 11932), `aiMoSummary` (~line 6079)

### `sendChat`
- Network errors (fetch throws): **caught** — displays a red inline message in the chat panel: `"Connection error: <message>"`. User sees it clearly.
- Non-2xx HTTP errors (e.g. 429 rate limit, 5xx): **previously not caught** — `res.json()` would be called on the error body, either silently producing a garbled reply or throwing a JSON parse error that surfaces as a generic "Connection error". **Fix D (applied this session) adds `if(!res.ok) throw new Error('AI service error '+res.status)` before `res.json()`**, making this path produce a clean user-visible message.
- No retry logic exists. Acceptable for a chat interface — retrying automatically on 429/5xx could cause double-sends.
- No fallback (e.g. cached or static response). Acceptable given this is a live AI feature.

**[WARNING] `sendChat` — 5xx / 429 responses previously caused a silent JSON parse failure or a confusing "No response" message. Fix D resolves this.**

### `aiMoSummary` (monthly overview AI summary, ~line 6079)
- Network errors: **caught** — the placeholder element is quietly removed. No error is shown to the user; the panel just disappears. This is a soft non-critical feature (ambient AI summary), so silent removal is acceptable, but a brief notification would be more informative.
- Non-2xx HTTP errors: **not caught** — `res.json()` is called unconditionally. If Groq returns 429 or 5xx, `data.choices` will be undefined, `summary` will be empty string, and the placeholder is silently removed. User sees nothing; no error is logged in the UI.
- No `res.ok` check analogous to Fix D.

**[WARNING] `aiMoSummary` — non-2xx Groq responses silently remove the summary with no user feedback and no console warning. Should add `if(!res.ok) throw new Error(...)` before `res.json()` and show a subtle notify.**

---

## 2. Supabase Sync Failures

**Functions reviewed:** `sbPushSync` (~line 13153), `sbPullAndMerge` (~line 13176), `_patchSave` (~line 13227)

### `sbPushSync`
- Network / Supabase error: **caught** — sets the sync dot to error state, calls `console.warn`, and shows `notify('Cloud sync failed — data saved locally only','err')`. User is clearly informed. Local data is unaffected.
- `_sbSyncing` guard prevents concurrent pushes.

**[MINOR] `sbPushSync` — good handling. The `finally` block always resets `_sbSyncing`, so a stuck-syncing state cannot occur.**

### `sbPullAndMerge`
- Network / Supabase error: **caught** — sets dot to error, `console.warn`, shows `notify('Could not load cloud data — working offline','err')`. Clean.
- `PGRST116` (no row found) is explicitly allowed through — correct behaviour for first-time users.
- If `localStorage.setItem` fails during a cloud merge (~line 13192): **silently swallowed** in a bare `try{}catch(e){}`. This is the only place in the sync path where a storage failure is not surfaced to the user.

**[MINOR] `sbPullAndMerge` — cloud-to-local write failure (line ~13192) is silently swallowed. Should at minimum call `notify('Could not write synced data to local storage','err')` in the catch.**

### `_patchSave` (debounced push on every `save()`)
- If `sbPushSync` fails, it self-handles as above. No additional wrapper needed.
- If `_sbUser` is null, the push is skipped — correct, no error emitted.

**No issues.**

---

## 3. Paddle Checkout Failures

**Functions reviewed:** `klUpgrade` (~line 14700), `klSubscribe` (~line 14814), `Paddle.Initialize` eventCallback (~line 14835)

### Pre-flight guards
- `!window.Paddle`: **handled** — `notify('Paddle is loading, please try again','err')` in both `klUpgrade` and `klSubscribe`. UI is not broken.
- Missing `priceId`: **handled** — `notify('Price not found…','err')` and early return.
- Unconfigured `PADDLE_TOKEN`: **handled** — returns early before `Paddle.Checkout.open` is called.

### During checkout
- `checkout.completed`: tier is applied to `S.prefs`, `save()` called, UI updated. Good.
- `checkout.error`: **handled** — `eventCallback` maps known error codes (`paddle_js_not_allowed_origin`, `not_found`) to human-readable `notify('…','err')` messages. Unknown codes fall back to a generic message with the raw code.
- `checkout.closed` / `checkout.warning` events: **not handled** — if the user abandons the overlay (closes without completing), no event handler fires and the UI is left in its pre-checkout state (pricing overlay still visible or closed). This is acceptable — there is no loading spinner or disabled button that could get stuck.

**[MINOR] No `checkout.closed` handler — if the Paddle overlay is dismissed by the user, the pricing modal may remain open behind it depending on call site. Not a data-loss risk, cosmetic only.**

---

## 4. localStorage Quota Exceeded

**Function reviewed:** `save` (~line 4906)

- The entire `save()` body is wrapped in a `try/catch`.
- The inner `localStorage.setItem(BIZ_KEY, …)` for business data (~line 4912) has its own `try{}catch(e){}` — **silently swallowed**. If biz data fails to write, the function continues and the personal key write is attempted. No notification is shown for the biz key failure specifically.
- The outer `localStorage.setItem('cl_v55', data)` (~line 4918) is inside the outer try. If it throws `QuotaExceededError`, the outer `catch` fires: `notify('Save failed — storage full. Export a backup and clear old data.','err')`. **This is correct and user-visible.**
- Proactive warnings are also in place: >4000 KB triggers an `'err'` notify; >3000 KB triggers a one-time `'ok'` notify.

**[MINOR] `save()` inner BIZ_KEY write failure (~line 4912) is silently swallowed — if business data fails to persist due to quota, no notification is shown and the user may not realise biz transactions were lost.**

**[MINOR] `deactivateBizData` (~line 4928) also writes to `BIZ_KEY` inside a bare `try{}catch(e){}` with no user notification on failure.**

---

## 5. Salt Edge / Bank Feed Failures

**Functions reviewed:** `klBankConnect` (~line 10761), `klBankSync` (~line 10781)

### `klBankConnect`
- Network error (fetch throws): **caught** — `notify('Connection error: '+e.message,'err')`. User sees it.
- Non-2xx or missing `connect_url` in response: **handled** — `if(!data.connect_url){ notify(data.error||'Could not start connection','err'); return; }`. Good.
- Button state always restored in `finally`. No stuck UI.

**No issues.**

### `klBankSync`
- Network error: **caught** — `notify('Sync error: '+e.message,'err')`. User sees it.
- Non-2xx HTTP: **handled** — `if(!res.ok){ notify(data.error||'Sync failed','err'); return; }`. This correctly checks `res.ok` before trusting the body. Good pattern (notably better than the AI path).
- `_bfSyncing` guard and `finally` block reset button state reliably.
- If `res.json()` itself throws (malformed JSON from Edge Function): **not explicitly caught**, but falls through to the outer `catch(e)` which calls `notify('Sync error: '+e.message,'err')`. Covered.

**No critical issues. The `res.ok` check here is the correct pattern that should be applied to `aiMoSummary` as well.**

---

## Summary Table

| Severity | Location | Issue |
|----------|----------|-------|
| WARNING | `aiMoSummary` (~line 6079) | No `res.ok` check — non-2xx Groq responses silently remove the summary with no user feedback |
| WARNING | `sendChat` (~line 11954) | **Fixed this session (Fix D)** — 5xx/429 now throws a clean error instead of attempting `res.json()` |
| MINOR | `sbPullAndMerge` (~line 13192) | Cloud-to-local `localStorage.setItem` failure is silently swallowed |
| MINOR | `save()` BIZ_KEY write (~line 4912) | Business data quota failure silently swallowed |
| MINOR | `deactivateBizData` (~line 4928) | BIZ_KEY write on mode-switch silently swallowed |
| MINOR | Paddle `checkout.closed` | No handler — pricing modal may remain open after abandonment (cosmetic only) |
