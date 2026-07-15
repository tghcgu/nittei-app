@AGENTS.md

# デプロイとブランチ運用ルール

## 構成（2026-07-09 に Vercel から Cloudflare へ移行済み）

| 場所 | 役割 |
|---|---|
| 本番 | Cloudflare Workers: https://nittei-app.qoj.workers.dev |
| 旧URL | https://nittei-app-five.vercel.app は Vercel が新URLへ308転送（vercel.json で設定） |
| `main` | ソースの正本。**push しても本番は変わらない**（Vercel の転送設定のみ反映される） |
| `develop` | 開発用。ここで実装・テストを行う |

## 本番反映の手順

1. **必ず `develop` ブランチで作業する**（作業前に `git branch` で確認）
2. lint / typecheck / build を通す
   - `npm run lint`
   - `.\node_modules\.bin\tsc.cmd --noEmit`
   - `npm run build`
3. 見た目の確認が必要なら `npm run preview`（ローカルの Cloudflare 実行環境 workerd で起動、http://localhost:8787）
4. **本番反映はユーザーの指示があったとき、`npm run deploy` を実行**（ローカルから Cloudflare へ直接デプロイ。git push ではデプロイされない）
5. main へのマージもユーザーの指示があったとき（ソースの同期のため）

## Cloudflare まわりの注意

- Cloudflare 用ビルドは **webpack** を使う（`npm run deploy` / `npm run preview` に組み込み済み。Turbopack の成果物は OpenNext が読めない）
- シークレットは `npx wrangler secret put 名前`（`SUPABASE_SERVICE_ROLE_KEY` と `CRON_SECRET` は設定済み）
- 自動削除 cron は `wrangler.jsonc` の `triggers`（毎日 19:00 UTC = 日本時間 朝4:00）で、エントリーポイントは `custom-worker.mjs`
