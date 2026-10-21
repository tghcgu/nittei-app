// Builds the site as files (next build --webpack with output: 'export', then scripts/finish-export.mjs) and sends it to
// Cloudflare. The Worker gets the Supabase URL and public key from .env.local as Worker variables, so they
// never go into Git.
//
// usage: node scripts/cloudflare.mjs deploy            production (https://nittei-app.qoj.workers.dev)
//        node scripts/cloudflare.mjs preview <name>    a preview URL https://<name>-nittei-app.qoj.workers.dev;
//                                                      production is not changed
import { spawnSync } from 'node:child_process'
import nextEnv from '@next/env'

const [mode, alias] = process.argv.slice(2)
if (!['deploy', 'preview'].includes(mode) || (mode === 'preview' && !alias)) {
  console.error('usage: node scripts/cloudflare.mjs deploy | preview <name>')
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
const vars = ['--var', `SUPABASE_URL:${url}`, '--var', `SUPABASE_KEY:${key}`]
const wrangler = 'node_modules/wrangler/bin/wrangler.js'
if (mode === 'deploy') run([wrangler, 'deploy', ...vars])
else run([wrangler, 'versions', 'upload', '--preview-alias', alias, '--message', `Preview-only:${alias}`, ...vars])
