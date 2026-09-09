'use client'

import { usePathname } from 'next/navigation'
import { localizedPath } from '@/lib/i18n'
import { useI18n } from './LocaleProvider'
import { LANGUAGE_SWITCH_EVENT } from './useLanguageDraft'

export function LanguageSwitch() {
  const pathname = usePathname()
  const { locale } = useI18n()
  const target = locale === 'ja' ? 'en' : 'ja'
  return (
    <a
      href={localizedPath(pathname, target)}
      lang={target}
      hrefLang={target}
      onClick={(event) => {
        if (!window.dispatchEvent(new Event(LANGUAGE_SWITCH_EVENT, { cancelable: true }))) {
          event.preventDefault()
          return
        }
        // Keep editing parameters and anchors when switching root layouts.
        event.currentTarget.href = localizedPath(pathname, target) + window.location.search + window.location.hash
      }}
      className="whitespace-nowrap text-[11px] text-stone-600 underline-offset-2 hover:text-rose-700 hover:underline"
    >
      {target === 'en' ? 'English' : '日本語'}
    </a>
  )
}
