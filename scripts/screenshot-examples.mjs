import { chromium } from 'playwright'

const BASE_URL = process.env.URL || 'http://host.docker.internal:8080'

async function screenshotExample(page, exampleIndex, filename) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 10000 })
  await page.waitForTimeout(500)

  await page.evaluate(() => localStorage.removeItem('stift-onboarding-seen'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // Click the last step indicator dot (examples step)
  const dots = page.locator('[class*="rounded-full"][class*="flex-1"]')
  const count = await dots.count()
  await dots.nth(count - 1).click()
  await page.waitForTimeout(300)

  // Click the example button
  await page.locator('button[class*="text-left"]').nth(exampleIndex).click()
  await page.waitForTimeout(2000)

  await page.screenshot({ path: `/screenshots/${filename}`, fullPage: false })
  console.log(`Saved: ${filename}`)
}

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text', '--disable-font-subpixel-positioning'],
})
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })

const count = parseInt(process.env.EXAMPLES || '6', 10)
for (let i = 0; i < count; i++) {
  const page = await context.newPage()
  await screenshotExample(page, i, `example${i + 1}.png`)
  await page.close()
}

await browser.close()
console.log('Done!')
