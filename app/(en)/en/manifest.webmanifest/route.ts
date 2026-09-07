import manifest from '@/app/manifest'
import { siteUrl } from '@/lib/site'
import { englishDescription } from '@/lib/i18n/metadata'

export const dynamic = 'force-static'

export function GET() {
  return Response.json({
    ...manifest(),
    id: '/en',
    name: 'Nitteigumi',
    short_name: 'Nitteigumi',
    description: englishDescription,
    lang: 'en',
    start_url: `${siteUrl}/en`,
    scope: '/',
  }, { headers: { 'Content-Type': 'application/manifest+json' } })
}
