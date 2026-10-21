// Runs after `next build` (output: 'export'): puts the Japanese and English "page not found" pages
// where Cloudflare looks for them (the nearest 404.html, served with status 404), and removes the
// pages Next.js made for its own not-found screen, which this site does not use.
// usage: node scripts/finish-export.mjs [export folder, default out]
import { copyFileSync, existsSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const out = process.argv[2] ?? 'out'
for (const folder of ['', 'en']) {
  const page = join(out, folder, 'missing.html')
  if (!existsSync(page)) throw new Error(`${page} is missing; did next build run with output: 'export'?`)
  renameSync(page, join(out, folder, '404.html'))
  rmSync(join(out, folder, 'missing.txt'), { force: true })
  rmSync(join(out, folder, 'missing'), { recursive: true, force: true })
}
for (const name of ['_not-found.html', '_not-found.txt', '_not-found']) rmSync(join(out, name), { recursive: true, force: true })

// Next.js writes the data it prefetches for a link as nested files (contact/__next.!KGphKQ/contact/__PAGE__.txt),
// but the browser asks for one flat name (contact/__next.!KGphKQ.contact.__PAGE__.txt). Add the flat copies,
// so prefetching works instead of failing with 404.
let flatCopies = 0
const filesUnder = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  const path = join(folder, entry.name)
  return entry.isDirectory() ? filesUnder(path) : [path]
})
const addFlatCopies = (folder) => {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_next') continue
    const path = join(folder, entry.name)
    if (!entry.name.startsWith('__next.')) { addFlatCopies(path); continue }
    for (const file of filesUnder(path)) {
      copyFileSync(file, join(folder, `${entry.name}.${relative(path, file).split(sep).join('.')}`))
      flatCopies++
    }
  }
}
addFlatCopies(out)
console.log(`finished the export in ${out}: 404.html and en/404.html are in place, ${flatCopies} prefetch files copied to flat names`)
