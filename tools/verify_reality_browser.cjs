/* Local visual/input verification; uses an isolated browser profile. */
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(require('node:os').homedir(), '.codex/skills/develop-web-game/node_modules/playwright'))
const assert = require('node:assert/strict')
const out = process.env.LF2_VERIFY_OUTPUT ? path.resolve(process.env.LF2_VERIFY_OUTPUT) : path.resolve(__dirname, '../docs/verification')
const url = 'http://127.0.0.1:18765/F.LF/game/game.html'
;(async () => {
  await fs.mkdir(out, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  const report = { errors: [], failedResources: [], checks: [] }
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) report.failedResources.push([response.status(), response.url()]) })
  async function shot(name) { await page.screenshot({ path: path.join(out, 'reality-' + name + '.png'), animations: 'disabled' }) }
  async function state() { return page.evaluate(() => JSON.parse(window.render_game_to_text())) }
  async function ready() { await page.waitForFunction(() => window.realityGame && !document.querySelector('#reality-loading'), { timeout: 30000 }) }
  async function hold(keys, ms) { for (const key of keys) await page.keyboard.down(key); await page.waitForTimeout(ms); for (const key of keys) await page.keyboard.up(key) }
  async function observeAction(kind, keys) {
    await page.evaluate(kind => {
      const match = window.realityGame.manager.activeMatch
      const frame = match.frame
      window.__inputSeen = [null, null]
      match.frame = function () {
        const result = frame.apply(this, arguments)
        Object.values(this.character).slice(0, 2).forEach((ch, i) => {
          const yes = kind === 'jump' ? ch.ps.y < 0 : kind === 'guard' ? ch.frame.N >= 110 && ch.frame.N <= 112 : ch.frame.N >= 60 && ch.frame.N < 110
          if (yes && !window.__inputSeen[i]) window.__inputSeen[i] = { frame: ch.frame.N, y: ch.ps.y }
        })
        return result
      }
      window.__restoreInputObserver = () => { match.frame = frame }
    }, kind)
    try {
      for (const key of keys) await page.keyboard.down(key)
      await page.waitForFunction(() => window.__inputSeen.every(Boolean), null, { timeout: 5000 })
      return await page.evaluate(() => window.__inputSeen)
    } finally {
      for (const key of keys) await page.keyboard.up(key)
      await page.evaluate(() => window.__restoreInputObserver())
    }
  }
  async function check(name, details) { report.checks.push({ name, details }); console.log(name, JSON.stringify(details)) }
  try {
    await page.goto(url); await ready(); await shot('home')
    await page.getByRole('button', { name: '双人键位', exact: true }).click()
    await page.locator('[data-control-player="0"][data-control-action="att"]').click()
    await page.keyboard.press('j')
    assert.equal((await state()).controls[0].config.att, 'f')
    const conflict = await page.locator('.control-binding-status').innerText()
    await page.keyboard.press('Escape')
    await page.locator('[data-control-player="0"][data-control-action="att"]').click()
    await page.keyboard.press('r')
    assert.equal((await state()).controls[0].config.att, 'r')
    await page.reload(); await ready()
    assert.equal((await state()).controls[0].config.att, 'r')
    await page.getByRole('button', { name: '双人键位', exact: true }).click()
    await page.getByRole('button', { name: '恢复推荐双人键位', exact: true }).click()
    assert.equal((await state()).controls[0].config.att, 'f')
    await shot('settings')
    await page.getByRole('button', { name: '保存并返回', exact: true }).click()
    assert.equal((await state()).screen, 'character_selection')
    await page.getByRole('button', { name: '自由对战', exact: true }).click()
    // This path starts at home, enters settings, then returns to the lobby.
    await hold(['d'], 120)
    assert.equal((await state()).selected[0].name, '林夏')
    await page.getByRole('button', { name: '选择 小一', exact: true }).click()
    await shot('lobby')
    await check('settings conflict, persistence, recommended reset and keyboard lobby path', { conflict })
    await page.locator('.urban-bots').selectOption('1')
    await page.locator('.urban-launch').click()
    await page.waitForFunction(() => window.realityGame.manager.activeMatch?.character && Object.keys(window.realityGame.manager.activeMatch.character).length === 3)
    await page.waitForTimeout(800)
    // Isolate controls from AI attacks; positions/AI only are fixture setup, inputs remain real keyboard events.
    await page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      match.AIscript = []
      for (const obj of Object.values(match.scene.live)) {
        if (obj.type === 'lightweapon' || obj.type === 'heavyweapon') match.destroy_object(obj)
      }
      const list = Object.values(match.character)
      list.forEach((ch, i) => {
        if (ch.hold.obj) ch.drop_weapon(0, 0)
        ch.set_pos([250, 550, 900][i], 0, [450, 450, 330][i]); ch.ps.vx = ch.ps.vy = ch.ps.vz = 0
        ch.combo_buffer.combo = null; ch.combo_buffer.timeout = 0
        ch.health.fall = ch.health.bdefend = 0
        Object.assign(ch.effect, { stuck: false, timeout: 0, timein: 0, super: false, blink: false })
        // Engine frame 0 means no transition; 999 explicitly returns to idle.
        ch.trans.reset_lock(100); ch.trans.frame(999, 100); ch.trans.trans()
        ch.con.flush?.(); ch.con.clear_states?.(); ch.combodec.clear_seq()
      })
      list[2].con.fetch = function () { this.clear_states?.() }
      list[2].con.clear_states?.()
    })
    await page.waitForTimeout(350)
    const before = await state()
    await hold(['a', 'ArrowRight'], 500)
    const moved = await state()
    assert(moved.players[0].x < before.players[0].x - 5)
    assert(moved.players[1].x > before.players[1].x + 5)
    await check('simultaneous two-player movement', { before: before.players.slice(0, 2).map(x => x.x), after: moved.players.slice(0, 2).map(x => x.x) })
    await page.waitForTimeout(350)
    const jumping = await observeAction('jump', ['g', 'k'])
    await check('both players jump', jumping)
    await page.waitForFunction(() => Object.values(window.realityGame.manager.activeMatch.character).slice(0, 2).every(ch => ch.ps.y === 0 && ch.frame.N < 4))
    // Observe brief guard frames as the engine emits them, rather than sampling after an arbitrary wall-clock delay.
    const defending = await observeAction('guard', ['h', 'l'])
    await check('both players guard', defending)
    await page.waitForTimeout(700)
    const attacking = await observeAction('attack', ['f', 'j'])
    await check('both players attack', attacking)
    await page.waitForTimeout(900)
    await page.keyboard.down('p'); await page.waitForTimeout(120)
    assert.equal((await state()).paused, true)
    const pausedTime = await page.evaluate(() => window.realityGame.manager.activeMatch.time.t)
    await page.keyboard.down('p'); await page.waitForTimeout(500)
    assert.equal(await page.evaluate(() => window.realityGame.manager.activeMatch.time.t), pausedTime)
    await page.keyboard.up('p'); await shot('paused')
    await page.keyboard.press('p'); await page.waitForTimeout(150)
    assert.equal((await state()).paused, false)
    await check('P pauses once while held, then resumes', { pausedTime })
    await page.keyboard.press('Escape'); await page.waitForTimeout(150)
    assert.equal((await state()).screen, 'character_selection')
    for (let stage = 0; stage < 3; stage++) {
      if (stage === 1) {
        await page.getByRole('button', { name: '选择 周齐', exact: true }).click()
        await page.locator('.urban-slot').nth(1).click()
        await page.getByRole('button', { name: '选择 陈野', exact: true }).click()
      }
      await page.locator('.urban-stage').selectOption(String(stage))
      await page.locator('.urban-bots').selectOption(stage === 1 ? '6' : '2')
      await page.locator('.urban-launch').click()
      await page.waitForFunction(() => window.realityGame.manager.activeMatch?.background && window.realityGame.manager.activeMatch?.time?.t > 20)
      await page.waitForTimeout(500)
      const data = await state()
      assert.equal(data.players.length, stage === 1 ? 8 : 4)
      await shot(stage === 0 ? 'battle' : stage === 1 ? 'ranking-8p' : 'graduation')
      const fps = []
      for (let tick = 0; tick < (stage === 1 ? 8 : 1); tick++) {
        await page.waitForTimeout(1000)
        fps.push(await page.locator('.urban-hud-fps').innerText())
      }
      await check('stage ' + stage + ' actual match', { names: data.players.map(x => x.name), fps })
      await page.keyboard.press('Escape'); await page.waitForTimeout(150)
      assert.equal((await state()).screen, 'character_selection')
    }
    // Re-enter the default lineup for the controlled hit -> KO -> result path.
    await page.locator('.urban-slot').nth(0).click()
    await page.getByRole('button', { name: '选择 小一', exact: true }).click()
    await page.locator('.urban-stage').selectOption('0')
    await page.locator('.urban-bots').selectOption('1')
    await page.locator('.urban-launch').click()
    await page.waitForFunction(() => window.realityGame.manager.activeMatch?.time?.t > 20)
    await page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      match.AIscript = []
      const list = Object.values(match.character)
      list.forEach((ch, i) => {
        ch.set_pos([300, 750, 340][i], 0, [450, 330, 450][i]); ch.ps.vx = ch.ps.vy = ch.ps.vz = 0
        ch.trans.reset_lock(99); ch.trans.frame(999, 99); ch.ps.dir = i === 2 ? 'left' : 'right'
      })
      list[2].health.hp = list[2].health.hp_bound = 1
      list[2].con.fetch = function () { this.clear_states?.() }
      list[2].con.clear_states?.()
    })
    await page.waitForTimeout(150)
    for (let hit = 0; hit < 10; hit++) {
      await hold(['f'], 100); await page.waitForTimeout(250)
      if ((await state()).players[2].hp <= 0) break
    }
    const hitState = await state()
    assert(hitState.players[2].hp <= 0)
    await page.waitForSelector('.summary_dialog', { state: 'visible', timeout: 20000 })
    await shot('results')
    await check('real attack damage causes KO and results (enemy HP=1 fixture)', hitState.players.map(x => ({ name: x.name, hp: x.hp })))
    await page.getByRole('button', { name: '再一起出发 ▶', exact: true }).click()
    assert.equal((await state()).screen, 'character_selection')
    await page.setViewportSize({ width: 700, height: 600 }); await shot('small-lobby')
    await page.goto(url + '?demo'); await ready(); await page.waitForTimeout(1600)
    await check('demo route loads without nonexistent background', { screen: (await state()).screen })
    assert.equal(report.errors.length, 0)
    assert.equal(report.failedResources.length, 0)
    report.passed = true
  } catch (error) {
    report.passed = false; report.failure = error.stack
    await shot('failure').catch(() => {})
    report.lastState = await state().catch(() => null)
    console.error(error)
    process.exitCode = 1
  } finally {
    await fs.writeFile(path.join(out, 'reality-browser-report.json'), JSON.stringify(report, null, 2))
    await browser.close()
  }
})()
