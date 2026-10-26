# FFF Skin Tools — Developer Handover

**Site:** https://skins.coinquestgames.com/
**Repo:** `codel4v/FFFSkinToolsWebsite` (GitHub)
**Host:** Vercel, auto-deploys from the repo's default branch
**Current version:** v1.29 (see `CHANGELOG.md` — it is detailed and worth reading)

This document covers how the site is built, how the ad stack works, how to deploy, and
the non-obvious traps that have already cost real debugging time. Read the
**"Traps"** section before changing anything.

---

## 1. The one-minute summary

A static, single-page-per-load catalogue site for Free Fire cosmetic skins, monetised
with Google AdSense. No build step, no framework, no package.json. Three files do
almost everything:

| File | Size | Role |
|---|---|---|
| `index.html` | ~146 KB | All markup, all screens, all page logic, all item data |
| `shared.js` | ~11 KB | Cross-page state, ad helpers, campaign attribution |
| `support.js` | ~63 KB | Third-party runtime that compiles the custom template format |

Plus `assets/` (164 WebP images, ~8.9 MB), `_ds/` (design tokens/CSS) and
`vercel.json` (cache headers).

**You do not edit `support.js`.** It is a vendored runtime from the original
claude.ai/design export. Treat it as a black box, but *do* read section 7 — one of its
behaviours is a live foot-gun.

---

## 2. Architecture

### The template format

`index.html` is not plain HTML. It is wrapped in an `<x-dc>` element and uses a
custom React-flavoured templating syntax that `support.js` compiles **at runtime in
the browser**:

- `<sc-if value="{{ expr }}">…</sc-if>` — conditional block
- `<sc-for list="{{ arr }}" as="item">…</sc-for>` — loop
- `{{ binding }}` — interpolation, including inside attributes and inline styles
- `<helmet>…</helmet>` — contents injected into `<head>` when the runtime boots

There is a React class component near the bottom of `index.html` holding state and a
`renderVals()` method that supplies every binding the markup references.

### Screens

Eleven screens, each an `<sc-if>` block keyed off a boolean (`isWelcome`, `isHome`, …):

```
isSplash → isWelcome → isHome → isCategory → isDetail
           → isFlowTerminal → isFlowVerify → isFlowTier
           → isFlowLevel → isFlowLeague → isFlowDone
```

### Routing — the single most important thing to understand

Routing is **query-string based**, not hash-based and not client-side:

```
index.html?screen=detail&key=vehicles&item=3
```

Built by `routeUrl(route, extra)` in `index.html` (~line 748).

**Every screen change is a genuine full browser page load.** The whole document, all
scripts, and the ad stack reinitialise on every navigation. This was a deliberate
architecture change — hash changes did not trigger the real page loads AdSense needed.

Consequences that bite constantly:

- Nothing in memory survives navigation. All cross-screen state must go through
  `localStorage`/`sessionStorage` via `AppShared`.
- Ads re-request on every screen change.
- Anything read from the URL on landing (campaign params) is **gone** on the next
  navigation unless explicitly persisted.
- Performance work matters more than usual, because every tap pays full page-load cost.

### State — `shared.js`

```js
AppShared.getState()            // { coins, unlocked, uid, region }
AppShared.setState(patch)       // merges + persists, returns new state
```

Persisted to `localStorage` under `fffSkinToolsState`. Defaults:
`{ coins: 0, unlocked: [], uid: '', region: 'India' }`.

Full `AppShared` export surface:

```js
{ getState, setState, fillAds, fillAdsWhenReady, adLog,
  getAttribution, navigateWithInterstitial, goBackWithInterstitial }
```

---

## 3. The ad stack

Publisher ID: **`ca-pub-8356035806330431`**

Four distinct ad products are in play. They fail independently and are debugged
differently — do not assume a problem in one affects the others.

### 3a. Static display slots (Top / Bottom)

- Top slot: `3316443330` — Bottom slot: `7202099488`
- **20 slots total**: one Top + one Bottom on each of the 10 content screens
  (every screen except Splash)
- Responsive: `data-ad-format="auto"`, `data-full-width-responsive="true"`

Markup is deliberately minimal — this matters, see Traps:

```html
<div class="fff-ad" style="width:100%">
  <span style="…">AD</span>
  <ins class="adsbygoogle" style="display:block"
       data-ad-client="ca-pub-8356035806330431"
       data-ad-slot="3316443330"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
</div>
```

Supporting CSS (in the `<style>` block inside `<helmet>`):

```css
ins.adsbygoogle[data-ad-status="unfilled"]{display:none!important}
.fff-ad{min-height:296px}                 /* 280 ad + 16 label — reserves space, prevents CLS */
.fff-ad:has(ins.adsbygoogle[data-ad-status="unfilled"]) span{visibility:hidden}
.google-auto-placed{grid-column:1/-1;max-width:100%}
```

Because the slots live inside runtime-compiled template markup, the stock
`(adsbygoogle = window.adsbygoogle || []).push({})` snippet cannot be inlined next to
each one — the elements do not exist when such a script would run. Instead
`AppShared.fillAdsWhenReady()` is called from `componentDidMount()`, waits for layout
to settle (double `requestAnimationFrame`), then `fillAds()` walks every `ins`, tags
it `data-ad-fill-requested` so it is only filled once, and pushes.

### 3b. H5 Games Ads — rewarded ("Watch ad to earn coins")

Uses the Ad Placement API (`adBreak()` / `adConfig()`), bootstrapped in `<helmet>`.
Flow lives in `index.html` around line 700.

`beforeReward(showAdFn)` calls `showAdFn()` **immediately** rather than showing a
second confirmation — the user already opted in on a button that states the reward.

> **The button copy is load-bearing for policy compliance.** "WATCH AD TO EARN ENTRY
> COINS" plus "Each short ad adds 10 coins" is what makes the opt-in informed. Do not
> reword it to drop the reward amount.

A fallback remains: if `showAdFn()` throws, or no ad takes over the screen within
2.5 s, the old "Ad ready / Watch Now" prompt appears so nobody is stranded on
"Finding an ad". The timer is cleared in `beforeAd`, `adDismissed`, `adViewed` and
`closeAd`.

Coins are granted **only** in `adViewed`. Never move that.

### 3c. H5 Games Ads — non-rewarded interstitial on navigation

`runNavInterstitial()` in `shared.js`. Every navigation goes through
`navigateWithInterstitial()` / `goBackWithInterstitial()`.

Timing model, which took several attempts to get right:

- 1200 ms window to see whether an ad is even coming (`beforeAd` fires)
- if `beforeAd` fires, that window is cancelled and a 30 s safety net replaces it so
  the ad can play out
- navigation can never block indefinitely

An earlier version used a blind `setTimeout(go, 2500)` that navigated away *mid-ad*,
destroying ads that had successfully served. If you touch this, keep the
`beforeAd`-aware two-stage model.

Expect `breakStatus === 'frequencyCapped'` on most navigations. **That is correct
behaviour, not a bug** — Google rate-limits interstitials. Roughly 50 % fire rate is
healthy.

### 3d. Auto ads + vignettes (dashboard-controlled, no code)

Ad ops enabled vignettes and Auto ads directly in the AdSense dashboard. The
"Discover more" panels that appear mid-content are **Related search for Auto ads** —
Google chooses those insertion points and **you cannot position them from code**.

If they land badly, the fix is in the AdSense UI: the *Related search* toggle,
*Excluded areas*, *Fine-tune your ads (beta)*, or the *Ad load* slider.

The only code-side mitigation is the `.google-auto-placed{grid-column:1/-1}` rule,
which stops an injected unit from eating a cell and distorting the Top Features grid.

---

## 4. Campaign attribution & analytics

### URL format (one URL drives everything)

```
?utm_source=facebook&utm_medium=cpc&utm_campaign=spring_ff&utm_content=adset_a12&channel=1234567890
```

| Param | Consumed by | Notes |
|---|---|---|
| `utm_*` | GA4, natively | No manual parsing needed |
| `utm_campaign` / `utm_content` | also our attribution | Map to campaign / adset |
| `campaign` / `adset` | our attribution | Legacy names, take precedence if both present |
| `channel` | AdSense custom channel | **Not** a UTM — AdSense cannot read `utm_*` |

`channel` is validated to digits-and-`+` only and dropped otherwise — it comes
straight off the URL and is attacker-controllable. A `+` in a query string decodes to
a space, so runs of spaces/plusses are normalised back to `+`.

Stored in **`sessionStorage`** under `fff_attr` — deliberately not `localStorage`, so
a campaign cannot be credited for an unrelated organic visit days later. A fresh
campaign link re-attributes the session.

### Where the AdSense channel is applied

Two different places, because the two ad products need it differently:

1. **Display slots** — `data-ad-channel` set on each `ins` in `fillAds()`, **before**
   `push()`. Set it afterwards and it has no effect.
2. **H5 (rewarded + interstitial)** — there is no `ins` element, so the channel must
   be an attribute on the **AdSense script tag**. That is why the AdSense loader is
   *injected by an inline script* rather than hardcoded.

### GA4

- Measurement ID **`G-4V0M8SC886`** (Stream ID `16060297142` — recorded in a comment,
  not used by `gtag.js`)
- Lives in the **real `<head>`**, not `<helmet>` — helmet is injected late, too late to
  reliably record a page view before a bounce
- GA4 attribution is session-scoped and its cookie sits on the registrable domain, so
  the full-page-load navigation does **not** flip traffic to `(direct)` after the
  first screen
- Internal links deliberately do **not** carry `utm_*`; re-sending them mid-visit
  would restart attribution

**Not built yet:** custom events (Get Started taps, category opens, rewarded ad views,
account linking). GA currently shows traffic and page views but nothing about what
users actually do per source.

---

## 5. Performance setup

Everything here was measured, not guessed. Please do not undo it casually.

- **Images:** all 164 are WebP, resized to their real on-screen size. The folder went
  from 89.7 MB to 8.5 MB (90.5 % reduction). The frame is 480 px wide, so full-bleed
  targets are 960 px (2× retina); item renders are 768 px; blurred backgrounds are
  720 px at low quality because the detail is invisible anyway.
- **Scripts:** `shared.js` and `support.js` are `defer`red. Safe because `support.js`
  gates its own boot on `readyState`/`DOMContentLoaded`.
- **CSS:** the 9 original stylesheets are concatenated into `_ds/…/bundle.css`.
  Google Fonts was hoisted out of an `@import` (which serialised the request) into a
  real `<link>` with preconnects.
- **`_ds_bundle.js` (76 KB) was removed from the page** — it was render-blocking and
  entirely unused. The file still exists in the repo but nothing references it.
  Likewise the individual `tokens/*.css` and `styles.css` remain as unreferenced
  source. Safe to delete; safe to leave.
- Lazy loading on below-fold images, `fetchpriority="low"` on decorative backgrounds,
  `fetchpriority="high"` on LCP images, preconnects to the ad domains.

### Caching — `vercel.json`

| Path | Cache-Control |
|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` |
| `/Favicon.png` | `public, max-age=604800` |
| `*.js`, `*.css`, `*.html` | `public, max-age=0, must-revalidate` |

> ⚠️ **`assets/` is immutable for a year.** If you change an image, **change its
> filename**, or returning visitors will never see the new version and cannot refresh
> out of it. Adding *new* files is unaffected.

---

## 6. Deployment

There is **no build step and no local git workflow**. Deployment is manual file upload
through the GitHub web UI; Vercel then auto-deploys.

1. Edit files locally.
2. Upload the changed files via GitHub's web interface (drag-drop / "Upload files").
3. Vercel picks up the commit and deploys automatically.
4. Verify against the live site, not against your local copy.

Update `CHANGELOG.md` with every release. It is genuinely the project's memory — it
records why decisions were made and which theories turned out to be wrong.

---

## 7. Traps — read this before editing

These are all real incidents, not hypotheticals.

### 7a. 🔴 Never put `<x-dc`, `</x-dc>`, `<helmet` or `</helmet` inside a comment

`support.js` locates the template with a **regex over the raw HTML source**, not the
DOM:

```js
const openMatch = /<x-dc(?:\s[^>]*)?>/.exec(src);
html = html.replace(/<helmet(\s|>)/gi, "<sc-helmet$1");
```

HTML comments are inert to a browser but **not** to a string matcher. An explanatory
comment in `<head>` containing the literal text `<x-dc>` once took the entire site
down — the regex matched inside the comment and everything after it was treated as
template body.

This applies to HTML comments, CSS comments and JS comments alike. Put explanations in
`CHANGELOG.md` instead. To verify after any edit, each of those four markers must
appear **exactly once** in `index.html`.

### 7b. 🔴 Do not size the `<ins>` element

Roughly five releases (v1.12–v1.16) were burned "fixing" a banner collapse by putting
`min-height` on the `ins`, removing it on fill, adding `overflow:hidden` to wrappers,
and so on. Every attempt failed or made it worse.

The actual cause, found only once a `MutationObserver` was attached: the ads were
`data-ad-status="unfilled"`. Google simply had no ad. Nothing was collapsing — it had
never filled. The "grey line" was our own bordered wrapper with the `ins` hidden.

Rules that came out of it:

- Height reservation goes on the **wrapper** (`.fff-ad`), never the `ins`. The `ins`
  is what Google measures when choosing a creative.
- **Never** `overflow:hidden` on an ad wrapper — it clips ads mid-resize.
- Use `min-height`, not `height`, so a taller creative can still grow.
- Google sets its own inline height on the `ins`; do not fight it.

### 7c. 🔴 Verify against the deployed file before diagnosing

More than once a "fix" recorded in the changelog had never actually made it into the
committed file. Always `git clone` and inspect what is really live before theorising
about behaviour.

### 7d. 🔴 Evidence beats theory for anything ad-related

Google's ad scripts are not observable from our code. Several confident, plausible
diagnoses were simply wrong. The debugging snippet that finally cracked the banner
saga:

```js
document.querySelectorAll('ins.adsbygoogle').forEach((el, i) => {
  const p = el.parentElement, f = el.querySelector('iframe');
  const log = t => console.log(`[${i}] ${t}`,
    'slot', el.getAttribute('data-ad-slot'),
    '| status', el.getAttribute('data-ad-status'),
    '| ins', el.offsetWidth + 'x' + el.offsetHeight,
    '| parent', p.offsetWidth + 'x' + p.offsetHeight,
    '| iframes', el.querySelectorAll('iframe').length,
    '| style', el.getAttribute('style'));
  log('t0');
  new MutationObserver(m => log('MUT(' + [...new Set(m.map(x => x.attributeName))].join(',') + ')'))
    .observe(el, { attributes: true, attributeFilter: ['style', 'data-ad-status'] });
  [500, 1500, 3000, 6000, 10000].forEach(ms => setTimeout(() => log('t+' + ms), ms));
});
```

`data-ad-status` values: absent = still deciding, `filled` = ad served,
`unfilled` = Google had nothing. If it reads `unfilled`, it is a **fill-rate or policy
matter, not a CSS bug** — stop editing CSS.

Also: `?addebug=1` on any URL enables `[ads]` console logging for the interstitial and
rewarded flows (off by default).

### 7e. 🟠 Test JS logic in Node before shipping

Mock `location`, `adBreak`, `sessionStorage` and so on. This caught real bugs before
deploy, including: a `+` in a query string decoding to a space and breaking channel
parsing; `gtag` being called via implicit global binding; and a GA placeholder ID that
*passed* its own format check (`X` is within `A-Z`) and would have fired requests at a
nonexistent property.

### 7f. 🟠 Editing `CHANGELOG.md` programmatically

Insert by explicit line index. Python's `str.replace()` replaces **every** occurrence
by default and produced duplicate entries more than once. The version history also had
to be repaired once — numbers are now unique, with earlier re-attempts carrying a dot
(`v1.1.4`, `v1.1.4b`, `v1.2.3` …).

---

## 8. Open items / known gaps

| Item | Notes |
|---|---|
| **No `ads.txt`** | Not in the repo at all. Matters more if the mirror domains launch. Confirm whether the root domain file covers subdomains. |
| **No GA custom events** | Traffic and page views only; nothing on user actions per source. |
| **Bottom slot fill rate** | `7202099488` fills far less reliably than Top, on all platforms. Long-standing. |
| **Mostly 1:1 creatives** | Observed on mobile; never fully explained. |
| **Unused ad space** | ~70 px of empty space inside Google's own `ins` on some mobile renders. Only ~10 px is our layout. Deliberately left alone. |
| **SEO basics missing** | No `lang` attribute, meta description, canonical, Open Graph, `robots.txt` or `sitemap.xml`. Duplicate viewport meta tag. |
| **`.git` is ~96 MB** | Working tree is ~9 MB; the old PNG history is still in there. |
| **`{{ d }}` SVG console error** | Cosmetic. The templating engine's placeholder pass writes a raw binding into an SVG `path` before it resolves. |
| **Planned mirror domains** | `skins1`–`skins10.coinquestgames.com` discussed. Needs DNS records from the domain owner (CNAMEs or a wildcard) — not self-serviceable from Vercel alone. |

### ⚠️ One judgement call worth raising early

The flow screens use language that presents the site as delivering real in-game items:
"Add to Game for Free", "Initialize Injection Protocol", "Security Bypass",
"Payload Staged", "Cleared for Injection", "queued for delivery to UID".

AdSense's misrepresentative-content and hacking/cracking policies both cover content
presented as granting paid game items for free, and enforcement is often **page-level**.
Notably, those same flow screens have historically had the worst ad fill on the site.
That correlation was never proven — but it was never ruled out either, and the check is
cheap: **AdSense → Policy centre, filtered by page URL.**

The relevant stakes: AdSense permits one account per publisher, and a termination would
affect all monetisation, not just these pages. The same framing was previously flagged
as a risk for the Play Store listing. Worth a conversation with ad ops before scaling
traffic or launching mirror domains.

---

## 9. Quick reference

```
Live site      https://skins.coinquestgames.com/
Repo           codel4v/FFFSkinToolsWebsite
Host           Vercel (auto-deploy from default branch)
AdSense pub    ca-pub-8356035806330431
Top slot       3316443330
Bottom slot    7202099488
GA4            G-4V0M8SC886  (Stream ID 16060297142)
localStorage   fffSkinToolsState
sessionStorage fff_attr
Ad debug       append ?addebug=1 to any URL
```

**First things to do:** read `CHANGELOG.md` from the top (it explains the *why*), then
`shared.js` in full (it is short), then the `<helmet>` block and `componentDidMount()`
in `index.html`.
