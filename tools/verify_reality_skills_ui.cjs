/* UI acceptance in an isolated browser. Set PLAYWRIGHT_MODULE or LF2_TEST_URL as needed. */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.codex/skills/develop-web-game/node_modules/playwright'))

const output = path.resolve(process.env.LF2_VERIFY_OUTPUT || path.join(__dirname, '../docs/verification'))
const url = process.env.LF2_TEST_URL || 'http://127.0.0.1:18765/F.LF/game/game.html'
const report = { ok: false, url: url, startedAt: new Date().toISOString(), errors: [], failedResources: [], checks: [] }

;(async function () {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ status: response.status(), url: response.url() }) })
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()))
  const shot = name => page.screenshot({ path: path.join(output, name), animations: 'disabled' })
  const check = (name, details) => report.checks.push({ name: name, details: details })
  try {
    await page.goto(url)
    await page.waitForFunction(() => window.realityGame && window.realityGame.skillsUI, null, { timeout: 60000 })
    await page.locator('.reality-skills-home-entry').click()
    assert.equal(await page.evaluate(() => window.realityGame.skillsUI.isOpen()), true)
    assert.equal((await state()).skillsGuideOpen, true)
    const counts = []
    const notes = []
    for (let index = 0; index < 4; index++) {
      await page.locator('.reality-skills-hero').nth(index).click()
      counts.push(await page.locator('.reality-skill-card').count())
      notes.push(await page.locator('.reality-skills-notes').innerText())
    }
    assert.deepEqual(counts, [4, 5, 4, 4])
    assert(notes.every(text => text.length > 0))
    assert(notes.every(text => !/\{(?:att|jump|def|up|down|left|right)\}/.test(text)))
    assert.equal(await page.locator('.reality-skill-shortcut').count(), 0)
    assert.doesNotMatch(await page.locator('.reality-skills-dialog').innerText(), /快捷/)
    assert.match(await page.locator('.reality-skills-foot').innerText(), /不必同时按/)
    check('Four hero tabs expose all 17 native combos and resolved advanced tips, without shortcut fields', { counts: counts, notes: notes })

    await page.locator('.reality-skills-hero').nth(0).click()
    const playerOneCombo = await page.locator('.reality-skill-combo').first().innerText()
    await page.locator('.reality-skills-player').nth(1).click()
    const playerTwoCombo = await page.locator('.reality-skill-combo').first().innerText()
    assert.match(playerOneCombo, /H/)
    assert.match(playerOneCombo, /F/)
    assert.match(playerTwoCombo, /L/)
    assert.match(playerTwoCombo, /J/)
    check('Player tabs use actual bindings', { playerOneCombo: playerOneCombo, playerTwoCombo: playerTwoCombo })
    await shot('skills-guide.png')
    await page.keyboard.press('Escape')
    assert.equal((await state()).screen, 'frontpage')
    assert.equal((await state()).skillsGuideOpen, false)

    await page.locator('.urban-start').click()
    const freeMode = page.getByRole('button', { name: '自由对战', exact: true })
    if (await freeMode.count()) await freeMode.click()
    await page.locator('.reality-skills-lobby-entry').click()
    assert.equal(await page.evaluate(() => window.realityGame.skillsUI.isOpen()), true)
    await page.keyboard.press('Enter')
    assert.equal((await state()).screen, 'character_selection')
    if (await page.evaluate(() => window.realityGame.skillsUI.isOpen())) await page.keyboard.press('Escape')
    check('Home and lobby guide entries preserve their screens')

    const changed = await page.evaluate(() => window.realityGame.manager.setControlBinding(0, 'att', 'q'))
    assert.equal(changed.ok, true)
    await page.locator('.reality-skills-lobby-entry').click()
    await page.locator('.reality-skills-player').nth(0).click()
    assert.match(await page.locator('.reality-skill-combo').first().innerText(), /Q/)
    const updatedCombo = await page.locator('.reality-skill-combo').first().innerText()
    await page.evaluate(() => window.realityGame.manager.applyRecommendedControls())
    await page.waitForFunction(() => document.querySelector('.reality-skill-combo').textContent.includes('F'))
    await page.keyboard.press('Escape')
    check('Custom attack binding updates the guide, and resetting controls refreshes the open guide immediately', { updatedCombo: updatedCombo })

    await page.locator('.urban-launch').click()
    await page.waitForFunction(() => window.realityGame.manager.active_UI === 'gameplay' && window.realityGame.manager.activeMatch && window.realityGame.manager.activeMatch.time, null, { timeout: 30000 })
    await page.waitForTimeout(700)
    const bounds = await page.evaluate(() => {
      const frame = document.querySelector('.urban-frame').getBoundingClientRect()
      const tray = document.querySelector('.reality-skills-tray').getBoundingClientRect()
      return { frameBottom: frame.bottom, trayTop: tray.top, trayBottom: tray.bottom, hidden: document.querySelector('.reality-skills-tray').hidden, viewportHeight: innerHeight }
    })
    assert.equal(bounds.hidden, false)
    assert(bounds.trayTop > bounds.frameBottom)
    assert(bounds.trayBottom <= bounds.viewportHeight)
    const rowCounts = await page.locator('.reality-skills-row').evaluateAll(rows => rows.map(row => row.querySelectorAll('.reality-skill-hint').length))
    assert.deepEqual(rowCounts, [4, 5])
    assert.equal(await page.locator('.reality-skills-row button').count(), 0)
    const trayCombo = await page.locator('.reality-skill-hint-combo').first().innerText()
    assert.match(trayCombo, /H/)
    assert.match(trayCombo, /A\/D/)
    assert.match(trayCombo, /F/)
    const removedAPI = await page.evaluate(() => ['cast', 'bindings', 'status'].every(name => !(name in window.realityGame.skills)))
    assert.equal(removedAPI, true)
    check('Both players get read-only combo hints outside the arena, with no cast buttons or shortcut API', { bounds: bounds, rowCounts: rowCounts, combo: trayCombo })

    await page.locator('.reality-skills-hud-entry').click()
    assert.equal((await state()).paused, true)
    const pauseSnapshot = () => page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      return { time: match.time.t, frame: match.character[match.panel[0].uid].frame.N }
    })
    const beforeInput = await pauseSnapshot()
    await page.keyboard.press('q')
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)
    assert.deepEqual(await pauseSnapshot(), beforeInput)
    await page.keyboard.press('Escape')
    assert.equal((await state()).screen, 'gameplay')
    assert.equal((await state()).paused, false)
    check('Guide pauses live play, isolates combat input, and Escape resumes without leaving')

    await page.locator('.urban-hud-pause-button').click()
    await page.waitForFunction(() => window.realityGame.manager.activeMatch.time.paused === true)
    await page.locator('.reality-skills-hud-entry').click()
    await page.keyboard.press('Escape')
    assert.equal((await state()).paused, true)
    await page.locator('.urban-hud-pause-button').click()
    await page.waitForFunction(() => window.realityGame.manager.activeMatch.time.paused === false)
    check('Closing the guide preserves an already paused match')

    // In this isolated browser, freeze opponents and reset the caster to inspect
    // native physical key input without the AI interrupting the sequence.
    await page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      match.AIscript = []
      Object.values(match.character).forEach((ch, index) => {
        ch.set_pos(300 + index * 200, 0, 400)
        ch.ps.vx = ch.ps.vy = ch.ps.vz = 0
        ch.health.hp = ch.health.hp_bound = 500
        ch.health.fall = ch.health.bdefend = 0
        Object.assign(ch.effect, { stuck: false, timeout: 0, timein: 0, super: false, blink: false })
        ch.trans.reset_lock(100); ch.trans.frame(999, 100); ch.trans.trans()
        ch.con.flush?.(); ch.con.clear_states?.(); ch.combodec?.clear_seq()
        ch.combo_buffer.combo = null; ch.combo_buffer.timeout = 0
        if (ch.con.type === 'AIcontroller') ch.con.fetch = function () { this.clear_states?.() }
      })
      const first = match.character[match.panel[0].uid]
      first.health.mp = 0
      first.health.mp_usage = 0
    })
    await page.waitForTimeout(110)
    const firstHint = page.locator('.reality-skills-row').first().locator('.reality-skill-hint').first()
    assert.match(await firstHint.getAttribute('title'), /MP 不足/)
    assert.equal(await firstHint.evaluate(node => node.tagName), 'DIV')
    check('Insufficient MP stays readable on a non-interactive combo hint', { message: await firstHint.getAttribute('title') })
    await page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      const first = match.character[match.panel[0].uid]
      first.health.mp = 500
      window.__comboFrames = []
      const frame = match.frame
      match.frame = function () {
        const value = frame.apply(this, arguments)
        window.__comboFrames.push(first.frame.N)
        return value
      }
      window.__restoreComboObserver = () => { match.frame = frame }
    })
    await page.keyboard.press('q')
    await page.waitForTimeout(200)
    assert.equal(await page.evaluate(() => window.realityGame.manager.activeMatch.character[window.realityGame.manager.activeMatch.panel[0].uid].health.mp_usage), 0)
    for (const key of ['h', 'd', 'f']) { await page.keyboard.press(key); await page.waitForTimeout(70) }
    await page.waitForFunction(() => window.__comboFrames.includes(240), null, { timeout: 3000 })
    const nativeCombo = await page.evaluate(() => {
      window.__restoreComboObserver()
      const match = window.realityGame.manager.activeMatch
      return { frames: [...new Set(window.__comboFrames)], mpUsed: match.character[match.panel[0].uid].health.mp_usage }
    })
    assert.equal(nativeCombo.mpUsed, 40)
    check('Q has no skill action; physical H → D → F enters the original move and consumes 40 MP', nativeCombo)
    await shot('skills-battle-ui.png')

    await page.setViewportSize({ width: 720, height: 700 })
    await page.waitForTimeout(180)
    const narrowTray = await page.locator('.reality-skill-hint-combo').evaluateAll(nodes => nodes.map(node => ({ width: node.clientWidth, content: node.scrollWidth })))
    assert(narrowTray.every(node => node.content <= node.width + 1))
    check('Every combo remains within its hint at the narrowest expanded layout', narrowTray)
    await page.setViewportSize({ width: 872, height: 594 })
    await page.waitForTimeout(180)
    assert.equal(await page.locator('.reality-skills-tray').isVisible(), false)
    assert.equal(await page.locator('.reality-skills-hud-entry').isVisible(), true)
    await page.locator('.reality-skills-hud-entry').click()
    const smallDialog = await page.locator('.reality-skills-dialog').boundingBox()
    assert(smallDialog.x >= 0 && smallDialog.y >= 0 && smallDialog.x + smallDialog.width <= 872 && smallDialog.y + smallDialog.height <= 594)
    assert(await page.locator('.reality-skills-body').evaluate(node => node.scrollHeight > node.clientHeight))
    await shot('skills-small.png')
    await page.keyboard.press('Escape')
    check('Small windows collapse the tray and retain the HUD guide button', { width: 872, height: 594 })
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.failedResources, [])
    report.ok = true
  } catch (error) {
    report.failure = error.stack || String(error)
    throw error
  } finally {
    report.completedAt = new Date().toISOString()
    await fs.writeFile(path.join(output, 'skills-ui-report.json'), JSON.stringify(report, null, 2) + '\n')
    await browser.close()
  }
  console.log(JSON.stringify(report, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
