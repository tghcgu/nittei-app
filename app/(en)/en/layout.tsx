import SiteLayout from '@/app/SiteLayout'
import { localizedMetadata } from '@/lib/i18n/metadata'

export const metadata = localizedMetadata('en')

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return <SiteLayout locale="en">{children}</SiteLayout>
}
