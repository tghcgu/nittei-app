# Secure Scheduling Rollout / 安全な切り替え

## 日本語

このリリースはアプリの更新とSupabaseのSQL変更がセットです。GitHubへのpushだけでは、DBにもCloudflare本番にも反映されません。

### 準備済みバージョン / Prepared Version

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
5. 続けて `npx wrangler versions deploy <新しいバージョンID>@100 --yes` で対応アプリを配信します。SQL適用から新アプリ配信まで旧クライアントは保存・読み取りに失敗します。開きっぱなしの旧タブには再読み込みが必要です。
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
4. During a short coordinated cutover, run **all of `supabase/secure-scheduling.sql`** in Supabase SQL Editor, then immediately deploy the matching Worker version at 100%. The migration runs transactionally and does not delete existing data.
5. Check old event URLs in both languages, new event/response creation and editing, private edit-link recovery, scoped reads, and rejection of direct writes. Previously opened tabs must reload.

Supabase project administrator access is needed for SQL execution. A publishable key or Cloudflare deployment login is not sufficient. Do not expose secret credentials. The old client cannot operate after this migration; rolling back only the Worker breaks it. Fix forward with a matching client and do not restore permissive RLS.

New records use 256-bit random edit keys, stored as SHA-256 hashes. Organizers manage their event and its responses; participants manage their own response. Legacy records retain share-link editing because their owner identity cannot be reconstructed. Normal share links never contain edit keys; private recovery links use URL fragments and must remain confidential. Losing both browser storage and the private link means the key cannot be recovered.

Writes are atomic and reuse UUIDs on retries. Candidate ownership and permitted answer values are validated in the DB. Concurrent edits use last-save-wins, not conflict merging. Limits: names 200 characters, descriptions/comments 10,000 characters, 1,000 candidates, 10 MiB input files, 50 MiB expanded ZIP data, 100 calendars, and 10,000 occurrences per recurring event. Account authentication, rate limiting, and account-based key recovery are outside this release.
