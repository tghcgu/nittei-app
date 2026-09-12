import UpdatesPage from '@/app/updates/UpdatesPage'
import { localizedMetadata } from '@/lib/i18n/metadata'

export const metadata = localizedMetadata('en', '/updates', '更新履歴', '日程組の新機能・改善・不具合修正の記録です。')
export default function Page() { return <UpdatesPage locale="en" /> }
