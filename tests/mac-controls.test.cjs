const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

const root = path.join(__dirname, '../vendor/F.LF')
function loadModules() {
  const handlers = {}
  const context = vm.createContext({
    window: { addEventListener(name, fn) { handlers[name] = fn } },
    document: { addEventListener(name, fn) { handlers[name] = fn } }
  })
  let Controller
  context.define = factory => { Controller = factory() }
  vm.runInContext(fs.readFileSync(path.join(root, 'core/controller.js'), 'utf8'), context)
  let controls
  context.define = (deps, factory) => { controls = factory(Controller) }
  vm.runInContext(fs.readFileSync(path.join(root, 'game/mac-controls.js'), 'utf8'), context)
  return { Controller, controls, handlers }
}
const legacy = [
  { type: 'keyboard', config: { up: 'w', down: 'x', left: 'a', right: 'd', def: 'z', jump: 'q', att: 's' } },
  { type: 'keyboard', config: { up: 'u', down: 'm', left: 'h', right: 'k', def: ',', jump: 'i', att: 'j' } }
]
function settings(control = legacy) {
  return { version: 1.00002, control: JSON.parse(JSON.stringify(control)), player: [{ name: '小一' }, { name: '林夏' }], server: {}, support_sound: true }
}

test('fresh and original-default installs receive two independent Mac layouts', () => {
  const { controls } = loadModules()
  const defaults = settings(controls.recommended())
  for (const stored of [null, settings()]) {
    const result = controls.loadSettings(stored, defaults)
    assert.equal(result.control[0].config.down, 's')
    assert.equal(result.control[0].config.att, 'f')
    assert.equal(result.control[1].config.up, 'up')
    assert.equal(result.control[1].config.att, 'j')
    assert.equal(new Set(result.control.flatMap(item => Object.values(item.config))).size, 14)
    assert.equal(result.player[0].name, '小一')
  }
})

test('legacy custom bindings and player preferences survive migration and reload', () => {
  const { controls } = loadModules()
  const custom = settings()
  custom.control[0].config.att = 'e'
  custom.player[0].name = '自己的名字'
  custom.support_sound = false
  const loaded = controls.loadSettings(custom, settings(controls.recommended()))
  assert.equal(JSON.stringify(loaded), JSON.stringify(custom))
  const deliberatelyOld = settings()
  deliberatelyOld.controls_profile = 'mac-duo-v1'
  assert.equal(controls.loadSettings(deliberatelyOld, settings()).control[0].config.down, 'x')
})

test('rebind rejects shared-player and reserved shortcuts but allows a free key', () => {
  const { controls } = loadModules()
  const bindings = controls.recommended()
  assert.equal(controls.validateBinding(bindings, 0, 'att', 'j').ok, false)
  assert.equal(controls.validateBinding(bindings, 0, 'att', 'w').ok, false)
  for (const key of ['p', 'esc', 'F1', 'F10', 9, 13, 16, 17, 18, 91]) {
    assert.equal(controls.validateBinding(bindings, 0, 'att', key).ok, false, String(key))
  }
  assert.equal(controls.validateBinding(bindings, 0, 'att', 'f').ok, true)
  assert.equal(controls.validateBinding(bindings, 0, 'att', 'e').ok, true)
})

test('invalid stored data falls back safely and legacy P keeps its existing action', () => {
  const { controls } = loadModules()
  const defaults = settings(controls.recommended())
  for (const value of [{}, { version: 1.00002 }, { ...settings(), control: [{ type: 'keyboard', config: {} }] }]) {
    assert.equal(controls.loadSettings(value, defaults).control[0].config.att, 'f')
  }
  const custom = settings()
  custom.control[0].config.att = 'p'
  assert.equal(controls.loadSettings(custom, defaults).control[0].config.att, 'p')
  assert.equal(controls.pauseKey(custom.control), 'F1')
  assert.equal(controls.pauseKey(defaults.control), 'P')
})

test('both players receive simultaneous held keys without masking each other', () => {
  const { Controller, controls, handlers } = loadModules()
  const pair = controls.recommended().map(item => new Controller(item.config))
  for (const [code, keyCode] of [['KeyD', 68], ['KeyF', 70], ['ArrowLeft', 37], ['KeyJ', 74]]) {
    handlers.keydown({ code, keyCode, preventDefault() {} })
  }
  pair.forEach(con => con.fetch())
  assert.equal(pair[0].state.right, 1)
  assert.equal(pair[0].state.att, 1)
  assert.equal(pair[1].state.left, 1)
  assert.equal(pair[1].state.att, 1)
})

test('legacy modifier binding remains usable and function/punctuation keys round-trip', () => {
  const { Controller, handlers } = loadModules()
  const con = new Controller({ att: 'ctrl' })
  handlers.keydown({ code: 'ControlLeft', keyCode: 17, ctrlKey: true, preventDefault() {} })
  con.fetch()
  assert.equal(con.state.att, 1)
  for (const key of ['F1', 'F10', 'F12', ',', ';', '\\', 'up']) {
    assert.equal(Controller.keycode_to_keyname(Controller.keyname_to_keycode(key)), key)
  }
})

test('physical keyboard code works during Chinese input and held keys do not retrigger', () => {
  const { Controller, handlers } = loadModules()
  const con = new Controller({ att: 'f' })
  let pressed = 0
  con.sync = false
  con.child.push({ key(action, down) { if (down) pressed++ } })
  const event = { code: 'KeyF', keyCode: 229, preventDefault() {} }
  handlers.keydown(event)
  handlers.keydown({ ...event, repeat: true })
  assert.equal(pressed, 1)
  assert.equal(con.state.att, 1)
  handlers.keyup(event)
  assert.equal(con.state.att, 0)
})

test('blur clears held movement so returning to the game cannot leave a player walking', () => {
  const { Controller, handlers } = loadModules()
  const con = new Controller({ right: 'd' })
  handlers.keydown({ code: 'KeyD', keyCode: 68, preventDefault() {} })
  con.fetch()
  assert.equal(con.state.right, 1)
  handlers.blur()
  con.fetch()
  assert.equal(con.state.right, 0)
})
