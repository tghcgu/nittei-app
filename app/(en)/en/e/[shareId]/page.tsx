import EventPage, { generateEventMetadata } from '@/app/e/[shareId]/EventPage'

type Props = { params: Promise<{ shareId: string }> }
export function generateMetadata(props: Props) {
  return generateEventMetadata({ ...props, locale: 'en' })
}
export default function Page(props: Props) {
  return <EventPage {...props} />
}
