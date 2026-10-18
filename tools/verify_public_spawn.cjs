/* Observe unmodified live combat after its initial render: no AI, position,
 * timing, hitbox, health or sprite state is replaced by a fixture. */
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
const output = path.resolve(process.env.GAME_VERIFY_OUTPUT || path.join(__dirname, '../docs/verification/public-live'))
const url = process.env.GAME_TEST_URL || process.env.LF2_TEST_URL || 'https://kingkazmax.github.io/those-who-fight-reality/'
const report = { passed: false, url, startedAt: new Date().toISOString(), pageErrors: [], failedResources: [], samples: [] }
;(async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 } })
  page.on('pageerror', error => report.pageErrors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ status: response.status(), url: response.url() }) })
  async function sample(label) {
    const data = await page.evaluate(() => {
      const match = window.realityGame.manager.activeMatch
      return {
        state: JSON.parse(window.render_game_to_text()), tick: match.time.t,
        fps: document.querySelector('.urban-hud-fps')?.innerText,
        rawFPS: document.querySelector('.fps')?.value,
        characters: Object.values(match.character).map(character => {
          const sprite = character.sp.sp
          return {
            id: character.id, frame: character.frame.N, picture: character.frame.D.pic,
            state: character.frame.D.state, hp: character.health.hp,
            blink: character.effect.blink, blinkIndex: character.effect.bi,
            timein: character.effect.timein, timeout: character.effect.timeout,
            hidden: Boolean(sprite.hidden), currentImage: sprite.cur_img,
            rect: { x: sprite.x, y: sprite.y, w: sprite.w, h: sprite.h, imageX: sprite.img_x, imageY: sprite.img_y },
            images: Object.entries(sprite.img).map(([key, image]) => ({ key, complete: image.complete, w: image.naturalWidth, h: image.naturalHeight }))
          }
        })
      }
    })
    report.samples.push({ label, at: new Date().toISOString(), ...data })
    console.log(label, JSON.stringify({ tick: data.tick, fps: data.fps, characters: data.characters.map(c => ({ id: c.id, frame: c.frame, blink: c.blink, hidden: c.hidden, loadedImages: c.images.filter(i => i.complete && i.w > 0).length, totalImages: c.images.length, w: c.rect.w, h: c.rect.h })) }))
    return data
  }
  const shot = name => page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' })
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForFunction(() => window.realityGame?.skillsUI && !document.querySelector('#reality-loading'), null, { timeout: 180000 })
    report.loader = await page.evaluate(() => ({ waitSeconds: requirejs.s.contexts._.config.waitSeconds, mainScript: document.querySelector('script[data-main]')?.getAttribute('data-main') }))
    await page.locator('.urban-start').click()
    await page.locator('.urban-humans').selectOption('2')
    await page.locator('.urban-slot').nth(0).click()
    await page.locator('.urban-fighter').nth(4).click()
    await page.locator('.urban-slot').nth(1).click()
    await page.locator('.urban-fighter').nth(5).click()
    await page.locator('.urban-stage').selectOption('3')
    await page.locator('.urban-bots').selectOption('3')
    await page.locator('.urban-monsters').selectOption('mixed')
    await page.locator('.urban-launch').click()
    await page.waitForFunction(() => window.realityGame.manager.activeMatch?.time?.t > 4)
    const opening = await sample('spawn')
    assert.deepEqual(opening.characters.map(c => c.id), [9, 10, 30, 31, 32])
    await page.waitForTimeout(6500)
    const later = await sample('after-6.5-seconds')
    await shot('battle-after-spawn')
    assert(later.tick > opening.tick + 120, 'unmodified game clock must keep advancing during observation')
    assert(parseInt(later.fps, 10) > 0, 'FPS must update after startup')
    for (const character of later.characters) {
      assert(character.images.every(i => i.complete && i.w > 0 && i.h > 0), 'every image must be decoded for character ' + character.id)
      assert(character.rect.w > 0 && character.rect.h > 0, 'sprite bounds must be nonzero for character ' + character.id)
    }
    await page.waitForTimeout(3500)
    await sample('after-10-seconds')
    await shot('battle-after-ten-seconds')
    // Naturally wait for a visible phase of any recovery blink, then use the
    // actual pause key. No sprite visibility or effect flags are changed.
    await page.waitForFunction(() => Object.values(window.realityGame.manager.activeMatch.character).every(c => !c.sp.sp.hidden && c.sp.sp.img[c.sp.sp.cur_img]?.complete), null, { timeout: 5000 })
    await page.keyboard.press('p')
    await page.waitForFunction(() => window.realityGame.manager.activeMatch.time.paused)
    await sample('paused-after-10-seconds')
    await shot('battle-after-spawn-paused')
    assert.deepEqual(report.pageErrors, [])
    assert.deepEqual(report.failedResources, [])
    report.passed = true
  } catch (error) {
    report.failure = error.stack || error.message
    try { await shot('spawn-failure') } catch (_) {}
    console.error(report.failure)
    process.exitCode = 1
  } finally {
    report.finishedAt = new Date().toISOString()
    await fs.writeFile(path.join(output, 'spawn-observation.json'), JSON.stringify(report, null, 2))
    await browser.close()
    console.log(JSON.stringify({ passed: report.passed, samples: report.samples.length, output }))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
