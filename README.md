# 日程組

候補日を作ってURLを共有するだけで、参加者がログイン不要かつ無料で回答できる日程調整Webアプリです。

公開URL: https://nittei-app.gucsic.workers.dev/
(旧URL https://nittei-app-five.vercel.app/ からは自動転送されます)

## 概要

飲み会、会議、面談などの日程調整を、できるだけ少ない手間で行うためのサービスです。

主催者はイベント名と候補日を登録し、発行されたURLを参加者へ共有します。参加者は共有URLからアクセスし、各候補日に対して「○」「△」「✕」「-」で回答できます。

「-」を選んだ場合は、「夕方以降ならOK」「仕事次第」などの補足コメントを残せます。単純な○△✕だけでは表しにくい予定のニュアンスも共有できるようにしました。

## 主な機能

### イベント作成

- イベント作成と共有URLの発行(ログイン不要)
- 候補日の手動追加・範囲指定による一括追加・カレンダーからの選択
- 候補日の並び替え(ドラッグ&ドロップ)
- `.ics`ファイル読み込みによる、自分の予定と重なる日の自動判定
- 回答がついた候補日を変更・削除しようとしたときの確認ダイアログ

### 回答

- ○ / △ / ✕ / - の4択回答と、「-」選択時の個別コメント入力
- 回答者ごとの編集・削除
- 回答一覧の縦表示 / 横表示切り替え
- `.ics`読み込みによる、予定がある日の一括✕設定(zip圧縮されたカレンダーにも対応)
- 一括回答パネル:「全部これに揃える」(入力済みの回答を残す設定つき)、日付範囲+時間帯での一括変更、曜日での絞り込み
- スマートフォンでは長押し→ドラッグで複数の候補日をまとめて塗るように回答可能(画面端に到達すると自動スクロール)

### その他

- ライト / ダークモード切り替え
- スマートフォン / PC 両対応
- 回答ページは検索エンジンにインデックスされない設定(回答者の名前が検索結果に出ないようにするため)
- **1年間更新がないイベントは自動削除**(詳細は後述)

## 使用技術

| 分類 | 技術 |
| --- | --- |
| 言語 | TypeScript |
| フロントエンド | React 19 |
| フレームワーク | Next.js 16(App Router) |
| スタイリング | Tailwind CSS 4 |
| データベース | Supabase(PostgreSQL) |
| ホスティング | Cloudflare Workers(OpenNext) |
| 定期実行 | Cloudflare Cron Triggers |
| 旧URLの転送 | Vercel |
| カレンダー解析 | ical.js / fflate(zip展開) |
| 並び替えUI | dnd-kit |
| 計測 | Cloudflare Web Analytics |

## データモデル

Supabase上の4つのテーブルでデータを管理しています。

| テーブル | 内容 | 主な列 |
| --- | --- | --- |
| `events` | イベント本体 | `share_id`(共有URL用ID)、`name`、`description`、`updated_at` |
| `candidates` | 候補日 | `date`、`time_label`(例: 19:00〜)、`sort_order` |
| `responses` | 回答者 | `name` |
| `answers` | 候補日ごとの回答 | `value`(○ / △ / ✕ / -)、`note`(コメント) |

`candidates`・`responses`・`answers`は`events`に外部キーで紐づいており、イベントを削除すると関連データもまとめて削除されます(ON DELETE CASCADE)。

回答値はTypeScript側でも`○ | △ | ✕ | -`に限定し、想定外の値を扱いにくくしています。型定義は`lib/database.types.ts`にまとめています。

## データ保持ポリシー(自動削除)

放置されたイベントが残り続けないよう、**最後の更新から365日が経過したイベントを毎日自動削除**しています。

- Cloudflare Cron Triggersが毎日 19:00 UTC(日本時間 朝4:00)に`/api/cleanup-old-events`を実行します
- 「更新」とみなされる操作: イベントの編集、候補日の追加・変更・削除、回答の追加・編集・削除
- ページを閲覧しただけでは延長されません
- 更新日時は`events.updated_at`列で管理し、PostgreSQLのトリガー(`supabase/auto-delete-old-events.sql`)が関連テーブルの変更を検知して自動的に書き換えます
- 削除APIは`CRON_SECRET`によるBearer認証つきで、外部からは実行できません
- 削除処理はService Role Keyを使ってバッチ実行し、1回の実行で最大4,000件まで処理します

## 技術構成

### Next.js

Next.jsのApp Routerを使い、トップページと共有URLごとの回答ページを実装しています。

- `app/page.tsx`: イベント作成・編集画面
- `app/e/[shareId]/page.tsx`: 共有URLごとの回答ページ(サーバー側のデータ取得とメタデータ)
- `app/e/[shareId]/ResponsePage.tsx`: 回答画面のUIと操作
- `app/api/cleanup-old-events/route.ts`: 古いイベントの自動削除API(Cron Triggersから呼ばれる)
- `app/layout.tsx`: サイト全体のメタデータ、Analytics設定

共有URLの`shareId`をもとにSupabaseからイベント情報を取得し、存在しないイベントの場合は404を返すようにしています。「該当なし」とDB障害を区別し、障害時に404を返さないようにしています。

### React

Reactでは、ユーザー操作に応じて変化する画面状態を管理しています。

- イベント名、説明文、候補日リスト
- 候補日の選択状態
- 回答者名、回答内容、コメント
- 編集中・削除中・送信中などの状態
- エラー表示
- 回答一覧の表示切り替え
- タッチ操作(長押しペイント)のジェスチャー状態

### Supabase

Supabaseをデータベースとして利用しています。

イベント作成時には`events`テーブルにイベント情報を、`candidates`テーブルに候補日を保存します。回答時には`responses`テーブルに回答者情報を、`answers`テーブルに候補日ごとの回答を保存します。

クライアントからはPublishable Key(公開可能キー)でアクセスし、自動削除APIのみサーバー側でService Role Key(管理者キー)を使用しています。

### Cloudflare Workers

OpenNextアダプターでNext.jsをCloudflare Workersにデプロイしています(無料プランで商用利用可・転送量課金なし)。

- `wrangler.jsonc`: Workerの設定とCron Triggers(毎日の自動削除)の定義
- `custom-worker.mjs`: Next.jsのリクエスト処理に加えて、cronから自動削除APIを呼ぶエントリーポイント
- デプロイは`npm run deploy`(webpackビルド → OpenNext変換 → アップロード)

旧URL(vercel.app)へのアクセスは、Vercel側に残した転送設定(`vercel.json`)が新URLへパスごと308リダイレクトします。

## 工夫した点

### 4択回答とコメント

一般的な日程調整では○△✕の3択が多いですが、このアプリでは「-」を追加しました。

「参加できるか未定だが、条件付きで可能」「その日は状況次第」など、△だけでは伝えにくい情報をコメント付きで残せるようにしています。

### 候補日入力の手間を減らすUI

候補日を1日ずつ追加するだけでなく、範囲指定やカレンダー選択にも対応しました。

日数が多いイベントでも、候補日をまとめて登録しやすいようにしています。

### 回答入力の手間を減らすUI

候補日が多いイベントでは1つずつ回答するのが大変なので、一括回答の手段を複数用意しました。

- 「全部これに揃える」で全候補日を一気に設定(入力済みの回答を残すかどうかも選べます)
- 日付範囲+時間帯+曜日で絞り込んでまとめて変更
- スマートフォンでは長押し→ドラッグで、表をなぞるように連続して回答を塗れます

### `.ics`ファイルの活用

カレンダーアプリから出力できる`.ics`ファイルを読み込み、予定がある日を判定できるようにしました。

主催者側では、自分の予定と重なる日を候補日から外せます。回答者側では、予定が入っている日をまとめて✕にできます。Googleカレンダーのエクスポートのようなzipファイルにもそのまま対応しています。

### ログイン不要の設計

日程調整では、参加者にアカウント作成を求めると回答のハードルが上がります。

そのため、URLを共有するだけで回答できる設計にし、できるだけすぐ使える体験を重視しました。

### 放置されたデータを自動で片付ける仕組み

ログイン不要で気軽に作れる分、使い終わったイベントはそのまま放置されがちです。

DBにトリガーで「最終更新日時」を記録し、Cloudflareの定期実行で1年間動きのないイベントを毎日自動削除することで、運用の手間なくデータを健全に保てるようにしました。

## セットアップ

### 1. インストール

```bash
git clone https://github.com/tghcgu/nittei-app.git
cd nittei-app
npm install
```

### 2. Supabaseの準備

Supabaseでプロジェクトを作成し、SQL Editorで以下を実行します。

1. テーブル作成(`events` / `candidates` / `responses` / `answers`。スキーマは`SPEC.md`を参照)
2. `supabase/rls-policies.sql`(RLSポリシー)
3. `supabase/auto-delete-old-events.sql`(自動削除用の`updated_at`列とトリガー)

### 3. 環境変数

`.env.local`に以下を設定します。

```env
NEXT_PUBLIC_SUPABASE_URL=      # SupabaseプロジェクトのURL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # Publishable Key(公開可能キー)
```

本番(Cloudflare)では、自動削除のために以下をシークレットとして設定します(`npx wrangler secret put 名前`)。

```env
SUPABASE_SERVICE_ROLE_KEY=     # Secret Key(サーバー専用・非公開)
CRON_SECRET=                   # Cron認証用のランダム文字列
```

実際の値は公開しないでください。

### 4. 起動

```bash
npm run dev
```

起動後、ブラウザで http://localhost:3000 を開きます。

## 確認コマンド

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## ディレクトリ構成

```text
app/
  page.tsx                        イベント作成・編集画面
  layout.tsx                      全体レイアウト・メタデータ
  globals.css                     和紙風テーマ・ダークモードのスタイル
  ThemeToggle.tsx                 ライト/ダーク切り替えボタン
  robots.ts / sitemap.ts          検索エンジン向け設定
  privacy/ / terms/               プライバシーポリシー・利用規約
  e/[shareId]/page.tsx            回答ページ(データ取得・メタデータ)
  e/[shareId]/ResponsePage.tsx    回答ページのUIと操作
  api/cleanup-old-events/route.ts 古いイベントの自動削除API
lib/
  supabase.ts                     Supabaseクライアント
  database.types.ts               テーブル型定義
  calendar-files.ts               .ics / zipファイルの解析
  site.ts                         サイト名・URL・説明文
supabase/
  rls-policies.sql                RLSポリシー
  auto-delete-old-events.sql      自動削除用の列・トリガー定義
wrangler.jsonc                    Cloudflare Workerの設定・Cron定義
custom-worker.mjs                 Workerのエントリーポイント(cron処理つき)
open-next.config.ts               OpenNextアダプターの設定
vercel.json                       旧URLから新URLへの転送設定
```

## ブランチ運用とデプロイ

| ブランチ | 役割 |
| --- | --- |
| `main` | ソースの正本 |
| `develop` | 開発用 |

developで実装し、`npm run preview`(ローカルのCloudflare実行環境)で確認後、`npm run deploy`で本番へデプロイしています。

## 今後の改善案

- 回答集計の見やすさ改善
- 候補日ごとの参加人数表示の強化
- Googleカレンダー連携
- イベント編集時の権限管理
- 共有時のOGP表示の改善

## お問い合わせ

nittei.app5@gmail.com
