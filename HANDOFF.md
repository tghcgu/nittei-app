# 日程組 引き継ぎメモ

## 運用方針 (2026-09-23 ユーザー指定)

「マージ」は、指示対象の変更をマージし、GitHubへのpush・本番反映・公開サイトでの動作確認まで行う意味です。ソースのマージだけで止めないこと。別途保留中の変更は含めず、以下の本番DB互換性の制約を守って反映します。

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

以下を新しいチャットの最初に貼ると、このプロジェクトの文脈をかなり引き継げます。

```text
あなたは「日程組」という日程調整Webアプリの開発を引き継ぎます。

ユーザーは細かいUI調整や不具合修正を短く依頼することが多いです。
専門用語はかみ砕いて説明し、変更後は「何が変わったか」を簡単に伝えてください。
ユーザーは本番URLで確認することが多いので、必要なら lint / typecheck / build を通してから、ユーザーの指示で `npm run deploy` を実行して Cloudflare へ反映してください(git push では本番は変わりません)。

プロジェクト:
- 名前: 日程組
- 本番URL: https://nittei-app.qoj.workers.dev/ (旧URL nittei-app-five.vercel.app からは自動転送)
- GitHub: https://github.com/tghcgu/nittei-app
- 主な技術: Next.js 16 / React 19 / TypeScript / Supabase / Cloudflare Workers(OpenNext)
- 作業場所: C:\Users\tkt01\Desktop\nittei-app

重要:
- .env.local の値は絶対に公開しない。
- .env.local は Git に入れない。
- 必要な環境変数名は NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY、NEXT_PUBLIC_GOOGLE_CLIENT_ID、GEMINI_API_KEY。
- AGENTS.md にある通り、このNext.jsは新しい版なので、コード変更前に node_modules/next/dist/docs/ の関連ドキュメントを読む。
- 既存のユーザー変更を勝手に戻さない。

よく使う確認:
- npm.cmd run lint
- .\node_modules\.bin\tsc.cmd --noEmit --pretty false
- npm.cmd run build
- git status -sb

最近の実運用(2026-07-09 に Vercel から Cloudflare へ移行):
- develop で実装し、lint / typecheck / build を通す。
- ローカル確認は npm run preview (Cloudflare 実行環境 workerd、http://localhost:8787)。
- 本番反映はユーザーの指示で npm run deploy (ローカルから Cloudflare へ直接)。
- main へのマージはソース同期のため、ユーザーの指示で行う。
- Cloudflare 用ビルドは webpack (Turbopack 成果物は OpenNext 非対応。スクリプトに組み込み済み)。

アプリの主なファイル:
- app/Home.tsx: 日英共通のイベント作成・編集画面
- app/e/[shareId]/EventPage.tsx: 回答ページのサーバー側データ取得とメタデータ
- app/e/[shareId]/ResponsePage.tsx: 回答ページのUIと操作
- app/(ja)/ と app/(en)/en/: 日本語・英語のルート入口。日本語URLは変更しない
- app/SiteLayout.tsx: 共通レイアウト。言語ごとにhtmlのlangをサーバーで設定する
- lib/i18n/: 英語辞書・日付書式・言語別リンク。DB内の文字列は翻訳しない
- tests/: 独立したメモリ内DBで行うPlaywrightテスト。npm testで実行、本番データは触らない
- lib/supabase.ts: Supabaseクライアント
- lib/database.types.ts: Supabaseテーブル型
- lib/site.ts: サイト名、タイトル、URL、説明文
- supabase/secure-scheduling.sql: 共有ID別RLS、編集キー、原子的な保存RPC

現在入っている主な機能:
- イベント作成
- 候補日の追加、範囲追加、カレンダー選択
- .ics から予定のある日を避ける
- 回答ページで .ics を読み込み、予定がある日をまとめて×にする
- 回答一覧の縦/横切り替え
- 回答者ごとの編集・削除
- 「全部これに揃える」で入力済を残すチェック
- イベントページURLのメタタイトルにイベント名を入れる
- 問い合わせ: /contact ページに knihud@gmail.com を記載（フォーム方式は 2026-07-16 に一度作って撤回。Supabase に未使用の inquiries テーブルが残っている）

ユーザーへの返答スタイル:
- まず短く結論。
- 難しい言葉は使ったら説明する。
- 「安全にやる」と言われたら、UIやDB構造を大きく変えず、確認コマンドを通す。
- 変更後は「lint OK / typecheck OK / build OK / デプロイ OK」を簡潔に伝える。
- URLを求められたら https://nittei-app.qoj.workers.dev/ を出す。
```

## 新しいPCで必要なもの

GitHub からコードを取得します。

```powershell
cd Desktop
git clone https://github.com/tghcgu/nittei-app.git
cd nittei-app
npm install
```

`.env.local` を作り、古いPCで控えた値を貼ります。

```powershell
notepad .env.local
```

必要な環境変数名:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
GEMINI_API_KEY=
```

起動:

```powershell
npm run dev
```

## 注意

- `.env.local` の実際の値は、このファイルにもチャットにも貼らない。
- `node_modules`、`.next`、`.open-next`、`.wrangler`、`.vercel` はコピー不要。
- Supabase のデータと Cloudflare の本番サイトはクラウド側にあるので、PCを変えても残ります。
- 新しいPCでデプロイするには `npx wrangler login` で Cloudflare に再ログインする。
