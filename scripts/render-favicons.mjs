// One-off: render public/logo.svg (brand gradient tile + white check) into the
// PNG app-icons Google and the PWA installer actually use.
// Usage: node scripts/render-favicons.mjs   (needs playwright-core + chromium)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const svg = fs.readFileSync(path.join(root, 'public', 'logo.svg'), 'utf8')
const targets = [
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-192.png', size: 192 },
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 })
  const html = `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${t.size}px;height:${t.size}px}svg{display:block;width:${t.size}px;height:${t.size}px}</style></head><body>${svg}</body></html>`
  await page.setContent(html, { waitUntil: 'networkidle' })
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } })
  fs.writeFileSync(path.join(root, 'public', t.file), buf)
  console.log('✓', t.file, buf.length, 'bytes')
  await page.close()
}
await browser.close()
