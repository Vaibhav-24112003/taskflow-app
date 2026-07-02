// One-time voiceover generator for the Launch Tour, using Sarvam AI TTS.
//
// The API key is NEVER shipped to the browser — it's read from the environment
// here and used only to produce static MP3s under public/tour-vo/, which are
// what the app actually loads.
//
// Usage:
//   1) Put your key in a git-ignored .env.local:   SARVAM_API_KEY=xxxxxxxx
//   2) node scripts/gen-narration.mjs
//
// Optional env overrides:
//   SARVAM_SPEAKER   (default: 'anushka')      SARVAM_LANG   (default: 'en-IN')
//   SARVAM_MODEL     (default: 'bulbul:v2')     SARVAM_PACE   (default: 1.0)
//
// Sarvam returns base64 WAV; we save WAV and (if ffmpeg is present) also emit MP3.
// The tour references .mp3 — if ffmpeg is unavailable, change narrationSrc to .wav.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Minimal .env.local loader (no dependency).
function loadEnvLocal() {
  const p = path.join(root, '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

const KEY = process.env.SARVAM_API_KEY
if (!KEY) {
  console.error('Missing SARVAM_API_KEY. Add it to .env.local (git-ignored) or export it, then re-run.')
  process.exit(1)
}
const SPEAKER = process.env.SARVAM_SPEAKER || 'anushka'
const LANG    = process.env.SARVAM_LANG    || 'en-IN'
const MODEL   = process.env.SARVAM_MODEL   || 'bulbul:v2'
const PACE    = Number(process.env.SARVAM_PACE || '1.0')

// Load narration lines from the shared data module.
const modUrl = 'file://' + path.join(root, 'src', 'tourNarration.js')
const { TOUR_NARRATION } = await import(modUrl)

const outDir = path.join(root, 'public', 'tour-vo')
fs.mkdirSync(outDir, { recursive: true })

const hasFfmpeg = (() => { try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true } catch { return false } })()

async function tts(text) {
  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      target_language_code: LANG,
      speaker: SPEAKER,
      model: MODEL,
      pace: PACE,
      enable_preprocessing: true,
    }),
  })
  if (!res.ok) throw new Error('Sarvam ' + res.status + ': ' + (await res.text()).slice(0, 300))
  const json = await res.json()
  const b64 = (json.audios && json.audios[0]) || json.audio
  if (!b64) throw new Error('No audio in Sarvam response')
  return Buffer.from(b64, 'base64')
}

let ok = 0
for (const seg of TOUR_NARRATION) {
  process.stdout.write('· ' + seg.id + ' … ')
  try {
    const wav = await tts(seg.text)
    const wavPath = path.join(outDir, seg.id + '.wav')
    fs.writeFileSync(wavPath, wav)
    if (hasFfmpeg) {
      execSync(`ffmpeg -y -i "${wavPath}" -codec:a libmp3lame -qscale:a 4 "${path.join(outDir, seg.id + '.mp3')}"`, { stdio: 'ignore' })
      fs.unlinkSync(wavPath)
      console.log('mp3 ✓')
    } else {
      console.log('wav ✓ (no ffmpeg — set narrationSrc to .wav)')
    }
    ok++
  } catch (e) {
    console.log('FAILED — ' + e.message)
  }
}
console.log(`\nDone: ${ok}/${TOUR_NARRATION.length} lines → public/tour-vo/`)
