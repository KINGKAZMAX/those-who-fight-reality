/* Asset expansion acceptance in an isolated browser. Native combo input only.
 * Combat fixtures stop AI, remove random falling weapons and separate targets.
 * They do not refill MP or change move data. The zero-cost move is also checked
 * at zero MP. A local checkpoint fixture exercises the chapter's actual UI.
 */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.codex/skills/develop-web-game/node_modules/playwright'))

const output = path.resolve(process.env.LF2_VERIFY_OUTPUT || path.join(__dirname, '../docs/verification/asset-expansion'))
const url = process.env.LF2_TEST_URL || 'http://127.0.0.1:18765/F.LF/game/game.html'
const report = { passed: false, url, startedAt: new Date().toISOString(), checks: [], skills: [], errors: [], failedResources: [], canceledMedia: [] }

;(async function () {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 }, deviceScaleFactor: 1 })
  page.on('pageerror', error => report.errors.push(error.stack || error.message))
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) report.failedResources.push([response.status(), response.url()]) })
  page.on('requestfailed', request => {
    const failure = [request.failure()?.errorText, request.url()]
    if (failure[0] === 'net::ERR_ABORTED' && request.resourceType() === 'media') report.canceledMedia.push(failure)
    else report.failedResources.push(failure)
  })
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()))
  const ready = () => page.waitForFunction(() => window.realityGame?.skillsUI && !document.querySelector('#reality-loading'), null, { timeout: 90000 })
  const shot = name => page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' })
  function check(name, details) { report.checks.push({ name, details }); console.log('PASS', name) }
  async function lobby() {
    if ((await state()).skillsGuideOpen) await page.keyboard.press('Escape')
    if ((await state()).screen === 'gameplay') {
      await page.keyboard.press('Escape')
      await page.waitForFunction(() => window.realityGame.manager.active_UI === 'character_selection')
    }
    if ((await state()).screen === 'frontpage') await page.locator('.urban-start').click()
    await page.getByRole('button', { name: '自由对战', exact: true }).click()
  }
  async function selectHero(slot, name) {
    await page.locator('.urban-slot').nth(slot).click()
    await page.getByRole('button', { name: '选择 ' + name, exact: true }).click()
  }
  async function begin(hero, stage = 1, bots = 1, formation = 'mixed') {
    await lobby()
    await page.locator('.urban-humans').selectOption('2')
    await selectHero(0, hero.name)
    await selectHero(1, '小一')
    await page.locator('.urban-stage').selectOption(String(stage))
    await page.locator('.urban-bots').selectOption(String(bots))
    await page.locator('.urban-monsters').selectOption(formation)
    await page.evaluate(() => {
      const manager = window.realityGame.manager
      const start = manager.start_match
      window.__expansionOpening = null
      manager.start_match = function () {
        manager.start_match = start
        const match = start.apply(this, arguments)
        const frame = match.frame
        match.frame = function () {
          if (this.time?.t === 0) {
            window.__expansionOpening = Object.values(this.character).map(ch => ({ id: ch.id, team: ch.team, mp: ch.health.mp, spent: ch.health.mp_usage }))
          }
          const result = frame.apply(this, arguments)
          if (window.__expansionOpening) this.frame = frame
          return result
        }
        return match
      }
    })
    await page.locator('.urban-launch').click()
    await page.waitForFunction(() => window.realityGame.manager.activeMatch?.time?.t > 4)
    return page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      return { stage: window.realityGame.draft.background, width: match.background.width,
        depth: match.background.zboundary, rules: match.data.realityRules, initial: window.__expansionOpening,
        players: Object.values(match.character).map(ch => ({ id: ch.id, team: ch.team, mp: ch.health.mp, spent: ch.health.mp_usage })) }
    })
  }
  async function isolateCombat(zeroMP = false) {
    await page.evaluate(zeroMP => {
      const match = window.realityGame.manager.activeMatch
      match.AIscript = []
      for (const object of Object.values(match.scene.live)) {
        if (object.type === 'lightweapon' || object.type === 'heavyweapon') match.destroy_object(object)
      }
      const chars = Object.values(match.character)
      const width = match.background.width
      const bounds = match.background.zboundary
      const depth = (bounds[0] + bounds[1]) / 2
      chars.forEach((ch, i) => {
        if (ch.hold.obj) ch.drop_weapon(0, 0)
        ch.set_pos(width * 0.4 + [0, 200, 340][i], 0, depth + [0, 25, -25][i])
        ch.ps.vx = ch.ps.vy = ch.ps.vz = 0
        ch.health.fall = ch.health.bdefend = 0
        ch.health.hp = ch.health.hp_bound = 500
        ch.dead = false
        Object.assign(ch.effect, { num: -99, stuck: false, timeout: 0, timein: 0, super: false, blink: false })
        ch.trans.reset_lock(100); ch.trans.frame(999, 100); ch.trans.trans()
        ch.ps.dir = 'right'
        ch.con.flush?.(); ch.con.clear_states?.(); ch.combodec?.clear_seq()
        // The AI controller only initializes keys it has used. Make both sides
        // of direction comparisons neutral (undefined !== 0 would keep walking).
        for (const key of ['up', 'down', 'left', 'right', 'def', 'jump', 'att']) ch.con.state[key] = 0
        ch.combo_buffer.combo = null; ch.combo_buffer.timeout = 0
        if (ch.con.type === 'AIcontroller') ch.con.fetch = function () { this.clear_states?.() }
      })
      const first = match.character[match.panel[0].uid]
      if (zeroMP) {
        first.health.mp = 0
        // Woody's uppercut stays grounded; its hitbox lifts the target.
        chars[2].set_pos(first.ps.x + 35, 0, first.ps.z)
      }
      const trace = window.__expansionTrace = {
        frames: [], objects: [], projectiles: {}, positions: [], start: { x: first.ps.x, z: first.ps.z, mp: first.health.mp },
        startUsage: first.health.mp_usage,
        minEnemyHP: chars[2].health.hp, minEnemyY: chars[2].ps.y,
        ally: { x: chars[1].ps.x, z: chars[1].ps.z }, enemy: { x: chars[2].ps.x, z: chars[2].ps.z }
      }
      const original = match.frame
      match.frame = function () {
        const result = original.apply(this, arguments)
        trace.frames.push(first.frame.N)
        trace.positions.push({ x: first.ps.x, y: first.ps.y, z: first.ps.z })
        trace.minEnemyHP = Math.min(trace.minEnemyHP, chars[2].health.hp)
        trace.minEnemyY = Math.min(trace.minEnemyY, chars[2].ps.y)
        for (const [uid, object] of Object.entries(match.scene.live)) {
          if (!trace.objects.includes(object.id)) trace.objects.push(object.id)
          if (object.type === 'specialattack') trace.projectiles[uid] = object.id
        }
        return result
      }
      window.__expansionRestore = () => { match.frame = original }
    }, zeroMP)
    await page.waitForFunction(() => Object.values(window.realityGame.manager.activeMatch.character).every(ch => ch.frame.N < 4))
  }
  async function collect() {
    return page.evaluate(() => {
      window.__expansionRestore?.()
      const match = window.realityGame.manager.activeMatch
      const first = match.character[match.panel[0].uid]
      const trace = window.__expansionTrace
      return { ...trace, frames: [...new Set(trace.frames)],
        mpUsed: first.health.mp_usage - trace.startUsage, mp: first.health.mp,
        end: { x: first.ps.x, y: first.ps.y, z: first.ps.z, frame: first.frame.N } }
    })
  }
  async function nativeCombo(sequence) {
    const keys = sequence.map(action => ({ def: 'h', forward: 'd', left: 'a', right: 'd', up: 'w', down: 's', att: 'f', jump: 'g' })[action])
    assert(keys.every(Boolean), 'every skill action must map to a physical key')
    for (const key of keys) { await page.keyboard.press(key); await page.waitForTimeout(70) }
    return keys
  }
  try {
    await page.goto(url)
    await ready()
    const metadata = await page.evaluate(() => ({
      heroes: window.realityGame.heroes.map(hero => ({ id: hero.id, name: hero.name, index: hero.index, file: hero.file, skills: window.realityGame.skills.getSkills(hero.id) })),
      stages: window.realityGame.stages, monsters: window.realityGame.monsters
    }))
    assert.deepEqual(metadata.heroes.map(h => h.id), [11, 2, 8, 4, 9, 10])
    assert.equal(metadata.stages.length, 5)
    assert.deepEqual(metadata.monsters.map(m => m.id), [30, 31, 32])
    assert.equal(metadata.heroes.reduce((sum, h) => sum + h.skills.length, 0), 27)
    assert.match(metadata.stages[3].preview, /stage-classroom\.png$/)
    assert.match(metadata.stages[4].preview, /stage-exam\.png$/)
    assert.equal(metadata.monsters.find(m => m.id === 31).name, '訂正獵手')
    assert.equal(metadata.monsters.find(m => m.id === 32).name, '催促鐘怪')
    assert.equal(await page.locator('.urban-crew-member').count(), 6)
    await shot('home-six-heroes')
    check('six heroes, five stages, three monsters and 27 native skills registered', metadata)

    await page.locator('.reality-skills-home-entry').click()
    assert.equal(await page.locator('.reality-skills-hero').count(), 6)
    const counts = []
    for (let index = 0; index < metadata.heroes.length; index++) {
      await page.locator('.reality-skills-hero').nth(index).click()
      counts.push(await page.locator('.reality-skill-card').count())
      assert.doesNotMatch(await page.locator('.reality-skills-notes').innerText(), /\{(?:att|jump|def|up|down|left|right)\}/)
    }
    assert.deepEqual(counts, [4, 5, 4, 4, 4, 6])
    assert.equal(await page.locator('.reality-skill-shortcut').count(), 0)
    await shot('shenzhou-six-skills-guide')
    await page.keyboard.press('Escape')
    await lobby()
    assert.equal(await page.locator('.urban-fighter').count(), 6)
    assert.equal(await page.locator('.urban-stage option').count(), 5)
    assert.equal(await page.locator('.urban-monsters option').count(), 4)
    for (const hero of metadata.heroes) {
      await selectHero(0, hero.name)
      assert.equal((await state()).selected[0].id, hero.id)
      assert.equal(await page.locator('.urban-agent-meta h3').innerText(), hero.name)
    }
    await selectHero(0, '唐梨')
    await selectHero(1, '沈舟')
    await page.locator('.urban-stage').selectOption('3')
    await shot('expanded-roster')
    await page.setViewportSize({ width: 700, height: 600 })
    await page.waitForTimeout(150)
    const smallLobby = await page.locator('.urban-frame').boundingBox()
    assert(smallLobby.x >= 0 && smallLobby.y >= 0 && smallLobby.x + smallLobby.width <= 700 && smallLobby.y + smallLobby.height <= 600)
    await shot('small-roster')
    await page.locator('.reality-skills-lobby-entry').click()
    await page.locator('.reality-skills-hero').last().click()
    const smallGuide = await page.locator('.reality-skills-dialog').boundingBox()
    assert(smallGuide.x >= 0 && smallGuide.y >= 0 && smallGuide.x + smallGuide.width <= 700 && smallGuide.y + smallGuide.height <= 600)
    assert.equal(await page.locator('.reality-skill-card').count(), 6)
    await shot('small-six-skills-guide')
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1280, height: 920 })
    check('all six selections, guide tabs and 700×600 roster/guide fit', { counts, smallLobby, smallGuide })

    for (const stage of [3, 4]) {
      const opening = await begin(metadata.heroes[stage === 3 ? 4 : 5], stage, 3)
      assert.equal(opening.stage, stage)
      assert.deepEqual(opening.rules, {})
      assert.deepEqual(opening.players.filter(p => p.team === 2).map(p => p.id), [30, 31, 32])
      assert(opening.initial.filter(p => p.team === 1).every(p => p.mp === 200 && p.spent === 0), 'native 200 MP opening retained')
      await page.evaluate(() => {
        const match = window.realityGame.manager.activeMatch
        const depth = (match.background.zboundary[0] + match.background.zboundary[1]) / 2
        // Wide LF2 arenas spawn characters far apart. Bring them into one view
        // for the art screenshot; the real AI and all combat remain active.
        Object.values(match.character).forEach((ch, i) => ch.set_pos(match.background.width / 2 - 180 + i * 85, 0, depth + [-20, 20, 0, -20, 20][i]))
      })
      await page.waitForTimeout(650)
      await shot(stage === 3 ? 'classroom-mixed-battle' : 'exam-mixed-battle')
      check('new background ' + stage + ' loads with all three real monster types', opening)
    }

    for (const hero of metadata.heroes.filter(h => [9, 10].includes(h.id))) {
      for (const skill of hero.skills) {
        const opening = await begin(hero)
        assert.equal(opening.initial[0].mp, 200)
        assert.equal(opening.initial[0].spent, 0)
        await isolateCombat(skill.mp === 0)
        const keys = await nativeCombo(skill.sequence)
        await page.waitForFunction(frame => window.__expansionTrace.frames.includes(frame), skill.entryFrame, { timeout: 5000 })
        if (skill.id === 'tangli-whirl') {
          await page.waitForFunction(() => [284, 285, 286, 287].includes(window.realityGame.manager.activeMatch.character[window.realityGame.manager.activeMatch.panel[0].uid].frame.N), null, { timeout: 5000 })
          await page.keyboard.press('h')
          await page.waitForFunction(() => window.__expansionTrace.frames.some(frame => frame >= 288 && frame <= 290), null, { timeout: 3000 })
          await page.waitForFunction(() => window.realityGame.manager.activeMatch.character[window.realityGame.manager.activeMatch.panel[0].uid].frame.N < 4)
          await shot(skill.id)
        } else {
          await page.waitForTimeout(650)
          await shot(skill.id)
          await page.waitForTimeout(1300)
        }
        const result = await collect()
        assert(result.frames.includes(skill.entryFrame), skill.id + ' must enter its original frame')
        if (skill.id === 'tangli-whirl') {
          assert(result.mpUsed >= 75, 'native spinning consumes at least the startup MP')
          assert(result.frames.some(frame => frame >= 288 && frame <= 290), 'defence reaches native spin ending')
          assert(result.end.frame < 4, 'defence stops the spin and returns to standing')
          assert(result.mp > 0, 'spin was stopped by defence before MP ran out')
        } else assert.equal(result.mpUsed, skill.mp, skill.id + ' native MP cost')
        const expected = { 'tangli-chalk': 205, 'tangli-question': 215, 'shenzhou-pages': 206, 'shenzhou-leap': 204 }[skill.id]
        if (expected) assert(result.objects.includes(expected), skill.id + ' must create native object ' + expected)
        if (skill.id === 'shenzhou-pages') assert(Object.values(result.projectiles).filter(id => id === 206).length >= 2, 'both native projectiles appear')
        if (skill.id === 'shenzhou-rise') {
          assert.equal(result.start.mp, 0); assert.equal(result.mpUsed, 0)
          assert(result.minEnemyHP < 500, 'zero-MP uppercut damages its target')
          assert(result.minEnemyY < -3, 'zero-MP uppercut lifts its target')
        }
        if (skill.id === 'shenzhou-face' || skill.id === 'shenzhou-return') {
          const target = skill.id === 'shenzhou-face' ? result.enemy : result.ally
          const distance = skill.id === 'shenzhou-face' ? 120 : 60
          assert(Math.abs(result.end.x - result.start.x) > 150, 'teleport changes caster position')
          assert(Math.abs(result.end.z - target.z) < 2, 'teleport enters target depth')
          assert(Math.abs(Math.abs(result.end.x - target.x) - distance) < 5, 'teleport keeps native target offset')
        }
        // Keep report readable; positions only need extrema and final target values.
        const positions = result.positions
        result.positionRange = { minX: Math.min(...positions.map(p => p.x)), maxX: Math.max(...positions.map(p => p.x)), minY: Math.min(...positions.map(p => p.y)) }
        delete result.positions
        report.skills.push({ hero: hero.name, id: skill.id, name: skill.name, combo: keys.join(' › '), ...result })
        console.log('PASS', hero.name, skill.name, 'MP', result.mpUsed)
      }
    }
    assert.equal(report.skills.length, 10)
    await lobby()
    await page.evaluate(() => localStorage.setItem('reality/chapter-01/v1', JSON.stringify({ version: 1, chapter: 'chapter-01', checkpoint: 1, completed: false, mementos: [], updatedAt: new Date().toISOString() })))
    await page.reload()
    await ready()
    await page.locator('.urban-start').click()
    await selectHero(0, '唐梨')
    await selectHero(1, '沈舟')
    await page.getByRole('button', { name: '01 故事 · 不要掉队', exact: true }).click()
    await page.locator('.urban-launch').click()
    await page.waitForSelector('.chapter-overlay:not([hidden])')
    assert.match(await page.locator('.chapter-scene > img').getAttribute('src'), /stage-classroom\.png$/)
    await shot('chapter-second-encounter-intro')
    await page.locator('.chapter-confirm').click()
    await page.waitForFunction(() => window.realityGame.chapter.getState().phase === 'battle')
    const chapter = await state()
    assert.equal(chapter.chapter.checkpoint, 1)
    assert.equal(chapter.chapter.background, 3)
    assert.deepEqual(chapter.chapter.monsterIds, [30, 31, 32])
    assert.deepEqual(chapter.players.filter(p => p.team === 2).map(p => p.id), [30, 31, 32])
    assert.deepEqual(chapter.players.filter(p => p.team === 1).map(p => p.id), [9, 10])
    await page.waitForTimeout(600)
    await shot('chapter-second-encounter-battle')
    check('checkpoint resumes into classroom with new heroes and mixed monsters', chapter)
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.failedResources, [])
    await fs.rm(path.join(output, 'failure.png'), { force: true })
    report.passed = true
  } catch (error) {
    report.failure = error.stack || String(error)
    report.lastState = await state().catch(() => null)
    await shot('failure').catch(() => {})
    console.error(error)
    process.exitCode = 1
  } finally {
    report.completedAt = new Date().toISOString()
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
