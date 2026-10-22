// Builds the site as files (next build --webpack with output: 'export', then scripts/finish-export.mjs) and sends it
// to Cloudflare: the site to the Pages project nitei (https://nitei.pages.dev), with custom-worker.mjs as its
// _worker.js for event pages, and, on deploy, the Worker at the previous address (redirects and the daily cleanup).
// The Supabase URL and public key come from .env.local and never go into Git.
//
// usage: node scripts/cloudflare.mjs deploy            production: https://nitei.pages.dev and the previous address
//        node scripts/cloudflare.mjs preview <name>    a preview https://<name>.nitei.pages.dev; nothing else changes
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import nextEnv from '@next/env'

const [mode, alias] = process.argv.slice(2)
if (!['deploy', 'preview'].includes(mode) || (mode === 'preview' && !alias)) {
  console.error('usage: node scripts/cloudflare.mjs deploy | preview <name>')
  process.exit(2)
}
if (mode === 'preview' && (alias === 'production' || !/^[a-z0-9-]+$/.test(alias))) {
  console.error('the preview name must be lowercase letters, digits and dashes, and not "production"')
  process.exit(2)
}

nextEnv.loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set (.env.local)')
  process.exit(1)
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// webpack: the same bundler as before the move to files; tests/stale-chunk.spec.ts relies on its chunk names
run(['node_modules/next/dist/bin/next', 'build', '--webpack'])
run(['scripts/finish-export.mjs', 'out'])

// The Pages Worker: the same code as the tests run, with the public Supabase values filled in. Only event pages and
// the verification file reach it; every other file is served without running it.
writeFileSync('out/_worker.js', `// Written by scripts/cloudflare.mjs; not in Git.
import worker from '../custom-worker.mjs'
const vars = ${JSON.stringify({ SUPABASE_URL: url, SUPABASE_KEY: key })}
export default { fetch: (request, env, ctx) => worker.fetch(request, { ...env, ...vars }, ctx) }
`)
writeFileSync('out/_routes.json', JSON.stringify({ version: 1, include: ['/e/*', '/en/e/*', '/googlecc8378481687d5f8.html'], exclude: [] }))

const wrangler = 'node_modules/wrangler/bin/wrangler.js'
run([wrangler, 'pages', 'deploy', 'out', '--project-name', 'nitei', '--branch', mode === 'deploy' ? 'production' : alias, '--commit-dirty=true'])
// The previous address: redirects every page to the same place on the new address, and runs the daily cleanup
if (mode === 'deploy') run([wrangler, 'deploy', '--var', `SUPABASE_URL:${url}`])
