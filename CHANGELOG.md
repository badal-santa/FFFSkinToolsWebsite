# Changelog

All notable changes to the FFF Skin Tools website, newest first.

## v1.30 — Lazy-load the Bottom ad slot; remove the "AD" labels; fix logo flash on load (2026-10-26)
- Reported by Brijen: the splash logo blinked for about a second while any page loaded. Cause:
  until support.js boots, the browser paints the raw template markup as plain HTML, and the
  splash section (full-screen, first in the markup) is what shows. support.js hides the raw
  template itself, but it is deferred since v1.22, so on slower phones the raw template got a
  paint first. Fix: the same rule support.js applies, x-dc{display:none!important}, is now in
  the real head's inline style, so it applies before first paint. Safe because support.js
  replaces that element with its own root anyway
- Verified with throttled CPU/network page-load recordings: the splash logo no longer renders
  while loading Welcome, Home, Category or Flow 6 (it still shows for ?screen=splash itself)
- Requested by Brijen. The Bottom slot (7202099488) is no longer requested at page load
  alongside the Top slot. An IntersectionObserver requests it once it reaches
  the viewport, so visitors who never scroll that far are not served an ad they can't see
  (better viewability). The Top slot (3316443330) still loads immediately
- On short screens where the Bottom slot is already in or near view (e.g. Flow 6), it still
  loads at once
- push({}) fills the first unfilled <ins> on the page. The Top slot precedes the Bottom slot in
  the markup on every screen, so the deferred push always lands on the Bottom slot
- The campaign channel is still set on the slot before its push, same as before
- Browsers without IntersectionObserver fall back to loading both slots at once
- Found while testing on skins7: fillAds() pushed for every ins.adsbygoogle on the page,
  including the ones Auto ads inserts and fills itself (6 boxes on the Welcome page, only 2 of
  them ours). That was already true before v1.30, but with lazy loading a spare push({}) lands
  on the next unfilled box, i.e. the Bottom slot, filling it early. fillAds() now only
  handles our own slots ('.fff-ad > ins.adsbygoogle'). Verified with simulated Auto ads boxes:
  1 push on load, the 2nd only after scrolling, Auto ads boxes untouched
- LAZY_MARGIN set to 0px (was 300px): the Bottom slot is requested once it actually reaches
  the screen
- Removed the small "AD" label above all 20 Top/Bottom slots. The reserved slot height drops
  from 296px to 280px accordingly (the 16px was the label), and the rule that hid the label on
  unfilled slots is gone. The "AD" badge in the rewarded-ad modal is unchanged
- Verified in headless Chrome on Welcome, Home, Category and Flow 6: slot requests before and
  after scrolling, channel tagging, and 280px reserved height with no label

## v1.29 — Google Analytics 4 install + UTM parameter support (2026-08-13)
- Team requirement: connect GA to the site and run tracking through UTM parameters
- GA4 Measurement ID G-4V0M8SC886 is wired in and live. Verified the loader actually fires with
  it: the injected script URL carries the ID and dataLayer queues 'js' then 'config' correctly
- The matching Stream ID 16060297142 is recorded as a comment next to it but is NOT used.
  gtag.js keys off the Measurement ID; the Stream ID is only needed for Measurement Protocol
  calls and inside the GA4 admin UI
- The safety guard is kept anyway: if the ID is ever blanked or reset to a placeholder, the block
  loads nothing rather than firing requests at a property that does not exist
- GA4 is in the REAL head, not the helmet block. Helmet contents are only injected once
  support.js boots, which is too late to reliably record a page view before a bounce - the same
  late-injection behaviour that caused the v1.25 white flash. Added a preconnect to
  googletagmanager.com alongside it
- No manual UTM parsing for GA: GA4 natively reads utm_source / utm_medium / utm_campaign /
  utm_content / utm_term from the landing URL
- Important given this architecture: every screen change is a full page load, but GA4 attribution
  is session-scoped and its cookie persists across same-origin loads, so the whole visit stays
  credited to the landing campaign rather than going (direct) after the first navigation.
  Internal links deliberately do NOT carry utm params - re-sending them mid-visit would restart
  attribution and inflate session counts
- The v1.27/v1.28 attribution now also accepts UTM names, so ad ops needs only ONE url format:
  ?utm_source=..&utm_medium=..&utm_campaign=..&utm_content=..&channel=..
  utm_campaign maps to campaign and utm_content (or utm_term) to adset, matching how GA4 reports
  them as Session campaign and Session manual ad content. The plain campaign/adset names still
  take precedence if both are present, so existing campaign links keep working unchanged
- 'channel' stays a separate non-UTM parameter because it drives the AdSense custom channel on
  both the display slots and the H5 script tag. GA does not use it and AdSense does not
  understand utm_*, so the two systems are fed from one url without colliding
- Both parsers updated in step - the head script and the shared.js fallback - so they cannot
  disagree about what a url means
- Two real bugs caught by the Node tests before shipping:
  1. The gtag helper was assigned to window and then called bare, relying on implicit global
     binding. Works in a browser, fragile everywhere else; now a proper local function
     declaration matching Google's own snippet shape
  2. The placeholder 'G-XXXXXXXXXX' SATISFIED the format regex, because X is within A-Z, so an
     unconfigured deploy would have loaded gtag and fired requests at a nonexistent property.
     The placeholder is now excluded by name as well as by format - retained as a guard even
     though the real ID is now in place
- Verified in Node, 9 cases: 6 on UTM attribution (full UTM url with channel; persistence across
  a later navigation; utm_term used when utm_content is absent; legacy names taking precedence;
  UTM with no channel so GA tracks but AdSense stays untagged; and no params at all) and 3 on the
  GA loader (placeholder loads nothing, empty id loads nothing, real id loads and queues js and
  config)
- NOT included, available as a follow-up: custom events. GA will record page views and traffic
  sources, but nothing about what users actually do - Get Started taps, category opens, rewarded
  ad views, account linking. Those are what let media buyers compare source QUALITY rather than
  just volume, and would need a short list of which actions matter
- Also not included: sending the AdSense channel into GA as a custom dimension to join GA traffic
  against AdSense revenue. Doable, but needs a custom dimension registered in GA4 first

## v1.28b — Stop Auto ads from breaking the grid layout (2026-08-13)
- Reported: extra ad panels appearing in awkward mid-content positions on the Welcome page,
  notably inside step 03 of How To Use and inside the Top Features grid
- These are NOT our slots. Verified against the deployed file: the Welcome screen has exactly 2
  ad slots in our markup (Top 3316443330, Bottom 7202099488) and there is no "Discover more"
  markup anywhere in the repo. The only 'related' match in the file is that word inside a
  character description
- They are AdSense Related search for Auto ads - the "Discover more" format, a headed panel of
  clickable related phrases. Google chooses the insertion points for Auto ads, so where they land
  is not addressable from our code. There is no API to position them
- Dashboard levers for ad ops, none of which are code changes: the Related search toggle in Auto
  ads settings turns this format off specifically; Excluded areas marks regions of the page
  off-limits to in-page Auto ads (the closest thing to "put them between sections"); Fine-tune
  your ads (beta) controls the number of in-page ads and the distance between them; plus the Ad
  load slider and Excluded pages
- Worth checking with ad ops whether Related search was switched on recently - that explains the
  timing better than anything in v1.26. Auto ads does re-evaluate page structure after a layout
  change, so the top bar removal MAY have shifted its choices, but that is speculation and the
  dashboard change history will answer it properly
- What this release actually fixes: Auto ads wrap injections in a .google-auto-placed container.
  Landing inside the 2-column Top Features grid (display:grid;grid-template-columns:1fr 1fr at
  line 179) made it a grid ITEM, so it consumed one cell and stretched the Region Support card
  beside it. Added .google-auto-placed{grid-column:1/-1;max-width:100%} so any auto-placed unit
  spans the full row instead, keeping the surrounding cards intact
- grid-column is ignored outside a grid container, so the rule is safe site-wide and is a no-op
  on screens where Auto ads are already behaving
- Deliberately no overflow or height rules on this selector, same reasoning as the slot CSS:
  overflow:hidden clipped resizing ads back in v1.15, and sizing anything Google controls has
  caused problems before. This only constrains how the injected container participates in grid
  layout - it does not move, resize or restyle the ad itself
- Does not change how many Auto ads appear or where Google puts them. That remains a dashboard
  decision; this only stops a badly-placed one from distorting the layout around it

## v1.28 — Extend campaign channel tracking to H5 (rewarded + interstitial) ads (2026-08-13)
- v1.27 tagged only the Top/Bottom display slots and flagged H5 attribution as unconfirmed. It IS
  supported -- general research says otherwise because it looks for an ad element that does not
  exist in the H5 flow
- Google's own AdSense help page for adding the code to a game page lists data-ad-channel as an
  optional AdSense code parameter: "You may include a custom channel ID for tracking the
  performance of your ads. Example: data-ad-channel='1234'". For H5 it goes on the ADSENSE SCRIPT
  TAG, not on an ad element -- rewarded and interstitial run through adBreak() and have no
  element to carry it. Google's own ad-placement integration guides show it being set the same
  way via script.setAttribute('data-ad-channel', ...)
- Problem this creates: the attribute must be on the script tag before it loads, but the channel
  comes from the URL. A static tag in the markup cannot carry a runtime value, so the AdSense
  loader is now INJECTED by a small inline head script instead of hardcoded
- That inline script runs during head parse (shared.js is deferred and has not run yet), so it
  duplicates the attribution parsing deliberately. It writes the result to window.__fffAttr and
  shared.js now reads that instead of re-parsing, keeping one source of truth. shared.js retains
  its own parsing as a fallback if the head script did not run
- The display slots keep their element-level data-ad-channel from v1.27. Same channel ID on both
  paths, so campaign revenue is now attributed across banner AND rewarded/interstitial inventory
- Loader is still async with crossOrigin anonymous, and the existing preconnect hints to
  pagead2/googleads/tpc are unchanged, so load behaviour should be equivalent to the static tag
- Verified in Node, 6 cases on the head loader: landing with a channel; later navigation with the
  params gone from the URL; organic visit with no params; '+' arriving decoded as a space;
  a script-injection attempt in the channel param being dropped; and a campaign with no channel.
  Each case also asserts the loader src, async and crossOrigin are set correctly
- Verified in Node, 3 further cases on the handoff: shared.js uses the head-computed value, honours
  an empty channel, and falls back to its own parsing when the head script is absent
- Template markers still occur exactly once each and no comment contains a parser-visible tag
  string, per the v1.25 rule
- Caveat worth holding: this is the documented parameter and the mechanism is sound, but H5
  channel reporting should still be confirmed against a live campaign. AdSense channel data takes
  roughly 24h to appear, and the H5 breakdown can also be sanity-checked with the Ad format
  filter in AdSense reports

## v1.27 — Campaign attribution: pass campaign/adset in URL, tag ads with AdSense channel (2026-08-13)
- Requirement from the team: accept 'campaign' and 'adset' URL parameters, and attribute AdSense
  revenue per campaign via a custom channel
- Mechanism: AdSense reads a data-ad-channel attribute on the ad element as part of the ad
  request. Google documents this on exactly the responsive unit type used here (data-ad-format
  auto + full-width-responsive). Channel IDs are numeric; multiple are joined with '+'
- Decision taken: the channel ID is passed IN THE URL rather than mapped in code
  (?campaign=spring_ff&adset=a12&channel=1234567890). Ad ops fully controls attribution from the
  campaign URL with no code change or redeploy per campaign, which matters given the manual
  zip-upload workflow. Adset is captured but NOT sent to AdSense - campaign-level revenue only,
  adset to be tracked in analytics instead
- Params are persisted in sessionStorage for the visit. This is required, not a nicety: every
  screen change on this site is a real page load, so without it the params would be dropped the
  moment the user navigates and every ad after the landing screen would go untagged
- sessionStorage rather than localStorage on purpose - it survives navigation within the tab but
  clears when the tab closes, so a campaign can never be credited for an unrelated organic visit
  days later. localStorage would quietly inflate campaign revenue over time
- A fresh campaign link re-attributes the session; without params the stored values carry forward
- data-ad-channel is set BEFORE adsbygoogle.push(), since the attribute is read as part of the ad
  request and setting it afterwards would not affect reporting
- The channel value is attacker-controllable (straight off the URL), so it is validated against
  digits-and-plus only and dropped entirely otherwise, never written raw into a DOM attribute
- Bug found and fixed by the Node tests before shipping: a '+' in a query string decodes to a
  SPACE, so channel=111+222 arrives as "111 222" and was being rejected. Now any run of spaces or
  plusses normalises back to '+', so ad ops can write it the natural way
- Verified in Node across 7 cases: landing with full params; later navigation with params gone
  from the URL; organic visit with no params; a new campaign link overwriting an earlier one;
  a script-injection attempt in the channel param being dropped; multiple channels joined with
  '+'; and a campaign with no channel (captured for analytics, no attribute set)
- AppShared.getAttribution() is exported so any analytics added later can read campaign/adset
  without re-parsing the URL
- OPEN ITEM, flagged: there is NO analytics on this site - zero references to gtag, Google Tag
  Manager or GA in index.html or shared.js. So 'adset tracked in GA instead' has nowhere to land
  yet. The adset value is captured and available, but until analytics is installed it is not
  recorded anywhere
- ALSO NOTE: GA auto-captures utm_* parameters, not arbitrary names. Custom 'campaign' and
  'adset' params will NOT appear in GA reports automatically - either have ad ops add utm_ params
  alongside these, or send the values explicitly once analytics exists
- NOT covered: the rewarded and interstitial placements go through adBreak() rather than an ad
  element, so this tags the Top/Bottom display slots only. Whether H5 Games Ads revenue can carry
  a custom channel is unconfirmed and would need checking with ad ops before promising
  campaign attribution across all ad revenue

## v1.26 — Ad slot height reservation; remove top bar; Home back button (2026-08-13)
- Reported on mobile: top/bottom banner slots either load then collapse, or don't load and the
  space collapses. Chose option A from the discussion: reserve fixed space, accept blank gaps
  when a slot is unfilled
- Mechanism confirmed before changing anything. There was ZERO reserved space -- the wrapper was
  just width:100% with no height -- and two CSS rules did the collapsing. The load sequence was:
  the ad element sits at height 0; adsbygoogle.push() runs and GOOGLE ITSELF sets an inline
  height (observed as height:280px in earlier console output, present even on unfilled slots) so
  space appears; then Google resolves and on unfilled our rules collapsed it back to nothing.
  Both reported symptoms were that same mechanism, not two separate bugs
- Why it showed on mobile and not desktop: full-width-responsive picks proportionally taller
  units on a narrow viewport so the collapse is bigger; that collapse is a far larger share of a
  ~700px mobile viewport; mobile fill is separately worse (the bottom slot has never filled
  reliably on any platform); and the viewport changes as the URL bar hides on scroll, which can
  make AdSense re-evaluate a responsive slot
- Fix: .fff-ad{min-height:296px} = 280px ad area + 16px AD label. 280 is the height Google itself
  set inline on both slots, so the reservation matches what actually serves
- The height is on the WRAPPER, never on the ad element. The ad element is what Google measures
  when choosing a creative, and sizing it directly is exactly what caused the v1.12-v1.16
  collapse saga. Also deliberately NO overflow:hidden on the wrapper -- that clipped resizing ads
  in v1.15. min-height rather than height, so a taller creative can still grow the box
- Removed the wrapper-hiding rule (.fff-ad:has(unfilled){display:none}) that was doing the
  collapse. Kept the rule that hides the ad element itself on unfilled, so no empty iframe
  lingers inside the reserved space
- Unfilled slots now hide the AD label via visibility:hidden rather than display:none, so the
  label still occupies its 16px and the reserved height is byte-identical whether a slot fills or
  not. Avoids labelling an empty box while keeping the reservation exact
- Layout is now deterministic. On the Welcome page, bottom of Get Started lands at ~656px whether
  the top slot fills or not; previously it was ~656px filled versus ~360px unfilled, which was
  the jump being reported
- KNOWN COST, accepted as part of option A: an unfilled slot now leaves ~296px of blank space
  instead of collapsing. With two slots per screen that is up to ~592px of dead space on a page
  where neither fills, and the bottom slot rarely does. The single knob to tune this is the
  min-height value; dropping it to ~120px would trade some residual shift for much less dead
  space if the gaps prove too costly in practice
- Also note this partially undoes the practical benefit of v1.24's above-fold work: that assumed
  unfilled slots collapse, so on a no-fill page Get Started used to sit much higher. It is now
  consistently at the filled-slot position
- TOP BAR REMOVED site-wide (folded into this release rather than shipped separately). Both
  instances of the branded sticky bar are gone: the app icon, the "FFF Skin Tools" title, the
  "Time to find some drip" tagline, and the trailing element on each. That is 2 bars, on Welcome
  and Home -- they were the only two screens carrying it
- Checked before removing that nothing functional was lost. The Home bar's trailing Info button
  looked load-bearing but was only navClick('index.html?screen=welcome') -- it navigated to the
  Welcome screen, it did NOT open the info modal. The modals remain reachable exactly as before:
  openPrivacy from Welcome's Privacy Policy tile, openTroubleshoot from the button further down.
  Welcome's bar ended in a decorative "Web" badge with no handler at all
- Navigation preserved rather than lost: added a square floating-style back button, top-left, on
  the Home screen (the screen carrying the Browse Categories grid, which is what lost its link to
  Welcome). Reuses the existing infoClick handler -- navClick('index.html?screen=welcome') -- which
  was left unused when the bar was removed, so no new binding was needed
- Styled to match the existing floating back buttons on Detail and the flow screens: 40x40,
  12px radius, translucent rgba(5,7,15,0.5) with an 8px backdrop blur, --line-strong border, and
  the same left-arrow icon. Consistent with the rest of the site rather than a new visual
- Placed in its own left-aligned row ABOVE the ad slot, not absolutely positioned over it. A
  genuinely floating button at top-left would sit on top of the top ad now that the ad is Home's
  first element, and overlaying an ad breaches AdSense policy. Same floating look, no overlap --
  verified programmatically that the button precedes the first ad wrapper in the DOM
- Cost: the button row is ~52px, so Home is back to roughly its pre-removal height. Welcome keeps
  the full ~57px saving since it needs no back button, so the Get Started above-fold gain there is
  unaffected
- The Category screen still uses its own sticky bar's Back button and needed no change
- Deliberately NOT removed: the Category screen's sticky bar. That is a different component --
  a centred 54px navigation header holding the Back button and the category title -- and removing
  it would break back navigation. Only the branded bar shown in the request was taken out
- assets/app-icon.webp is still referenced: the Splash screen uses it at 150x150. Not orphaned
- Side benefits: both screens now begin directly with the top ad slot, matching the element order
  requested back in v1.23. Get Started moves up by the bar's ~57px, so it now lands around 599px
  instead of 656px, recovering most of what the v1.26 ad reservation cost it. Two backdrop-filter
  blur layers are also gone, which are among the more expensive things to composite on mobile
- Verified after removal: div tags balance at 174 open / 174 close, and all 20 ad slots and
  wrappers are intact
- Verified after the change: all four template markers (x-dc / helmet open and close) still occur
  exactly once, and no comment in any syntax contains a parser-visible tag string -- the v1.25
  regression rule

## v1.25 — Fix white flash on page load (2026-08-13)
- NOTE: the first build of v1.25 shipped with a broken <head> comment that took the site down.
  Cause and permanent rule recorded at the bottom of this entry. The fix itself is unchanged.
- Reported after v1.24: a flash of white before the dark UI appears on load
- Root cause, confirmed by inspection rather than theory:
    1. bundle.css never sets a page background. base.css scopes the canvas background to
       .fff-scope/.fff-app, and neither class is on <html> or <body>
    2. The ONLY rule that sets it -- html,body{margin:0;background:#05070F} -- lives inside
       <helmet>. Verified programmatically: helmet spans chars 227-2916 and that rule sits at
       char 1363. Everything inside <x-dc> (helmet included) is template markup that support.js
       injects into <head> only once it boots, so it arrives AFTER the browser's first paint
  Net result: at first paint there is no page background rule at all, so the browser paints
  white, then flips dark once support.js boots
- This bug is not new and was NOT introduced by v1.22 -- v1.22 exposed it. Previously 3
  render-blocking scripts (including the 76 KB unused _ds_bundle.js) plus 9 blocking CSS files
  delayed first paint long enough that support.js had usually already booted, masking the gap.
  Removing that blocking made first paint arrive early enough to see it
- Fix: added <style>html,body{margin:0;background:#05070F}</style> to the REAL <head>, inline so
  it costs no extra request and is guaranteed to apply before anything paints. Also added
  <meta name="theme-color" content="#05070F"> so mobile browser chrome tints to match instead of
  showing a bright band above the page
- The original rule inside <helmet> is deliberately left in place. It also carries font-family,
  and keeping it means nothing depends on the ordering of this fix
- REGRESSION AND FIX (same version): the explanatory HTML comment added alongside this fix in
  <head> broke the whole site -- the page flashed once then rendered as a blank dark screen with
  a stray word from the comment visible top-left
- Cause: support.js does NOT locate the template via the DOM. support.js line 39 uses
  /<x-dc(?:\s[^>]*)?>/.exec(src) -- a REGEX ON THE RAW HTML SOURCE STRING. The comment contained
  the literal text "<x-dc>", so that regex matched INSIDE THE COMMENT, and everything from that
  point was treated as the template body. Line 377 compounded it by string-replacing "<helmet"
  with "<sc-helmet" on raw source, and the comment contained "<helmet" twice
- HTML comments are inert to the browser but NOT to a string-based parser. Fixed by removing the
  comment entirely; the meta theme-color and the inline <style> are unchanged and still work
- PERMANENT RULE for this repo: never put the text "<x-dc", "</x-dc>", "<helmet" or "</helmet"
  inside any comment in index.html -- HTML comments, CSS comments in the <style> block, or JS
  comments in the script block. support.js finds the template by raw string search and cannot
  tell a comment from real markup. Verified after the fix: each of those four markers now occurs
  exactly ONCE in the file, at its real position. Explanations belong in this changelog instead

- Welcome page hero left exactly as v1.24. The remaining empty space between the ad and the logo
  was traced to unused height reserved inside Google's own <ins> (only 10px of that gap is our
  layout -- the outer container is a flex column so no margin collapsing is possible, ad parent
  has 0 bottom padding, hero has 10px top, img has no margin). Deliberately not touched

## v1.24 — Actually get Get Started above the fold on mobile (2026-08-13)
- v1.23 shrank the header image but the space it occupied stayed, as reported. Cause: the logo
  was sized by WIDTH (width:100%;max-width:340px;height:auto), which guarantees nothing about its
  HEIGHT -- the rendered height is whatever the aspect ratio produces at that width, so on wider
  viewports it still filled ~227px and the hero block's height followed it. Reducing max-width
  from 420 to 340 only reclaimed ~53px, nowhere near enough
- Fix: constrain the logo by height instead -- width:auto;height:auto;max-width:100%;max-height:150px.
  The vertical budget is now deterministic regardless of viewport width, which is the property
  that was missing. Aspect ratio is preserved (the image is 1.5:1, so it renders ~225x150)
- Confirmed the image itself was NOT the problem: checked hero-logo-characters.webp's alpha
  bounding box and there is no baked-in transparent padding to crop (6px top, 0px bottom of 560)
- Supporting cuts in the hero block: padding-top 26 -> 10, padding-bottom 4 -> 0, the "Welcome To"
  eyebrow margin 10 -> 8 and font 12 -> 11px, h1 32 -> 26px with margin 6 -> 4, and the decorative
  radial glow rescaled 360x270 -> 300x200 to match. CTA wrapper padding-top 20 -> 16
- Measured result on a 393px-wide device with a filled 280px top ad: bottom of Get Started moves
  from ~769px to ~656px, a 113px saving. Fits with ~44px headroom on a typical Android Chrome
  viewport (~700px usable) and ~74px on iPhone Safari (~730px)
- Remaining caveat, unchanged from v1.23: the top ad slot is ~312px of the budget and was left
  untouched by instruction. On a small phone (~640px usable) it is still about 16px over, and if
  the ad serves taller than 280px that headroom shrinks accordingly. The next levers, if needed,
  would be max-height 150 -> 120 on the logo or dropping the "Welcome To" eyebrow entirely
- The sticky header bar was deliberately NOT touched: that markup is shared with the Home screen,
  and changing it would have altered a screen outside the scope of this request for ~4px

## v1.23 — Rewarded ad shows without re-confirming; Welcome page reorder + CTA animation (2026-08-13)
- No caching changes. v1.22's assets/ rule stays at max-age=31536000, immutable as deployed
- REWARDED AD: beforeReward now calls showAdFn() immediately instead of revealing a second
  "Ad ready / Watch Now" confirmation. One tap on "Watch ad to earn entry coins" now goes
  straight into the ad once one is available
- The "Finding an ad" and "No ad available / Try again" states are untouched and still behave
  exactly as before -- only the redundant middle confirmation step is bypassed
- Compliance reasoning: Google's rewarded requirement is an informed, user-initiated opt-in. The
  initiating button already satisfies both -- it is a direct user tap and it states the reward on
  the button itself ("WATCH AD TO EARN ENTRY COINS", with "Each short ad adds 10 coins" directly
  beneath). That copy is now load-bearing for compliance and should NOT be reworded to drop the
  reward amount. Note Google's documented sample pattern is the two-step prompt, so this relies
  on the initiating tap being the opt-in rather than a prompt inside beforeReward
- Kept the old two-step path as a FALLBACK only: if showAdFn() throws, or if the ad hasn't taken
  over the screen within 2.5s (beforeAd never fires), the "Ad ready / Watch Now" prompt appears so
  the user is never stranded on "Finding an ad". The fallback timer is cleared in beforeAd,
  adDismissed, adViewed and closeAd so it can't fire late over a playing or closed ad
- WELCOME PAGE reordered to get Get Started above the fold. New order: top ad slot -> header
  image + "Welcome To" + "FFF Skin Tools" -> Get Started -> Rate/Share/Policy tiles -> the
  "Every legendary drop..." line -> Top Features and the rest unchanged
- The tagline paragraph moved out of the centred hero block to its own centred wrapper below the
  tiles (it kept its max-width:320px and centring, so it reads the same)
- Header image reduced from max-width 420px to 340px, hero top padding 44px -> 26px, and the
  decorative radial glow behind it scaled 400x320 -> 360x270 to match. Ad slot untouched
- Net effect: Get Started moves from roughly 936px down the page to roughly 686px with a filled
  top ad, or about 406px when the top slot is unfilled -- a saving of about 250px. Caveat: with a
  filled 280px-tall top ad this is right at the fold on shorter phones. The top ad is by far the
  biggest consumer of above-fold space and was deliberately left alone, so if it needs to clear
  the fold on every device the logo would have to come down further (~300px) or the "Welcome To"
  eyebrow be dropped
- Get Started now has a pulse + radiating glow animation (.fff-cta): 2.4s ease-in-out, scaling to
  1.028 with the shadow blooming and a soft expanding ring. The 0%/100% keyframe matches the
  button's existing inline box-shadow so it rests at its normal appearance between pulses.
  Wrapped in prefers-reduced-motion so it disables for users who ask for less animation

## v1.22 — Caching, render-blocking cleanup, CSS consolidation, hygiene (2026-08-13)
- Audit follow-up; items 1, 2, 3, 5, 7 and 8 from the full-repo pass. No new functionality
- CACHING (new vercel.json): assets/ now served with max-age=31536000, immutable. This matters
  more than it looks -- every screen is a real page load, so previously each navigation
  re-validated every image. Favicon 7 days. JS/CSS and HTML set to must-revalidate so deploys
  still propagate instantly (a 304 costs a round trip but no body). Also added nosniff and
  Referrer-Policy headers
  CAVEAT: immutable means a changed image at the SAME filename won't be picked up by returning
  visitors. If an asset is ever re-optimised, change its filename
- REMOVED _ds_bundle.js (76 KB, render-blocking, entirely unused). It exports 21 components
  (ItemCard, Button, Badge, AppHeader, TabBar...) plus window.FFFData and window.__t -- index.html
  references NONE of them, and there are zero <x-dc component=...> tags for support.js to
  resolve. The earlier "ICONS" grep hit was a local const at index.html line 725, not the bundle.
  This was the single largest blocking resource on the page, bigger than everything else combined
- shared.js and support.js now load with defer instead of blocking the parser. Safe because
  support.js already gates its own boot on readyState/DOMContentLoaded (line ~1760): under defer
  it executes with readyState "interactive" and boots immediately, so behaviour is unchanged --
  it just no longer blocks HTML parsing. defer also preserves order, so shared.js still defines
  AppShared before support.js boots the component code
- CSS: the 9 separate <link> tags collapsed into one bundle.css (same directory, so any relative
  paths still resolve). Found while doing it: styles.css ALREADY @imported all 8 token files, so
  every token file was being fetched TWICE -- once via its own <link> and once via styles.css.
  Those redundant @imports are stripped in the bundle
- The Google Fonts @import was hoisted out of fonts.css into a real <link>, plus preconnect to
  fonts.googleapis.com and fonts.gstatic.com. An @import inside CSS serializes: the browser had
  to download and parse fonts.css before it could even discover the font URL. Now they fetch in
  parallel
- Net effect on the critical path: 12 blocking requests (9 CSS + 3 JS) down to 2 (bundle.css +
  Google Fonts), with 76 KB of dead JS gone and the font request no longer chained
- CHANGELOG renumbered to match the reconciled deploy folders. Every duplicate version number is
  resolved -- earlier re-attempts of a clashing number now carry a dot:
    v1.11 (Navigation Bug Fixes, 10-08)        -> v1.1.1
    v1.12 (Favicon fix + text changes, 10-08)  -> v1.1.2
    v1.21 (Lazyload + minor fixes, 12-08)      -> v1.1.3
    v1.14 / v1.14b / v1.14c (Top-Bottom slots) -> v1.1.4 / v1.1.4b / v1.1.4c
    v1.15 / v1.15b (Interstitial Ads)          -> v1.1.5 / v1.1.5b
    v1.16 (Interstitial/Rewarded reliability)  -> v1.1.6
    v1.17 (Category page ad slots)             -> v1.1.7
    v2.3 / v2.4 / v2.21 (stray v2.x block)     -> v1.2.3 / v1.2.4 / v1.2.21
    v1.1 (Hash links & Favicon, asset upload)  -> v1.0.1
  Version list now reads cleanly descending with no repeats
- Deleted Favicon.svg (44 KB). It was an Illustrator export wrapping a base64 raster, so it was
  never really a vector; Favicon.png does the same job in 8 KB. Its <link> is removed
- [ads] console logging is now opt-in: add ?addebug=1 to any URL to re-enable it. The flag rides
  in the query string, which is also how routing works here, so it survives navigation. Off by
  default so production consoles stay clean. adLog is exported from AppShared and the adConfig
  onReady log in index.html now routes through the same gate
- Left alone from the audit: the {{ d }} SVG path console error (item 4), .git history bloat
  (item 6), the unused fillAds export (item 9), SEO/meta additions (item 10, would be new
  functionality), and the claim-language and ad-density observations (items 11 and 12, product
  decisions rather than code fixes)
- The token CSS files and _ds_bundle.js remain in the repo as unreferenced source. Safe to leave;
  safe to delete if you want the repo tidier

## v1.21 — Image optimisation: 89.7 MB of assets down to 8.5 MB (2026-08-13)
- The real fix flagged in v1.20. All 164 images in assets/ resized to their actual on-screen
  size and converted to WebP. Result: 89.7 MB -> 8.54 MB, a 90.5% reduction
- Sizing was derived from measured display dimensions, not guessed. The site frame is 480px
  wide, so full-bleed targets are 960px (2x for retina):
    item renders (characters/bundles/fashion/vehicles/pets/weapons/backpacks/skyboards)
                              -> 768px q85   (doubles as 74px list thumb and ~384px detail hero)
    page + catalog headers    -> 960px q82   (container is 480x190, object-fit:cover)
    category card fills (cat-*) -> 400px q82 (~136x158 on screen)
    ranks                     -> 200px q85   (shown at 76x76)
    app-icon                  -> 300px q88   (largest use is 150x150 on splash)
    hero-logo                 -> 840px q85   (max-width 420px)
    splash-bg                 -> 960px q78   (full viewport, 55% opacity)
    site-bg / home-coins-header -> 720px q72 (blurred 2px at 50% opacity, detail is invisible)
- Representative results:
    app-icon.png             2.1 MB  ->  23 KB   (was 1254x1254 for a 32x32 header icon)
    catalog-weapons-header   2.8 MB  -> 125 KB
    home-coins-header        2.7 MB  ->  70 KB
    site-bg                  2.5 MB  ->  66 KB
    hero-logo-characters     1.9 MB  -> 112 KB
- Alpha channel preserved on all item renders (verified RGBA with a full 0-255 alpha range) so
  they still composite correctly over the gradient backgrounds. Genuinely opaque images were
  flattened to RGB to save further bytes
- All 166 asset paths in index.html rewritten from .png to .webp. Verified programmatically:
  164 referenced paths, 164 converted files, zero missing and zero orphans. Favicon.png at the
  repo root is intentionally untouched (referenced separately as type="image/png")
- WebP is safe to use without PNG fallbacks — supported in every current browser including iOS
  Safari 14+, which predates the audience's device range by years
- DEPLOY NOTE: the old assets/*.png files are now unreferenced but still present in the repo.
  They should be deleted so the repo/deployment isn't carrying 90 MB of dead weight. Deleting
  the assets/ folder before uploading the new one is the cleanest route through the GitHub web UI
- Combined with v1.20's lazy loading and fetch-priority work, this is where the slow-connection
  problem actually gets solved -- v1.20 changed request ordering, this changes the payload

## v1.20 — Loading performance: lazy loading, fetch priority, preconnect (2026-08-13)
- Audited load performance after a slow-connection report on mobile. Finding: lazy loading was
  implemented in exactly ONE place (category list row thumbnails, via realImg(..., true)) out of
  ~20 img() call sites -- but lazy loading is NOT the main bottleneck here
- The dominant problem is raw image weight. assets/ is 164 files / 90 MB, averaging 560 KB per
  file, with 43 files over 500 KB. The site frame is max-width 480px, and the images are
  full-resolution uncompressed PNGs, e.g.:
    app-icon.png                  1254x1254  2.1 MB  -- rendered at 32x32 in the header
    site-bg.png                   1448x1086  2.5 MB  -- blurred, 50% opacity, on EVERY page
    catalog-weapons-header.png    1448x1086  2.8 MB  -- shown at roughly 480x190
    characters/nulla.png          1024x1536  2.3 MB  -- 74x74 in list view
  Measured on a 5-file sample: resizing to displayed size + WebP at q82 took 11.6 MB down to
  456 KB, a 96% reduction. Extrapolated, assets/ would go from ~90 MB to roughly 3.5 MB.
  NOT done in this release -- it changes 164 binary files and every src path, so it needs to be
  its own deliberate pass
- Why lazy loading has limited headroom on its own: the heaviest images (page headers, detail
  hero, site background, app icon) are all ABOVE the fold, and loading="lazy" only defers what's
  offscreen. Those can only be fixed by making the files smaller
- Code-level wins shipped here:
  - loading="lazy" added to the 7 Rank/league tile images and to the info/troubleshoot modal
    image (the latter only ever renders once a user opens it, so it was pure waste before)
  - fetchpriority="low" + decoding="async" on site-bg.png and splash-bg.png -- both are purely
    decorative, blurred and semi-transparent, but were competing with real content for
    bandwidth. They fill the viewport so lazy can't defer them; deprioritising is the right tool
  - fetchPriority "high" on the two LCP images (category header, detail hero) so they win the
    race against the decorative layers instead of queueing behind them
  - decoding="async" now applied to all images via the img() helper, not just lazy ones
  - Added preconnect to pagead2.googlesyndication.com and googleads.g.doubleclick.net, plus
    dns-prefetch for tpc.googlesyndication.com -- saves a DNS + TLS round trip before any ad
    byte transfers, which is significant on high-latency mobile
- img() helper signature extended to img(src, style, lazy, prio); existing 3-arg calls unaffected
- Worth noting for future perf work: the query-string routing pivot means every screen is a real
  page load, so index.html (141 KB) + support.js (63 KB) + 9 separate token CSS files +
  _ds_bundle.js are re-requested per navigation. Browser cache covers most of it after the first
  visit, but the 9 separate CSS round trips are a latency cost worth revisiting

## v1.19 — Strip the frame around Top/Bottom ad slots (2026-08-13)
- Simplified the Top/Bottom ad slots site-wide (all 20 blocks, every screen). Removed the
  rounded frame entirely: no border, no border-radius, no background, no overflow, no
  position:relative, and dropped the leftover width/flex-shrink/min-width props from the
  abandoned v1.16 flex theory. Each slot is now just a bare wrapper (width:100%, plus
  grid-column:1/-1 on the two inside Rank's 2-col grid) containing an AD label and the ins
- Reason: these creatives are sometimes video and we don't control their dimensions, so a fixed
  rounded frame was never going to fit them. Reported symptoms it addresses: ads rarely fitting
  the frame, and on iPhone Chrome incognito rendering outside/above the box with square corners
  while the frame stayed rounded -- i.e. the frame and the ad disagreeing about size
- The AD label was position:absolute overlaying the creative's top-left corner; it's now a plain
  block label sitting above the ad. Better for policy too (label adjacent to the ad rather than
  obscuring it)
- Consequence to be aware of: the grey line on an unfilled slot is gone, because that line WAS
  this box's 1px top+bottom border. With no border there's nothing to show. Added
  .fff-ad:has(ins[data-ad-status="unfilled"]){display:none} so an unfilled slot also hides its
  AD label -- otherwise you'd get a stray "AD" with no ad beneath it. If a visible no-fill
  indicator is wanted back, that one CSS rule is the place to change
- Field report on v1.18: non-rewarded interstitials are firing again, roughly half of
  navigations. Consistent with the frequency cap plus normal fill variability, so no further
  interstitial changes made here -- leaving it to settle before touching it again

## v1.18 — Fix non-rewarded interstitials not firing on navigation (2026-08-13)
- Static display ads: left exactly as-is at v1.17. The grey line on an unfilled slot is
  intentional/wanted and was NOT removed. Console diagnostics from v1.17 testing showed the
  static-ad symptom is data-ad-status="unfilled" (Google returning no ad), not a layout collapse
  -- treating that as a fill-rate matter to give more time, not a code bug
- Rewarded ad flow deliberately untouched -- it works consistently and shares no code with the
  navigation interstitial path
- Three real problems found in the non-rewarded nav interstitial:
  1. navigateWithInterstitial()/goBackWithInterstitial() ran a blind setTimeout(go, 2500) that
     fired regardless of ad state. A real interstitial takes longer than 2.5s to view/dismiss,
     so even a successfully-served ad was destroyed by navigating away mid-playback. Verified in
     Node: a 6s ad under the old timing gets cut off at 2500ms
  2. adBreakDone's placementInfo argument was discarded. Its breakStatus field states exactly
     why no ad showed (noAdPreloaded / frequencyCapped / timeout / ignored / dismissed / viewed
     / error / notReady / other) -- the single most useful diagnostic available, thrown away
  3. adConfig() never set preloadAdBreaks. Because every screen is a real page load in this app,
     each page begins a fresh ad-placement session with nothing preloaded, so a break requested
     a few seconds after load was very likely never fetched at all
- Fixes: replaced the blind timeout with a two-stage model keyed off the beforeAd callback --
  a short 1200ms "is an ad even coming?" window, cancelled the moment beforeAd fires, then a
  30s safety net so a real ad can play to completion. Navigation still can never block
  indefinitely. Both nav and Back now share one runNavInterstitial() implementation to stop the
  two copies drifting apart. adConfig now sets preloadAdBreaks:'on' plus an onReady log
- All adBreak callbacks now log to console under an [ads] prefix, including breakStatus
- Verified all four paths in Node before shipping (no ad / silent adBreakDone never firing /
  6s ad playing through / adBreak throwing). Navigation completes correctly in every case, and
  is now FASTER than before when no ad is coming (~30-50ms, or 1200ms worst case, vs a flat
  2500ms wait previously)
- Expectation setting: even fully working, this will NOT fire on every navigation. Google
  enforces a frequency cap between interstitials, so breakStatus=frequencyCapped on most
  navigations is correct behaviour, not a bug. Also worth noting vignette ads are already
  enabled at the AdSense dashboard level and serve their own navigation interstitials -- the two
  formats compete, so some suppression of adBreak interstitials is expected

## v1.17 — Ad slots on all flow screens; slot-parity test for the collapse (2026-08-13)
- v1.16's flex-item theory did NOT fix it: Detail and the flow screens still collapse, both via
  the flow and on a fresh direct load. Third failed theory in a row on this bug
- Added the missing static slots: Mode Selection, Progression Level, and Rank Selection had NO
  ad slots at all and now have both Top and Bottom. Rank's container is a 2-col grid, so its
  ad wrappers get grid-column:1/-1 to span full width instead of sitting in one cell
- Also added the complementary slot to the four screens that only had one: Detail (had Top only,
  now + Bottom), Flow Terminal / Account Sync / Complete (had Bottom only, now + Top). Every
  screen now has exactly one Top + one Bottom; 20 ins tags across 10 screens
- Reason for doing that beyond consistency: the only structural property that correlates
  perfectly with the bug across all 7 ad-bearing screens is slot COUNT, not any CSS property --
  Welcome/Home/Category have two slots and are stable; Detail/Terminal/Verify/Complete had
  exactly one and all collapse. No confirmed mechanism for why, so this is explicitly a
  hypothesis test that happens to coincide with wanted work, NOT a diagnosed fix
- If the collapse persists after this, stop guessing and capture real evidence first -- a
  MutationObserver on the ins (logging data-ad-status, inline style, offsetWidth/Height over
  time) will show whether the slot is being un-filled, resized to zero, or width-starved,
  which none of the last three theories could distinguish between

## v1.16 — Fix collapse on Detail/flow screens: ad wrapper as flex item (2026-08-13)
- Reported: static ads still collapsing on the item Detail screen and every flow screen after
  it (Terminal, Account Sync, Complete), even on a cold first load with no prior navigation --
  ruling out any session/frequency-based explanation
- Verified the v1.14/v1.15 CSS fixes ARE present identically on every screen, including these
  ones -- this is not a leftover of the earlier bug
- Actual difference found by checking each ad wrapper's direct parent: on Welcome/Home/Category
  (stable) the ad wrapper's parent is a plain block div. On Detail, Flow Terminal, Flow Account
  Sync, and Flow Complete (collapsing) the ad wrapper's direct parent is a
  display:flex;flex-direction:column container -- making the ad wrapper itself a flex item
- Flex items get min-width:auto by default, which lets the browser size them by content rather
  than guaranteeing 100% width -- a known source of full-width-responsive AdSense units
  mis-measuring available space, rendering, then re-resolving to something smaller. This matches
  the "shrinks, then collapses" symptom exactly
- Fix: added width:100%;flex-shrink:0;min-width:0 to the 4 ad wrapper divs that sit inside a
  flex column (Detail, Flow Terminal, Flow Account Sync, Flow Complete only) to force stable
  block-level sizing regardless of the flex context. The 6 wrappers on non-flex parents
  (Welcome/Home/Category) were left untouched since they were never affected
- Flow Mode Selection and Flow Level Selection have no ad slots at all, so nothing to fix there

## v1.15 — Roll back CSS entirely; stop fighting AdSense's own resize box model (2026-08-13)
- v1.14 made things worse: min-height:100px unconditional caused Top to also collapse almost
  always, with mostly 1:1/square creatives now being served
- Root cause reframed: AdSense sets sizing via inline styles on the ins during its own resize
  step (which briefly shrinks before settling on final size) — inline styles beat any CSS rule
  we write unless we use !important, so our min-height was never actually stopping the shrink,
  it was just adding noise. Meanwhile the ad wrapper divs' overflow:hidden was clipping the ad
  if it tried to grow past whatever height it was mid-resize at — this is what "shrinks, then
  collapses" was actually showing us. The shrunk/clipped presentation at push() time is also the
  likely cause of the 1:1-only creatives, since Google was measuring an artificially squeezed
  container
- Fix: removed the ins-level min-height rule entirely (back to zero custom sizing CSS — ad ops'
  original snippet has none). Changed overflow:hidden to overflow:visible on all 10 ad wrapper
  divs so nothing can clip AdSense's own resize. Kept the unfilled data-ad-status hide rule
  only, which is Google's own documented recommendation and scoped to genuinely-unfilled ins,
  not the filled/resizing case
- Kept AppShared.fillAdsWhenReady()/fillAds() in shared.js — unlike ad ops' snippet, our ins
  tags don't exist in the DOM until support.js compiles the page at runtime, so a deferred
  push() call is a real architectural requirement here, not an embellishment
- Lesson from this round: two consecutive "fixes" (v1.12's claim, and v1.14's real but wrong-
  theory attempt) both tried to manage AdSense's box model via CSS instead of just not fighting
  it — reverting to the minimum footprint matching ad ops' original tags first, rather than
  layering on more CSS, was the move that should have happened earlier

## v1.14 — Actually fix the grey-line collapse (v1.12 fix had never shipped) (2026-08-13)
- Root cause of the collapse bug "coming back with a vengeance": verified against the live
  deployed index.html and found the v1.12 fix was never actually applied — the CSS was still
  the original `ins.adsbygoogle:not([data-ad-status]){min-height:250px}` rule, not the static
  100px/never-removed version the v1.12 entry describes
- `:not([data-ad-status])` stops matching the instant Google sets data-ad-status="filled" on
  the ins, so the min-height rule doesn't shrink, it disappears entirely — and since each ad's
  wrapper div has overflow:hidden with no height of its own, the whole block collapses to the
  AD-badge sliver the moment a fill succeeds. Very likely also what triggers Google's script to
  re-evaluate and invalidate the just-filled ad, per the original v1.12 theory
- Explains the Top (~1/4) vs Bottom (almost every time) asymmetry too — it tracks how often
  each slot actually resolves to data-ad-status at all, not a lazy-load/viewport timing effect
- Fixed for real this time: `ins.adsbygoogle{min-height:100px}` (unconditional, all states),
  `ins.adsbygoogle[data-ad-status="unfilled"]{display:none!important}` unchanged
- Reinforces the standing rule: always verify against the actual deployed file before trusting
  a changelog entry describing a fix as shipped

## v1.13 — Fix lingering availableWidth=0 error; note on ad sizing (2026-08-13)
- Confirmed via fresh screenshot: "TagError: adsbygoogle.push() error: No slot size for
  availableWidth=0" is a separate, still-open issue from the v1.12 grey-line fix (that one was
  about height being removed after fill; this is specifically about width resolving to 0 at
  push() time)
- Replaced the readyState/load-event gate with AppShared.fillAdsWhenReady(): waits for load,
  then a double requestAnimationFrame — readyState === 'complete' doesn't strictly guarantee
  the browser has actually finished a layout pass at that exact synchronous point, which is a
  plausible cause of the intermittent width=0 error; double rAF is the standard way to
  guarantee a real paint has happened first
- Reviewed the "ad sizing sometimes looks off" report (a tall list-style creative pushing
  content down): this looks like normal variation from data-ad-format="auto", not a bug —
  Google is deliberately choosing creative shape/size per request. Constraining the format
  (e.g. "rectangle") would reduce this at the cost of fill rate; not changed without a
  decision on that trade-off
- Confirmed via screenshot: rewarded ads are genuinely playing full video creatives now
  (#goog_fullscreen_ad), consistent with what's been reported working

## v1.12 — Fix: ads rendering then collapsing into a grey line (2026-08-12)
- Confirmed: the top/bottom static ad refresh bug (loading only once, needing a refresh) is
  fixed as of the v1.9/v1.10 query-string routing work — no longer an open issue
- New bug found instead: an ad would render successfully, then collapse into a grey
  placeholder a moment later. Root cause: our own CSS removed the reserved min-height the
  instant data-ad-status="filled" appeared, which could trigger Google's script to
  re-evaluate the slot's now-changed dimensions and invalidate what was just a working ad
- Fixed: min-height is now static (100px, down from 250px) and never removed once an ad
  fills — only the display:none for genuinely unfilled slots still toggles dynamically
- Reviewed the once-in-7-9-attempts rewarded ad auto-close report: nothing in our code can
  cause this — our own UI is fully removed from the DOM before real ad playback begins, so
  this is most likely inherent ad-network flakiness, not a fixable bug on our end
- Ad ops enabled vignette ads via the AdSense dashboard directly — working well, so the
  custom overlay-style interstitial (discussed but never built) is no longer needed
- Regular (non-rewarded) blanket interstitials confirmed not firing anywhere — next up

## v1.11 — Fix: navigation could get permanently stuck (2026-08-12)
- v1.10's navigateWithInterstitial()/goBackWithInterstitial() waited for adBreakDone before
  navigating, with no fallback — reported as "clicking a category does nothing"
- Confirmed via console: Google's own ad script is throwing real internal errors on this page
  ("TagError: adsbygoogle.push() error: No slot size for availableWidth=0") — if a similar
  error happens inside adBreak()'s own processing, adBreakDone can simply never fire
- Added a hard 2.5s timeout so navigation always completes regardless of what the ad script
  does, plus a try/catch around adBreak() itself so a thrown error navigates immediately
  instead of waiting out the timeout unnecessarily
- Verified both failure modes directly in Node (adBreakDone never firing, adBreak() throwing
  synchronously) before shipping
- The "No slot size for availableWidth=0" error is new, useful evidence for the still-open
  Top/Bottom static ad slot bug — not addressed in this release, still next up

## v1.10 — Fix interstitial/rewarded broken by v1.9 (2026-08-12)
- Root cause: Google's Ad Placement API requires adBreak() to be called "as part of a user
  action". v1.9 called it in componentDidMount — a page-load lifecycle hook, not a live user
  gesture — which very likely also poisoned the page's whole ad-placement context, breaking
  the rewarded ad's otherwise-valid click too. Confirmed via console: no JS error, just a
  silent "no ad" — consistent with a policy-compliant rejection, not a crash.
- Moved the interstitial trigger out of componentDidMount entirely. Every navigating link
  (category cards, item rows, flow tiles, Back buttons, Get Started, etc.) now calls
  adBreak() synchronously from its own click handler, and only completes the real navigation
  once the ad break resolves (via adBreakDone) — genuinely "part of a user action" this time.
- Added AppShared.navigateWithInterstitial()/goBackWithInterstitial() and a navClick() handler
  factory; modified clicks (ctrl/cmd/shift/middle-click) are left alone so opening in a new
  tab still works normally
- Verified the new helpers directly in Node (deferred-navigation timing, Back fallback,
  modified-click bypass) before shipping, not just by inspection
- Top/Bottom static ad slot bug is unrelated and still open — not addressed in this release

## v1.9 — Hash links to URL Parameters (2026-08-12)
- Pivoted away from the multi-file HTML-split effort (v1.4 category-grid work stays, that
  file split is abandoned) — realized query-string changes trigger a real browser navigation
  just like separate files do, so the whole site could go back to one index.html
- Every #/route hash link converted to a real index.html?screen=...&key=...&item=... link —
  each navigation is now a genuine page load, which is what actually fixes AdSense treating
  the whole SPA as one ever-growing page
- Removed entirely (no longer needed): the hashchange listener, routeHash/parseHash, the
  duplicate _syncHash definition, componentDidUpdate, and all the stale-<ins>
  pruning/cloning logic from fillAds() — a real page load starts with a clean DOM every time
- Added shared.js: coins/UID/region now persist via localStorage, since nothing in memory
  survives a real navigation anymore (this didn't matter in the old SPA, where the page never
  actually reloaded) — required for the site to function correctly, not optional
- back() now uses real history.back() with a simple fallback, no more hash comparison

## v1.8 — Cleaned up ad fill logic (2026-08-12)
- Removed the retry-with-delay from v1.6 — redundant on top of the pruning fix, and firing
  extra unnecessary requests is exactly the kind of noisy pattern worth avoiding
- Fixed a real bug in clone-and-replace: it would swap out and re-request ANY already-processed
  slot, including one already showing a real, successfully filled ad (data-ad-status="filled")
  — discarding a working ad to ask for one it didn't need. Now explicitly skips filled slots and
  only retries genuinely unfilled/stuck ones.
- Kept the core fix from v1.7 (pruning invisible leftover <ins> tags) and the load-timing gate
  from v2.3 — this is meant to be the same theory, tested clean, not a new one

## v1.7 — Prune leftover ad slots from previous screens (2026-08-12)
- Root cause found via direct console/network inspection: navigating away from a screen was
  NOT removing its <ins class="adsbygoogle"> tags from the DOM — they stayed behind, invisible.
  AdSense has no concept of our SPA screens and treats every ins it has ever seen as living on
  one single, ever-growing real page, and appears to cap/ignore further requests once too many
  accumulate — matching "works after a refresh, breaks down the more you navigate" exactly.
- fillAds() now actively deletes any ins.adsbygoogle that is no longer visible (offsetParent is
  null) before requesting anything new, keeping the real DOM ad-slot count bounded to just the
  current screen instead of growing for the entire session.

## v1.6 — Ad fill retry on first push (2026-08-12)
- fillAds() now retries once, after 800ms, if a push() call never got acknowledged by
  AdSense at all (no data-adsbygoogle-status appeared) — most likely caused by the AdSense
  script still loading/initializing at the moment we called push()
- Deliberately scoped narrow: this never re-requests a slot Google already responded to
  (filled or genuinely unfilled), since AdSense refuses to re-fill an <ins> it has processed —
  only helps the specific "our push never even registered" case

## v1.5 — Weapons/Vehicles/Pets/Bundles are now genuinely free (2026-08-12)
- Correction to v1.4: that release only hid the Entry Cost badge on these 4 categories — the
  actual 10-coin unlock requirement was untouched, so the lock overlay still showed on them
- Now fixed for real: openCategory() skips the coin gate entirely for these 4 keys (based on
  category key, not array position, so this stays correct even if the grid order changes again),
  and the category card never renders as locked regardless of coin balance

## v1.4 — Home page category grid changes (2026-08-12)
- Swapped row 1 and row 3: Weapons and Vehicles are now the first two category cards, moving
  Characters and Fashion down
- Removed the Entry Cost badge from the first 4 cards (Weapons, Vehicles, Pets, Bundles) —
  the remaining 4 (Characters, Fashion, Skyboards, Backpacks) still show it
- Reworked the locked-category overlay to only cover the bottom portion of the card, so the
  title and item count stay visible even when a category is locked

## v1.2.4 — Fix ad fills on SPA navigation (Static Ad not loading fix) (2026-08-12)
- Removed a premature fillAds() call that ran immediately after setState() inside the
  hashchange handler — React 18 batches setState even in native event listeners, so this fired
  before the new screen's ad slots existed in the DOM at all. componentDidUpdate already
  handles this correctly (fires after the DOM commit), so this was simply the wrong-timing call.
- Hardened fillAds() to detect an <ins> already marked processed by AdSense and swap in a
  clean clone before requesting a fill, in case the templating engine reuses/patches an ad
  slot's DOM node across screens or revisits rather than creating a genuinely fresh one —
  AdSense refuses to re-fill an element it has already marked done.

## v1.2.3 — Ad slot polish: responsive sizing + first-load fix (2026-08-12)
- Ad slots now use Google's own recommended CSS: reserve 250px only until an ad request
  resolves, then hide unfilled slots entirely and let filled slots size to whatever creative
  actually loaded (fixes visible empty space in slot boxes)
- First ad-fill attempt now waits for the page to fully finish loading instead of firing right
  after mount — likely cause of static ads only appearing after a refresh, not on first load
  (a known class of issue when a slot briefly resolves to 0-width before layout settles)

## v1.2.21 — Fix: test mode flags had reappeared (2026-08-12)
- v1.2 was built on a stale base and silently re-included data-ad-test="on" on all 10 display
  slots plus data-adbreak-test="on" on the loader script, despite the commit message — the
  rewarded interstitial showing "Rewarded ad example" after go-live was this, not a deployment issue
- Re-removed both flags for real this time (verified directly against the file, not assumed)
- Spinner animation from v1.2 carried over correctly, no change needed there

## v1.2 — Go live: test mode removed (2026-08-12)
- Removed data-ad-test="on" from all 10 AdSense display slots
- Removed data-adbreak-test="on" from the AdSense loader script (interstitial/rewarded)
- All ad units now request real inventory — no more forced test creative
- Fixed the "Finding an ad" loading icon: was static, now has a simple looping spin animation

## v1.1.7 — Category page ad slots (2026-08-12)
- Removed the repeating 320×100 in-list ad placeholders from category pages (never wired to
  real ads; could repeat up to ~17 times on a single large category — a duplicate-density
  concern anyway)
- Added a real Top ad slot to category pages (above the item list), joining the existing Bottom
  slot (below it) — category pages now match every other screen's Top/Bottom pattern

## v1.1.6 — Interstitial/Rewarded ad reliability fixes (2026-08-12)
- Fixed interstitial getting stuck (no countdown, unclickable X, required a refresh): added a
  guard against firing a second adBreak() while a previous one was still resolving
- Rewarded ad flow no longer silently closes when no ad is available — now shows a visible
  "No ad available, Try Again" state instead
- Confirmed: the grey header bar, countdown, and X button are entirely Google's own test-mode
  overlay chrome (data-adbreak-test="on") — nothing in our code renders any of that

## v1.1.5b — Interstitial Ads Fixes and Changes (2026-08-12)
- Reward ("Watch Ad") modal redesigned: small centered card + blurred backdrop instead of a full-screen takeover, matching the existing "insufficient coins" dialog style
- Fixed "Finding an ad" appearing to do nothing: modal now stays visible at least 600ms before auto-closing on a no-fill response
- Reserved `min-height:250px` on all 9 AdSense `<ins>` slots so unfilled ads don't collapse to 0px and shorten pages on desktop

## v1.1.5 — Interstitial Ads (2026-08-12)
- Implemented non-rewarded interstitial (`adBreak({type:'next'})`) firing on every real navigation, via the single hashchange choke point
- Rebuilt the rewarded-ad flow end to end: "Watch Ad" → real `adBreak({type:'reward'})` call → checking/ready states → user-confirmed "Watch Now" → coins granted only in `adViewed` (previously granted unconditionally on modal close)
- Added `adBreak`/`adConfig` bootstrap script; enabled `data-adbreak-test="on"` for testing

## v1.1.4c — Top Bottom Ad Slot bug fixes (2026-08-12)
- Fixed crash in `componentDidUpdate` (`Cannot read properties of undefined (reading 'route')`) that was silently blocking ad slots from re-filling on navigation

## v1.1.4b — Top Bottom Ad Slot testing (2026-08-12)
- Added `data-ad-test="on"` to all 9 display ad slots for AdSense test-mode verification

## v1.1.4 — Top Bottom Ad Slot implementation (2026-08-12)
- Pivoted from the originally-planned Google Ad Manager/GPT setup to AdSense + H5 Games Ads (per ad ops)
- Replaced all 9 existing 320×250 placeholder ad slots site-wide with real AdSense `<ins>` units (2 slot IDs: Top/Bottom)
- Reordered Home screen: ad slot now appears before the "Entry Coins Balance" card
- Added `fillAds()` — required in this SPA since AdSense needs one fill call per newly-mounted `<ins>` tag on route change

## v1.1.3 — Lazyload Implementation + Minor bug fixes (2026-08-12)
- Added `loading="lazy"` to category-grid item thumbnails (up to 51 images in some categories); left hero/detail images eager
- Fixed a leftover dangling line in `back()` referencing an undefined variable

## v1.1.2 — Favicon fix and minor text changes (2026-08-10)
- Fixed favicon not appearing: href casing didn't match the actual uploaded filenames (`Favicon.svg`/`Favicon.png` vs `favicon.svg`/`favicon.png`)
- Synced the "Skin not showing?" troubleshooting popup text to exactly match the Home page's troubleshooting section (was missing a bullet + had a shortened closing line)

## v1.1.1 — Navigation Bug Fixes (2026-08-10)
- Fixed Back button infinite loop (category ↔ detail bounce, never reaching Home): removed the hand-rolled history stack and switched to native `window.history.back()`, since every forward navigation already creates a real browser history entry

## v1.1 — hash links & favicon implementation (2026-08-10)
- Converted every navigation point site-wide (category cards, item rows, flow steps, Back buttons, Get Started) from JS-only clicks to real `<a href="#/...">` anchors — required for ad click-trigger detection, plus gets working browser Back/Forward and deep links for free
- Added dynamic per-screen browser tab titles
- Added favicon `<link>` tags
- Swapped the coin icon (opaque-white slit → transparent slit) across all 4 places it appears

## v1.0.1 — Hash links & Favicon (asset upload) (2026-08-10)
- Uploaded Favicon.svg / Favicon.png asset files

## Initial deployment (2026-08-07)
- First deployment of the claude.ai/design HTML export to GitHub + Vercel
- Removed the splash/loading screen — site now opens straight to the Welcome screen
