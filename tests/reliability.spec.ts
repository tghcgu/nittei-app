import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

const api = 'http://127.0.0.1:54329/rest/v1'

for (const locale of ['ja','en'] as const) {
  test(`${locale}: drafts, atomic retries, edit links, options, and mobile toolbar`, async ({ page, request, browser }) => {
    const { t, path } = getI18n(locale)
    const other = getI18n(locale === 'ja' ? 'en' : 'ja')
    const switchAway = locale === 'ja' ? 'English' : '日本語'
    const switchBack = locale === 'ja' ? '日本語' : 'English'
    const eventName = `Reliable event ${locale}`
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto(path('/'))
    await page.getByPlaceholder(t('例：みんなでご飯')).fill(eventName)
    await page.getByRole('button', {name:t('📅 範囲で追加'),exact:true}).click()
    const dialog = page.locator('.fixed.inset-0')
    await dialog.locator('input[type="date"]').nth(0).fill('2026-09-14')
    await dialog.locator('input[type="date"]').nth(1).fill('2026-09-16')
    await dialog.getByRole('button',{name:t('{0}日を追加',3),exact:true}).click()
    await page.getByRole('link',{name:switchAway,exact:true}).click()
    await expect(page.getByPlaceholder(other.t('例：みんなでご飯'))).toHaveValue(eventName)
    await expect(page.locator('.candidate-row')).toHaveCount(3)
    await page.getByRole('button',{name:other.t('↶ 戻す'),exact:true}).click()
    await expect(page.locator('.candidate-row')).toHaveCount(0)
    await page.getByRole('button',{name:other.t('↷ 進む'),exact:true}).click()
    await page.getByRole('link',{name:switchBack,exact:true}).click()
    await expect(page.locator('.candidate-row')).toHaveCount(3)

    // Simulate a committed transaction whose HTTP response was lost.
    await page.route('**/rpc/nittei_save_event', async route => {
      const saved = await route.fetch()
      expect(saved.ok()).toBe(true)
      await route.fulfill({status:503,body:JSON.stringify({message:'Simulated network failure'})})
    }, {times:1})
    await page.getByRole('button',{name:t('作成する'),exact:true}).first().click()
    await expect(page.getByText(t('保存中にエラーが発生しました。もう一度試してください。'))).toBeVisible()
    await page.getByRole('button',{name:t('作成する'),exact:true}).first().click()
    await page.waitForURL(/\/e\/[a-z0-9]+$/)
    const eventUrl = page.url()
    const shareId = eventUrl.split('/').pop()!
    const [event] = await (await request.get(`${api}/events?share_id=eq.${shareId}`)).json()
    expect(await (await request.get(`${api}/events?name=eq.${encodeURIComponent(eventName)}`)).json()).toHaveLength(1)
    expect(event.edit_protected).toBe(true)
    const dates = await (await request.get(`${api}/candidates?event_id=eq.${event.id}`)).json()
    expect(dates).toHaveLength(3)
    await expect(page.getByRole('button',{name:t('管理用URLをコピー'),exact:true})).toBeVisible()

    await page.getByPlaceholder(t('例：山田')).fill('Draft participant')
    await page.locator('[data-answer-value="△"][data-answer-candidate-id]').first().click()
    await page.getByRole('link',{name:switchAway,exact:true}).click()
    await expect(page.getByPlaceholder(other.t('例：山田'))).toHaveValue('Draft participant')
    await expect(page.locator('[data-answer-value="△"][data-answer-candidate-id]').first()).toHaveClass(/bg-amber-50/)
    await page.getByRole('link',{name:switchBack,exact:true}).click()
    await expect(page.getByPlaceholder(t('例：山田'))).toHaveValue('Draft participant')
    await page.route('**/rpc/nittei_save_response', async route => {
      expect((await route.fetch()).ok()).toBe(true)
      await route.fulfill({status:503,body:JSON.stringify({message:'Simulated network failure'})})
    }, {times:1})
    await page.getByRole('button',{name:t('回答を送信'),exact:true}).click()
    await expect(page.getByText(t('送信中にエラーが発生しました。もう一度試してください。'))).toBeVisible()
    await page.getByRole('button',{name:t('回答を送信'),exact:true}).click()
    await expect(page.locator('.response-results-table')).toContainText('Draft participant')
    const rows = await (await request.get(`${api}/responses?event_id=eq.${event.id}&select=*,answers(*)`)).json()
    expect(rows).toHaveLength(1)
    expect(rows[0].answers).toHaveLength(3)
    const token = await page.evaluate(id => localStorage.getItem('nittei-response-key-'+id), rows[0].id)

    const visitor = await browser.newContext()
    try {
      const publicPage = await visitor.newPage()
      await publicPage.goto(eventUrl)
      await expect(publicPage.locator('.response-results-table')).toContainText('Draft participant')
      await expect(publicPage.getByRole('link',{name:t('日程を編集'),exact:true})).toHaveCount(0)
      await expect(publicPage.getByRole('button',{name:t('編集'),exact:true})).toHaveCount(0)
      const denied = await request.post(`${api}/rpc/nittei_delete_response`, {
        headers:{apikey:'isolated-test-key','x-nittei-share-id':shareId},
        data:{p_id:rows[0].id,p_edit_token:null},
      })
      expect(denied.status()).toBe(403)
      await publicPage.goto(eventUrl+`?response=${rows[0].id}#key=${token}`)
      await expect(publicPage.getByPlaceholder(t('例：山田'))).toHaveValue('Draft participant')
      await expect(publicPage).toHaveURL(eventUrl)
      await expect(publicPage.getByRole('button',{name:t('回答の編集用URLをコピー'),exact:true})).toBeVisible()
    } finally { await visitor.close() }

    await page.getByRole('link',{name:t('日程を編集'),exact:true}).click()
    await expect(page).toHaveURL(new RegExp('edit='+shareId))
    await expect(page.getByRole('button',{name:t('「○✕」から選択'),exact:true})).toBeDisabled()
    await page.getByPlaceholder(t('例：みんなでご飯')).fill('Draft edit')
    await page.getByRole('link',{name:switchAway,exact:true}).click()
    await expect(page.getByPlaceholder(other.t('例：みんなでご飯'))).toHaveValue('Draft edit')
    await page.getByRole('link',{name:switchBack,exact:true}).click()
    await page.getByRole('button',{name:t('更新する'),exact:true}).first().click()
    await page.waitForURL(eventUrl)
    await page.setViewportSize({width:320,height:800})
    const toolbar = page.getByRole('heading',{name:t('みんなの回答'),exact:true}).locator('..')
    await toolbar.scrollIntoViewIfNeeded()
    // phones keep the controls on one row; each one is reachable by scrolling that row
    for (const control of await toolbar.locator('button,label').all()) {
      await control.scrollIntoViewIfNeeded()
      const r = (await control.boundingBox())!
      expect(r.x >= 0 && r.x + r.width <= 320).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    await page.screenshot({path:`test-results/reliability-${locale}-mobile.png`})
    expect(errors).toEqual([])
  })
}
