import { notFound } from 'next/navigation'

// どのページにも当たらないURLも、この言語の「見つかりません」ページにする
export default function UnmatchedPage() { notFound() }
