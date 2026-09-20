import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: compact brand header aligns controls and keeps the existing single-column form`, async ({ page }) => {
    const { t, path } = getI18n(locale)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path('/'))
    await expect(page.locator('[data-calendar-date]').first()).toBeVisible()
    const header = page.locator('.home-brand-header')
    const name = header.getByRole('heading', { level: 1 })
    const themeToggle = page.locator('.theme-toggle')
    const bottom = header.getByRole('button', { name: t('↓ 最下部へ'), exact: true })
    await expect(header.locator('p')).toHaveCount(0)
    await expect(name).toHaveText(locale === 'ja' ? '日程組略して 日組' : 'Nitteigumi')
    await expect(bottom).toHaveAttribute('title', t('↓ 最下部へ'))
    await expect(page.locator('.home-desktop-layout')).toHaveCount(0)
    for (const width of [320, 390, 640, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await themeToggle.click()
        await expect(name).toHaveCSS('color', theme === 'dark' ? 'rgb(245, 245, 244)' : 'rgb(28, 25, 23)')
        await expect(name).toHaveCSS('font-weight', '700')
        await expect(name).toHaveCSS('font-size', '26px')
        await expect(page.locator('form')).toHaveCSS('display', 'block')
        const headerBox = (await header.boundingBox())!
        const nameBox = (await name.boundingBox())!
        const left = (await themeToggle.boundingBox())!
        const right = (await bottom.boundingBox())!
        expect(headerBox.height).toBeLessThanOrEqual(36)
        expect(nameBox.x + nameBox.width / 2).toBe(width / 2)
        expect(nameBox.x).toBeGreaterThan(left.x + left.width)
        expect(nameBox.x + nameBox.width).toBeLessThan(right.x)
        expect(left.width).toBe(32)
        expect(left.height).toBe(32)
        expect(right.width).toBe(32)
        expect(right.height).toBe(32)
        expect(left.y).toBe(right.y)
        expect((await page.locator('form').boundingBox())!.width).toBeLessThanOrEqual(576)
        expect(await name.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.mouse.move(0, 0)
        await page.screenshot({ path: `test-results/brand-header-${locale}-${width}-${theme}.png`, animations: 'disabled' })
      }
    }
    await page.setViewportSize({ width: 390, height: 700 })
    await bottom.click()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY)).toBeLessThanOrEqual(1)
    expect((await themeToggle.boundingBox())!.y).toBeLessThan(0)
    await page.getByRole('button', { name: t('↑ 最上部へ'), exact: true }).click()
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
    await bottom.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY)).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })

  test(`${locale}: edit status remains visible and other page headers are unchanged`, async ({ page, request }) => {
    const { t, path } = getI18n(locale)
    const shareId = `header-edit-${locale}`
    expect((await request.post('http://127.0.0.1:54329/rest/v1/events', {
      data: { share_id: shareId, name: 'Header edit check' },
    })).ok()).toBe(true)
    await page.goto(path(`/?edit=${shareId}`))
    await expect(page.getByPlaceholder(t('例：みんなでご飯'))).toHaveValue('Header edit check')
    await expect(page.locator('.home-brand-header p')).toHaveText(t('日程を編集して、共有ページに戻りましょう'))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path('/history'))
    await expect(page.locator('.home-brand-header')).toHaveCount(0)
    await expect(page.locator('.theme-toggle')).toHaveCSS('width', '36px')
    await expect(page.locator('.theme-toggle')).toHaveCSS('height', '36px')
  })
}
