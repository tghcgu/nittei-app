import EventPage, { generateEventMetadata } from '@/app/e/[shareId]/EventPage'

export function generateMetadata(props: { params: Promise<{ shareId: string }> }) {
  return generateEventMetadata(props)
}
export default function Page(props: { params: Promise<{ shareId: string }> }) {
  return <EventPage {...props} />
}
