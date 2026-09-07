'use client'

import { createContext, useContext } from 'react'
import { getI18n, type Locale } from '@/lib/i18n'

const LocaleContext = createContext<Locale>('ja')

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useI18n() { return getI18n(useContext(LocaleContext)) }
