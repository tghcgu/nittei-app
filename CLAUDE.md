@AGENTS.md

# デプロイとブランチ運用ルール

作業前に `HANDOFF.md`（先頭が最新）と `SECURE-ROLLOUT.md` を読み、本番の状態を確認すること。

## 構成

| 場所 | 役割 |
|---|---|
| 本番 | Cloudflare Workers: https://nittei-app.qoj.workers.dev |
| 旧URL | https://nittei-app-five.vercel.app は Vercel が新URLへ301転送（vercel.json で設定。Vercel の Git デプロイは無効化済み） |
| `release/ui-20260910` | **本番で動いているコード**（今のDBで動く版）。作業ツリーは `C:\Users\tkt01\Desktop\nittei-app-ui-release` |
| `main` | ソースの正本。未適用のDB移行（`supabase/secure-scheduling.sql`）が前提の保存処理を含むため、**DB移行が済むまで本番へ deploy してはいけない** |
| `develop` | 旧来の開発用ブランチ。今は使っていない（2026-09-24 に main と同じ内容へ揃えた） |

## 作業の流れ

1. main から作業ブランチ（例 `fix/…`、`ui/…`）を作って実装する
2. 本番に出す変更は、release から `preview/…` ブランチを作って同じ変更を入れる（release の旧保存処理を main に戻さない）
3. lint / typecheck / テスト / build を通す
   - `npm run lint`
   - `.\node_modules\.bin\tsc.cmd --noEmit`
   - `npm test`（Playwright。専用ブラウザーが未導入なら `PLAYWRIGHT_CHROMIUM_EXECUTABLE` に既存の Chromium を指定）
   - `npx next build --webpack`
4. 確認用URLは preview ブランチで `npx next build --webpack` → `npx opennextjs-cloudflare build --skipNextBuild` → `npx opennextjs-cloudflare upload -- --preview-alias 名前`。確認用イベントは `/e/ohbcvs2j`（プレビューも本番DBにつながるので、手で保存すると本物のデータになる）
5. **本番反映とマージはユーザーの指示（「マージ」）があったときだけ**。作業ブランチを main へ、preview ブランチを release へ fast-forward して push し、**release の作業ツリーで `npm run deploy`**、公開サイトで動作確認まで行う。Worker の Version ID を `HANDOFF.md` に記録する
6. deploy の成否は必ず確かめる（パイプで終了コードを隠さない。`npx wrangler deployments status` で本番のバージョンを確認する）

## Cloudflare まわりの注意

- Cloudflare 用ビルドは **webpack** を使う（`npm run deploy` / `npm run preview` に組み込み済み。Turbopack の成果物は OpenNext が読めない）
- シークレットは `npx wrangler secret put 名前`（`SUPABASE_SERVICE_ROLE_KEY` と `CRON_SECRET` は設定済み）
- 自動削除 cron は `wrangler.jsonc` の `triggers`（毎日 19:00 UTC = 日本時間 朝4:00）で、エントリーポイントは `custom-worker.mjs`
