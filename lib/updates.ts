import type { MessageKey } from './i18n'

// Record production releases here, not changes awaiting the secure DB rollout.
export const updates = [
  {
    date: '2026-09-13',
    title: '更新履歴を公開',
    changes: ['更新履歴を日本語と英語で確認できるページを追加しました。'],
  },
  {
    date: '2026-09-12',
    title: '日またぎ予定と入力の保持',
    changes: [
      '翌日にまたがる候補日時と、終日・繰り返し予定の重なり判定を改善しました。',
      '日英を切り替えても、入力途中の内容と「戻す・進む」の履歴を保持するようにしました。',
      '通信エラー後に新規回答を再送したときの重複を防ぐようにしました（ページの再読み込み前）。',
      '大きすぎるカレンダーファイルの読み込み制限を追加しました。',
    ],
  },
  {
    date: '2026-09-10',
    title: 'PCとスマホの時刻欄を統一',
    changes: [
      'PCでもスマホと同じ順序で時刻入力・適用ボタン・戻す・進むを配置しました。',
      '日本語の回答選択肢を、説明付きでスマホでも一行に収まる表示に戻しました。',
      '言語切替リンクをフッターに移しました。',
    ],
  },
  {
    date: '2026-09-07',
    title: '英語版を公開',
    changes: [
      'イベント作成・回答・編集・カレンダー読み込みなどの英語表示に対応しました。',
      '日本語版と英語版で、同じイベントと回答データを利用できます。',
      '長い英数字の名前やコメントの改行と、スマホの時刻欄の配置を改善しました。',
    ],
  },
] as const satisfies readonly { date: string; title: MessageKey; changes: readonly MessageKey[] }[]
