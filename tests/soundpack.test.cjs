const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const root = path.join(__dirname, '..')
function setup() {
  const created = []
  function EffectsPool() { this.create = id => created.push(id) }
  const context = vm.createContext({ document: { createElement() { return { canPlayType() { return true } } } } })
  function load(relative, dependencies = []) {
    let result
    context.define = (deps, factory) => { result = factory ? factory(...dependencies) : deps }
    vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative })
    return result
  }
  const SoundManager = load('vendor/F.LF/LF/soundpack.js', [EffectsPool])
  const sound = new SoundManager({ packs: [{ id: '1' }, { id: '12' }] })
  return { sound, created, load }
}

test('missing and empty optional sounds do not throw, create audio or dirty the deduplication buffer', () => {
  const { sound, created } = setup()
  for (const optional of [undefined, null, '', '   ', '\n\t', false, 0, {}, []]) {
    assert.doesNotThrow(() => sound.play(optional))
  }
  assert.deepEqual(created, [])
  assert.deepEqual(Object.keys(sound.buffer), [])
})

test('valid sounds still play once in the existing five-tick deduplication window', () => {
  const { sound, created } = setup()
  sound.play('1/025')
  sound.play('1/025')
  sound.play('12/020')
  assert.deepEqual(created, ['025', '020'])
  for (let i = 0; i < 4; i++) sound.TU()
  sound.play('1/025')
  assert.equal(created.length, 2)
  sound.TU()
  sound.play('1/025')
  assert.deepEqual(created, ['025', '020', '025'])
})

test('native Henry arrow hits safely omit the undefined broken sound', () => {
  const { sound, created, load } = setup()
  const arrow = load('vendor/LF2_19/data/henry_arrow1.js')
  assert.equal(arrow.bmp.weapon_broken_sound, undefined)
  const SpecialAttack = load('vendor/F.LF/LF/specialattack.js', [function LivingObject() {}, { gameplay: {} }, {}])
  const projectile = { data: arrow, match: { sound }, states: SpecialAttack.prototype.states }
  for (const event of ['hit', 'hit_others']) {
    assert.doesNotThrow(() => SpecialAttack.prototype.states.generic.call(projectile, event))
  }
  assert.deepEqual(created, [])
  assert.deepEqual(Object.keys(sound.buffer), [])
  sound.play(arrow.bmp.weapon_hit_sound)
  assert.deepEqual(created, ['025'])
})
