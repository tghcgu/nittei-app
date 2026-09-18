import { expect, test, type Page } from '@playwright/test'
import { getI18n } from '../lib/i18n'

type Point = { x: number; y: number }

async function dragPointer(page: Page, input: 'mouse' | 'touch') {
  const touch = input === 'touch' ? await page.context().newCDPSession(page) : null
  return {
    async start(point: Point) {
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] })
      else { await page.mouse.move(point.x, point.y); await page.mouse.down() }
    },
    async move(point: Point) {
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] })
      else await page.mouse.move(point.x, point.y)
    },
    async end() {
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      else await page.mouse.up()
    },
  }
}

for (const locale of ['ja', 'en'] as const) {
  for (const input of ['mouse', 'touch'] as const) {
    test.describe(`${locale} ${input}`, () => {
      test.use({ hasTouch: input === 'touch', viewport: { width: input === 'touch' ? 390 : 1280, height: 900 } })
      test('vertical cancellation preserves prior dates and removal can clear all dates', async ({ page }) => {
        const { t, path } = getI18n(locale)
        await page.clock.setFixedTime(new Date('2026-09-15T12:00:00'))
        await page.goto(path('/'))
        const day = (date: number) => page.locator(`[data-calendar-date="2026-09-${String(date).padStart(2, '0')}"]`)
        const point = async (date: number) => {
          const box = (await day(date).boundingBox())!
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        }
        const selected = page.locator('[data-calendar-date].bg-rose-700')
        const undo = page.getByRole('button', { name: t('↶ 戻す'), exact: true })
        const redo = page.getByRole('button', { name: t('↷ 進む'), exact: true })
        const pointer = await dragPointer(page, input)
        await day(27).click()
        await day(1).locator('..').scrollIntoViewIfNeeded()
        const start = await point(1)
        await pointer.start(start)
        await pointer.move(await point(8))
        await expect(selected).toHaveCount(9)
        await pointer.move(start)
        await expect(selected).toHaveCount(2)
        await pointer.move({ x: start.x, y: start.y - 12 })
        await expect(selected).toHaveCount(1)
        await pointer.end()
        await expect(day(27)).toHaveClass(/bg-rose-700/)
        await undo.click()
        await expect(selected).toHaveCount(0)
        await redo.click()
        await expect(selected).toHaveCount(1)
        await undo.click()
        for (const date of [10, 11, 12]) await day(date).click()
        await pointer.start(await point(10))
        await pointer.move(await point(11))
        await expect(selected).toHaveCount(1)
        await pointer.move(await point(10))
        await expect(selected).toHaveCount(2)
        await pointer.end()
        await undo.click()
        await expect(selected).toHaveCount(3)
        await redo.click()
        await expect(selected).toHaveCount(2)
        await pointer.start(await point(11))
        await pointer.move(await point(12))
        await expect(selected).toHaveCount(0)
        await pointer.end()
        await undo.click()
        await expect(selected).toHaveCount(2)
        await redo.click()
        await expect(selected).toHaveCount(0)
      })
      for (const reverse of [false, true]) {
        test(`calendar drag can shrink to one or zero (${reverse ? 'backward' : 'forward'})`, async ({ page }) => {
          const { t, path } = getI18n(locale)
          const errors: string[] = []
          page.on('pageerror', error => errors.push(error.message))
          await page.clock.setFixedTime(new Date('2026-09-15T12:00:00'))
          await page.goto(path('/'))
          const day = (date: number) => page.locator(`[data-calendar-date="2026-09-${String(date).padStart(2, '0')}"]`)
          await day(10).locator('..').scrollIntoViewIfNeeded()
          const point = async (date: number) => {
            const box = (await day(date).boundingBox())!
            return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
          }
          const selected = page.locator('[data-calendar-date].bg-rose-700')
          const pointer = await dragPointer(page, input)
          const startDate = reverse ? 12 : 10
          const endDate = reverse ? 10 : 12
          const start = await point(startDate)
          const middle = await point(11)
          const end = await point(endDate)
          await pointer.start({ x: start.x + (reverse ? -12 : 12), y: start.y })
          await pointer.move(middle)
          await expect(selected).toHaveCount(2)
          await pointer.move(end)
          await expect(selected).toHaveCount(3)
          await pointer.move(await point(reverse ? 1 : 24))
          await expect(selected).toHaveCount(reverse ? 12 : 15)
          await pointer.move(middle)
          await expect(selected).toHaveCount(2)
          await pointer.move(start)
          await expect(selected).toHaveCount(1)
          await page.screenshot({ path: `test-results/calendar-one-${locale}-${input}-${reverse}.png`, animations: 'disabled' })
          await pointer.end()
          await expect(selected).toHaveCount(1)

          const undo = page.getByRole('button', { name: t('↶ 戻す'), exact: true })
          const redo = page.getByRole('button', { name: t('↷ 進む'), exact: true })
          await undo.click()
          await expect(selected).toHaveCount(0)
          await redo.click()
          await expect(selected).toHaveCount(1)
          await day(startDate).click()
          await expect(selected).toHaveCount(0)

          await pointer.start(await point(startDate))
          await pointer.move(await point(endDate))
          await expect(selected).toHaveCount(3)
          await pointer.move(await point(11))
          await pointer.move(await point(startDate))
          await expect(selected).toHaveCount(1)
          const origin = await point(startDate)
          await pointer.move({ x: origin.x + (reverse ? 12 : -12), y: origin.y })
          await expect(selected).toHaveCount(0)
          await pointer.end()
          await expect(selected).toHaveCount(0)
          await expect(page.getByRole('button', { name: t('日付を選んでください'), exact: true })).toBeDisabled()
          await page.screenshot({ path: `test-results/calendar-zero-${locale}-${input}-${reverse}.png`, animations: 'disabled' })

          // Cancelling a new drag must preserve prior selections and redo history.
          await undo.click()
          await expect(selected).toHaveCount(1)
          await undo.click()
          await expect(selected).toHaveCount(0)
          await expect(redo).toBeEnabled()
          expect(errors).toEqual([])
        })
      }
    })
  }
}
