import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { PNG } from 'pngjs'

const BASE_URL = process.env.URL || 'http://host.docker.internal:8080'
const THRESHOLD = parseFloat(process.env.THRESHOLD || '0.01')

async function screenshotExample(page, exampleIndex) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 10000 })
  await page.waitForTimeout(500)
  await page.evaluate(() => localStorage.removeItem('stift-onboarding-seen'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const dots = page.locator('[class*="rounded-full"][class*="flex-1"]')
  const count = await dots.count()
  await dots.nth(count - 1).click()
  await page.waitForTimeout(300)
  await page.locator('button[class*="text-left"]').nth(exampleIndex).click()
  await page.waitForTimeout(2000)
  return await page.screenshot({ fullPage: false })
}

// Pixel-level comparison. Returns { diffRatio, diffPng } where diffPng
// is a highlighted diff image: matching pixels are dimmed, differing
// pixels are bright red.
function compareImages(actualBuf, referenceBuf) {
  const actual = PNG.sync.read(actualBuf)
  const ref = PNG.sync.read(referenceBuf)
  const w = Math.max(actual.width, ref.width)
  const h = Math.max(actual.height, ref.height)
  const diff = new PNG({ width: w, height: h })
  let diffCount = 0
  const total = w * h

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const aIdx = (y < actual.height && x < actual.width) ? (y * actual.width + x) * 4 : -1
      const rIdx = (y < ref.height && x < ref.width) ? (y * ref.width + x) * 4 : -1

      if (aIdx < 0 || rIdx < 0) {
        // Size mismatch region -- mark magenta
        diff.data[idx] = 255; diff.data[idx+1] = 0; diff.data[idx+2] = 255; diff.data[idx+3] = 255
        diffCount++
        continue
      }

      if (actual.data[aIdx] !== ref.data[rIdx] || actual.data[aIdx+1] !== ref.data[rIdx+1] || actual.data[aIdx+2] !== ref.data[rIdx+2]) {
        // Different -- bright red
        diff.data[idx] = 255; diff.data[idx+1] = 0; diff.data[idx+2] = 0; diff.data[idx+3] = 255
        diffCount++
      } else {
        // Same -- dimmed grayscale of actual
        const gray = Math.round(actual.data[aIdx] * 0.3 + actual.data[aIdx+1] * 0.59 + actual.data[aIdx+2] * 0.11)
        const dimmed = Math.round(gray * 0.3)
        diff.data[idx] = dimmed; diff.data[idx+1] = dimmed; diff.data[idx+2] = dimmed; diff.data[idx+3] = 255
      }
    }
  }

  return { diffRatio: diffCount / total, diffPng: PNG.sync.write(diff) }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text', '--disable-font-subpixel-positioning'],
})
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

const names = ['Bug Report', 'PCB Inspection', 'Weld Analysis', 'Server Room Audit', 'Bridge Inspection', 'Solar Panel Array']
let allPassed = true

for (let i = 0; i < names.length; i++) {
  const page = await context.newPage()
  const actual = await screenshotExample(page, i)
  await page.close()

  const refPath = `/reference/example${i + 1}.png`
  let reference
  try {
    reference = readFileSync(refPath)
  } catch {
    console.log(`  SKIP: ${names[i]} -- no reference image at ${refPath}`)
    continue
  }

  const { diffRatio, diffPng } = compareImages(actual, reference)
  const passed = diffRatio <= THRESHOLD

  if (passed) {
    console.log(`  PASS: ${names[i]} (diff: ${(diffRatio * 100).toFixed(2)}%)`)
  } else {
    console.log(`  FAIL: ${names[i]} (diff: ${(diffRatio * 100).toFixed(2)}%, threshold: ${(THRESHOLD * 100).toFixed(2)}%)`)
    writeFileSync(`/screenshots/example${i + 1}_actual.png`, actual)
    writeFileSync(`/screenshots/example${i + 1}_diff.png`, diffPng)
    console.log(`        Actual: /screenshots/example${i + 1}_actual.png`)
    console.log(`        Diff:   /screenshots/example${i + 1}_diff.png`)
    allPassed = false
  }
}

await browser.close()

if (!allPassed) {
  console.log('\nSome visual regression tests failed.')
  process.exit(1)
} else {
  console.log('\nAll visual regression tests passed.')
}
