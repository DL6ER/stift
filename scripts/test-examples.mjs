import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const BASE_URL = process.env.URL || 'http://host.docker.internal:8080'
const THRESHOLD = parseFloat(process.env.THRESHOLD || '0.01') // 1% pixel diff allowed by default

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

function compareBuffers(actual, reference) {
  // Simple byte-level comparison: returns fraction of differing bytes
  const minLen = Math.min(actual.length, reference.length)
  const maxLen = Math.max(actual.length, reference.length)
  let diffBytes = Math.abs(actual.length - reference.length)
  for (let i = 0; i < minLen; i++) {
    if (actual[i] !== reference[i]) diffBytes++
  }
  return diffBytes / maxLen
}

const browser = await chromium.launch({ headless: true })
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

  const diff = compareBuffers(actual, reference)
  const passed = diff <= THRESHOLD

  if (passed) {
    console.log(`  PASS: ${names[i]} (diff: ${(diff * 100).toFixed(2)}%)`)
  } else {
    console.log(`  FAIL: ${names[i]} (diff: ${(diff * 100).toFixed(2)}%, threshold: ${(THRESHOLD * 100).toFixed(2)}%)`)
    // Write actual for manual inspection
    const { writeFileSync } = await import('fs')
    writeFileSync(`/screenshots/example${i + 1}_actual.png`, actual)
    console.log(`        Actual saved to /screenshots/example${i + 1}_actual.png`)
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
