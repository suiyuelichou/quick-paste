import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync(require('electron'), [fileURLToPath(new URL('./smoke.mjs', import.meta.url))], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env, windowsHide: true, stdio: 'inherit', timeout: 90000
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
