import type { Metadata } from 'next'
import { EventLoader } from './EventLoader'

// イベントのページは、どのイベントでも同じ1つのファイル（out/e/_.html と out/en/e/_.html）。
// /e/<共有ID> を開くと custom-worker.mjs がイベントを読み、このファイルにタイトル・共有リンクのプレビュー用の
// タグと、イベントの中身（JSON）を入れて返す。EventLoader がその JSON から画面を作る。
export const EVENT_SHELL_ID = '_'

export function eventStaticParams() {
  return [{ shareId: EVENT_SHELL_ID }]
}

// タイトル・説明・URL・共有リンクのプレビュー用のタグは、custom-worker.mjs がイベントごとに入れる。
// ここ（Next.js）で出すと、画面を作るときに Next.js が共通の値のタグを足して二重になるので、消しておく
export const eventShellMetadata: Metadata = {
  title: null,
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  // イベントページには回答者名が載るため検索エンジンに載せない
  // （LINE/Slack等のURLプレビューには影響しない）
  robots: { index: false, follow: true },
}

export default function EventPage() {
  return <EventLoader />
}
