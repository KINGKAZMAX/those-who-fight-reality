/* Deterministic startup regression: slow AMD module and failed AMD module.
 * Routing changes only this isolated test browser's network responses. */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
function playwright() {
  if (process.env.PLAYWRIGHT_MODULE) return require(process.env.PLAYWRIGHT_MODULE)
  try { return require('playwright') } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    return require(path.join(os.homedir(), '.codex/skills/develop-web-game/node_modules/playwright'))
  }
}
const { chromium } = playwright()
const url = process.env.GAME_TEST_URL || process.env.LF2_TEST_URL || 'http://127.0.0.1:18766/those-who-fight-reality/'
const output = path.resolve(process.env.GAME_VERIFY_OUTPUT || path.join(__dirname, '../docs/verification/public-loading'))
const report = { passed: false, url, startedAt: new Date().toISOString(), delayMilliseconds: 10000, cases: [] }
;(async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  for (const kind of ['slow-module', 'failed-module']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 920 } })
    const page = await context.newPage()
    const record = { kind, passed: false, pageErrors: [], requests: [], consoleErrors: [] }
    report.cases.push(record)
    page.on('pageerror', e => record.pageErrors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') record.consoleErrors.push(m.text()) })
    let intercepted = 0
    await page.route('**/content/data/bandit.js*', async route => {
      intercepted++
      record.requests.push({ url: route.request().url(), interceptedAt: new Date().toISOString() })
      if (kind === 'slow-module') {
        await new Promise(resolve => setTimeout(resolve, report.delayMilliseconds))
        await route.continue()
      } else await route.abort('failed')
    })
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => window.requirejs?.s?.contexts?._?.config?.urlArgs, null, { timeout: 15000 })
      record.waitSeconds = await page.evaluate(() => requirejs.s.contexts._.config.waitSeconds)
      if (kind === 'slow-module') {
        await page.waitForFunction(() => window.realityGame?.skillsUI && !document.querySelector('#reality-loading'), null, { timeout: 30000 })
        assert.equal(intercepted, 1, 'the selected AMD module must really be delayed')
        assert.deepEqual(record.pageErrors, [], 'slow response must not produce uncaught AMD timeout')
        record.title = await page.title()
        record.screen = await page.evaluate(() => window.realityGame.manager.active_UI)
        assert.equal(record.screen, 'frontpage')
      } else {
        const retry = page.locator('#reality-loading button')
        await retry.waitFor({ state: 'visible', timeout: 15000 })
        assert.equal(intercepted, 1, 'the selected AMD module must really fail')
        assert.equal(await retry.isEnabled(), true, 'retry must be actionable')
        assert.match(await retry.innerText(), /重新集合/)
        record.message = await page.locator('#reality-loading').innerText()
        assert.match(record.message, /失敗|未能|無法|失联|失聯|錯誤|中斷|重試|重试|重新集合/)
        assert.deepEqual(record.pageErrors, [], 'handled startup error must not become an uncaught page error')
      }
      record.passed = true
      console.log('PASS', kind)
    } catch (error) {
      record.failure = error.stack || error.message
      console.log('FAIL', kind, error.message)
    } finally {
      record.intercepted = intercepted
      record.loadingText = await page.locator('#reality-loading').count() ? await page.locator('#reality-loading').innerText() : null
      await page.screenshot({ path: path.join(output, kind + '.png'), animations: 'disabled' })
      await context.close()
    }
  }
  report.passed = report.cases.every(record => record.passed)
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
  console.log(JSON.stringify({ passed: report.passed, output, cases: report.cases.map(c => ({ kind: c.kind, passed: c.passed, waitSeconds: c.waitSeconds, intercepted: c.intercepted })) }))
  if (!report.passed) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
