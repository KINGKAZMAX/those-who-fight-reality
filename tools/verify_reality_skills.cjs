/* Real keyboard skill acceptance in an isolated local browser. */
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(require('node:os').homedir(), '.codex/skills/develop-web-game/node_modules/playwright'))
const output = path.resolve(__dirname, '../docs/verification/native-combos')
;(async function () {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 } })
  const report = { errors: [], resources: [], canceledMedia: [], skills: [], extra: [] }
  page.on('pageerror', error => {
    if (!report.errors.includes(error.stack)) { report.errors.push(error.stack); console.error(error.stack) }
  })
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) report.resources.push([response.status(), response.url()]) })
  page.on('requestfailed', request => {
    const failure = [request.failure()?.errorText, request.url()]
    // Audio source selection/seek cancels speculative media requests normally.
    if (failure[0] === 'net::ERR_ABORTED' && request.resourceType() === 'media') report.canceledMedia.push(failure)
    else report.resources.push(failure)
  })
  async function snapshot() { return page.evaluate(() => JSON.parse(window.render_game_to_text())) }
  async function begin(hero) {
    const screen = (await snapshot()).screen
    if (screen === 'gameplay') { await page.keyboard.press('Escape'); await page.waitForTimeout(100) }
    // A sustained native attack can finish the match before the next case.
    // Reset that result screen before selecting the next isolated skill.
    if (!['frontpage', 'selection'].includes((await snapshot()).screen) && !(await page.locator('.urban-slot').first().isVisible())) {
      await page.reload()
      await page.waitForFunction(() => window.realityGame?.skills && !document.querySelector('#reality-loading'), null, { timeout: 60000 })
    }
    if ((await snapshot()).screen === 'frontpage') await page.locator('.urban-start').click()
    const free = page.getByRole('button', { name: '自由对战', exact: true })
    if (await free.count()) await free.click()
    await page.locator('.urban-slot').nth(0).click()
    await page.getByRole('button', { name: '选择 ' + hero.name, exact: true }).click()
    await page.locator('.urban-slot').nth(1).click()
    await page.getByRole('button', { name: '选择 小一', exact: true }).click()
    await page.locator('.urban-bots').selectOption('1')
    await page.locator('.urban-launch').click()
    await page.waitForFunction(() => window.realityGame.manager.activeMatch?.time?.t > 6)
    await page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      match.AIscript = []
      // Random falling weapons are unrelated to the skill under test.
      for (const obj of Object.values(match.scene.live)) {
        if (obj.type === 'lightweapon' || obj.type === 'heavyweapon') match.destroy_object(obj)
      }
      const heroes = Object.values(match.character)
      heroes.forEach((char, i) => {
        if (char.hold.obj) char.drop_weapon(0, 0)
        char.set_pos([350, 388, 395][i], 0, [430, 430, 430][i])
        char.ps.vx = char.ps.vy = char.ps.vz = 0
        char.health.fall = char.health.bdefend = 0
        Object.assign(char.effect, { stuck: false, timeout: 0, timein: 0, super: false, blink: false })
        // Native next=0 means "stay here"; 999 is the engine's standing frame.
        char.trans.reset_lock(100); char.trans.frame(999, 100); char.trans.trans()
        char.ps.dir = 'right'
        char.con.flush?.(); char.con.clear_states?.()
        char.combo_buffer.combo = null; char.combo_buffer.timeout = 0
        char.combodec?.clear_seq()
        char.health.hp = char.health.hp_bound = 500
        if (char.con.type === 'AIcontroller') char.con.fetch = function () { this.clear_states?.() }
      })
      const first = heroes[0]
      first.health.mp = 500
      first.health.mp_usage = 0
      window.__skillTrace = { frames: [], objects: [], minEnemyHP: 500, allyY: 0, minAllyHP: 500, initialHP: 500 }
      window.__skillTimer = setInterval(() => {
        const trace = window.__skillTrace
        trace.frames.push(first.frame.N)
        for (const object of Object.values(match.scene.live)) if (!trace.objects.includes(object.id)) trace.objects.push(object.id)
        trace.minEnemyHP = Math.min(trace.minEnemyHP, heroes[2].health.hp)
        trace.minAllyHP = Math.min(trace.minAllyHP, heroes[1].health.hp)
        trace.allyY = Math.min(trace.allyY, heroes[1].ps.y)
      }, 12)
    })
    await page.waitForFunction(() => Object.values(window.realityGame.manager.activeMatch.character).every(ch => ch.frame.N < 4))
    await page.waitForTimeout(80)
  }
  async function collect() {
    return page.evaluate(() => {
      clearInterval(window.__skillTimer)
      const match = window.realityGame.manager.activeMatch
      const chars = Object.values(match.character)
      return { ...window.__skillTrace, frames: [...new Set(window.__skillTrace.frames)], mpUsed: chars[0].health.mp_usage,
        hp: chars.map(ch => ch.health.hp), healing: chars.map(ch => ch.effect.heal || 0), hold: chars[0].hold.obj?.id || null,
        direction: chars[0].ps.dir }
    })
  }
  try {
    await page.goto('http://127.0.0.1:18765/F.LF/game/game.html')
    await page.waitForFunction(() => window.realityGame?.skills && !document.querySelector('#reality-loading'), null, { timeout: 60000 })
    const heroes = await page.evaluate(() => window.realityGame.heroes.map(hero => ({ id: hero.id, name: hero.name, skills: window.realityGame.skills.getSkills(hero.id) })))
    for (const hero of heroes) {
      for (let index = 0; index < hero.skills.length; index++) {
        const skill = hero.skills[index]
        await begin(hero)
        if (skill.id === 'linxia-breathe' || skill.id === 'linxia-friend') {
          await page.evaluate(id => {
            const chars = Object.values(window.realityGame.manager.activeMatch.character)
            const target = id === 'linxia-breathe' ? chars[0] : chars[1]
            target.health.hp = 250; target.health.hp_bound = 500
            // Distinguish enemy healing from native slow recovery.
            chars[2].health.hp = chars[2].health.hp_bound = 250
          }, skill.id)
        }
        if (skill.id === 'chenye-flute') {
          // Keep the ally inside the flute radius but behind its caster, clear
          // of the enemy's native falling-body collision on the other side.
          await page.evaluate(() => Object.values(window.realityGame.manager.activeMatch.character)[1].set_pos(260, 0, 430))
        }
        const keys = skill.sequence.map(action => ({def:'h',forward:'d',up:'w',down:'s',att:'f',jump:'g'})[action])
        for (const key of keys) { await page.keyboard.press(key); await page.waitForTimeout(70) }
        await page.waitForTimeout(700)
        await page.screenshot({ path: path.join(output, skill.id + '.png') })
        await page.waitForTimeout(skill.id.startsWith('linxia-') && /breathe|friend/.test(skill.id) ? 3500 : 1800)
        const result = await collect()
        assert(result.frames.includes(skill.entryFrame), skill.id + ' did not enter its native frame: ' + result.frames.join(','))
        if (skill.id === 'tangli-whirl') {
          assert(result.mpUsed >= skill.mp && (result.mpUsed - skill.mp) % 34 === 0, 'native spin cycles cost34 MP')
          await page.keyboard.press('g')
        } else assert.equal(result.mpUsed, skill.mp, skill.id + ' mana cost')
        const expectedObject = { 'xiaoyi-draft': 207, 'linxia-plane': 200, 'linxia-notes': 214, 'linxia-desk': 200,
          'linxia-friend': 200, 'linxia-breathe': 200, 'zhouqi-calm': 209, 'zhouqi-boundary': 212, 'zhouqi-formula': 212,
          'zhouqi-ruler': 213, 'chenye-bell': 204, 'chenye-arrow': 208, 'chenye-kites': 201, 'tangli-chalk': 205, 'tangli-question': 215, 'shenzhou-pages': 206 }[skill.id]
        if (expectedObject) assert(result.objects.includes(expectedObject), skill.id + ' missing native spawned object ' + expectedObject)
        if (skill.id === 'linxia-breathe') assert(result.hp[0] > 300, 'self heal should restore actual HP')
        if (skill.id === 'linxia-friend') { assert(result.hp[1] > 300, 'ally heal should restore actual HP'); assert.equal(result.hp[2], 250, 'full-health-bound enemy remains at its recovery cap') }
        if (skill.id === 'chenye-flute') { assert(result.minEnemyHP < 500); assert(result.minAllyHP < 500, 'native flute affects allies'); assert(result.allyY < 0, 'native flute lifts allies') }
        if (skill.id === 'zhouqi-ruler') assert.equal(result.hold, 213)
        report.skills.push({ hero: hero.name, skill: skill.name, id: skill.id, combo: keys.join(' › '), ...result })
        console.log('PASS', hero.name, skill.name, 'MP', result.mpUsed, 'objects', result.objects.join(','))
      }
    }
    await begin(heroes[0])
    for (const pair of [['h','l'], ['d','ArrowRight'], ['f','j']]) {
      for (const key of pair) await page.keyboard.press(key)
      await page.waitForTimeout(70)
    }
    await page.waitForTimeout(700)
    const duo = await page.evaluate(() => Object.values(window.realityGame.manager.activeMatch.character).slice(0, 2).map(ch => ch.health.mp_usage))
    assert.deepEqual(duo, [40, 40])
    report.extra.push({ name: 'two players enter native combos together', mpUsed: duo })
    await collect()
    await begin(heroes[0])
    // Keep targets out of the continuation test: native falling bodies can
    // interrupt the caster after the first projectile lands at point-blank range.
    await page.evaluate(() => {
      const chars = Object.values(window.realityGame.manager.activeMatch.character)
      chars[1].set_pos(70, 0, 330)
      chars[2].set_pos(710, 0, 330)
    })
    // Native follow-up projectile still works after sequential input.
    for (const key of ['h', 'd', 'f']) { await page.keyboard.press(key); await page.waitForTimeout(70) }
    await page.waitForFunction(() => Object.values(window.realityGame.manager.activeMatch.character)[0].frame.N === 246, null, { polling: 'raf', timeout: 4000 })
    await page.keyboard.press('f'); await page.waitForTimeout(500)
    const repeated = await collect()
    assert(repeated.mpUsed >= 80)
    report.extra.push({ name: 'native combo and follow-up projectile', mpUsed: repeated.mpUsed })
    await begin(heroes[0])
    for (const key of ['q','e','r','t','y','u','i','o','[',']']) await page.keyboard.press(key)
    await page.waitForTimeout(300)
    const noShortcuts = await collect()
    assert.equal(noShortcuts.mpUsed, 0)
    assert.equal(await page.evaluate(() => typeof window.realityGame.skills.cast), 'undefined')
    report.extra.push({ name: 'former shortcut keys no longer cast', mpUsed: noShortcuts.mpUsed })
    await begin(heroes[0])
    for (const key of ['h','a','f']) { await page.keyboard.press(key); await page.waitForTimeout(70) }
    await page.waitForTimeout(300)
    const left = await collect()
    assert(left.frames.includes(240))
    assert.equal(left.direction, 'left')
    assert.equal(left.mpUsed, 40)
    report.extra.push({ name: 'left-direction combo turns and casts from right-facing stance', mpUsed: left.mpUsed })
    assert.equal(report.skills.length, heroes.reduce((sum, hero) => sum + hero.skills.length, 0))
    assert.equal(report.errors.length, 0)
    assert.equal(report.resources.length, 0)
    report.passed = true
  } catch (error) {
    report.passed = false; report.failure = error.stack
    report.lastState = await snapshot().catch(() => null)
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {})
    console.error(error)
    process.exitCode = 1
  } finally {
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    await browser.close()
  }
})()
