# 日程組 引き継ぎメモ

## 運用方針 (2026-09-23 ユーザー指定)

「マージ」は、指示対象の変更をマージし、GitHubへのpush・本番反映・公開サイトでの動作確認まで行う意味です。ソースのマージだけで止めないこと。別途保留中の変更は含めず、以下の本番DB互換性の制約を守って反映します。

## オーナーとの約束（Claude の記憶の写し）

PCが壊れると Claude の記憶（各PCの `~/.claude/projects/…/memory/`）も消えるので、ここに写しておく。新しい環境では作業の前に必ず読む。

- 「マージ」は、main と release の両方を fast-forward して push し、release の作業ツリーで `npm run deploy`、公開サイトで確認し、このファイルに記録するところまで。本番に出すのは「マージ」と言われたときだけ。
- 返事は日本語で、結論を先に短く。「君はどう思う」と聞かれたら、正直な意見と理由を短く言う。長い説明や表を並べた比較は「よくわからない」と言われた。
- 画面の説明文は短く平易に。1文に1つの内容。決まりは「26時は 02:00 と入力します」のように具体例で書く。似た機能を別々の場所に並べない。
- オーナー自身が出した案（機能）は、代案やまとめる提案のときも勝手に消さない。消すならその機能名を挙げて確かめる（2026-09-30 と 2026-10-07 に失敗した）。
- オーナーが見せてくれた利用者のイベントの文面（スクリーンショット・凡例・説明文・名前）を、画面の例・テスト・コミットメッセージ・このファイルに使わない（「ページ見たことがばれる」）。例は自分で作り、push の前に検索して確かめる。
- 共有リンクのプレビューは文字だけ。大きな画像（og:image）は付けない（「きもすぎる」）。宣伝っぽい目立つ要素を足さない。
- 見た目の確認には `/e/ohbcvs2j` を使う。確認用URL（プレビュー）も本番DBにつながっているので、手で保存すると本物のデータになる。
- 運営者の個人メールアドレスはどこにも載せない（リポジトリは公開）。問い合わせは Google フォーム。
- `.env.local` の値は公開しない・Git に入れない。秘密の値は `npx wrangler secret put` で入れる。Vercel のアカウント・プロジェクトは消さない（旧URLの転送に使っている）。
- main は DB 移行が済むまで本番に出さない（main の `npm run deploy` は最初の `check:database` で止まる）。

## 2026-10-24: The Vercel Address Redirects Straight To nitei.pages.dev

The owner asked for it (「やれ」). https://nittei-app-five.vercel.app now answers 301 to the same path on https://nitei.pages.dev (one hop instead of two through the Workers address); `robots.txt` (allow all, sitemap on nitei.pages.dev), `favicon.ico` and `icon.png` are still served there. Deployed to the Vercel project `tghcgus-projects/nittei-app` as production deployment `nittei-kzyhwoafo-tghcgus-projects.vercel.app` (Ready) with Vercel CLI 63.1.2, logged in on this PC as tghcgu through the device login. It was not built from the repo: a folder holding only the repo's `vercel.json` plus `"framework": null, "installCommand": "", "buildCommand": "", "outputDirectory": "public"` and a `public/` with those three files (the project preset is Next.js, so these overrides skip the build). Remove the `.env.local` that `vercel link` downloads before deploying. To undo, use Instant Rollback in the Vercel dashboard. Change of Address from the Vercel property to nitei.pages.dev passed on 2026-10-27, three days after this direct redirect (before, with the hop through workers.dev, it failed). From the Workers property it still fails: on 2026-10-27 a log tail of the old Worker, checked alive before and after, showed no request at all from Google during the check. Every check that involved workers.dev failed (July: Vercel to workers.dev for months; October: workers.dev to nitei.pages.dev), so the tool cannot be used for the Workers address; the 301 redirects move its search results instead.

## 2026-10-23 (2): The Move Notice Says The URL Has Changed

The owner shortened the notice (「ドメインが変更になりました で良くないか」「urlのほうがいいか」): it now reads 「URLが変更になりました。ブックマークを登録し直すことをお勧めします。」 ("The URL has changed. We recommend updating your bookmarks."). Source `ui/domain-wording` → main `112c830`; `preview/domain-wording` → release `f71a89e`; the notice and English specs passed.

**Production is live:** Pages deployment `134c3cb0-a4ff-4074-b8f6-e37a37f4977a` and the old-address Worker `cbda9fbe-587e-4320-91b1-78ed2759322e` (same code), at 2026-10-23 12:27 UTC. `features.mjs` 66/66, `sweep.mjs` found no problems. Before this: Pages `c29a8726-4d7a-4b19-b1c5-ef04a7b4d47c`, Worker `12632a05-a62e-4868-8115-ff936731b07c`.

## 2026-10-23: Serif Titles Again; Notice About The New Address

The owner asked for a closable notice at the top recommending to bookmark the new address again (「urlが変更になったからブックマークをし直すことをお勧めする知らせを上に」「×で消せるようにもして」「お勧めします的な文言がいい」), and for the home title and event names to use the earlier typeface with today's colors (「これらの字体以前の物に戻して色はそのまま」).

- `app/SiteLayout.tsx` shows `.move-notice` at the top of every page. `app/MoveNoticeClose.tsx` closes it and stores `nittei-move-notice` in localStorage; `themeInitScript` sets `html[data-move-notice="closed"]` before the page is drawn, so a closed notice never flashes. Page content and the theme button sit in a `relative` wrapper below the notice. Tests run as a visitor who closed it (`storageState` in `playwright.config.ts`); `tests/move-notice.spec.ts` starts without it.
- The home title (`.home-brand-name`) and event titles (`.event-title`: the h1 and the results h3) are `font-serif` at normal weight again, as before 2026-09-18/20; the monochrome colors and bands stay.

Source `ui/move-notice` → main `7c80132`; `preview/move-notice` → release `371507a`. Full suites 123 of 123 on both; after the last wording change the notice and English specs passed.

**Production is live:** Pages deployment `c29a8726-4d7a-4b19-b1c5-ef04a7b4d47c` and the old-address Worker `12632a05-a62e-4868-8115-ff936731b07c` (same code, redeployed by `npm run deploy`), at 2026-10-23 07:23 UTC. `features.mjs` 66/66 (the first run once waited 30s for the event page after a reload; four reloads by hand and the rerun were fine), `sweep.mjs` found no problems. Before this: Pages `28fe1c1f-a87e-4c10-95f7-8badf7abf3b1`, Worker `864090d3-0477-4348-aedf-96e6a618d928`.

No SQL or Cron changes.

## 2026-10-22: The Site Moved To nitei.pages.dev; Every Page Is A File

The owner chose to stay on Workers Free and rework the site (「払いたくないなら、この作り替え」), asked for an urgent check and fix of the October 2026 vulnerabilities (「色んなのの脆弱性が出てるから至急チェック修正」), and chose the shorter address `nitei.pages.dev` with the old one redirecting (「nitei.pages.dev に使用」「元のurlからも飛ぶようにして」).

**Where things run.**
- The site is the Cloudflare **Pages** project `nitei` (production branch `production`): https://nitei.pages.dev. `next.config.ts` has `output: 'export'`; `npm run build` (`next build --webpack`, then `scripts/finish-export.mjs`) writes every page to `out/`, served as files (security headers from `public/_headers`). `scripts/cloudflare.mjs` adds `out/_worker.js` (it imports `custom-worker.mjs` and fills in the public Supabase URL and key from `.env.local`; never in Git) and `out/_routes.json`, so the Worker runs only for `/e/*`, `/en/e/*` and the Google verification file. For an event it reads the event and its dates from Supabase (waiting is not CPU time), adds the title and link-preview tags to the shared page `e/_` (`en/e/_`) and embeds the event as JSON; `app/e/[shareId]/EventLoader.tsx` renders from that JSON, or reads the event in the browser when the JSON is missing. Unknown events and URLs get `out/404.html` / `out/en/404.html` with status 404. Links into event pages must load the page (`<a>` or `window.location`). `next dev` cannot show event pages; use `npm test` or a preview.
- The previous address https://nittei-app.qoj.workers.dev is the Worker `nittei-app` (`wrangler.jsonc`, `REDIRECT_TO`). It redirects every page to the same place on the new address: 301 for search engines and link previews; browsers get a small page that carries the old address's saved data (`nittei-*`: page view history, settings, theme, edit keys) once in the URL fragment, which `app/SiteLayout.tsx` imports only when the visitor came from the old address (history merged, nothing else overwritten). The verification file is still served there. Pages runs no Cron, so this Worker also runs the daily cleanup (`scheduled`, with the `SUPABASE_SERVICE_ROLE_KEY` secret).

**Why.** Next.js on the server (OpenNext) used 20-600ms of CPU per request against the Workers Free limit of 10ms, and production hung twice (2026-10-18/19; see the next entry). Every server-side Next.js and React advisory of October 2026 (next/og RCE, image-optimization SSRF/RCE, cache poisoning, the React Server Functions CPU DoS CVE-2026-23870, the `use cache` RCE, the Server Actions DoS) needs a Next.js server, which production no longer has. The site used none of next/og, `use cache`, Server Actions or middleware.

**Versions.** Next.js 16.4.2 and React 19.2.9 (pinned exactly), wrangler 4.151, OpenNext removed, `npm audit fix` for the rest. `npm audit` still lists `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`: lint tooling only.

**Deploying.** `npm run deploy` (release worktree) = build, `wrangler pages deploy out --project-name nitei --branch production`, then `wrangler deploy` of the old-address Worker with `SUPABASE_URL` (for the cleanup). `npm run preview -- NAME` uploads only a Pages preview, https://NAME.nitei.pages.dev. Never run `wrangler pages project create` in a folder with `wrangler.jsonc`: wrangler 4.151 hands it to Workers and published that folder as a new Worker (`nitei.qoj.workers.dev`, deleted again on 2026-10-22); the Pages project had to be created with `--force` from an empty folder. `CRON_SECRET` is unused.

**Tests.** `tests/server.mjs` builds the export against the fixture database and runs the same Worker with `wrangler dev` (`wrangler.test.jsonc`). New: `tests/worker-cleanup.spec.mjs`, `tests/move-address.spec.mjs` (redirects, carrying saved data, refusing crafted links). On this Windows PC, `wrangler dev` sometimes drops a connection and Node once crashed with 0xC0000409; such a test passes when rerun alone. Full suites: release 120 of 121 (`tests/results-toolbar.spec.ts` en failed once in the full run and passed 8 times alone), main 121 of 121.

Source `fix/static-site` → main `931e7ce`; compatible `preview/static-site` → release `443a437` (legacy columns without `edit_protected`, plain Supabase client in EventLoader).

**Production is live:** Pages deployment `28fe1c1f-a87e-4c10-95f7-8badf7abf3b1` on https://nitei.pages.dev and the old-address Worker `864090d3-0477-4348-aedf-96e6a618d928`, at 2026-10-22 06:01 UTC (15:01 JST). Checked right after the deploy: `scripts/production-checks/features.mjs` 66/66 OK, `sweep.mjs` found no problems, a real browser opening the old address landed on the same page with page view history and the theme carried once (and plainly the second time), and `wrangler tail` showed the Pages Worker at 0-6ms CPU (median 2ms over 28 event-page requests) and the old-address Worker at 0ms, every outcome ok and no exceptions. Search Console: the Change of Address check failed twice with 「ページを取得できませんでした」 for the old homepage, /privacy and /en; during the second check the log tail showed no request from Google to the old address at all. A URL Inspection live test of the old homepage (06:13 UTC) got the 301 and fetched the new homepage (crawl allowed, fetch successful), so the redirect itself works; the owner also requested indexing of the old homepage. The tool fails the same way from the Vercel address (it never passed for the July move to the Workers address either), yet Google moved the search results to the Workers address through the redirects alone, so the tool is not needed. Before this, production was Worker `a09b625f-07ab-4e6d-a6d5-004cdadbd10e` (October 9, OpenNext) at the old address; rolling back to it brings the server-side Next.js back, so prefer fixing forward. To undo only the redirect, roll the Worker back with `npx wrangler rollback`.

**Owner tasks.** Search Console: the property https://nitei.pages.dev was added and verified on 2026-10-22 (the meta tag and `/googlecc8378481687d5f8.html`). Still to do: submit `sitemap.xml`. Change of Address is not needed (see above). `vercel.json` now points at nitei.pages.dev, but Vercel Git deploys are off, so the old Vercel URL still redirects through the old Workers address (two hops) until someone runs a Vercel deploy.

No SQL or Cron schedule changes.

## 2026-10-18/19: Release Rolled Back Twice — The Workers Free Plan CPU Limit

**Superseded on 2026-10-22: instead of Workers Paid, the site was reworked so that every page is a file (entry above) and moved to nitei.pages.dev. This entry explains why.**

What happened. The new work was deployed twice: Worker `e07f53fd-1066-4933-baa5-533ee9a50041` (Next.js 16.3.8) on 2026-10-18 13:22Z, rolled back about 15 minutes later, and Worker `b501a30e-693e-47d6-95cc-8de62c01ce1d` (the same work on Next.js 16.3.4) on 2026-10-19 07:49Z, rolled back at 09:32Z. Both times, after the production check scripts had opened many pages in a row, about one request in three hung: 2-5ms of CPU, no answer, cancelled when the client gave up, and "waitUntil() tasks did not complete". `wrangler tail` on the second attempt showed the cause: first `exceededCpu` (503, "Worker exceeded CPU time limit") at exactly 10ms of CPU, then the hangs. The account is on Workers Free, whose limit is 10ms of CPU per request; an isolate may run over it now and then, but when it keeps doing so, requests are cut at 10ms (https://developers.cloudflare.com/workers/platform/limits). This Next.js site uses far more (October 9 Worker: median 23ms, p90 212ms; the new work: median 45ms, p90 365ms, measured at different colos), so it only works on that tolerance. A request cut off mid-way seems to leave the isolate stuck, and later requests there hang until it is recycled. Preview URLs and a 0% version reached with `Cloudflare-Workers-Version-Overrides` did not reproduce it with light traffic. The October 9 Worker is at the same risk under a burst of visitors.

Fix: the owner moves the account to Workers Paid (5 USD a month; Cloudflare dashboard → Workers & Pages → Plans), where the default limit is 30 seconds. Then deploy the release branch, run both production check scripts, probe the top page a few dozen times, and watch `npx wrangler tail nittei-app --format json` for `exceededCpu` or long `canceled` requests, ready to roll back with `npx wrangler versions deploy a09b625f-07ab-4e6d-a6d5-004cdadbd10e@100% -y`. The already built candidate `b501a30e` can be deployed directly (`npx wrangler versions deploy b501a30e-693e-47d6-95cc-8de62c01ce1d@100% -y`) if the release branch has not changed. Note that the hang was not caused by Next.js 16.3.8 after all (16.3.4 hung too); `next` is pinned to exactly 16.3.4 now and can go back to 16.3.8 (its security fixes) once the site runs on Workers Paid.

What the new work contains (tested: full Playwright suite 114 on both branches; TypeScript and lint pass):
- Security headers from `next.config.ts` on every page (`frame-ancestors 'none'` and `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS) and no `X-Powered-By`; `public/_headers` adds `nosniff` to static files.
- The event edit form is disabled until the saved event has loaded (`<fieldset disabled>`).
- http(s) addresses in event descriptions are links (`app/LinkifiedText.tsx`).
- The .ics import settings are stored per event (`nittei-ics-<shareId>`), a changed setting shows under the buttons while the panel is closed (`data-ics-summary`), loaded calendars can be removed (「読み込んだカレンダーを外す」; a file with the same name replaces the earlier one), and changing a setting re-applies it to the loaded calendars at once.
- `.hit-area` gives small controls a 24×24px tap area without moving anything; result tables have `overflow-y-hidden`; the answers beside the form are a focusable `role="region"`.
- favicon.ico holds 16/32/48 only (49KB → 4KB); three unused translations are removed and `tests/assets.spec.ts` guards against new ones.
- The production check scripts check all of the above, abort any non-GET Supabase request (main's edit page sends a read-only RPC as POST: adjust that guard before main is released), and ignore console errors from Cloudflare's analytics beacon, which an ad filter on the checking PC may block.
- The release note for these changes is dated 2026-10-19; move it to the real release date when it ships.

## 2026-10-09: Busy Or Free Time Rules, And A Calendar-Free 「範囲で一括回答」

The owner asked for three things, agreed to a plan after asking for an honest opinion, and then asked for a review pass before merging.

**Import settings.** 「時間で記号を決める」 (formerly 「空いている時間で記号を決める」) has a switch, 「その時間が [空いていたら|埋まっていたら]」 (`icsRuleWhen`). Free rules list ◎ ○ △ and fall back to ✕ (「どれも空いていない日」); busy rules list ✕ then △ and fall back to ○ (「どれも埋まっていない日」). Each direction keeps its own times and fallback (`icsRuleInputs`, `icsFallbackValues`). `firstMatchingValue` in `lib/calendar.ts` (formerly `firstFreeValue`; type `WindowRule`, formerly `FreeWindowRule`) takes the direction. For busy rules, the symbol a hand-set date keeps is the first rule's symbol. The example line is chosen from the event's own symbols (three free variants, two busy ones), so a ○✕ event never sees ◎ or △ in it. All help lines in the rules share one font size: the 11px line rendered at about 16px on the owner's phone, which could not be reproduced in Chromium.

**「範囲で一括回答」 reads no calendar any more.** The old 「日付範囲 + 時間帯で一括回答」 and the 「カレンダーで一括回答」 block from October 7 became one block, 「時間で一括回答」 (`data-time-window`, shown only when some date has a time): 「[19:00]〜[23:00] に [かぶる日程|かぶらない日程] を [✕] にする」. It compares the window with each date's own time (`parseCandidateClockRange`, `clockRangesOverlap`, start-only times count as three hours), leaves dates without a time alone, and flips the usual symbol (✕ ↔ ○) when the switch changes. The calendar target, `hasCalendar` and `fillFromCalendar` are gone. Both 「適用」 buttons in the panel now print a result line (`bulkResultMessage`): how many dates were filled, how many answered ones 「入力済の行は変更しない」 kept, or that nothing matched — before, a press that changed nothing said nothing.

Tests: `tests/time-range.spec.ts` (rewritten), `tests/calendar-rules.spec.ts` (busy direction, examples), `tests/calendar.spec.ts` (`firstMatchingValue` both ways); `tests/calendar-window.spec.ts` was removed with its block. The release note for 2026-10-09 has three lines.

Source `fix/time-directions` → main `249c16e`; compatible `preview/time-directions` → release `82800c1`. TypeScript and `npx eslint .` pass on both. The full Playwright suite passes on release (103) and main (103).

**Production is live:** `npm run deploy` from the release worktree made Worker `a09b625f-07ab-4e6d-a6d5-004cdadbd10e` 100% at 2026-10-09T06:50:16Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `6a1fe389-4a9b-45ba-91c7-1163a8bf1752`. Production checks passed: both rule directions from a synthetic calendar, the range panel without any calendar text and with its result line, the update history, phone and PC layouts in the dark theme, all earlier checks, and a sweep with no errors.

No SQL, storage, Cron or runtime changes. The secure migration is still pending; rebuild the cutover Worker from current main when it happens.

## 2026-10-07 (later): One-Sentence Calendar Block Back In 「範囲で一括回答」

Right after the release above, the owner said they want to keep the time-based calendar block in 「範囲で一括回答」. It came back improved as 「カレンダーで一括回答」 (`data-calendar-window`), laid out to read as one sentence: 「[19:00]〜[23:00] に [予定がある日|予定がない日] を [✕] にする」. It acts only on the dates and weekdays chosen above in the panel (the difference from the import settings, which fill every date). Busy or free can be picked; switching flips the usual symbol (✕ for busy, ○ for free) unless the user chose another. With both times empty it checks the whole day; with only one time the button stays disabled. It reuses a calendar the import already loaded (`hasCalendar`, button 「カレンダーで適用」), or asks for a file first (「カレンダーを選んで適用」, `CalendarFillTarget` 'window'). Rows typed by hand stay while 「入力済の行は変更しない」 is on; rows the calendar filled are redone (`fillFromCalendar`). The October 7 release note now says 「空き時間で一括回答」 moved to the settings, and has a second line for this block. Test: `tests/calendar-window.spec.ts`.

Lesson: the owner's own idea (this block) was removed with their OK and missed within the hour. When consolidating, keep the owner's ideas unless they explicitly say to drop that exact thing.

Source `fix/calendar-window` → main `e07bb9f`; compatible `preview/calendar-window` → release `59d5030`. TypeScript and `npx eslint .` pass on both. The full Playwright suite passes on release (101) and main (101).

**Production is live:** `npm run deploy` from the release worktree made Worker `6a1fe389-4a9b-45ba-91c7-1163a8bf1752` 100% at 2026-10-07T11:14:39Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `b3d2d0f8-0b22-4a08-b588-cf23d760dd97`. Production checks passed: the one-sentence block in the range panel (busy all day on the first date turned to △ from the loaded calendar), the import settings, the update history, all earlier checks, and a sweep with no errors.

No SQL, storage, Cron or runtime changes. The secure migration is still pending; rebuild the cutover Worker from current main when it happens.

## 2026-10-07: Calendar Input Gathered In The Import Settings

The owner asked to bring back the free-time rules in an improved form, then to tidy up the two calendar blocks in 「範囲で一括回答」. A "time slots" design (busy in all, some or none of the slots) was tried on the branch first, but it cannot tell "day only" from "night only", and the owner preferred "if this time is free, use this symbol".

The settings of 「.ics / zip から自動入力」 now have a radio choice (`icsMode`). 'busy' keeps the old check at each date's own time, with the 予定あり／予定なし pickers. 'rules' gives each symbol except ✕ and − one or two time ranges, or 終日, checked from the top with `firstFreeValue` in `lib/calendar.ts`; a rule with two ranges applies when either is free, and dates where none is free get 「どれも空いていない日」. Rules mode without any time shows an error instead of importing. Every import judges from all calendars loaded on the page (`calendarPeriodsRef`), so events in different files add up. A date set by hand to the busy (or fallback) symbol keeps it, while dates the calendar filled are redone with the current settings (`calendarFilledRef`). Both calendar blocks (`data-busy-window`, `data-free-rules`) and their helpers (`fillFromCalendar`, `hasCalendar`, `CalendarFillTarget`) are gone, so 「範囲で一括回答」 is back to its form before September 30. The settings texts are short, with one made-up example (「◎ 1日OK、○ 夜だけOK、△ 遅れて参加」); the owner found it 「一瞬で理解できる」.

Never put wording from users' event pages into examples, tests, commit messages or this file: the owner pointed out that it shows the operator looked at those pages. A test added on October 3 had a description close to a real event's; it now uses a generic sentence, but the older text stays in Git history.

Tests: `tests/calendar-rules.spec.ts` (new), `tests/time-range.spec.ts` (the time-range test that used to sit in `free-rules.spec.ts`), and the unit test in `tests/calendar.spec.ts`. The release note is dated 2026-10-07.

Source `fix/calendar-slots` → main `18c155b`; compatible `preview/calendar-slots` → release `77cd3da`. TypeScript and `npx eslint .` pass on both. The full Playwright suite passes on release (99) and main (99).

**Production is live:** `npm run deploy` from the release worktree made Worker `b3d2d0f8-0b22-4a08-b588-cf23d760dd97` 100% at 2026-10-07T08:41:03Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `4dfab05d-b3c2-4739-b28b-92129b5f8513`. Production checks passed: the import settings in both modes, a synthetic calendar filled through the free-time rules, no calendar block left in 「範囲で一括回答」, the made-up example on screen and in the update history, all earlier checks, and a sweep with no errors.

No SQL, storage, Cron or runtime changes. The secure migration is still pending; rebuild the cutover Worker from current main when it happens.

## 2026-10-03 (later): Image Form, Text-Only Link Previews And Readable Results Description

Three changes shipped together.

**Images with inquiries.** The contact page links a second Google Form, `contactImageFormUrl` in `lib/site.ts`. The owner copied the text form and added a file-upload question. Google requires sign-in for uploads and records the sender's name, email address and photo; the contact page says so next to the button. The text form stays sign-in free. The privacy policy says the image form records the images and the sender's Google account details, and lists Google Drive next to Google Forms (the date stays 2026-10-03). The first form's installable on-submit trigger does not carry over to a copy. The owner was asked to turn on the copy's own 「新しい回答についてのメール通知を受け取る」, remove 「のコピー」 from its title, label the upload question in both languages, and allow only images up to 10 MB.

**Text-only link previews.** The owner found the large preview image in Discord embeds too loud. Pages no longer set `og:image` or `twitter:image`, `twitter:card` is `summary` again (as before September 30), `public/og.png` and `public/og-en.png` are deleted, and the 9/30 release note mentions only the home-screen icon. Comments in `app/SiteLayout.tsx`, `app/e/[shareId]/EventPage.tsx` and `lib/i18n/metadata.ts` record the decision. Links posted earlier may keep the old image in Discord's cache. The 略して日組 wording stays: the owner asked to remove only the image.

**Readable description in the results on PC.** On PC the results card fits its table (`lg:w-fit`), and the repeated event details used `contain: inline-size` so they never widened it. With no answers yet, the description wrapped at the heading's width (193px on a 1440px screen). The details now use `max-w-2xl` instead. They may widen the card up to 42rem, so lines break only where the author broke them unless they are longer than that. The tables keep their own width (`w-max`), and phones are unchanged. `tests/results-event-details.spec.ts` covers it, including a no-answers case at 1440px.

Source `fix/contact-images` → main `8304828`; compatible `preview/contact-images` → release `41ad52f`. TypeScript and `npx eslint .` pass on both. The full Playwright suite passes on release (99) and main (99). Preview alias `oct3` (Worker `54ea7a8e`) was checked first.

**Production is live:** `npm run deploy` from the release worktree made Worker `4dfab05d-b3c2-4739-b28b-92129b5f8513` 100% at 2026-10-03T10:20:35Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `fb9f7fa6-0e7a-493c-b68a-6fae8d6937f3`. Production checks passed: both contact forms in both languages, no email address, text-only previews on seven pages, the old images returning 404, the description at its natural width with no answers (512px instead of 193px) and wrapping at 672px for long lines, the earlier release checks, and a sweep with no errors.

No SQL, storage, Cron or runtime changes. The secure migration is still pending; rebuild the cutover Worker from current main when it happens.

## 2026-10-03: Contact Form Released And Viewing Time Restored

The owner wanted the page-viewing time back in the page information, so the October 1 removal was reverted.

Inquiries now go to a Google Form, `contactFormUrl` in `lib/site.ts`. The owner made it from a short Apps Script: no sign-in, no email collection, five questions, and an installable on-submit trigger that emails each submission to the owner. File upload was left out on purpose, because it would force every sender to sign in to Google. The operator's personal address is no longer published anywhere: it is gone from the contact page (both languages), README, the maintenance page in `custom-worker.mjs`, and this file. Earlier commits in the public GitHub repository still contain it. The owner was told that making the repository private, or replying from a separate address, would close those gaps. The privacy policy lists the form under collected information and external services, the terms mention it, and both are dated 2026-10-03. `tests/contact.spec.ts` checks the form link and that no address or mailto appears.

Source `fix/restore-viewed-time` → main `318e4c0`; compatible `preview/restore-viewed-time` → release `d88eeab`. TypeScript and `npx eslint .` pass on both. Related tests pass on both, release 16 and main 16: contact, English, updates, spacing and service-share.

**Production is live:** `npm run deploy` from the release worktree made Worker `fb9f7fa6-0e7a-493c-b68a-6fae8d6937f3` 100% at 2026-10-03T01:12:29Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `3a8c16ad-6fd7-492d-a0fc-fbd6d5efb455`. Production checks passed: the form link in both languages, no email address on any of 19 public URLs, the policy wording and dates, the four-line info block, all earlier checks, and a sweep with no errors.

No SQL, storage, Cron or runtime changes. The secure migration is still pending; rebuild the cutover Worker from current main when it happens.

## 2026-10-01: Copy Totals And Viewing Time Removed

The owner decided the totals-as-text button added on September 30 is not needed, so it was removed with its translations, test, README lines and release-note line. The page-information block no longer shows the time the page was opened; it keeps created, last updated and the response count. This came from a clutter review. Other candidates were offered and left unchanged: grouping the tools above the answer list, repeating the event description in the results, the general-note position switch, the home page's jump-to-top/bottom buttons, and the long calendar-settings text.

Source `fix/remove-copy-totals` → main `eb8532e`; compatible `preview/remove-copy-totals` → release `78a7ef9`. TypeScript and `npx eslint .` pass on both. Related tests pass on both: spacing, service-share and the info-block checks. `service-share.spec.ts` needed `--timeout=240000` because the machine was heavily loaded (OBS and other apps); all tests ran 4-5x slower than usual.

**Production is live:** `npm run deploy` from the release worktree made Worker `3a8c16ad-6fd7-492d-a0fc-fbd6d5efb455` 100% at 2026-10-01T06:30:05Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `4b989880-dc91-40ca-83fe-d99df6e48995`. The September 30 checks were rerun on production and all passed: the copy button is gone, the info block has the three remaining lines, the update history no longer mentions copying, and a full sweep found no errors or overflow.

No SQL, storage, Cron or runtime changes. The secure migration is still pending. The Worker prepared on September 30 (`ceb357aa`) still contains both removed items, so do not promote it; rebuild and upload from current main right before the cutover.

## 2026-09-30: Calendar Bulk Answers And Polish Released

Requested by the owner and shipped together.

**Calendar bulk answers** (bulk panel on the response page). Parsed events are now kept in memory for the page (`calendarPeriodsRef`; never stored or sent) and add up across several files. Two blocks use them. "カレンダーの空き時間で一括回答" takes one time window per symbol and gives each date the first symbol, from the top, whose window has no overlapping event (`firstFreeValue` in `lib/calendar.ts`). This matches legends such as "◎ all day / ○ 20:00-24:00 / △ 23:00-26:00 / ✕ none". "カレンダーの予定がかぶる日を一括回答" is the single-window operation the owner first described: dates with any event in the window take one symbol (`overlapsWindow`). An end at or before the start is the next day, so 26:00 is entered as 02:00. Both respect the panel's date range and weekday filter. Rows the calendar filled are tracked in `calendarFilledRef` and are redone even when "keep existing answers" is on; rows changed by hand are kept. The single hidden file input serves the import button and both blocks through `icsTargetRef`.

**Existing time-range block.** It is hidden when no candidate has a time, where it could never match. A candidate with only a start time now lasts `OPEN_ENDED_HOURS` (3h), the same as the calendar import, instead of being a single instant.

**Other changes.** A button under the results copies the per-date totals as text. The dark theme gives the selected ✕ a dark fill (it was light on light, 1.15:1), and weekend dates use `text-rose-700` / `text-blue-600` (they were 2.5-2.7:1). Each language has a not-found page, and a `[...rest]` catch-all per language sends unmatched URLs to it; no experimental flag is used. `public/` now holds `og.png`, `og-en.png`, a 512px `icon.png`, `icons/icon-192.png` and `apple-touch-icon.png`, referenced through `shareImage` and `appIcons` in `lib/i18n/metadata.ts`; `app/icon.png` (765KB, served by the Worker) was removed, and the Twitter card is `summary_large_image`. The update history and README list the changes.

Source `feat/free-window-rules` → main `f1730f3`; compatible `preview/free-window-rules` → release `c0f7c7b`. Preview: https://calendar-rules-nittei-app.qoj.workers.dev (Worker `f1bc5a0a-5dfd-404a-9b2e-c12abef01b3a`, before the final help-text rewording). Release passed all 97 tests. Main passed 95 of 97 in the full run; the two `spacing.spec.ts` failures happened while a webpack build and a browser check ran at the same time ("session closed"), and all four spacing tests passed when rerun alone. TypeScript and `npx eslint .` pass on both.

**Production is live:** `npm run deploy` from the release worktree made Worker `4b989880-dc91-40ca-83fe-d99df6e48995` 100% at 2026-09-30T10:18:31Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `b9ead445-7f33-46e8-bb88-75aff0cc6661`. Read-only production checks passed: routes, static images, link-preview tags and manifests in both languages, 404 pages, both calendar blocks with a synthetic calendar (nothing submitted), copied totals, contrast, the September 25 checks, and a sweep of 8 pages × 4 widths × 2 themes with no errors or overflow.

When checking exit codes in a loop, capture `$?` into a variable first. `echo "$(basename $d) EXIT=$?"` always prints 0 because the command substitution runs first.

No SQL, storage, Cron or runtime changes. The secure migration is still pending; the owner has the SQL steps. The matching Worker for that cutover was rebuilt from main `db21e6d` and uploaded without promotion: `ceb357aa-04e0-4863-ad56-0274f628fce2` (preview alias `secure`). The one prepared on September 25 (`008f8cf1`) predates these changes; do not promote it.

## 2026-09-25: Improvements Batch Released

Five changes shipped together. (1) English result labels are shorter ("Pin", "Notes", "Below"), so the English phone row fits from 339px; Japanese fits from 360px. (2) A head script in `SiteLayout` catches failed `/_next/static` script or stylesheet loads and chunk-load rejections. It lets pages save drafts through the existing language-switch event (`lib/draft-events.ts`) and then reloads once. A second failure within a minute leaves the page alone, and a failed draft save cancels the reload silently. This addresses the old-chunk errors after deploys recorded below. (3) `public/_headers` makes hashed `/_next/static/*` files `public,max-age=31536000,immutable` instead of `max-age=0`, as OpenNext recommends. (4) The Playwright expect timeout is now 15s, because `next dev` compiles routes on first visit and the earlier flakes (`retry.spec`, `reliability.spec`) were 5s waits under load. (5) `lib/updates.ts` gained the missing 2026-09-23 and 09-24 releases plus this one, with translations.

Source `fix/improvements-0925` → main `44e72a3`; compatible `preview/improvements-0925` → release `7024849`. Both suites passed 78/78, and lint and TypeScript passed on both. The new `tests/stale-chunk.spec.ts` fails without the head script (the page stays broken) and passes with it. **Production is live:** `npm run deploy` from the release worktree made Worker `b9ead445-7f33-46e8-bb88-75aff0cc6661` 100% at 2026-09-25T05:08:56Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `f9a7a0f2-7dac-436f-b910-b300778cddc2`. Production checks passed: 14 routes returned 200 (`/_headers` is 404, i.e. not served); the chunk cache header, the head script and both update pages were present; phone rows fit as above. A missing chunk reloaded once and kept an unsaved name without submitting it.

**Local verification note:** AdGuard on this PC now injects `local.adguard.org` scripts into HTML that Chromium receives. That makes React report #418 on every page, including older Workers, and blocks the Cloudflare analytics beacon. When HTML is fetched outside the browser (Playwright `route.fetch()` + `fulfill`), every page has zero errors. Use that bypass for public checks from this machine; the site itself is unaffected.

Cleanup: 10 merged `fix/`, `ui/` and `preview/` branches were deleted from GitHub and locally. Unmerged `ui/desktop-create-layout`, `preview/desktop-create-layout` and the April Vercel branch remain. Seven leftover test events (`wfp93t1l d8nnw6td 1a0h9a3g uj5po2hk h486fas8 8mb5pefz y3p2xd0i`) cannot be deleted with the publishable key under the legacy RLS; they are to be removed in the SQL Editor during the cutover. `pje8ct2z` (" fdvs", two responses) may not be a test event and was kept.

No SQL, storage, Cron or runtime changes. The secure migration is still pending.

## 2026-09-24: Compact Results Controls Released

At the user's request, "↑ Respond" moved beside the "Everyone's responses" heading and now uses the same quiet style as "↓ Everyone's responses" near the top of the page (`rounded-lg bg-white/50 px-2 py-0.5 text-xs`). On phones the remaining controls (Totals, Pin headers, Across/Down, General notes) use 11px text, 3px padding and 2px gaps. The Japanese row fits without scrolling from 360px; only 320–350px still scrolls sideways. English labels are longer, so that row still scrolls below 450px. From 640px the controls keep their previous sizes and the wrapping from the release below. The controls row now renders only when there are responses.

Source `fix/results-controls-compact` (`d1e0b8c` plus this record), based on main `4c24aad`. Compatible `preview/results-controls-compact` (`11078ff` plus this record), based on release `6bbcc0a`. Preview: https://compact-controls-nittei-app.qoj.workers.dev/e/ohbcvs2j (English: /en/e/ohbcvs2j), Worker `0c2d35c5-1281-4f9c-a0f6-d8bdeac170a2`. Both were fast-forwarded into main `aad0e36` and release `a9b1c02` and pushed.

**Production is live:** `npm run deploy` from the release worktree made Worker `f9a7a0f2-7dac-436f-b910-b300778cddc2` 100% at 2026-09-24T04:31:46Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `44cc0d87-f81a-499f-87d8-fb635237ca98`. Afterwards all 11 public routes returned 200. The 320–1440px header measurement on production matched the preview. A sweep of 8 pages × 4 widths × light/dark found no page errors or overflow. All checks were read-only.

`tests/results-toolbar.spec.ts` now also checks that the answer link shares the heading line and that the Japanese phone row does not scroll from 360px. main's reliability check now covers the whole results header. Release passed 30 related tests and main 22, plus lint and TypeScript on both; webpack and OpenNext also passed. The preview was measured every 10px from 320 to 1440px in dark mode for both languages. It showed no page overflow, one control row on phones, the answer link beside the heading at every width, and no page errors.

No SQL, storage, Cron or runtime changes. Do not deploy main to the legacy DB or merge legacy storage back into main.

## 2026-09-24: Results Toolbar Wrap Released

From 640px the results controls sat beside the "Everyone's responses" heading on one row that could not shrink. After the general-note toggle joined them, production pages widened to 896px at 640–890px in English and 713px at 640–710px in Japanese (iPad portrait, landscape phones, narrow windows). The controls now shrink and wrap beside the heading from 640px. Phones keep the single sideways-scrolling row requested on 2026-08-30. main's all-width wrap from `d468305` was replaced with the same markup so both branches match; its reliability test now checks that each phone control is reachable by scrolling that row.

Source `fix/results-toolbar-wrap` (`65d5df1` plus this record), based on main `6d31e66`. Compatible `preview/results-toolbar-wrap` (`c6e3239` plus this record), based on release `a04418b`. Preview: https://toolbar-wrap-nittei-app.qoj.workers.dev/e/ohbcvs2j (English: /en/e/ohbcvs2j), Worker `dcb1f29d-5a6f-4b28-8e77-db228f986267`. Both were fast-forwarded into main `9679915` and release `2a69d1a` and pushed.

**Production is live:** `npm run deploy` from the release worktree made Worker `44cc0d87-f81a-499f-87d8-fb635237ca98` 100% at 2026-09-24T03:23:09Z; `wrangler deployments status` confirmed it. The previous compatible Worker is `703681c5-ce0e-49c1-b8fd-34013c652312`. Afterwards all 11 public routes returned 200. The same 320–1440px sweep on production matched the preview: no overflow, one row on phones, and wrapping only at 640–890px (EN) and 640–710px (JA). A sweep of 8 pages × 4 widths × light/dark found no page errors or overflow. All checks were read-only.

The new `tests/results-toolbar.spec.ts` failed on the unfixed release (713px / 896px at 640px) and passes after the fix. Full suites: release 74/75 and main 74/75. The single failures were `retry.spec.ts` before-answers during a concurrent webpack build and `reliability.spec.ts` ja at the edit-link navigation step; both passed when rerun alone. Lint, TypeScript, webpack and OpenNext passed. The public preview was measured every 10px from 320 to 1440px in both languages and themes. It showed no page overflow, one row on phones, two lines only at 640–890px (EN) and 640–710px (JA), and no page errors or DB writes.

No SQL, storage, Cron or runtime changes. Do not deploy main to the legacy DB or merge legacy storage back into main.

## 2026-09-24: Compact Result Names Released

The latest screenshot identifies excess horizontal space around wrapped respondent names, not gaps between answer rows. Vertical results now measure centered text lines in one batched layout effect and shrink each name label to its rendered width, keeping the existing wrapping and font size. Name edits and orientation changes remeasure the labels. Short names remain compact; notes and edit controls can still determine the minimum column width. A screenshot-like two-line Japanese/English name shrank from roughly 176px to 127px without adding lines. Horizontal orientation and the response-input comparison table are unchanged.

Source `fix/compact-result-names`, application `7b872c4`, based on main `7d06c3b`. Legacy-compatible `preview/compact-result-names`, application `cf0207a`, based on release `f1c3bc7`. Preview: https://compact-names-nittei-app.qoj.workers.dev/e/ohbcvs2j (English: /en/e/ohbcvs2j), Worker `703681c5-ce0e-49c1-b8fd-34013c652312`. Both were fast-forwarded into main `3883795` and release `ea972b0` and pushed.

**Production is live:** Worker `703681c5-ce0e-49c1-b8fd-34013c652312` was promoted to 100% at 2026-09-23T15:45:05Z (September 24, 00:45 JST), about ten minutes after this entry was first written as preview-only. The record was corrected on September 24 after `wrangler deployments status` showed the mismatch. A read-only production sweep that day returned 200 for all 11 public routes and found zero page errors across 8 pages × 4 widths × light/dark; it also found the results toolbar widening the page at 640–890px in English and 640–710px in Japanese, which is being fixed separately.

The final focused source tests passed for both languages, plus scoped lint and TypeScript. Compatible verification passed all 10 name/notes tests, scoped lint, webpack (including TypeScript) and OpenNext. Tests include 320/390/1440px, light/dark, counts on/off, mixed-direction and long names, unchanged line counts, edits to short and long names, and orientation switching. Public preview verification passed 24 name-width combinations and 24 note-placement combinations, with zero page errors and zero DB writes. Mobile and desktop screenshots were visually checked. The public preview shares production data, so manual saves are real.

The version was uploaded with `wrangler versions upload --keep-vars` and later promoted. The previous compatible Worker is the general-notes Worker `fe320559-2547-486d-acd6-3f44236744a3`; its rollout and recheck are recorded below. No SQL, storage, Cron or runtime changes, and no held desktop layout. Do not deploy main to the legacy DB or merge legacy storage back into main.

## 2026-09-23: General Note Position Released

Added a compact "General notes: By name / Below table" segmented control beside the existing results controls, in both languages. Default is the existing by-name display. Below-table mode renders nonblank response-level notes once, with respondent names, outside the horizontal scroller. Per-date notes remain in their answer cells; response input, edit permissions and DB writes are unchanged. Long words and explicit line breaks wrap; the list does not determine table/panel width. Existing table preferences remain compatible and the new `notes: 'name' | 'bottom'` preference is remembered on the device, with fallback when storage is unavailable.

Source branch `ui/general-note-position`, application `04ee769`, based on main `fca5cbb`. Compatible branch `preview/general-note-position`, application `e9fedcc`, based on release `5ca6307`. On September 23 these were fast-forwarded separately into main `7d06c3b` and release `f1c3bc7`, and both were pushed. Preview: https://general-notes-nittei-app.qoj.workers.dev/e/ohbcvs2j (English: /en/e/ohbcvs2j), Worker `fe320559-2547-486d-acd6-3f44236744a3`.

Source verification: 20 related Playwright cases passed; after a final bullet-indent adjustment, the two multilingual geometry tests passed again. Source lint and TypeScript passed. Compatible final build: 13 note/JA/EN workflow tests, scoped lint, webpack (including TypeScript) and OpenNext passed. Tests cover both orientations, light/dark themes, mobile/desktop widths, long names/notes, line breaks, empty notes/results, old/invalid/blocked storage, reload/language persistence, keyboard use, unsaved input preservation, and updating/clearing a note.

The public preview passed 24 locale/width/theme/orientation combinations at 320/390/1440px using seven existing notes, with no page errors or DB writes. It also passed reload and keyboard checks. Screenshots were visually inspected. Public validation is read-only; the preview shares production data, so manual saves are real.

**Production is live:** the verified Worker `fe320559-2547-486d-acd6-3f44236744a3` was promoted to 100% at 2026-09-23T05:30:10Z. The previous compatible Worker is `fcf0e160-27e2-47bf-9282-a69e6b5e4a98`. The first production check encountered an old-chunk loading error; a fresh-context repeat was started but its final output was lost on interruption. On September 24 the unchanged read-only check was rerun successfully: all 24 combinations, reload and keyboard checks passed, with seven notes, zero page errors and zero DB writes. Deployment status still confirmed the notes Worker at 100%. The underlying intermittent old-chunk/CPU-limit issues are not fixed by this verification.

No SQL, Cron, variables or runtime changes were made. The held desktop layout is excluded. The secure migration remains pending: never deploy main to the legacy DB or merge legacy storage back into main.

## 2026-09-23: Compact Home Header Released

The header-only change was implemented on `ui/compact-brand-header` (application `26b37b3`, based on main `9bc4aad`) and the legacy-compatible `preview/compact-brand-header` (application `c50f17e`, based on release `8769c65`). On 2026-09-23, these were fast-forwarded separately into `main` and `release/ui-20260910`, preserving their different storage implementations. After the user clarified that "merge" includes production rollout, the verified compatible Worker was promoted unchanged. Preview: https://brand-header-nittei-app.qoj.workers.dev/ (English: /en), Worker `fcf0e160-27e2-47bf-9282-a69e6b5e4a98`.

The create/edit header uses a monochrome bold 26px brand, a small Japanese alias, and matching 32px theme/bottom controls. The regular introductory sentence is removed; loading/editing status remains. The theme control remains absolute and scrolls away. Form layout, event headers, storage and input behavior are unchanged. The preview is 54px shorter on mobile and 50px shorter at desktop widths.

Source verification: 8 header/spacing/JA+EN workflow cases and 12 calendar-drag cases passed, plus lint and TypeScript. Compatible preview: 8 header/spacing/JA+EN workflow cases, lint, webpack (including TypeScript) and OpenNext builds passed. Read-only public checks passed in 24 locale/width/theme combinations (320/390/640/768/1440/1920px), comparing unchanged form dimensions and relative control positions against production. Bottom/top navigation, keyboard activation, non-sticky theme control and four existing-event page loads passed; page errors and DB writes were zero. Public mobile/desktop screenshots were visually inspected.

**Production is live:** https://nittei-app.qoj.workers.dev/ now serves Worker `fcf0e160-27e2-47bf-9282-a69e6b5e4a98` at 100% (application `c50f17e`), confirmed by deployment status. The previous compatible Worker is `6c578af4-d8c3-442a-b632-dd01f23f0ea9` (application `fb8372c`). Production passed the same 24 header/form comparisons against that previous version, four existing-event page checks, and all eight mouse/touch calendar-drag cases. No page errors or DB writes occurred. Production screenshots were visually inspected.

The already-built preview was promoted with `wrangler versions deploy`; no application rebuild, SQL, Cron, variable or runtime-limit changes were needed. The preview shares production data, so manual saves are real. Existing CPU-limit concerns remain unresolved; passing these checks is not a runtime remediation.

The desktop two-column experiment remains on hold on `ui/desktop-create-layout` / `preview/desktop-create-layout`, preview https://desktop-form-nittei-app.qoj.workers.dev/ (Worker `84fb691e-1240-48f4-b001-da04f6645260`). It is **not included** in this header trial. Do not deploy main to the legacy DB or merge legacy storage back into main; the coordinated secure SQL migration is still pending.

このファイルは、新しいAIチャットや別の開発環境にこのプロジェクトを引き継ぐためのメモです。
秘密情報は書かないでください。

## 2026-09-19: 白黒のイベント名と最多候補日の色付け

現在の本番は `release/ui-20260910` の `fb8372c`、Worker `6c578af4-d8c3-442a-b632-dd01f23f0ea9` (100%)。mainの対応変更は `7633713`（見出し）と `0c6f977`（色付け）。直前の互換Workerは `73d53d34-ea4c-41e2-81bd-195e2ac78c37` です。

上部と「みんなの回答」のイベント名を、白黒の太字と上下・左の細い枠に変更しました。サービスロゴは変更していません。上部の見出しは1行30px、回答一覧の見出しは22pxで、説明の改行や内容に合わせた表幅を維持します。ユーザー確認に基づき、◎と○の合計が最多の候補日を自動で色付けし、該当する正数の集計も赤く強調します。同率は全て対象、全日0人なら対象なし。集計OFFでも日付の色は残り、縦横表示・固定列・明暗テーマに対応します。日英の更新履歴に9月19日分を追加しました。

mainの関連19ケースは全て確認済み（初回は英語の日付にも日本語形式を期待するテスト3件が失敗。期待値を言語別に直した最終8件が全成功、他11件は初回成功）。本番互換版の関連16件、両lint、main TypeScript、webpack/OpenNextビルドも成功。プレビューと本番で日英・320/390/1440px・明暗・縦横の各24条件を検証し、最多人数・集計OFF・表幅・横あふれ・見出しの位置を確認しました。本番のドラッグ8条件と、日英更新履歴41件・最新記事も成功。公開検証のpageerrorとDB書き込みは0です。今回の切替では初回chunkエラーも再現していませんが、**以前記録したCPU上限問題の対策は含まれていません。**

Preview: https://candidate-highlight-nittei-app.qoj.workers.dev . Production: https://nittei-app.qoj.workers.dev/ . Existing variables were preserved with `--keep-vars`; SQL, storage, Cron and runtime limits are unchanged. **The secure SQL migration remains pending: never deploy main to the legacy DB or merge legacy storage back into main.**

ガラケーについては未対応と回答済みです。イベント名など一部はSSRですが、回答一覧の取得・入力にはJavaScriptが必要です。ガラホも機種とブラウザ次第で実機未確認。軽量版や互換レイヤーは実装していません。


## 2026-09-18: ドラッグ選択の1日・0日 / Calendar Drag Reversal

現在の本番は `release/ui-20260910` の `cf6ca1c`、Worker `73d53d34-ea4c-41e2-81bd-195e2ac78c37` (100%)。mainの対応変更は `ccc9914` と `34c5d8d`。直前の互換Workerは `b1fc098d-b307-434b-8446-40666255f56f` です。

「2日までしか選べない」は、ユーザー確認により「戻すと2日から0日に飛び、1日を残せない」という意味でした。開始日への復帰だけで全取消しする条件を廃止し、日付の中心まで戻したら1日、さらに直前のドラッグ方向と逆に8pxを越えて戻したら開始前の選択状態に戻します。日付の端を押して始めても中心が基準です。既存の別日の選択、解除ドラッグ、履歴1回分へのまとめ方は維持。レイアウト・保存処理・DBは変更していません。日英の更新履歴に9月18日分を追加しました。

mainの関連20テストと、中心基準にそろえた本番互換最終版の関連20テストが成功。うち12ケースは日英・マウス/タッチ・順逆方向・縦方向・既存選択・全解除・Undo/Redoを検証します。関連lint、mainのTypeScript、本番用webpack/OpenNextビルドも成功しました。プレビューと本番のドラッグ操作は各8条件で成功し、その実行中のブラウザーエラー・DB書き込みは0です。

切替直後の本番初回チェックでは旧版の `75-60567a61fe663758.js` を参照するchunk読み込みエラーが1件発生しました。アプリや待機条件を変えず新しいブラウザーコンテキストで再実行すると全8条件が成功しました。旧HTMLが返った配信上の理由は未確定です。**前回記録したCPU上限問題の対策は今回行っていません。**

Preview: https://calendar-drag-nittei-app.qoj.workers.dev . Existing variables were preserved with `--keep-vars`; SQL, storage, Cron and runtime limits were not changed. **The secure SQL migration remains pending: never deploy main to the legacy DB or merge legacy storage back into main.**

## 2026-09-15: 全画面の余白縮小 / Compact Spacing

現在の本番は `release/ui-20260910` のアプリ `c055bf9`、Worker `b1fc098d-b307-434b-8446-40666255f56f` (100%)。直前の互換Workerは `e396e93a-295a-48ea-89f4-66f1c3e4ce2f`。mainの対応変更は `3393456`、追加テストの待機修正はmain `9049093` / 本番互換版 `46348d1` です。

作成・編集・回答・更新履歴・ページ表示履歴・お問い合わせ・規約・プライバシーの上下余白を縮めました。大きい区切りは32pxから8px、回答一覧の上下paddingは24pxから8px、更新履歴の記事paddingは20pxから8pxへ変更。説明欄は初期2行でリサイズ可能。文字サイズ・日付/回答ボタンの大きさ・表幅・横スクロール・保存処理は維持しています。設定と書き出しガイドを同じ行にまとめ、日英の更新履歴も追記しました。

日英・320/390/1440pxの公開14ページ、計42条件で旧本番より短いことと横あふれがないことを確認。日本語390pxの実測では作成154px、回答234px、更新履歴1,357px、履歴45px、お問い合わせ100px、規約205px、プライバシー157px短縮しました。プレビューと本番の寸法検証は成功し、その実行中のブラウザーエラー・DB書き込みは0です。

本番互換版の全37件実行では36件成功、追加テスト1件が画面幅変更直後の小数ピクセル差で失敗しました。実寸の即時計測をCSS寸法の自動待機に修正後、追加4件はすべて成功。mainの関連既存テストと追加4件、両lint、mainのTypeScript、本番用webpack/OpenNextビルドも成功しています。

**残る公開環境の問題:** 切替直後のトップで読み込みエラーが1回発生。その後の日英トップを本番・プレビューで各3回開く診断は12回成功しましたが、補助の共有/履歴検証は英語の更新履歴で503、再実行ではnetworkidle待ちタイムアウトとなり、全項目の完走には至っていません。Cloudflare tailで `/icon.png` と英語トップのRSC要求に `Exceeded CPU Limit` / `Worker exceeded CPU time limit`、ほかに `Network connection lost` とhung requestキャンセルを確認しました。初回エラーとの因果関係は未確定で、**CPU上限エラーは未解消です。公開検証すべて成功とは扱わないでください。** この調査によるアプリ・課金プラン・実行上限の変更はしていません。

Preview: https://compact-spacing-nittei-app.qoj.workers.dev . Production: https://nittei-app.qoj.workers.dev/ . Existing variables were preserved; SQL, storage and Cron are unchanged. The spacing measurement passes, but supplementary production navigation checks encountered intermittent runtime failures, including observed CPU-limit errors. **The secure SQL migration remains pending: never deploy main to the legacy DB or merge legacy storage back into main.**

## 2026-09-15: 共有リンクの配置修正 / Bottom Links

現在の本番は `release/ui-20260910` の `ec3259f`、Worker `e396e93a-295a-48ea-89f4-66f1c3e4ce2f` (100%)。直前の互換Workerは `11f80fc3-256a-4f6e-bcfd-4631579f817d`、mainの対応変更は `23fff29` です。更新履歴とX共有をトップ・回答ページ最下部の小さな一行へ移し、イベント情報欄から外しました。投稿本文は「これめっちゃつかいやすい！！」、英語版は "This is so easy to use!!" と各言語の公開トップURLだけです。

mainの関連7テスト、本番互換版の関連11テスト、両lint、mainのTypeScript、webpack/OpenNextビルドが成功。プレビューと本番を日英・320/390/1440pxで確認し、最下部の位置・一行表示・リンク先・共有内容・テーマ・更新履歴・サイトマップを検証しました。切替直後に一度更新履歴の読み込みエラーが出ましたが、直後の診断と検証の再実行では再現せず、DB書き込み・ブラウザーエラーは0でした。原因の特定はしていません。

再確認中に英語リンク移動の5秒タイムアウトも1件発生しました。その後、URL到達を15秒上限で待つ検証では日英・全画面が成功し、別途日英3回ずつのリンク移動は0.5〜1.1秒で成功、ブラウザーエラーと通信失敗は0でした。アプリ変更を加えて解消したものではありません。

Preview: https://footer-links-nittei-app.qoj.workers.dev . Optional links now sit below the legal footer, outside event information. Existing variables were preserved; SQL, storage and Cron are unchanged. **The secure migration remains pending: do not deploy main to the legacy DB or merge legacy storage back into main.**

## 2026-09-15: 回答一覧にイベント情報 / Event Details in Results

本番は `release/ui-20260910` の `b9cbc9e`、Worker `11f80fc3-256a-4f6e-bcfd-4631579f817d` (100%) です。直前の互換Workerは `ae285d74-730a-42c3-b51f-4d3fcd105d31`。同じ表示変更はmainの `5531f36` にもあります。

「みんなの回答」の操作行と表の間に、既存イベント名と説明を読み取り専用で表示します。説明の改行を保持し、空欄は非表示。長い文字列は折り返し、情報欄が表の横幅を広げないようにしています。情報欄は横スクロール領域の外にあり、表だけを動かせます。上部のイベント名も長い英数字を折り返します。新しい入力欄・保存処理・DB変更はありません。

本番互換版は全33テスト、mainは関連12テストが成功。両lint、mainのTypeScript、本番用webpack/OpenNextビルドも成功しました。プレビューと本番の既存イベントを日英・320/390/1440px・縦横表示で確認し、長文・改行・空欄・表幅の維持・横スクロールを検証済み。本番トップ・共有リンク・更新履歴・サイトマップも確認し、公開DBへの書き込みとブラウザーエラーは0です。

Event details are repeated above the results in both locales without affecting the compact table width. Preview: https://results-details-nittei-app.qoj.workers.dev . Existing variables were preserved with `--keep-vars`; no storage, SQL or Cron changes were deployed. **The secure SQL migration remains pending. Do not deploy main to the legacy DB or merge legacy storage back into main.** Vercel Git auto-deploy remains disabled.

## 2026-09-15: 任意の共有リンクと初期履歴 / Optional Sharing and Archive

本番は `release/ui-20260910` の `1e303ef`、Worker `ae285d74-730a-42c3-b51f-4d3fcd105d31` (100%) です。直前の互換Workerは `5fafb566-b927-4a54-8908-ff196e6d4223`。mainにも同じ表示変更が `289c0d8` と `ade2753` にあります。

トップ・回答ページ・更新履歴の既存行に「よければXでシェア」を追加しました。`app/ServiceShareLink.tsx` は固定の紹介文と日英の公開トップURLだけを使用し、イベント情報・編集キーを含めません。Xの埋め込みスクリプトや自動投稿は使わず、別タブの投稿画面へ進む通常のリンクです。

更新履歴は2026年4月20日まで34件をさかのぼって追加し、今回の共有リンクの記録を含め全39件です。2026年9月6日以前は公開ブランチのGit変更日から再構成した記録で、実際の公開日とは異なる場合があることをページに明記しました。根拠コミットは `lib/updates.ts` のコメントにあります。

本番互換版の関連15テスト、mainの関連7テスト、両lint、mainのTypeScript、本番用webpack/OpenNextビルドが成功しました。プレビューと本番の日英トップ・既存イベント・更新履歴を320/390/1440pxで確認し、共有先・縦幅・横あふれ・テーマ・古い履歴・サイトマップを検証済みです。公開DBへの書き込み・ブラウザーエラーは0。実際のX投稿は行わず、別タブ動作のテストでは行き先をローカルで代替しました。

Both features are deployed from the compatibility branch, with localized service-only sharing and a dated archive. **The secure SQL migration remains pending; do not deploy main to the legacy DB or merge legacy storage back into main.** Production was checked read-only. Vercel Git auto-deploy remains disabled.

## 2026-09-14: 更新履歴を公開 / Release History

本番は `release/ui-20260910` の `0b83b03`、Worker `5fafb566-b927-4a54-8908-ff196e6d4223` (100%) です。直前の互換Workerは `d1229529-9fbc-482c-a159-ce4c7e03787e`。同じ更新履歴機能をmainの `396d947` にも反映しました。

公開ページは `/updates` と `/en/updates`。トップのお問い合わせ行とイベント下部の情報欄にリンクを追加し、既存フッターの縦幅は増やしていません。履歴は `lib/updates.ts`、英訳は `lib/i18n/en.json` に追加します。本番公開済みの変更だけを日本時間の日付で記録してください。READMEにも日英で手順を記載しています。

本番互換版は全27テスト、mainは関連13テストが成功。両ブランチのlint、mainのTypeScript、本番用webpack/OpenNextビルドが成功しました。main初回は開発サーバーのルーター初期化エラーが1件出ましたが、テストを変更しない再実行ですべて成功しています。プレビューと本番の日英ページ・既存イベントを320/390/1440pxで確認し、テーマ・言語切替・サイトマップ・アイコン・リンク・横あふれを検証しました。旧Vercelの `/updates` は本番へ301転送されます。

Production release history is live in both languages. Preview and production browser checks passed without page errors or database writes. **The secure SQL migration is still pending: do not deploy main to the legacy database or merge legacy storage back into main.** Vercel Git auto-deploy remains disabled; Cloudflare was deployed separately. See `SECURE-ROLLOUT.md` for the database cutover.

## 2026-09-13: 改善版の本番確認 / Production improvements verified

本番は `release/ui-20260910` の `22f8e85`、Worker `d1229529-9fbc-482c-a159-ce4c7e03787e` (100%) です。日またぎ・終日・繰り返し例外のICS判定、ファイル上限、言語切替時の下書きと履歴、新規回答の再送時の重複防止、英語の月選択ラベル短縮を反映しました。日英・320/390/1440pxで公開サイトを確認し、アイコンは元のデータと一致しています。

本番互換版の22テスト・lint・TypeScript・webpack/OpenNextビルド、mainの22テスト・配信前確認の3テスト・lintは成功。Git管理情報と欠けていた元ファイルを復旧済みです。**SQL移行は未適用で、mainはまだ本番ではありません。** mainの `npm run deploy` は読み取り専用のDB事前確認から始まり、未移行なら停止します。詳細と切り替え手順は `SECURE-ROLLOUT.md` を参照してください。

Production uses the compatibility branch's calendar, draft and retry fixes. Legacy writes remain non-transactional, and retry IDs do not survive reloads. The secure main code still needs its coordinated SQL migration; never deploy it to the legacy database or merge legacy storage back into main. Production verification was read-only.

## 2026-09-10: 候補日時バーをスマホ配置に統一 / Time controls unified

本番Workerは `45745046-71e2-4172-8766-7f1b54e96129`、アプリは `release/ui-20260910` の `80429b1`（`main` の `0f9583a` と同じ内容）です。候補日時バーが幅ごとに段組みを変えていたのをやめ、日英・全幅で同じ4段（ラベル／時刻入力／適用ボタン／戻す・進む）にしました。時刻入力は全幅で左右均等に伸びます。

**DB更新は引き続き未適用です。** 反映先は今も `release/ui-20260910` で、`main` をそのままdeployしてはいけません。

Production still runs the UI-only release branch. The date-options bar now uses one layout at every width in both languages; the phone breakpoint keeps only its tighter input padding.

## 2026-09-10: UI修正は本番反映済み / UI deployed

本番Workerは `bbdd0f78-0c0c-4a65-8170-390227e3219f`、アプリは `release/ui-20260910` の `0bb7908` です。`main` のUI修正 `6568c72` を、既存DBで動く `af7801c` に移して公開しました。英語リンクは既存フッターと同じ行、日本語スマホの回答選択肢は説明付き一行表示です。

**DB更新は未適用です。最新mainの保存・権限処理は本番へ出していません。** DB移行前はこのリリースブランチを基準にし、移行時は最新mainから新しいWorkerを準備してください。旧保存コードをmainへ戻さないでください。詳細・検証結果・依存警告は `SECURE-ROLLOUT.md` を参照。

Production uses the UI-only backport, not the current main application. Existing storage behavior and data were preserved. Rebuild current main for the coordinated SQL cutover; do not promote the older prepared secure Worker, which lacks the latest UI changes.

## 2026-09-08: DB切り替え必須 / Database cutover required

新しい保存・権限処理は `supabase/secure-scheduling.sql` が必須です。準備時点では本番RPCは未導入でした。現在の適用状況を確認し、`SECURE-ROLLOUT.md` の手順でDBと対応Workerをセットで切り替えてください。SQLなしで新クライアントを本番へ出すことや、旧公開ポリシーを実行し直すことは禁止です。

Read `SECURE-ROLLOUT.md` before deployment. The new client requires the database migration; verify whether it has been applied. Legacy links remain valid; new records use private edit keys. Tests execute real PostgreSQL policies/RPCs in isolated PGlite, not production.

## 最初に貼る文章

新しいPCや新しいチャットで作業を始めるとき、最初にこれを貼る。

```text
あなたは「日程組」という日程調整Webアプリ（ログイン不要。伝助のようなもの）の開発を引き継ぎます。
作業の前に CLAUDE.md、AGENTS.md、HANDOFF.md（先頭が最新。「オーナーとの約束」は必ず）、SECURE-ROLLOUT.md を読んでください。

- 本番URL: https://nitei.pages.dev/（Cloudflare Pages のプロジェクト nitei。前の https://nittei-app.qoj.workers.dev/ と、その前の nittei-app-five.vercel.app からは自動で転送）
- GitHub: https://github.com/tghcgu/nittei-app（公開リポジトリ）
- 技術: Next.js 16 / React 19 / TypeScript / Tailwind 4 / Supabase / Cloudflare 無料プラン（Pages: ページはビルド時に書き出したファイル、イベントのページだけ Worker。前の住所の Worker が転送と自動削除。ビルドは webpack）
- 作業フォルダ: main の作業ツリー（例 Desktop\nittei-app）と、本番用 release/ui-20260910 の作業ツリー（例 Desktop\nittei-app-ui-release）
- 本番で動いているのは release/ui-20260910。main は DB 移行（supabase/secure-scheduling.sql）前提の保存処理を含むので、移行が済むまで本番に出さない。
- 作業は main から fix/… を作り、同じ変更を release から作った preview/… にも入れる。「マージ」と言われたら、両方を fast-forward して push し、release の作業ツリーで npm run deploy、公開サイトで確認して HANDOFF.md に記録する。
- 確認: npm run lint / .\node_modules\.bin\tsc.cmd --noEmit / npm test（Playwright。本番と同じ作りを wrangler dev で動かす）/ npm run build
- 本番の確認: node scripts/production-checks/features.mjs と node scripts/production-checks/sweep.mjs
- オーナーは短い日本語で頼む。返事は結論から短く。

主なファイル:
- app/Home.tsx: イベント作成・編集画面（日英共通）
- app/e/[shareId]/EventPage.tsx: 回答ページのデータ取得とメタデータ
- app/e/[shareId]/ResponsePage.tsx: 回答ページの画面と操作（.ics 読み込みの「設定」、範囲で一括回答、回答一覧）
- lib/calendar.ts: .ics の予定と時間帯の判定
- lib/i18n/: 英語辞書（日本語の文がキー）
- lib/updates.ts: 公開している更新履歴
- lib/site.ts: サイト名・URL・お問い合わせフォームのURL
- tests/: Playwright のテスト（独立したメモリ内DBを使い、本番DBには触れない）
- scripts/production-checks/: 本番の確認スクリプト（読み取りだけ）
```

## 新しいPCで続けるとき（PCが壊れたとき）

PCが壊れても、コード（GitHub）・本番サイト（Cloudflare）・データ（Supabase）・お問い合わせフォーム（オーナーの Google アカウント）は残る。このPCにしかないのは `.env.local` と、各サービスへのログイン状態と、Claude の記憶だけ。記憶の中身は上の「オーナーとの約束」に写してある。詳しい手順は README の「新しいPCへの完全引き継ぎ」。

| もの | ある場所 | PCが壊れたら |
| --- | --- | --- |
| コード・履歴・このファイル | GitHub `tghcgu/nittei-app`（全ブランチ push 済み） | 残る |
| 本番サイト（Worker `nittei-app`）と毎日の自動削除 | Cloudflare | 残る |
| 秘密の値 `SUPABASE_SERVICE_ROLE_KEY`・`CRON_SECRET` | Cloudflare の Worker の Secrets | 残る（値は読み戻せない。作り直すときは新しい値を `npx wrangler secret put`） |
| イベント・回答のデータ | Supabase | 残る |
| `.env.local`（Supabase の URL と公開用キーの2つ） | このPCだけ | 消える。Supabase の管理画面の Project Settings → API から取り直す |
| お問い合わせフォーム2つと、通知の Apps Script | オーナーの Google アカウント | 残る |
| 旧URLの転送 | Vercel（`vercel.json`） | 残る |
| 本番の確認スクリプト | `scripts/production-checks/` | 残る |
| Claude の記憶 | このPCだけ | 消える。上の「オーナーとの約束」を見る |

新しいPCでの手順（Windows）:

```powershell
cd $HOME\Desktop
git clone https://github.com/tghcgu/nittei-app.git
cd nittei-app
npm.cmd ci
git worktree add ..\nittei-app-ui-release release/ui-20260910
cd ..\nittei-app-ui-release
npm.cmd ci
```

`.env.local` を両方のフォルダに作る。値は Supabase の管理画面から取り、チャットや Git には貼らない。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

古い `.env.local` にあった `NEXT_PUBLIC_GOOGLE_CLIENT_ID` と `GEMINI_API_KEY` は、今のアプリでは使っていないので要らない。

Cloudflare とテストの準備:

```powershell
npx.cmd wrangler login
npx.cmd wrangler deployments status   # いま本番で動いている Version ID を確かめる
npx.cmd wrangler secret list          # SUPABASE_SERVICE_ROLE_KEY と CRON_SECRET があること
npx.cmd playwright install chromium   # テストと本番確認に使うブラウザー
```

本番が動いていれば、PCを替えただけで deploy し直す必要はない。

## 本番に出す・戻す

- 出す: release の作業ツリーで `npm.cmd run deploy`（Pages の本番と、前の住所の Worker を上げる。`.env.local` の Supabase の値を使うので、wrangler を直接使わない）。終わったら `npx.cmd wrangler pages deployment list --project-name nitei` と `npx.cmd wrangler deployments status` で新しい版を確かめ、`node scripts/production-checks/features.mjs` と `node scripts/production-checks/sweep.mjs` を流す。画面や文言を変えたリリースでは、同じ変更の中で確認スクリプトも直す。
- 確認用URL: release 側の preview ブランチで `npm.cmd run preview -- 名前`（Pages の確認用に上げる。本番は変わらない）。URL は `https://名前.nitei.pages.dev`。
- 戻す: サイト（Pages）は Cloudflare の管理画面の Workers & Pages → nitei → Deployments で前の版の「Rollback」、または前の commit から `npm.cmd run deploy`。前の住所の Worker は `npx.cmd wrangler versions list` で前の Version ID を確かめて `npx.cmd wrangler rollback <Version ID>`。戻したら公開サイトを確認し、このファイルに書く。
- main は DB 移行が済むまで deploy しない（`check:database` で止まる）。

## 宿題（まだ終わっていないこと）

- Cloudflare は無料プランのまま（2026-10-22、オーナーが作り替えを選んだ）。CPU 上限は1回10ms なので、Worker に重い処理を足さない。サーバーで Next.js を動かす作りに戻さない。
- オーナーの作業（2026-10-22）: Search Console の新しい住所 https://nitei.pages.dev は確認済み。残りは sitemap.xml を送ること。「アドレス変更」は前の住所からも Vercel の住所からも「ページを取得できませんでした」で通らない（Google がこちらにアクセスしないまま失敗する）。7月の移転でも通らないまま、検索結果は転送だけで移ったので、しなくてよい。
- オーナーの判断待ち（2026-10-18 に聞いた）: (1) カレンダーの URL（Google の「iCal 形式の非公開アドレス」）を一度貼れば、ボタン1つで読み込めるようにするか。Google はブラウザーから直接読ませない（CORS なし、確認済み）ので日程組のサーバー経由になり、「送信も保存もしません」の約束とプライバシーポリシーが変わる。 (2) 作成画面のカレンダーで今日より前の日付も選べるのを、選べなくするか・薄くするか・そのままか。 (3) `app/e/[shareId]/ResponsePage.tsx`（2,600行超）を分けるか（急ぎではない）。
- DB 移行（`supabase/secure-scheduling.sql`）は未適用。オーナーが SQL を実行する。手順は `SECURE-ROLLOUT.md`。移行と同時に、最新の main から Worker を作り直して出す（9/30 に用意した `ceb357aa` は古いので使わない）。移行が済めば release ブランチの役目は終わる。
- 画像を添付できるお問い合わせフォーム（日程組のフォームのコピー）について、オーナーに次をお願いした。済んだかは未確認: タイトルの「のコピー」を消す、質問名を「画像 / Images」にする、画像だけ・10MB までにする、「新しい回答についてのメール通知を受け取る」をオンにする（コピーには元のフォームの Apps Script の通知が付いていない）。
- 2026-07-16 に作って撤回した自前フォームの `inquiries` テーブルが、Supabase に使われないまま残っている。
- 365日での自動削除（毎日 19:00 UTC）が動いているかは、Cloudflare の管理画面で Worker `nittei-app` の Cron の実行履歴を見れば確かめられる。
- Discord などに前に貼ったリンクは、しばらく古いプレビュー（大きな画像つき）のまま残ることがある。

## 注意

- `.env.local` の実際の値は、このファイルにもチャットにも貼らない。
- `node_modules`、`.next`、`out`、`.next-i18n-tests`、`.wrangler`、`.vercel` はコピー不要。
- Supabase のデータと Cloudflare の本番サイトはクラウド側にあるので、PCを変えても残る。
- 新しいPCでデプロイするには `npx wrangler login` で Cloudflare に再ログインする。
- 外付けドライブにも控えるなら `git bundle create nittei-app-backup.bundle --all`（README の「GitHubにもアクセスできない場合」）。
