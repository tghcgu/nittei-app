import { expect, test } from '@playwright/test'

const api = 'http://127.0.0.1:54329/rest/v1'

test('every page is sent with the security headers and does not name the framework', async ({ request }) => {
  const created = await request.post(`${api}/events`, { data: { share_id: 'security-headers', name: 'Headers' } })
  expect(created.ok()).toBe(true)
  for (const path of ['/', '/en', '/e/security-headers', '/en/e/security-headers', '/contact', '/updates', '/no-such-page']) {
    const headers = (await request.get(path)).headers()
    // no other site may show these pages inside a frame
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'")
    expect(headers['x-frame-options'], path).toBe('DENY')
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    // other sites only learn the domain, never which event was open
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy'], path).toContain('camera=()')
    expect(headers['strict-transport-security'], path).toContain('max-age=')
    expect(headers['x-powered-by'], path).toBeUndefined()
  }
})
