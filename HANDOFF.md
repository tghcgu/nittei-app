# 日程組 引き継ぎメモ

## 2026-09-12 反映・09-13 確認: 改善版 / Production Improvements

このフォルダーには、日またぎ・終日・繰り返し例外の判定、ファイル上限、日英切替時の下書き・履歴の保持、新規回答の再送時のID再利用、英語の月選択ラベル短縮を追加しました。22件のPlaywrightテスト、lint、TypeScript込みのwebpackビルド、OpenNextビルドが成功しました。再送テストは、途中で保存された名前ではなく送信完了を待ってからDBを検査します。

DBは変更せず、公開Workerを下記の改善版へ切り替えました。新規回答の再送は重複を防ぎますが、旧DBへの複数回の書き込みは引き続き原子的ではありません。完全な保存・権限の更新はmainの `supabase/secure-scheduling.sql` と対応アプリの同時切り替えが必要です。旧保存処理をmainへ戻さないでください。

Git管理情報をバックアップ後、失われたmainのHEAD参照を復旧し、GitHubからリモート参照を取得しました。`git fsck --no-dangling` は成功しています。欠けていたアイコンと日英の既存テストは元のコミットから復元しました。faviconとicon.pngは元データとハッシュ一致を確認済みです。ユーザーの `.vscode/` は変更していません。

本番Worker: `d1229529-9fbc-482c-a159-ce4c7e03787e` (100%)、アプリ: `22f8e85`。直前の互換Workerは `45745046-71e2-4172-8766-7f1b54e96129` です。プレビュー https://improvements-nittei-app.qoj.workers.dev と本番 https://nittei-app.qoj.workers.dev/ で、日英トップ・既存イベント・320/390/1440px・元のアイコン・下書き・日またぎ判定を確認しました。横あふれ・ブラウザーエラーなし。本番DBへの書き込みテストは行っていません。

Client-only fixes and stable IDs for retrying a new response passed all 22 browser tests, lint, TypeScript, webpack and OpenNext builds. Git metadata and original assets were recovered without resetting working changes. Application `22f8e85` is deployed on the Worker above at 100%; read-only preview and production checks passed in both locales at all three widths, including original icon hashes. This is not the secure DB rollout: multi-request writes can still be partial, and retry deduplication does not survive a page reload.

このファイルは、新しいAIチャットや別の開発環境にこのプロジェクトを引き継ぐためのメモです。
秘密情報は書かないでください。

## 2026-09-10: 本番UIリリース / Production UI release

このブランチ `release/ui-20260910` は、既存DBで動く `af7801c` にUI修正 `6568c72` とmainの依存更新を取り込んだ本番用です。アプリ `0bb7908` をWorker `bbdd0f78-0c0c-4a65-8170-390227e3219f` として100%配信しました。

テスト11件・lint・TypeScript・webpack/OpenNextビルド成功。本番とプレビューの日英トップ・既存イベントを320/390/1440pxで確認済み。本番データの書き換えテストやSQL移行は行っていません。

最新mainは別途SQL移行が必要です。旧保存処理をこのブランチからmainへ戻さないでください。[mainの切り替え手順と依存警告](https://github.com/tghcgu/nittei-app/blob/main/SECURE-ROLLOUT.md)を確認してください。

This UI-only production backport preserves legacy storage. Main's secure persistence release remains pending a coordinated database migration. See the linked rollout notes before deployment; they also record the outstanding Miniflare/Sharp tooling audit warnings.

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
- supabase/rls-policies.sql: Supabase RLSポリシー

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
