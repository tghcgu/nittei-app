import HistoryPage from '@/app/history/HistoryPage'
import { localizedMetadata } from '@/lib/i18n/metadata'

export const metadata = {
  ...localizedMetadata('en', '/history', 'ページ表示履歴', 'この端末で開いた日程組のイベントページの一覧です。端末内にのみ保存されます。'),
  robots: { index: false, follow: true },
}
export default function Page() { return <HistoryPage locale="en" /> }
