import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: the edit form cannot be typed into until the saved event has loaded`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `edit-loading-${locale}`
    const seeded = await request.post(`${api}/events`, { data: { share_id: shareId, name: 'Saved name', description: 'Saved description' } })
    expect(seeded.ok()).toBe(true)
    const [event] = await seeded.json()
    await request.post(`${api}/candidates`, { data: [{ event_id: event.id, date: '2026-11-02', sort_order: 0 }] })

    // hold the event back so the loading state lasts long enough to look at
    let release = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    await page.route(url => url.pathname.endsWith('/rest/v1/events') && url.searchParams.get('share_id') === `eq.${shareId}`, async route => {
      await held
      await route.continue()
    })
    await page.goto(path(`/?edit=${shareId}`))
    const name = page.getByPlaceholder(t('例：みんなでご飯'))
    await expect(page.getByText(t('日程を読み込んでいます...'), { exact: true })).toBeVisible()
    await expect(name).toBeDisabled()
    await expect(page.getByPlaceholder(t('場所や詳細など'))).toBeDisabled()
    await expect(page.locator('[data-calendar-date]').first()).toBeDisabled()

    release()
    await expect(name).toBeEnabled()
    await expect(name).toHaveValue('Saved name')
    await name.fill('Changed name')
    await expect(name).toHaveValue('Changed name')
  })
}
