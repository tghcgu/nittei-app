import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: web addresses in the description open in a new tab, other text stays text`, async ({ page, request }) => {
    const { path } = getI18n(locale)
    const shareId = `description-links-${locale}`
    // a closing bracket or Japanese text right after the address is not part of it
    const description = [
      '地図：https://example.com/map?q=1&z=2。',
      '会議 (https://example.com/meet) は20時から',
      'Wiki: http://example.org/a_(b).',
      'javascript:alert(1) と example.com はリンクにしない',
    ].join('\n')
    const seeded = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Links', description } })
    expect(seeded.ok()).toBe(true)
    const [event] = await seeded.json()
    await request.post(`${api}/candidates`, { data: [{ event_id: event.id, date: '2026-11-02', sort_order: 0 }] })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path(`/e/${shareId}`))

    // the description is shown at the top and again above the results
    const blocks = page.locator('p').filter({ hasText: '地図：' })
    await expect(blocks).toHaveCount(2)
    for (const block of await blocks.all()) {
      expect(await block.textContent()).toBe(description)
      const links = block.getByRole('link')
      expect(await links.evaluateAll(anchors => anchors.map(anchor => (anchor as HTMLAnchorElement).getAttribute('href')))).toEqual([
        'https://example.com/map?q=1&z=2',
        'https://example.com/meet',
        'http://example.org/a_(b)',
      ])
      for (const link of await links.all()) {
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', /noopener/)
      }
    }
    expect(errors).toEqual([])
  })
}
