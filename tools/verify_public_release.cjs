/* Isolated public-release acceptance. Uses real keyboard events; combat setup
 * only removes random props/AI and places both players in an open test lane. */
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
const output = path.resolve(process.env.GAME_VERIFY_OUTPUT || path.join(__dirname, '../docs/verification/public-release'))
const url = process.env.GAME_TEST_URL || process.env.LF2_TEST_URL || 'http://127.0.0.1:18766/those-who-fight-reality/'
const title = '與名為現實的怪物戰鬥的人們'
const english = 'THOSE WHO FIGHT THE MONSTER CALLED REALITY'
const report = { passed: false, url, startedAt: new Date().toISOString(), checks: [], pageErrors: [], consoleErrors: [], failedResources: [], canceledMedia: [], screenshots: [] }
;(async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 }, deviceScaleFactor: 1 })
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.pageErrors.push(error.stack || error.message))
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ status: response.status(), url: response.url() }) })
  page.on('requestfailed', request => {
    const failure = { error: request.failure()?.errorText, url: request.url(), type: request.resourceType() }
    if (failure.error === 'net::ERR_ABORTED' && failure.type === 'media') report.canceledMedia.push(failure)
    else report.failedResources.push(failure)
  })
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()))
  const shot = async name => { await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' }); report.screenshots.push(name + '.png') }
  function check(name, details) { report.checks.push({ name, details }); console.log('PASS', name) }
  async function cleanCopy(surface) {
    const text = await page.locator('body').innerText()
    assert.doesNotMatch(text, /\bLF2\b|F\.LF|Little\s+Fighter|Project\s*F\b/i, surface + ' contains legacy branding')
    check('visible copy: ' + surface, text)
  }
  async function fitHome(size) {
    await page.setViewportSize(size)
    await page.waitForTimeout(180)
    const boxes = await page.evaluate(() => {
      const rect = selector => {
        const el = document.querySelector(selector); const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, text: el.textContent }
      }
      return { frame: rect('.urban-frame'), chinese: rect('.reality-wordmark'), english: rect('.reality-title-en'), action: rect('.urban-start'), pageWidth: document.documentElement.scrollWidth }
    })
    for (const [name, box] of Object.entries(boxes)) {
      if (typeof box !== 'object') continue
      assert(box.x >= -1 && box.y >= -1 && box.right <= size.width + 1 && box.bottom <= size.height + 1, name + ' must fit ' + size.width + '×' + size.height)
    }
    assert(boxes.pageWidth <= size.width, 'no horizontal document overflow')
    await shot('home-' + size.width + 'x' + size.height)
    check('complete title and home controls fit ' + size.width + '×' + size.height, boxes)
  }
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForFunction(() => window.realityGame?.skillsUI && !document.querySelector('#reality-loading'), null, { timeout: 180000 })
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.title(), title + ' | ' + english)
    assert.equal((await page.locator('.reality-wordmark').textContent()).replace(/\s/g, ''), title)
    assert.equal((await page.locator('.reality-title-en').innerText()).replace(/\s+/g, ' ').trim(), english)
    const fonts = await page.evaluate(() => ({
      loaded: [...document.fonts].map(f => ({ family: f.family, status: f.status, weight: f.weight, style: f.style })),
      chinese: getComputedStyle(document.querySelector('.reality-wordmark')).fontFamily,
      english: getComputedStyle(document.querySelector('.reality-title-en')).fontFamily,
      resources: performance.getEntriesByType('resource').filter(e => /\/fonts\//.test(e.name)).map(e => ({ url: e.name, bytes: e.transferSize, duration: e.duration }))
    }))
    for (const name of ['Reality Display TC', 'Reality Fight']) assert(fonts.loaded.some(f => f.family === name && f.status === 'loaded'), 'bundled font must load: ' + name)
    assert.match(fonts.chinese, /Reality Display TC/); assert.match(fonts.english, /Reality Fight/)
    const loader = await page.evaluate(() => ({ waitSeconds: requirejs.s.contexts._.config.waitSeconds, mainScript: document.querySelector('script[data-main]')?.getAttribute('data-main'), gameScripts: performance.getEntriesByType('resource').filter(r => /\/game\.js/.test(r.name)).map(r => r.name) }))
    check('bilingual title and both bundled display fonts load', { title: await page.title(), finalURL: page.url(), fonts, loader })
    const metadata = await page.evaluate(() => ({ heroes: window.realityGame.heroes.map(h => ({ id: h.id, name: h.name, skills: window.realityGame.skills.getSkills(h.id).length })), stages: window.realityGame.stages.map(s => ({ id: s.id, name: s.name })), monsters: window.realityGame.monsters.map(m => ({ id: m.id, name: m.name })), animation: JSON.parse(window.render_game_to_text()).animation }))
    assert.deepEqual(metadata.heroes.map(h => h.id), [11, 2, 8, 4, 9, 10])
    assert.equal(metadata.stages.length, 5)
    assert.equal(metadata.monsters.length, 3)
    assert.equal(metadata.heroes.reduce((n, h) => n + h.skills, 0), 27)
    assert.equal(await page.locator('.urban-crew-member').count(), 6)
    check('six heroes, five arenas, three monsters and 27 skills', metadata)
    await cleanCopy('home')
    await fitHome({ width: 1280, height: 920 })
    await fitHome({ width: 700, height: 600 })
    await fitHome({ width: 390, height: 844 })
    await page.setViewportSize({ width: 1280, height: 920 })
    await page.locator('.urban-home .urban-text-button:not(.reality-skills-home-entry)').click()
    await cleanCopy('about')
    await shot('about')
    await page.locator('.urban-credits .urban-primary').click()
    await page.locator('.urban-home .urban-secondary').click()
    await page.waitForFunction(() => window.realityGame.manager.active_UI === 'settings')
    await cleanCopy('controls')
    await shot('controls')
    await page.locator('.urban-settings-bottom .urban-primary').click()
    await page.waitForFunction(() => window.realityGame.manager.active_UI === 'character_selection')
    await page.locator('.urban-lobby-back .urban-back:not(.reality-skills-lobby-entry)').nth(1).click()
    await page.waitForFunction(() => window.realityGame.manager.active_UI === 'frontpage')
    await page.locator('.reality-skills-home-entry').click()
    const guideCounts = []
    for (let i = 0; i < metadata.heroes.length; i++) {
      await page.locator('.reality-skills-hero').nth(i).click()
      guideCounts.push(await page.locator('.reality-skill-card').count())
      await cleanCopy('skill guide ' + metadata.heroes[i].name)
    }
    assert.deepEqual(guideCounts, [4, 5, 4, 4, 4, 6])
    await shot('shenzhou-six-skills')
    await page.locator('.reality-skill-card').last().scrollIntoViewIfNeeded()
    const lastCard = await page.locator('.reality-skill-card').last().boundingBox()
    const guideBody = await page.locator('.reality-skills-body').boundingBox()
    assert(lastCard.y >= guideBody.y - 1 && lastCard.y + lastCard.height <= guideBody.y + guideBody.height + 1, 'sixth move is reachable inside the scrolling guide')
    await shot('shenzhou-six-skills-bottom')
    check('sixth Shenzhou move is fully reachable by scrolling', { lastCard, guideBody })
    await page.keyboard.press('Escape')
    assert.equal((await state()).skillsGuideOpen, false)
    check('all 27 skill cards and guide close', guideCounts)
    await page.locator('.urban-start').click()
    await page.waitForFunction(() => window.realityGame.manager.active_UI === 'character_selection')
    assert.equal(await page.locator('.urban-fighter').count(), 6)
    assert.equal(await page.locator('.urban-stage option').count(), 5)
    assert.equal(await page.locator('.urban-monsters option').count(), 4)
    assert.equal((await state()).chapter.mode, 'free')
    await page.locator('.urban-humans').selectOption('2')
    await page.locator('.urban-slot').nth(0).click()
    await page.locator('.urban-fighter').nth(4).click()
    await page.locator('.urban-slot').nth(1).click()
    await page.locator('.urban-fighter').nth(5).click()
    await page.locator('.urban-stage').selectOption('3')
    await page.locator('.urban-bots').selectOption('3')
    await page.locator('.urban-monsters').selectOption('mixed')
    await cleanCopy('lobby')
    await shot('lobby')
    await page.locator('.urban-launch').click()
    await page.waitForFunction(() => window.realityGame.manager.activeMatch?.time?.t > 4)
    const opening = await state()
    assert.deepEqual(opening.players.filter(p => p.team === 1).map(p => p.id), [9, 10])
    assert.deepEqual(opening.players.filter(p => p.team === 2).map(p => p.id), [30, 31, 32])
    await cleanCopy('free battle')
    await shot('battle')
    await page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      match.AIscript = []
      for (const o of Object.values(match.scene.live)) if (o.type === 'lightweapon' || o.type === 'heavyweapon') match.destroy_object(o)
      const middle = (match.background.zboundary[0] + match.background.zboundary[1]) / 2
      const characters = Object.values(match.character)
      characters.forEach((c, i) => {
        if (c.hold.obj) c.drop_weapon(0, 0)
        c.set_pos(match.background.width / 2 - 200 + i * 100, 0, middle + (i === 1 ? 25 : -20))
        c.ps.vx = c.ps.vy = c.ps.vz = 0
        c.health.fall = c.health.bdefend = 0
        c.trans.reset_lock(100); c.trans.frame(999, 100); c.trans.trans()
        c.ps.dir = 'right'
        c.con.flush?.(); c.con.clear_states?.(); c.combodec?.clear_seq()
        for (const key of ['up', 'down', 'left', 'right', 'def', 'jump', 'att']) c.con.state[key] = 0
        c.combo_buffer.combo = null; c.combo_buffer.timeout = 0
        if (c.con.type === 'AIcontroller') c.con.fetch = function () { this.clear_states?.() }
      })
      const original = match.frame
      window.__publicTrace = [[], []]
      match.frame = function () {
        const result = original.apply(this, arguments)
        characters.slice(0, 2).forEach((c, i) => window.__publicTrace[i].push({ frame: c.frame.N, state: c.frame.D.state, name: c.frame.D.name, x: c.ps.x, z: c.ps.z }))
        return result
      }
    })
    const before = await state()
    await page.keyboard.down('d'); await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(330)
    await page.keyboard.up('d'); await page.keyboard.up('ArrowRight')
    const moved = await state()
    for (let i = 0; i < 2; i++) assert(moved.players[i].x > before.players[i].x + 4, 'player ' + (i + 1) + ' must move on actual simultaneous keys')
    await page.waitForTimeout(150)
    await page.keyboard.down('f'); await page.keyboard.down('j')
    await page.waitForTimeout(140)
    await page.keyboard.up('f'); await page.keyboard.up('j')
    await page.waitForTimeout(180)
    const traces = await page.evaluate(() => window.__publicTrace)
    for (let i = 0; i < 2; i++) assert(traces[i].some(f => f.state === 3), 'player ' + (i + 1) + ' must enter attack state from physical key')
    check('real simultaneous P1/P2 movement and attacks', { before: before.players.slice(0, 2), after: moved.players.slice(0, 2), attackFrames: traces.map(t => t.filter(f => f.state === 3)) })
    await page.keyboard.press('p')
    await page.waitForFunction(() => window.realityGame.manager.activeMatch.time.paused)
    const frozenTick = await page.evaluate(() => window.realityGame.manager.activeMatch.time.t)
    await page.waitForTimeout(180)
    assert.equal(await page.evaluate(() => window.realityGame.manager.activeMatch.time.t), frozenTick)
    await cleanCopy('paused battle'); await shot('paused-battle')
    await page.keyboard.press('p')
    await page.waitForFunction(t => !window.realityGame.manager.activeMatch.time.paused && window.realityGame.manager.activeMatch.time.t > t, frozenTick)
    await page.locator('.reality-skills-hud-entry').click()
    await page.waitForFunction(() => window.realityGame.skillsUI.isOpen())
    assert.equal((await state()).paused, true)
    await page.locator('.reality-skills-hero').last().click()
    assert.equal(await page.locator('.reality-skill-card').count(), 6)
    await shot('battle-skill-guide')
    await page.keyboard.press('Escape')
    assert.equal((await state()).paused, false)
    check('pause/resume and battle guide preserve correct pause state', { frozenTick })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => window.realityGame.manager.active_UI === 'character_selection')
    await page.locator('.chapter-mode').nth(0).click()
    assert.equal((await state()).chapter.mode, 'story')
    await cleanCopy('story lobby')
    await page.locator('.urban-launch').click()
    await page.waitForFunction(() => window.realityGame.chapter.getState().dialog === 'intro')
    await cleanCopy('story intro'); await shot('story-intro')
    await page.locator('.chapter-confirm').click()
    await page.waitForFunction(() => window.realityGame.chapter.getState().phase === 'battle' && window.realityGame.manager.activeMatch?.time?.t > 4)
    const story = await state()
    assert.equal(story.chapter.checkpoint, 0)
    assert.equal(story.players.filter(p => p.team === 2).length, 2)
    await cleanCopy('story battle'); await shot('story-battle')
    check('story intro enters first chapter through real buttons', story.chapter)
    assert.deepEqual(report.pageErrors, [], 'no page exceptions')
    assert.deepEqual(report.consoleErrors, [], 'no console errors')
    assert.deepEqual(report.failedResources, [], 'no missing or failed resources')
    report.passed = true
    await fs.rm(path.join(output, 'failure.png'), { force: true })
  } catch (error) {
    report.failure = error.stack || error.message
    try { report.failureState = await state(); await shot('failure') } catch (_) {}
    process.exitCode = 1
    console.error(report.failure)
  } finally {
    report.finishedAt = new Date().toISOString()
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    await browser.close()
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, errors: report.pageErrors.length + report.consoleErrors.length, failedResources: report.failedResources.length, output }))
  }
})()
