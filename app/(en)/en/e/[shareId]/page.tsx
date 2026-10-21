import EventPage, { eventShellMetadata, eventStaticParams } from '@/app/e/[shareId]/EventPage'

// 共通ファイル en/e/_ だけを作る。ほかの共有IDは custom-worker.mjs がこのファイルで返す
export const dynamicParams = false
export const generateStaticParams = eventStaticParams
export const metadata = eventShellMetadata

export default EventPage
