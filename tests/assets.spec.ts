import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const root = resolve(__dirname, '..')

test('the tab icon only holds the sizes a browser tab uses', () => {
  // larger icons are served separately (icon.png, apple-touch-icon.png, the manifest)
  const ico = readFileSync(join(root, 'app/favicon.ico'))
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico[6 + index * 16] || 256)
  expect(sizes).toEqual([16, 32, 48])
  expect(ico.length).toBeLessThan(8 * 1024)
})

test('every English translation is used by the site', () => {
  const sources: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name)) sources.push(readFileSync(full, 'utf8'))
    }
  }
  walk(join(root, 'app'))
  walk(join(root, 'lib'))
  const source = sources.join('\n')
  const keys = Object.keys(JSON.parse(readFileSync(join(root, 'lib/i18n/en.json'), 'utf8')))
  expect(keys.filter(key => !source.includes(key) && !source.includes(JSON.stringify(key).slice(1, -1)))).toEqual([])
})
