/* Isolated local-browser checks. HP/position fixtures shorten encounters; inputs and chapter transitions are real. */
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { chromium } = require(path.join(require('node:os').homedir(), '.codex/skills/develop-web-game/node_modules/playwright'))
const out = path.resolve(__dirname, '../docs/verification')
const url = 'http://127.0.0.1:18765/F.LF/game/game.html'
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  const report = { errors: [], failedResources: [], checks: [] }
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) report.failedResources.push([response.status(), response.url()]) })
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()))
  const shot = name => page.screenshot({ path: path.join(out, 'chapter-' + name + '.png'), animations: 'disabled' })
  const ready = () => page.waitForFunction(() => window.realityGame && !document.querySelector('#reality-loading'), { timeout: 30000 })
  const phase = value => page.waitForFunction(value => window.realityGame.chapter.getState().phase === value, value, { timeout: 10000 })
  function check(name, details) { report.checks.push({ name, details }); console.log(name, JSON.stringify(details)) }
  async function hold(key, ms) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key) }
  async function clearWithAttack(expected) {
    await page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      match.AIscript = []
      const list = Object.values(match.character)
      list.forEach((ch, i) => {
        ch.set_pos(i === 0 ? 300 : i === 1 ? 700 : 340 + (i - 2) * 3, 0, i === 1 ? 330 : 450)
        ch.ps.vx = ch.ps.vy = ch.ps.vz = 0; ch.ps.dir = i < 2 ? 'right' : 'left'
        ch.dead = false; ch.health.fall = ch.health.bdefend = 0
        Object.assign(ch.effect, { num: -99, stuck: false, timeout: 0, timein: 0, super: false, blink: false })
        ch.combo_buffer.combo = null; ch.combo_buffer.timeout = 0
        ch.trans.reset_lock(99); ch.trans.frame(999, 99)
        if (i >= 2) { ch.health.hp = ch.health.hp_bound = 1; ch.con.fetch = function () { this.clear_states?.() }; ch.con.clear_states?.() }
      })
    })
    await page.waitForTimeout(250)
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.evaluate(() => {
        const list = Object.values(window.realityGame.manager.activeMatch.character)
        list[0].set_pos(300, 0, 450); list[0].ps.dir = 'right'
        list.filter(ch => ch.team === 2 && ch.health.hp > 0).forEach((ch, i) => {
          ch.set_pos(340 + i * 3, 0, 450); ch.ps.vx = ch.ps.vy = ch.ps.vz = 0
          ch.health.hp = ch.health.hp_bound = 1; ch.health.fall = ch.health.bdefend = 0; ch.dead = false
          ch.effect.super = false; ch.effect.stuck = false; ch.effect.timeout = 0
          ch.trans.reset_lock(99); ch.trans.frame(999, 99)
        })
      })
      await hold('f', 110); await page.waitForTimeout(300)
      if ((await state()).chapter.phase === expected) break
    }
    await phase(expected)
  }
  try {
    await page.goto(url); await ready(); await shot('home')
    await page.locator('.urban-start').click(); await page.getByRole('button', { name: '01 故事 · 不要掉队', exact: true }).click(); await shot('lobby')
    assert.equal(await page.locator('.urban-stage').isDisabled(), true)
    await page.keyboard.press('Enter'); await page.waitForSelector('.chapter-overlay:not([hidden])')
    await shot('intro')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('chapter-cancel')), true)
    await page.keyboard.press('Escape')
    assert.equal((await state()).chapter.dialog, '')
    await page.locator('.urban-launch').click(); await page.locator('.chapter-confirm').click(); await phase('battle')
    const opening = await state()
    assert.equal(opening.players.length, 4)
    assert.equal(opening.chapter.checkpoint, 0)
    assert.equal(opening.players[2].hp, 150)
    const fps = []
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(1000); fps.push(await page.locator('.urban-hud-fps').innerText()) }
    await shot('battle')
    check('story entry, modal keyboard handling, real AI performance sample', { fps, enemies: opening.chapter.enemiesRemaining })

    await page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      match.AIscript = []
      const list = Object.values(match.character)
      list.forEach((ch, i) => {
        ch.set_pos(i < 2 ? 300 + i * 30 : 900, 0, i < 2 ? 450 : 330)
        ch.ps.vx = ch.ps.vy = ch.ps.vz = 0
        ch.trans.reset_lock(99); ch.trans.frame(i === 1 ? 230 : 999, 99)
        ch.effect.stuck = false; ch.effect.timeout = 0; ch.health.fall = 0
        if (i === 0) ch.health.hp = ch.health.hp_bound = 500
        if (i === 1) { ch.itr.attacker = list[2]; ch.health.hp = -1 }
        if (i >= 2) { ch.con.fetch = function () { this.clear_states?.() }; ch.con.clear_states?.() }
      })
    })
    await page.waitForFunction(() => window.realityGame.chapter.getState().downedPlayers.includes(1))
    await page.keyboard.down('h'); await page.waitForTimeout(650)
    const progress = (await state()).chapter.reviveProgress
    assert(progress > 0 && progress < 1)
    await shot('rescue')
    await page.keyboard.press('p'); await page.waitForTimeout(150)
    const paused = await state()
    await page.waitForTimeout(350)
    assert.equal((await state()).chapter.reviveProgress, paused.chapter.reviveProgress)
    assert.equal((await state()).chapter.elapsedFrames, paused.chapter.elapsedFrames)
    await page.keyboard.press('p'); await page.waitForTimeout(1100); await page.keyboard.up('h')
    const rescued = await state()
    assert.equal(rescued.chapter.rescues, 1)
    assert(rescued.players[1].hp >= 180)
    assert.deepEqual(rescued.chapter.downedPlayers, [])
    await page.waitForTimeout(800)
    const beforeMove = (await state()).players[1].x
    await hold('ArrowLeft', 350)
    assert((await state()).players[1].x < beforeMove)
    check('held defence revives teammate; pause freezes progress; revived player moves', { progress, hp: rescued.players[1].hp, rescues: rescued.chapter.rescues })

    await clearWithAttack('interlude'); await shot('checkpoint')
    assert.equal((await state()).chapter.saved.checkpoint, 1)
    const stoppedTime = await page.evaluate(() => window.realityGame.manager.activeMatch.time.t)
    await page.keyboard.press('p'); await hold('f', 200)
    assert.equal(await page.evaluate(() => window.realityGame.manager.activeMatch.time.t), stoppedTime)
    await page.locator('.chapter-cancel').click()
    assert.equal((await state()).screen, 'character_selection')
    assert.equal(await page.evaluate(() => window.realityGame.manager.activeMatch), null)
    await page.reload(); await ready()
    assert.equal((await state()).chapter.saved.checkpoint, 1)
    await page.locator('.urban-start').click(); await page.getByRole('button', { name: '01 故事 · 不要掉队', exact: true }).click(); await page.locator('.urban-launch').click(); await shot('resume')
    await page.locator('.chapter-confirm').click(); await phase('battle')
    const resumed = await state()
    assert.equal(resumed.chapter.checkpoint, 1)
    assert.equal(resumed.players.length, 5)
    assert.equal(resumed.players[2].hp, 220)
    check('real hits clear encounter; modal blocks pause; exit cleans match; reload resumes checkpoint 1', { checkpoint: resumed.chapter.checkpoint, enemies: resumed.chapter.enemiesRemaining })

    await page.evaluate(() => Object.values(window.realityGame.manager.activeMatch.character).filter(ch => ch.team === 1).forEach(ch => { ch.health.hp = -1 }))
    await phase('failed'); await shot('failed')
    assert.equal((await state()).chapter.saved.checkpoint, 1)
    await page.keyboard.press('p')
    assert.equal((await state()).chapter.phase, 'failed')
    await page.locator('.chapter-confirm').click(); await phase('battle')
    const retried = await state()
    assert.equal(retried.chapter.checkpoint, 1)
    assert(retried.players.slice(0, 2).every(ch => ch.hp === 500))
    check('team failure retains checkpoint; retry restores both players', { checkpoint: retried.chapter.checkpoint, hp: retried.players.slice(0, 2).map(ch => ch.hp) })
    await clearWithAttack('complete'); await shot('complete')
    assert.equal((await state()).chapter.saved.completed, true)
    assert.deepEqual((await state()).chapter.saved.mementos, ['第一张合照'])
    await page.setViewportSize({ width: 700, height: 600 }); await shot('small-complete')
    const fits = await page.locator('.chapter-sheet').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight })
    assert(fits)
    await page.locator('.chapter-confirm').click()
    await page.getByRole('button', { name: '自由对战', exact: true }).click()
    assert.equal(await page.locator('.urban-stage').isDisabled(), false)
    await page.locator('.urban-stage').selectOption('2'); await page.locator('.urban-bots').selectOption('1')
    await page.locator('.urban-launch').click()
    await page.waitForFunction(() => window.realityGame.manager.activeMatch?.time?.t > 10)
    assert.equal((await state()).chapter.phase, 'idle')
    assert.equal((await state()).players.length, 3)
    assert.equal(await page.locator('.chapter-objective').isVisible(), false)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => window.realityGame.manager.active_UI === 'character_selection')
    assert.equal((await state()).screen, 'character_selection')
    await page.reload(); await ready()
    assert.equal((await state()).chapter.saved.completed, true)
    check('photo persists, 700×600 dialog fits, free battle and Escape still work', { mementos: (await state()).chapter.saved.mementos })

    // A second run covers direct interlude -> advance and native combination input.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.locator('.urban-start').click(); await page.getByRole('button', { name: '01 故事 · 不要掉队', exact: true }).click(); await page.locator('.urban-launch').click(); await page.locator('.chapter-confirm').click(); await phase('battle')
    await clearWithAttack('interlude')
    await page.locator('.chapter-confirm').click(); await phase('battle')
    assert.equal((await state()).chapter.checkpoint, 1)
    assert.equal((await state()).players.length, 5)
    const priorMP = await page.evaluate(() => Object.values(window.realityGame.manager.activeMatch.character)[0].health.mp_usage)
    for (const key of ['h','d','f']) { await page.keyboard.press(key); await page.waitForTimeout(70) }
    await page.waitForTimeout(200)
    const skillMP = await page.evaluate(() => Object.values(window.realityGame.manager.activeMatch.character)[0].health.mp_usage - 0)
    assert.equal(skillMP - priorMP, 40)
    const layout = await page.locator('.urban-frame').evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: innerHeight } })
    assert(layout.top >= 0 && layout.bottom <= layout.height)
    await shot('second-encounter')
    await page.keyboard.press('Escape'); await page.waitForFunction(() => window.realityGame.manager.active_UI === 'character_selection')
    check('direct next encounter keeps layout in viewport and native combos usable', { layout, skillMP })
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, [])
    report.passed = true
  } catch (error) {
    report.passed = false; report.failure = error.stack
    console.error(error); process.exitCode = 1
    await shot('failure').catch(() => {})
    report.lastState = await state().catch(() => null)
  } finally {
    await fs.writeFile(path.join(out, 'chapter-browser-report.json'), JSON.stringify(report, null, 2))
    await browser.close()
  }
})()
