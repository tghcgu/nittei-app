import { NextRequest, NextResponse } from 'next/server'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-2.0-flash'

type CalendarEvent = {
  date: string
  startTime: string | null
  endTime: string | null
  title: string
}

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  let imageBase64: string
  let mimeType: string
  try {
    const body = await req.json()
    imageBase64 = body.imageBase64
    mimeType = body.mimeType
    if (!imageBase64 || !mimeType) throw new Error('missing fields')
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const prompt = `この画像はカレンダーや手帳です。写っている全ての予定をJSONで返してください。
フォーマット: [{"date":"2026-04-25","startTime":"19:00","endTime":"21:00","title":"予定名"}]
ルール:
- date は YYYY-MM-DD 形式（年が画像にない場合は今年を使う）
- startTime / endTime は HH:MM 形式（24時間）
- 時刻が不明な場合は startTime と endTime を null にする
- 予定が全くない場合は空配列 [] を返す
- JSONのみ返す（説明文・コードブロック記号は不要）`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          }],
          generationConfig: { temperature: 0 },
        }),
      }
    )

    if (!res.ok) {
      return NextResponse.json({ error: `Gemini API error: ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // コードブロックや余分なテキストを除いてJSON配列を抽出
    const cleaned = text.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (!match) {
      return NextResponse.json({ events: [] })
    }

    const events: CalendarEvent[] = JSON.parse(match[0])
    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ error: 'Failed to analyze image' }, { status: 502 })
  }
}
