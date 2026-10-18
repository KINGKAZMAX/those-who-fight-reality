/* Verify the shipped entry and arena rules in an isolated browser. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require(path.join(require('node:os').homedir(), '.codex/skills/develop-web-game/node_modules/playwright'))
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const report = { errors: [], resources: [], stages: [] }
  page.on('pageerror', e => report.errors.push(e.message))
  page.on('response', r => { if (r.status() >= 400) report.resources.push(r.url()) })
  try {
    await page.goto('http://127.0.0.1:18765/F.LF/game/game.html')
    await page.waitForFunction(() => window.realityGame && !document.querySelector('#reality-loading'))
    await page.locator('.urban-start').click()
    assert.equal(await page.locator('.urban-lobby').getAttribute('data-mode'), 'free')
    assert.equal(await page.locator('.urban-stage').isDisabled(), false)
    const native = [[794, [316, 442]], [2400, [292, 495]], [1600, [420, 510]]]
    for (let stage = 0; stage < 3; stage++) {
      await page.locator('.urban-stage').selectOption(String(stage))
      await page.locator('.urban-launch').click()
      await page.waitForFunction(() => window.realityGame.manager.activeMatch?.time?.t > 0)
      const state = await page.evaluate(() => {
        const match = window.realityGame.manager.activeMatch
        return { width: match.background.width, depth: match.background.zboundary, rules: match.data.realityRules,
          phase: window.realityGame.chapter.getState().phase, tick: match.time.t,
          players: Object.values(match.character).filter(c => c.con.type === 'keyboard').map(c => ({ mp: c.health.mp, spent: c.health.mp_usage })) }
      })
      assert.equal(state.width, native[stage][0])
      assert.deepEqual(state.depth, native[stage][1])
      assert.deepEqual(state.rules, {})
      assert.equal(state.phase, 'idle')
      assert(state.players.every(p => p.mp >= 200 && p.mp <= 210 && p.spent === 0), 'native 200 MP start, with only elapsed passive recovery')
      report.stages.push(state)
      await page.keyboard.press('Escape')
      await page.waitForFunction(() => window.realityGame.manager.active_UI === 'character_selection')
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.resources, [])
    report.passed = true
    console.log(JSON.stringify(report, null, 2))
  } catch (e) { report.failure = e.stack; process.exitCode = 1; console.error(e) }
  finally {
    await fs.writeFile(path.join(__dirname, '../docs/verification/native-rules-browser.json'), JSON.stringify(report, null, 2) + '\n')
    await browser.close()
  }
})()
