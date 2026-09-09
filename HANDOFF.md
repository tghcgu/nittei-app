# 日程組 引き継ぎメモ

このファイルは、新しいAIチャットや別の開発環境にこのプロジェクトを引き継ぐためのメモです。
秘密情報は書かないでください。

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
