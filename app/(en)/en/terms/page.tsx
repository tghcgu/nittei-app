import TermsPage from '@/app/terms/TermsPage'
import { localizedMetadata } from '@/lib/i18n/metadata'

export const metadata = localizedMetadata('en', '/terms', '利用規約', '日程組の利用条件・禁止事項・免責事項について定めます。')
export default function Page() { return <TermsPage locale="en" /> }
