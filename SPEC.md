# 日程調整アプリ 仕様書

## 概要
伝助のような日程調整Webアプリ。URL共有で誰でも回答可能。
将来的にGoogleカレンダー連携で自動入力機能を追加予定（今回はまだ作らない）。

## 技術スタック
- **Next.js 15**（App Router, TypeScript）
- **Tailwind CSS**
- **Supabase**（DB、フェーズ2で認証も追加）
- **Vercel**（デプロイ先、最終段階で設定）

## フェーズ1で作る機能（今回の範囲）

### 1. イベント作成ページ（`/`）
- イベント名、説明、候補日時（複数）を入力
- 「作成する」ボタンで保存し、共有URL `/e/[shareId]` を発行
- ログイン不要

### 2. 回答・集計ページ（`/e/[shareId]`）
- イベント情報を表示
- 自分の名前を入力
- 各候補日に対して以下から選択：
  - **○** 夜OK
  - **△** 他卓調整中・日程不明等
  - **✕** NG
  - **-** その他（選択するとテキスト入力欄が出る）
- 「回答を送信」で保存
- 下に全員分の集計テーブルを表示
- スコア計算：○=2点、△=1点、-=0.5点、✕=0点
- 最高スコアの日程をハイライト

## データモデル（Supabase）

```sql
-- イベント
create table events (
  id uuid primary key default gen_random_uuid(),
  share_id text unique not null, -- URL用の短いID（例: "a3k9x2"）
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- 候補日
create table candidates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  date date not null,
  time_label text, -- 例: "19:00〜"
  sort_order int default 0
);

-- 回答者
create table responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- 各候補日への回答
create table answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid references responses(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  value text not null check (value in ('○', '△', '✕', '-')),
  note text
);
```

RLS（Row Level Security）は一旦オフ。誰でも読み書き可能な状態でOK。

## デザイン方針
- 和紙風の温かい背景色（クリーム系 #f5efe4 グラデーション）
- タイトル・日付は明朝体（Noto Serif JP）
- 本文はゴシック体（Noto Sans JP）
- アクセントカラーは深い紅色（rose-800）
- 余白多めで読みやすく

## 実装ステップ

### Step 1: プロジェクト初期化
- `create-next-app` でNext.js + TypeScript + Tailwindをセットアップ
- 不要なボイラープレート削除
- 基本レイアウト作成
- **Supabaseの接続はまだしない**、仮データでUIだけ先に作る

### Step 2: UI実装（モックデータで）
- `/` トップページ：イベント作成フォーム
- `/e/[shareId]` ページ：回答フォーム + 集計テーブル
- デモ版（nittei-demo）と同じ見た目で

### Step 3: Supabase接続
- Supabaseプロジェクト作成手順を案内
- 環境変数（.env.local）設定
- 上記SQLでテーブル作成
- クライアントから実際に読み書きできるように

### Step 4: ローカル動作確認
- `npm run dev` で起動
- イベント作成→URL発行→別タブで回答→集計、の流れが動くことを確認

### Step 5: Vercelデプロイ
- GitHubリポジトリ作成
- Vercel連携
- 環境変数をVercelにも設定

## 作業時の注意
- 各ステップが終わるごとに、ユーザー（初心者）に何をすればいいか明確に指示する
- コマンドは一つずつ、コピペできる形で提示
- エラーが出そうな箇所は事前に説明
- Supabaseの設定など、ブラウザ作業が必要なときは画面のどこを見るか具体的に
