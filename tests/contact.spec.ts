import { expect, test } from '@playwright/test'
import { getI18n } from '../lib/i18n'
import { contactFormUrl } from '../lib/site'

for (const locale of ['ja', 'en'] as const) {
  test(`${locale}: inquiries go to the Google Form and no operator address is published`, async ({ page }) => {
    const { t, path } = getI18n(locale)
    await page.goto(path('/contact'))
    const form = page.getByRole('link', { name: t('お問い合わせフォームを開く ↗'), exact: true })
    await expect(form).toHaveAttribute('href', contactFormUrl)
    await expect(form).toHaveAttribute('target', '_blank')
    await expect(form).toHaveAttribute('rel', /noopener/)
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
    expect(await page.content()).not.toMatch(/[\w.+-]+@gmail\.com/)
    // the privacy policy names the form among the services it uses
    await page.goto(path('/privacy'))
    await expect(page.getByText(locale === 'ja' ? 'お問い合わせの受付に Google フォーム' : 'Google Forms for inquiries')).toBeVisible()
  })
}
