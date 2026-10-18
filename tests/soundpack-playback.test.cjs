const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

function setup(play) {
  let Soundmanager
  let sprite
  let releases = 0
  class Pool {
    constructor(config) { this.config = config }
    create(id) {
      if (!sprite) { sprite = this.config.construct(); sprite.parent = this }
      sprite.born(id)
    }
    die(value) { releases++; value.die() }
  }
  const document = { createElement(tag) { return tag === 'audio' ? { canPlayType() { return true }, readyState: 4, currentTime: 0, appendChild() {}, addEventListener() {}, play, pause() {} } : {} } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../vendor/F.LF/LF/soundpack.js'), 'utf8'), { document, define(deps, factory) { Soundmanager = factory(Pool) } })
  const manager = new Soundmanager({ packs: [{ id: '1', data: { file: 'demo', ext: ['mp3'], sound: { beep: { start: 0, end: 1 } } } }] })
  return { manager, sprite: () => sprite, releases: () => releases }
}

test('blocked autoplay releases its sprite without an unhandled rejection', async () => {
  const env = setup(() => Promise.reject(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' })))
  env.manager.play('1/beep')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(env.releases(), 1)
  assert.equal(env.sprite().dead, true)
})

test('successful or legacy playback stays active until the sound ends', async () => {
  for (const playback of [undefined, Promise.resolve()]) {
    const env = setup(() => playback)
    env.manager.play('1/beep')
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(env.releases(), 0)
    assert.equal(env.sprite().dead, false)
  }
})

test('a late rejected attempt cannot release a subsequently reused sound sprite', async () => {
  let reject
  let count = 0
  const env = setup(() => ++count === 1 ? new Promise((resolve, fail) => { reject = fail }) : Promise.resolve())
  env.manager.play('1/beep')
  env.sprite().parent.die(env.sprite())
  env.sprite().born('beep')
  reject(new Error('old attempt'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(env.releases(), 1)
  assert.equal(env.sprite().dead, false)
})
