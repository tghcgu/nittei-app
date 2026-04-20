@AGENTS.md

# ブランチ運用ルール

## ブランチ構成

| ブランチ | 役割 |
|---|---|
| `main` | 本番環境（Vercel本番URL）。直接pushしない。 |
| `develop` | 開発用。ここで実装・テストを行う。 |

## 新機能を実装するときのルール

1. **必ず `develop` ブランチで作業する**
   - 作業前に `git branch` で現在のブランチを確認する
   - `main` に直接 commit・push しない

2. **developにpushすると、VercelがプレビューURLを自動発行する**
   - プレビューURLで動作確認を行う

3. **動作確認OKなら `main` にマージして本番反映**
   - GitHubのPull Request経由でマージするか、ユーザーの指示に従う

## よく使うコマンド（参考）

```bash
# 現在のブランチ確認
git branch

# developブランチに切り替え
git checkout develop

# developにpush（通常の作業）
git push origin develop

# mainにマージ（本番反映時のみ・ユーザーの指示があったとき）
git checkout main
git merge develop
git push origin main
git checkout develop
```
