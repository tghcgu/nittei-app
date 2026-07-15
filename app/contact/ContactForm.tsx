'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const MAX_MESSAGE_LENGTH = 2000
const MAX_EMAIL_LENGTH = 255

export function ContactForm() {
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedMessage = message.trim()
    if (!trimmedMessage || status === 'sending') return

    // ボット対策: 画面に見えない入力欄が埋まっていたら保存せず成功扱いにする
    if (honeypot) {
      setStatus('done')
      return
    }

    setStatus('sending')
    const trimmedEmail = email.trim()
    const { error } = await supabase.from('inquiries').insert({
      message: trimmedMessage.slice(0, MAX_MESSAGE_LENGTH),
      email: trimmedEmail ? trimmedEmail.slice(0, MAX_EMAIL_LENGTH) : null,
    })
    setStatus(error ? 'error' : 'done')
  }

  if (status === 'done') {
    return (
      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-relaxed text-rose-800">
        送信しました。ありがとうございます。
        内容を確認のうえ、返信用メールアドレスをいただいた場合は必要に応じてご連絡します。
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-4">
      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-stone-700">
          お問い合わせ内容 <span className="text-rose-700">*</span>
        </label>
        <textarea
          id="contact-message"
          required
          rows={6}
          maxLength={MAX_MESSAGE_LENGTH}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            '不具合のご報告の場合は、イベントページのURL・どの操作で何が起きたか・お使いの端末(スマートフォン / PC)も書いていただけると助かります。'
          }
          className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm leading-relaxed text-stone-800 placeholder:text-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
        />
        <p className="mt-0.5 text-right text-[11px] text-stone-400">
          {message.length} / {MAX_MESSAGE_LENGTH}
        </p>
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-stone-700">
          返信用メールアドレス(任意)
        </label>
        <input
          id="contact-email"
          type="email"
          maxLength={MAX_EMAIL_LENGTH}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="返信をご希望の場合のみ"
          className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-300 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
        />
      </div>

      {/* ボット対策用の見えない入力欄(人は触らない) */}
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      {status === 'error' && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          送信に失敗しました。時間をおいて、もう一度お試しください。
        </p>
      )}

      <button
        type="submit"
        disabled={!message.trim() || status === 'sending'}
        className="w-full rounded-full bg-rose-800 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status === 'sending' ? '送信中...' : '送信する'}
      </button>
    </form>
  )
}
