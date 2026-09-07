import ContactPage from '@/app/contact/ContactPage'
import { localizedMetadata } from '@/lib/i18n/metadata'

export const metadata = localizedMetadata('en', '/contact', 'お問い合わせ', '日程組に関する不具合のご報告・ご要望などの連絡先をご案内します。')
export default function Page() { return <ContactPage locale="en" /> }
