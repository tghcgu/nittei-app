import type { ReactNode } from 'react'

// http(s) の URL だけを押せるリンクにする（javascript: などは文字のまま）。
// URL に使える半角の文字までを URL とみなすので、「https://example.com/です」の「です」は含めない
const URL_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%()]+/g
const TRAILING = /[.,!?;:]$/

// 文の終わりの「.」や、URL を囲んだ閉じかっこは URL に含めない
function trimUrl(url: string) {
  let trimmed = url
  for (;;) {
    if (TRAILING.test(trimmed)) trimmed = trimmed.slice(0, -1)
    else if (trimmed.endsWith(')') && trimmed.split('(').length < trimmed.split(')').length) trimmed = trimmed.slice(0, -1)
    else return trimmed
  }
}

export function LinkifiedText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0])
    if (url.length <= 'https://'.length) continue
    parts.push(text.slice(last, match.index))
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="break-all text-rose-700 underline underline-offset-2 hover:text-rose-800"
      >{url}</a>
    )
    last = match.index + url.length
  }
  parts.push(text.slice(last))
  return <>{parts}</>
}
