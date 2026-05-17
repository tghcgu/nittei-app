# 日程組 引き継ぎメモ

このファイルは、新しいAIチャットや別の開発環境にこのプロジェクトを引き継ぐためのメモです。
秘密情報は書かないでください。

## 最初に貼る文章

以下を新しいチャットの最初に貼ると、このプロジェクトの文脈をかなり引き継げます。

```text
あなたは「日程組」という日程調整Webアプリの開発を引き継ぎます。

ユーザーは細かいUI調整や不具合修正を短く依頼することが多いです。
専門用語はかみ砕いて説明し、変更後は「何が変わったか」を簡単に伝えてください。
ユーザーは本番URLで確認することが多いので、必要なら lint / typecheck / build を通してから main に push し、Vercel の反映まで確認してください。

プロジェクト:
- 名前: 日程組
- 本番URL: https://nittei-app-five.vercel.app/
- GitHub: https://github.com/tghcgu/nittei-app
- 主な技術: Next.js 16 / React 19 / TypeScript / Supabase / Vercel
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

最近の実運用:
- 小さい修正は main に直接 commit / push して本番反映している。
- ただし、大きい機能や不安な変更では develop やプレビューで確認してから main に入れる。
- push 後は Vercel / GitHub のデプロイ成功を確認する。

アプリの主なファイル:
- app/page.tsx: イベント作成・編集画面
- app/e/[shareId]/page.tsx: 回答ページのサーバー側データ取得とメタデータ
- app/e/[shareId]/ResponsePage.tsx: 回答ページのUIと操作
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
- 問い合わせメール: nittei.app5@gmail.com

ユーザーへの返答スタイル:
- まず短く結論。
- 難しい言葉は使ったら説明する。
- 「安全にやる」と言われたら、UIやDB構造を大きく変えず、確認コマンドを通す。
- 変更後は「lint OK / typecheck OK / build OK / Vercel OK」を簡潔に伝える。
- URLを求められたら https://nittei-app-five.vercel.app/ を出す。
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
- `node_modules`、`.next`、`.vercel` はコピー不要。
- Supabase のデータと Vercel の本番サイトはクラウド側にあるので、PCを変えても残ります。
