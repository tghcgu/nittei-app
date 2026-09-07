import PrivacyPage from '@/app/privacy/PrivacyPage'
import { localizedMetadata } from '@/lib/i18n/metadata'

export const metadata = localizedMetadata('en', '/privacy', 'プライバシーポリシー', '日程組における利用者情報・データの取り扱いについて説明します。')
export default function Page() { return <PrivacyPage locale="en" /> }
