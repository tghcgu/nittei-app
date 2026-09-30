import { expect, test, type Locator } from '@playwright/test'

const api = 'http://127.0.0.1:54329/rest/v1'

// WCAG contrast between an element's text and the background actually painted behind it.
// Colours are read by painting a canvas pixel, so oklch() and translucent layers are handled.
const contrast = (target: Locator) => target.evaluate(element => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  const rgba = (value: string) => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    return { r, g, b, a: a / 255 }
  }
  type Colour = ReturnType<typeof rgba>
  const over = (top: Colour, bottom: Colour) => ({
    r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1,
  })
  const luminance = ({ r, g, b }: Colour) => {
    const channel = (value: number) => { value /= 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const layers: Colour[] = []
  for (let node: Element | null = element; node; node = node.parentElement) {
    const colour = rgba(getComputedStyle(node).backgroundColor)
    if (colour.a > 0) layers.push(colour)
    if (colour.a >= 1) break
  }
  let background = layers.at(-1)?.a === 1 ? layers.pop()! : rgba(document.documentElement.dataset.theme === 'dark' ? '#0a0a0a' : '#f1e9dc')
  while (layers.length) background = over(layers.pop()!, background)
  const text = over(rgba(getComputedStyle(element).color), background)
  const [lighter, darker] = [luminance(text), luminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
})

test('a selected ✕ stays readable in the dark theme', async ({ page, request }) => {
  const created = await request.post(`${api}/events`, { data: { share_id: 'contrast-dark', name: 'Contrast', answer_choices: '◎○△✕' } })
  expect(created.ok()).toBe(true)
  const [event] = await created.json()
  const [candidate] = await (await request.post(`${api}/candidates`, { data: { event_id: event.id, date: '2026-10-01', sort_order: 0 } })).json()
  await page.goto('/e/contrast-dark')
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.locator('.theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    for (const value of ['◎', '○', '△', '✕', '-']) {
      const button = page.locator(`[data-answer-candidate-id="${candidate.id}"][data-answer-value="${value}"]`)
      await button.click()
      await expect(button).toHaveClass(/font-bold/)
      // the dark ✕ used to be 1.15:1, light text on a light fill. Polling lets the colour transition finish.
      await expect.poll(() => contrast(button), `${theme} selected ${value}`).toBeGreaterThanOrEqual(4.5)
    }
  }
})

test('weekend dates on the calendar are as readable as weekdays', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.locator('.theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const days = await page.locator('[data-calendar-date]').evaluateAll(buttons => buttons.map(button => ({
      date: button.getAttribute('data-calendar-date')!, weekday: new Date(`${button.getAttribute('data-calendar-date')}T00:00:00`).getDay(),
    })))
    for (const weekday of [0, 6]) {
      const day = days.find(item => item.weekday === weekday)!
      await expect.poll(() => contrast(page.locator(`[data-calendar-date="${day.date}"]`)), `${theme} weekday ${weekday}`).toBeGreaterThanOrEqual(4.5)
    }
  }
})
