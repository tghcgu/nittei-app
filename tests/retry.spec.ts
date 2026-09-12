import { expect, test } from '@playwright/test'

const api = 'http://127.0.0.1:54329/rest/v1'
for (const failure of ['before-answers', 'after-answers', 'after-response']) {
  test(`retry reuses IDs ${failure}, including across a language change`, async ({ page, request }) => {
    const share = Math.random().toString(36).slice(2, 10)
    const event = await (await request.post(`${api}/events`, { data: { share_id: share, name: 'Retry fixture' } })).json()
    const eventId = event[0].id
    await request.post(`${api}/candidates`, { data: { event_id: eventId, date: '2026-09-15', time_label: '23:00-01:00' } })
    await page.goto(`/en/e/${share}`)
    await page.getByPlaceholder('e.g. Alex').fill('Retry participant')
    await page.locator('[data-answer-candidate-id][data-answer-value="\u25cb"]').first().click()
    const target = failure === 'after-response' ? 'responses' : 'answers'
    await page.route(`**/rest/v1/${target}?*`, async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return }
      if (failure !== 'before-answers') expect((await route.fetch()).ok()).toBe(true)
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated lost response' }) })
    }, { times: 1 })
    await page.getByRole('button', { name: 'Submit response', exact: true }).click()
    await expect(page.getByText('Could not submit your response. Please try again.')).toBeVisible()
    await page.getByRole('link', { name: '\u65e5\u672c\u8a9e', exact: true }).click()
    await expect(page.locator('input[type=text]').first()).toHaveValue('Retry participant')
    await page.locator('button[type=submit]').click()
    // A partial first attempt may already have made the participant name visible.
    await expect(page.getByText('\u56de\u7b54\u3092\u9001\u4fe1\u3057\u307e\u3057\u305f\uff01\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3059\u3002', { exact: true })).toBeVisible()
    await expect(page.locator('.response-results-table')).toContainText('Retry participant')
    const rows = await (await request.get(`${api}/responses?event_id=eq.${eventId}&select=*,answers(*)`)).json()
    expect(rows).toHaveLength(1)
    expect(rows[0].answers).toHaveLength(1)
    expect(rows[0].answers[0].value).toBe('\u25cb')
  })
}
