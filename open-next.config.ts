import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// ISR やキャッシュ用ストレージ(R2)は使っていないため、デフォルト設定のままにする
export default defineCloudflareConfig()
