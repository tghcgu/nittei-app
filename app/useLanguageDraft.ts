'use client'

import { useEffect, useEffectEvent } from 'react'
import { useI18n } from './LocaleProvider'

export const LANGUAGE_SWITCH_EVENT = 'nittei-language-switch'

export function useLanguageDraft<T>(key: string | null, snapshot: T, restore: (snapshot: T) => void) {
  const { t } = useI18n()
  const restoreLatest = useEffectEvent(restore)
  const saveLatest = useEffectEvent((event: Event) => {
    if (!key) return
    try { sessionStorage.setItem(`nittei-draft-${key}`, JSON.stringify(snapshot)) }
    catch {
      event.preventDefault()
      window.alert(t('下書きを保持できないため、言語を切り替えられません。入力内容を保存してから切り替えてください。'))
    }
  })
  useEffect(() => {
    if (!key) return
    try {
      const saved = sessionStorage.getItem(`nittei-draft-${key}`)
      sessionStorage.removeItem(`nittei-draft-${key}`)
      if (saved) restoreLatest(JSON.parse(saved) as T)
    } catch { /* An unreadable draft must not prevent opening the page. */ }
    const save = (event: Event) => saveLatest(event)
    window.addEventListener(LANGUAGE_SWITCH_EVENT, save)
    return () => window.removeEventListener(LANGUAGE_SWITCH_EVENT, save)
  }, [key])
}
