# Secure Scheduling Rollout / 安全な切り替え

## 日本語

このリリースはアプリの更新とSupabaseのSQL変更がセットです。GitHubへのpushだけでは、DBにもCloudflare本番にも反映されません。

### 準備済みバージョン / Prepared Version

**2026-09-15: 共有リンクと過去の更新履歴 / Optional sharing and archive deployed**

- Current production Worker: `ae285d74-730a-42c3-b51f-4d3fcd105d31` (100%). Application: `1e303ef`, branch `release/ui-20260910`. Previous compatible Worker: `5fafb566-b927-4a54-8908-ff196e6d4223`. Matching main changes: `289c0d8` and `ade2753`.
- Added discreet X composer links to existing home, event and updates rows without increasing their height. Only localized service introduction text and the production homepage are included, not event details or keys; no external widget or automatic posting is used.
- Added 34 historical entries back to April 20, 2026, bringing the total to 39 including this release. Entries before September 7 are explicitly labeled as Git change dates, not verified deployment dates, with source commits recorded in code.
- Verification: 15 compatibility layout/history/share tests and 7 main history/share tests passed, plus both lints, main TypeScript and compatibility webpack/OpenNext builds. Preview and production read-only checks passed for both locales at 320/390/1440px, with zero DB writes or browser errors. Sharing parameters, unchanged row heights, themes, oldest entries and sitemap were checked. No real X posts were submitted; the new-tab test intercepted its destination.
- Preview: https://updates-nittei-app.qoj.workers.dev . Production: https://nittei-app.qoj.workers.dev/ . Uploaded with `--keep-vars` and promoted at 100% after verification. **DB・保存方式・Cron設定は変更していません。SQL移行は依然未適用です。mainを旧DBへ配信しないでください。**

**2026-09-14: 更新履歴を本番公開 / Release history deployed**

- Current production Worker: `5fafb566-b927-4a54-8908-ff196e6d4223` (100%). Application: `0b83b03`, branch `release/ui-20260910`. Previous compatible Worker: `d1229529-9fbc-482c-a159-ce4c7e03787e`. The same release-history changes are on main at `396d947`.
- Added `/updates` and `/en/updates`, localized sitemap entries, and compact navigation links on the home and response pages. Release notes are static in `lib/updates.ts`; no DB or save behavior changed.
- Verification: compatibility suite 27 passed; main's 13 layout/history checks passed on rerun after one development-router initialization error. Both lints, main TypeScript, and the compatibility webpack/OpenNext build passed. Preview and production checks covered both locales at 320/390/1440px, themes, language navigation, existing event reads, icons and sitemap, with zero browser errors and zero production DB writes. The legacy Vercel `/updates` URL redirects with HTTP 301.
- Preview: https://updates-nittei-app.qoj.workers.dev . Production: https://nittei-app.qoj.workers.dev/updates . GitHub main and the compatibility branch contain the feature. Vercel Git auto-deploy is disabled; the Cloudflare upload used `--keep-vars`, followed by a verified 100% promotion.
- **SQL移行は未適用のままです。mainを旧DBへ配信しないでください。** Only the compatibility branch was deployed. The secure main application still requires the coordinated database cutover below.

**2026-09-12 本番反映、09-13 最終確認 / Deployed and verified**

- Current production Worker: `d1229529-9fbc-482c-a159-ce4c7e03787e` (100%). Application: `22f8e85`, branch `release/ui-20260910`. Previous compatible Worker: `45745046-71e2-4172-8766-7f1b54e96129`.
- Preview: https://improvements-nittei-app.qoj.workers.dev . Production: https://nittei-app.qoj.workers.dev/ . 日英トップ・既存イベントを320/390/1440pxで確認し、横あふれとブラウザーエラーはありません。下書きの言語間引継ぎ、日またぎのICS判定、取り消し、テーマ切り替えも確認済みです。公開DBへの書き込みテストは行っていません。

- DBを変えない修正を `nittei-app-ui-release` に移しました。日またぎ・終日・繰り返し例外の判定、カレンダーファイルの上限、言語切替時の下書きと履歴の保持に対応します。
- 新規回答は再送時に同じ回答ID・回答明細IDを再利用します。保存前、保存後、回答者作成後の通信失敗と、言語切り替えを挟む再送をローカルテストで確認しました。これは再送の重複防止であり、旧DBでの複数テーブルの保存を原子的にするものではありません。ページ再読み込み後の再送は保証しません。
- 英語の月まとめ選択は `Select remaining days (件数)` に短縮し、320pxでも一行に収まることを確認しました。
- mainに `npm run check:database` を追加しました。公開キーでの読み取りのみで、必要な列・共有IDなしの読み取り制限・読み取り専用の権限確認RPCを検査します。`npm run deploy` はこのチェックから始まり、未移行ならビルド・配信前に停止します。DB管理画面での全SQL適用や保存テストの代わりではありません。
- 現在の接続先はチェックでHTTP 400となり、未移行のままです。管理用Supabase認証情報は環境にありません。本番DBは変更していません。
- 検証結果: 本番互換版は全22テスト・lint・TypeScript込みのwebpack/OpenNextビルドに成功。再送テストの待機条件を、途中保存でも現れる名前から送信完了メッセージへ修正しました。mainも最後の全22テスト、DB事前確認の単体テスト3件、lintが成功しました。mainの初回検証では2件のタイムアウトがありましたが、テストを弱める変更はしていません。
- この作業開始時、mainの `.git/HEAD` と一部ファイルが欠けていました。Git管理情報をバックアップ後、mainのHEADとGitHubのリモート参照を復旧しました。`git fsck --no-dangling` は成功。元のコミットからアイコンと日英の既存テストを復元し、公開中のfavicon・icon.pngも元データとハッシュ一致しています。`.vscode/` は変更していません。

The compatibility branch's calendar/draft fixes and stable IDs for retrying a new response are deployed as `22f8e85` on Worker `d1229529-9fbc-482c-a159-ce4c7e03787e` at 100%. Both locales, existing events, 320/390/1440px layouts, drafts, overnight imports and original icons passed read-only production checks. Its writes are still not transactional. The secure main deployment now has a read-only database preflight; this is not a migration or a complete security audit. Production database configuration/data were not changed. Git metadata and missing original files were recovered. Coordinate the SQL migration and matching main Worker as described below; never merge legacy writes back into main.

**2026-09-10 (2回目): 候補日時バーの統一 / Date-options bar unified**

- Current production Worker: `45745046-71e2-4172-8766-7f1b54e96129` (100%). Previous: `bbdd0f78-0c0c-4a65-8170-390227e3219f`.
- Application commit: `80429b1`, branch `release/ui-20260910`, cherry-picked from `main` `9f79d8e` + `0f9583a`. Both branches carry the identical change.
- 候補日時バーはPCでもスマホと同じ4段になりました。`sm:contents` / `sm:w-auto` を外し、全幅指定を `@media (max-width: 640px)` の外へ出しています。スマホ側に残したのは `padding-inline: 4px` だけです。
- DB・保存処理・Cron設定は一切触っていません。SQL移行は未実施のままです。
- Verification: 18 Playwright tests (2 new desktop layout cases), lint, TypeScript, webpack production build, and OpenNext build passed. Production `/`, `/en`, `/e/ohbcvs2j`, `/en/e/ohbcvs2j`, `/history`, `/terms` returned 200. Browser measurements at 390/640/768/1024/1440px in both locales show one identical 165px bar with no horizontal overflow. `reliability.spec.ts` (ja) failed once on an unrelated draft-timing race and passed on re-run.
- Preview: https://phone-rows-nittei-app.qoj.workers.dev . Production: https://nittei-app.qoj.workers.dev/ .

**2026-09-10: UIのみ本番反映 / UI-only production release**

- Current production Worker: `bbdd0f78-0c0c-4a65-8170-390227e3219f` (100%).
- Application commit: `0bb7908`, branch `release/ui-20260910`. This backports UI commit `6568c72` onto the production-compatible `af7801c` base and uses the dependency lockfile from main.
- 日本語スマホの回答選択肢を説明付きで一行表示に戻し、言語切り替えを既存リンクと同じ行へ移しました。上部の追加行・余白は削除済みです。
- DBのRPC確認は引き続き `404 / PGRST202`。保存処理・DB定義・Cron設定は旧本番と同一で、SQL移行は行っていません。**最新mainをそのまま本番へdeployしないでください。**
- Verification: 11 tests, lint, TypeScript, webpack production build, and OpenNext build passed. Preview and production `/`, `/en`, `/e/ohbcvs2j`, and `/en/e/ohbcvs2j` returned 200; browser checks at 320/390/1440px passed without page errors or horizontal page overflow. Production checks were read-only; create/answer/edit tests used an isolated local fixture.
- Preview: https://compact-ui-nittei-app.qoj.workers.dev . Production: https://nittei-app.qoj.workers.dev/ . Previous compatible Worker: `db406392-8e35-41a7-98de-7cb4e92fa64a`.
- Before the database cutover, rebuild and upload **current main**. The older prepared secure Worker below does not contain these latest UI changes. Never merge legacy storage code back from the UI release branch into main.
- Dependency audit: four high-severity entries remain on the `wrangler -> miniflare -> sharp@0.35.2` tooling chain. Next.js resolves `sharp@0.35.4`; do not report the entire dependency tree as audit-clean. Track a compatible tooling update separately instead of accepting the forced Wrangler downgrade suggested by npm. [Sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).

**2026-09-08: Prepared secure version (not production)**

- App commit: `d468305` (`main`)
- Prepared Worker: `0d03b5a2-69be-485b-b5cf-68d872d45b68`
- Preview: https://reliability-nittei-app.qoj.workers.dev
- Production at preparation time: `db406392-8e35-41a7-98de-7cb4e92fa64a` (app `af7801c`)
- 検証: テスト14件、lint、TypeScript、Next.js webpack build、OpenNext build成功。npm auditの検出0件。Cloudflareプレビューの日英トップは200・操作可能・横あふれなし。本番の既存イベントも200。
- **DB未適用のためプレビューのイベント表示・保存はまだ利用できません。本番へは未配信です。** 共有ID別アクセス制限を含むDB変更は、本番では未適用です。
- Verification: 14 tests plus lint, typecheck, webpack/OpenNext builds passed; npm audit reported zero findings. Preview home pages work in both languages. Event reads/writes on the preview await the migration; no production promotion or DB security rollout has occurred.

### 現在の前提

- ローカルテストはPGlite上で実際のSQL・RLS・RPCを検証します。本番DBを変更しません。
- 新しい画面は `edit_protected` 列と `nittei_*` RPCが必須です。SQL未適用のまま本番へ配信しないでください。
- 準備時点で、本番のRPC確認は `PGRST202`（未導入）でした。DB適用の完了は別途確認が必要です。
- 公開用SupabaseキーやCloudflareへのデプロイ権限だけでは、SQL Editorでの変更はできません。Supabaseプロジェクトの管理者アクセスが必要です。秘密鍵をチャットやGitへ貼らないでください。

### 切り替え

1. SupabaseでDBバックアップを確保します。既存の4テーブル、回答選択肢列、更新日時トリガーがあることを確認します。新規環境ではREADMEのベーステーブル・追加SQLを先に実行します。
2. `npm ci`、`npm run lint`、`npx tsc --noEmit`、`npm test`、`npm run build -- --webpack` を通します。
3. `npx opennextjs-cloudflare build --skipNextBuild` と `npx wrangler versions upload --preview-alias reliability --keep-vars` で新しいWorkerバージョンを準備します。この時点では本番へ100%配信しません。バージョンIDを控えます。
4. 短い切り替え時間を確保し、Supabase SQL Editorで **`supabase/secure-scheduling.sql` 全体** を実行します。1トランザクションで適用され、既存イベント・回答の移行時削除は行いません。
5. `npm run check:database` で読み取りの互換性を確認し、続けて `npx wrangler versions deploy <新しいバージョンID>@100 --yes` で対応アプリを配信します。SQL適用から新アプリ配信まで旧クライアントは保存・読み取りに失敗します。開きっぱなしの旧タブには再読み込みが必要です。
6. 日本語と英語で、既存共有URLの表示、新規イベント作成、回答・編集、編集用URLによる別端末からの復旧を確認します。通常の共有URLにはキーを含めないでください。
7. 公開キーで共有IDなしの `events?select=id` が空配列になること、正しい `x-nittei-share-id` 付きでそのイベントだけ読めること、直接のテーブル書き込みが拒否されることを確認します。

**SQL適用後に旧アプリだけへ戻すと壊れます。** エラー時はSQL実行結果を確認し、修正した対応アプリを再配信してください。旧公開RLSへ戻して問題を回避しないでください。障害調査中もDBバックアップと新旧WorkerバージョンIDを保持します。

### 権限・保存・制限

- 閲覧と新規回答には共有URLが必要です。ログインは不要です。
- 新規イベント: 主催者のランダムな256ビット編集キー。新規回答: 回答者ごとの編集キー。保存するのはSHA-256ハッシュです。
- 主催者は自分のイベント・候補日と、そのイベントの回答を管理できます。回答者は自分の回答だけを変更できます。
- 既存データには所有者が分からないため、移行前イベントの主催者権限と移行前回答の編集は従来どおり共有URLで利用できます。この互換性は本人確認を追加するものではありません。
- 保存は検証付きRPCの1トランザクションです。通信失敗の再試行では同じUUIDを使い、重複を防ぎます。候補日と回答記号の整合性もDBで確認します。
- 同時編集では最後に保存した内容が優先されます。編集競合のマージ機能やアカウントによるキー復旧はありません。
- 名前200文字、説明・コメント10,000文字、候補日1,000件。カレンダーファイル10MiB、zip展開後50MiB、100カレンダー、繰り返し展開は各予定10,000件までです。
- 共有URL自体は秘密情報として扱ってください。連続アクセスの制限やアカウント認証はこのリリースの対象外です。

## English

This release requires **both the matching application and the Supabase migration**. A Git push changes neither the live database nor the production Worker. Local tests run the real SQL against isolated PGlite; they do not migrate production. At preparation time, the production RPC probe returned `PGRST202` (not installed).

1. Back up the existing database. Ensure the four scheduling tables, answer-choice column, and update triggers exist. For a new database, follow the base schema setup in README first.
2. Run install, lint, TypeScript, browser/database tests, and the webpack production build.
3. Build OpenNext and upload a Worker version with `--preview-alias reliability --keep-vars`. Record its ID; do not promote it before migrating the DB.
4. During a short coordinated cutover, run **all of `supabase/secure-scheduling.sql`** in Supabase SQL Editor, verify read compatibility with `npm run check:database`, then immediately deploy the matching Worker version at 100%. The migration runs transactionally and does not delete existing data.
5. Check old event URLs in both languages, new event/response creation and editing, private edit-link recovery, scoped reads, and rejection of direct writes. Previously opened tabs must reload.

Supabase project administrator access is needed for SQL execution. A publishable key or Cloudflare deployment login is not sufficient. Do not expose secret credentials. The old client cannot operate after this migration; rolling back only the Worker breaks it. Fix forward with a matching client and do not restore permissive RLS.

New records use 256-bit random edit keys, stored as SHA-256 hashes. Organizers manage their event and its responses; participants manage their own response. Legacy records retain share-link editing because their owner identity cannot be reconstructed. Normal share links never contain edit keys; private recovery links use URL fragments and must remain confidential. Losing both browser storage and the private link means the key cannot be recovered.

Writes are atomic and reuse UUIDs on retries. Candidate ownership and permitted answer values are validated in the DB. Concurrent edits use last-save-wins, not conflict merging. Limits: names 200 characters, descriptions/comments 10,000 characters, 1,000 candidates, 10 MiB input files, 50 MiB expanded ZIP data, 100 calendars, and 10,000 occurrences per recurring event. Account authentication, rate limiting, and account-based key recovery are outside this release.
