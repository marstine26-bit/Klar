# Klar Accessibility Audit — WCAG 2.1 AA (Code-Based, Static Analysis)

**Scope:** `Klar Rebrand.html` (~17,800 lines), read-only review of CSS custom properties, markup, and JS event bindings.
**Method:** Static code inspection and computed contrast ratios (WCAG relative-luminance formula) — no live browser, no screen reader, no real keyboard walkthrough was performed. Every finding below is **code-inferred**, not user-tested. Treat this as a triage list to verify with real assistive tech (NVDA/VoiceOver + keyboard-only pass) before launch, especially the Critical items.

---

## 1. Color Contrast (SC 1.4.3 / 1.4.11)

Computed against the default dark theme tokens (lines ~43–55): `--bg:#07070A`, `--s0…s4`, `--t1:#F0F0EE`, `--t2:#8A8A98`, `--t3:#6B6B78`, `--t4:#4A4A58`, `--accent:#9B7FD4`.

| Combination | Ratio | AA needs | Result |
|---|---|---|---|
| `--t1` primary text on `--bg`/`--s1` | 17.6:1 / 17.2:1 | 4.5:1 | Pass |
| `--t2` secondary text on `--bg`…`--s3` | 5.4–5.9:1 | 4.5:1 | Pass |
| **`--t3` tertiary text/labels on `--bg`/`--s1`/`--s2`** | **3.7–3.8:1** | 4.5:1 | **Fail** (normal text) — passes only the 3:1 large-text/UI-component threshold |
| **`--t4` on `--bg`** (used for muted/disabled text, e.g. `.t-muted`) | **2.3:1** | 4.5:1 (or 3:1 if large) | **Fail** even against the lower UI-component bar |
| `--accent` (#9B7FD4) as text/link color on `--bg`/`--s1`/`--s2` | 5.9–6.1:1 | 4.5:1 | Pass |
| **White text on solid `--accent` fill** (`.ob-region-btn.active`, `.kl-pm-tog-thumb` context, plan/region pills) | **3.29:1** | 4.5:1 | **Fail** |
| **White text on `.btn-gold` gradient** (`#7B5EA7 → #5B7FD4`) | **5.25:1 → 3.87:1** | 4.5:1 | **Fail at the gradient's blue end** — the same button label crosses from pass to fail depending on where the character sits on the gradient |

**Severity:** Moderate. `--t3` is used extremely widely (field labels, table headers, metadata, sub-labels — e.g. lines 351, 380, 588, 673, 827, 857, 864) at 3.7–3.8:1, just under the 4.5:1 normal-text floor. `--t4` (line 718, `.t-muted`, disabled-looking states) fails badly at 2.3:1 and should not carry any meaningful text. `.btn-gold` and solid-accent-fill buttons are primary CTAs (Save, Sign in, region/plan selection) — white-on-iris failing 4.5:1 is a Moderate-severity finding on high-traffic action buttons, not just decorative chrome.

**Not checked:** the light, "Classic," "Aged Paper," and "Slate" theme variants (lines ~104–174) were not individually recomputed — worth a follow-up pass since some use similarly low-contrast tertiary tokens.

---

## 2. Keyboard Navigation & Focus (SC 2.1.1, 2.4.7)

- **Positive:** Text inputs/selects/textareas have a global focus style (line 964: `border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-d)`). The custom `.kl-select` dropdown trigger has an explicit `:focus-visible` ring (line 976) **and** real keyboard operation: Arrow Up/Down to open and move highlight, Enter/Space to pick, Escape to close, type-ahead by first letter (lines 5629–5648). This is a genuinely accessible custom widget, not just decoration.
- **Positive:** Modal dialogs implement a focus trap (`trapFocus`, line ~14031) and global Escape-to-close handlers (lines 5678, 6724, 6752, 14081).
- **Finding — Moderate:** Only `.btn` has an explicit `:focus-visible` rule (line 941: `outline:2px solid var(--accent)`). Other interactive classes used throughout primary navigation — `.rail-btn` (main hub rail, line 218), `.nav-item` (line 235), `.tb-tab`/`.tb-icon-btn` (toolbar, lines 351/393), `.stbtn`, `.money-tab`, `.d-menu-dots`, `.d-pp` — define `:hover`/`:active` states but **no dedicated focus-visible style**. No global `outline:none` reset was found stripping the browser default ring, so these likely still show the UA default outline — but several of these sit on dark, low-contrast surfaces (`--s2`/`--s3`) where a thin default outline may be hard to see. Recommend explicit, high-contrast focus rings on all of these to remove ambiguity.
- **Positive spot-check:** custom clickable `<div>`-as-button patterns were found with keyboard equivalents added (line 6686 `role="button" tabindex="0"` plus Enter/Space handling at 14051 and 17474), showing the pattern is known and applied in places — but it is not universal (see §3).

---

## 3. Semantic / ARIA Usage (SC 4.1.2, 2.5.3)

- **Modals:** Good — every modal sampled (`m-split-bill`, `kl-plan-gate`, `kl-auth-gate`, `kl-region-gate`, `m-add-trip`, `m-add-account`, etc., ~20+ instances) carries `role="dialog" aria-modal="true"` plus either `aria-label` or `aria-labelledby`.
- **Custom dropdown (`.kl-select`):** Partial. The list container has `role="listbox"` (line 5610) and the trigger has `aria-haspopup="listbox"`, but individual options are rendered as plain `<button class="kl-select-opt">` **without `role="option"`** (line 5583), and the trigger never sets `aria-expanded` (unlike the `.tb-more`/`.rail-more` menus at lines 6714/6742, which do toggle `aria-expanded`). A screen reader user will hear "listbox" but not get correct option semantics or open/closed state on the trigger itself. **Severity: Moderate.**
- **Icon-only buttons spot-check (10 instances):**
  - Good — most icon buttons pair an icon with visible text (e.g. "Delete Selected" line 2207, "Copy for WhatsApp" line 2664, "Export transactions (CSV)" line 3551) so the accessible name comes from the text node regardless of the icon.
  - Good — the three-dot "more" buttons (`.d-menu-dots`, lines 2029/2081/2089) correctly pair `title` **and** `aria-label`.
  - Good — primary rail nav icons carry `aria-label` (e.g. line 1757 `aria-label="Home"`).
  - **Fail — Minor:** the receipt-photo "remove" button (line 5071) is icon-only with a literal `×` glyph as its only content and no `aria-label`/`aria-hidden`+label pattern; a screen reader will announce the raw character ("multiplication sign" / "times") rather than "Remove receipt."
  - Toolbar icon buttons (`.tb-icon-btn`, e.g. lines 1938/1941) rely on `title` alone for their accessible name — `title` does map to the accessible name in most browsers/AT combos, but it also produces a mouse-hover tooltip with a delay and is not reliably read by all screen readers/touch AT. Prefer `aria-label` alongside `title` for consistency with the pattern already used at line 2029.
- **Decorative icons not hidden — Moderate:** `aria-hidden="true"` appears **once** in the entire file. The codebase uses hundreds of `<svg><use href="#ki-...">` icons sitting next to their own visible text label (e.g. "Delete Selected", "Snapshot Now", "Analyse my spending"). None of these decorative icons are marked `aria-hidden="true"`. Behavior varies by browser/AT (some ignore untitled `<svg>` by default), so this is not a guaranteed blocker, but it's an easy, high-value fix to make SVG-plus-text buttons consistently silent-on-icon across all assistive tech rather than relying on inconsistent default behavior.

---

## 4. Form Labeling (SC 1.3.1, 3.3.2, 4.1.2)

- **Positive — the core "Add Transaction" modal is done correctly**: every field (`txn-acc`, `txn-ds`, `txn-am` amount, `txn-ca` category, `txn-note`, `txn-tags`, etc., lines 5041–5053) uses `<label for="...">` matched to the input's `id`. This is the highest-stakes form in the app (entering money) and it passes.
- **Finding — Moderate, broad:** Across the rest of the app, `<label>` appears **281 times** but only **13** carry a `for` attribute pointing at a control's `id`. The remaining ~268 (e.g. lines 2419–2530: "Category to adjust", "Amount", "Name", "Day of Month", "Monthly Income Override," compound-interest calculator fields, budget/goal/debt/asset modals, bill fields, etc.) are visually adjacent `<label>` text with **no programmatic `for`/`id` link**. A sighted mouse user sees the association; a screen reader user tabbing into the following `<input>`/`<select>` will not reliably hear the label read out — it depends on layout heuristics some AT applies, not a guaranteed association. This is a widespread, low-effort-to-fix pattern issue (add matching `id`/`for` pairs) rather than one isolated form.
- No instances of placeholder-text-standing-in-for-a-label were found on the core transaction form (placeholders like "0.00", "e.g. Woolworths groceries" are supplementary hints alongside real `<label>`s, which is correct usage) — but this could not be verified for all ~268 unlinked-label fields without a full manual pass.

---

## 5. Images / Icons (SC 1.1.1)

- The one `alt` usage found on an `<img>` (line 5070, receipt photo preview: `alt="Receipt photo"`) is appropriately descriptive for an informative image.
- All other icons in the app are inline `<svg><use>` sprite references, not `<img>` tags, so `alt` doesn't apply directly — accessible-name handling for these falls under §3 above (title/aria-label on the button, or aria-hidden on decorative icons), and that is where the gap is: **decorative icons are essentially never explicitly hidden from AT** (see §3).

---

## Severity Summary

| Severity | Count | Items |
|---|---|---|
| Critical | 0 | No keyboard traps or fully unusable flows found in static review; core transaction-entry form and modal dialogs are correctly built. |
| Moderate | 5 | (1) `--t3`/`--t4` text-contrast failures on widely-used label/metadata text; (2) white-on-accent / `.btn-gold` gradient CTA text failing 4.5:1; (3) no dedicated focus-visible styling on primary nav/toolbar interactive classes; (4) `.kl-select` options missing `role="option"` and trigger missing `aria-expanded`; (5) ~268 of 281 `<label>` elements lack a `for`/`id` association outside the core transaction form. |
| Minor | 2 | Icon-only receipt-remove button (`×`) has no accessible name; decorative SVG icons are not marked `aria-hidden` app-wide (single occurrence in the whole file). |

**Caveat:** This is a static, code-only pass on one representative sample of patterns in a 17,800-line file — it is not exhaustive and was not validated with a real screen reader or keyboard-only user session. Treat it as a prioritized starting list, and follow up with an actual assistive-technology test pass before/shortly after launch.
