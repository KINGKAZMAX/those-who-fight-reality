const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

const root = path.join(__dirname, '..')
const nativeNames = { 11: 'davis', 2: 'john', 8: 'freeze', 4: 'henry', 9: 'dennis', 10: 'woody' }
const heroIds = [11, 2, 8, 4, 9, 10]
function eventTarget() {
  const handlers = {}
  return {
    addEventListener(name, fn) { (handlers[name] ||= []).push(fn) },
    removeEventListener(name, fn) { handlers[name] = (handlers[name] || []).filter(item => item !== fn) },
    emit(name, event = {}) { for (const handler of handlers[name] || []) handler(event) }
  }
}
function setup(ids = [11, 2]) {
  const window = eventTarget()
  const document = eventTarget()
  const context = vm.createContext({ window, document, Date, Object, Number, Array })
  function load(relative, dependencies = []) {
    let exported
    context.define = (deps, factory) => {
      exported = typeof deps === 'function' ? deps() : factory ? factory(...dependencies) : deps
    }
    vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context)
    return exported
  }
  const Controller = load('vendor/F.LF/core/controller.js')
  const Combo = load('vendor/F.LF/core/combodec.js')
  const global = load('vendor/F.LF/LF/global.js')
  const skills = load('vendor/F.LF/game/reality-skills.js', [Controller])
  const Character = load('vendor/F.LF/LF/character.js', [function LivingObject() {}, global, Combo, {}, {}])
  const controls = [
    { player: 0, type: 'keyboard', config: { up: 'w', down: 's', left: 'a', right: 'd', att: 'f', jump: 'g', def: 'h' } },
    { player: 1, type: 'keyboard', config: { up: 'up', down: 'down', left: 'left', right: 'right', att: 'j', jump: 'k', def: 'l' } }
  ]
  const heroes = heroIds.map((id, index) => ({ id, index, name: nativeNames[id] }))
  const objects = heroes.map(hero => ({ id: hero.id, type: 'character', data: load('vendor/LF2_19/data/' + nativeNames[hero.id] + '.js') }))
  const chars = ids.map((id, index) => {
    const con = new Controller(controls[index].config)
    const data = objects.find(object => object.id === id).data
    const detected = []
    const decoder = new Combo(con, { callback(combo) { detected.push(combo.name) } }, global.combo_list)
    return { id, uid: index + 1, con, data, frame: { N: 0, D: data.frame[0] }, ps: { dir: 'right' }, health: { hp: 500, mp: 500 }, detected, decoder }
  })
  const match = { character: Object.fromEntries(chars.map(char => [char.uid, char])), panel: chars.map(char => ({ uid: char.uid })), time: { paused: false, t: 5 } }
  const manager = { active_UI: 'gameplay', activeMatch: match, getControlBindings() { return controls }, isRebindingControls() { return false } }
  const api = { manager, heroes, draft: { selected: ids.map(id => heroes.find(hero => hero.id === id).index), humans: 2 } }
  const runtime = skills.attach(api, { data: { object: objects }, reality: { heroes } })
  function key(type, code, extra = {}) {
    const event = { code, preventDefault() {}, stopPropagation() {}, target: { tagName: 'BODY' }, ...extra }
    window.emit(type, event)
    document.emit(type, event)
    return event
  }
  return { skills, runtime, chars, match, manager, api, controls, objects, key, window, document, global, Controller, Character }
}

test('all 27 declared skills match the native entry frame, combo tag and mana cost', () => {
  const env = setup()
  let total = 0
  for (const object of env.objects) {
    const declared = env.skills.getSkills(object.id)
    const tags = Object.keys(object.data.frame[0]).filter(key => /^hit_(Fa|Da|Ua|Fj|Dj|Uj|ja)$/.test(key) && object.data.frame[0][key])
    assert.equal(declared.length, tags.length)
    for (const skill of declared) {
      assert.ok(tags.includes(skill.tag), skill.id)
      assert.equal(object.data.frame[0][skill.tag], skill.entryFrame, skill.id)
      assert.equal((object.data.frame[skill.entryFrame].mp || 0) % 1000, skill.mp, skill.id)
      assert.ok(skill.name && skill.description && Array.isArray(skill.sequence))
      total++
    }
  }
  assert.equal(total, 27)
})

function physicalKey(name) {
  return ({up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight','[':'BracketLeft',']':'BracketRight'})[name] || 'Key' + name.toUpperCase()
}
function press(env, name) {
  env.key('keydown', physicalKey(name)); env.key('keyup', physicalKey(name))
  env.chars.forEach(char => char.con.fetch())
}
function inputCombo(env, player, skill, direction = 'right') {
  for (const action of skill.sequence) press(env, env.controls[player].config[action === 'forward' ? direction : action])
}

test('all 27 native combos work through physical bindings for both players and both directions', () => {
  for (const id of heroIds) {
    const env = setup([id, id])
    for (const player of [0, 1]) for (const direction of ['left', 'right']) {
      const char = env.chars[player]
      for (const skill of env.skills.getSkills(id)) {
        env.chars.forEach(ch => { ch.decoder.clear_seq(); ch.detected.length = 0 })
        inputCombo(env, player, skill, direction)
        assert(char.detected.some(name => env.global.combo_tag[name] === skill.tag), `${id} P${player + 1} ${direction} ${skill.id}`)
        assert.equal(env.chars[1 - player].detected.length, 0, 'another player must not receive this input')
        assert.equal(char.health.mp, 500, 'the engine remains responsible for mana')
      }
    }
  }
})

test('removed single-key shortcuts do not inject any skill or control input', () => {
  const env = setup()
  for (const key of ['q','e','r','t','y','u','i','o','[',']']) press(env, key)
  for (const char of env.chars) { assert.equal(char.detected.length, 0); assert.equal(char.con.buf.length, 0) }
  for (const name of ['cast','bindings','status']) assert.equal(env.runtime[name], undefined)
})

test('rebinding attack to a former shortcut updates the guide and preserves the native combo', () => {
  const env = setup()
  const char = env.chars[0]
  env.controls[0].config.att = 'q'
  char.con.keycode.att = env.Controller.keyname_to_keycode('q')
  const skill = env.skills.getSkills(11)[0]
  assert.deepEqual([...env.runtime.getPlayerSkills(0).skills[0].comboKeys], ['H','A/D','Q'])
  inputCombo(env, 0, skill)
  assert(char.detected.includes('D>A'))
  assert.equal(env.runtime.getPlayerSkills(0).skills[0].shortcut, undefined)
})

test('availability describes pause, defeat, action and MP limits without writing input', () => {
  const env = setup()
  const char = env.chars[0]
  const cases = [
    () => { env.match.time.paused = true },
    () => { char.health.hp = 0 },
    () => { char.health.mp = 39 },
    () => { char.frame = { N: 180, D: char.data.frame[180] } },
    () => { env.api.skillsUI = { isOpen: () => true } }
  ]
  for (const change of cases) {
    env.match.time.paused = false; char.health.hp = char.health.mp = 500
    char.frame = { N: 0, D: char.data.frame[0] }; delete env.api.skillsUI
    change()
    const skill = env.runtime.getPlayerSkills(0).skills[0]
    assert.equal(skill.enabled, false); assert(skill.disabledReason)
    assert.equal(char.con.buf.length, 0)
  }
})

test('two players can enter different combos interleaved on the same keyboard', () => {
  const env = setup()
  for (const key of ['h','l','s','ArrowUp','f','k']) {
    const code = key.startsWith('Arrow') ? key : physicalKey(key)
    env.key('keydown', code); env.key('keyup', code)
    env.chars.forEach(char => char.con.fetch())
  }
  assert(env.chars[0].detected.includes('DvA'))
  assert(env.chars[1].detected.includes('D^J'))
})

test('a missing player stays inactive without inheriting a surviving teammate', () => {
  const env = setup()
  delete env.match.character[env.chars[0].uid]
  assert.equal(env.runtime.getPlayerSkills(0).active, false)
  assert.equal(env.runtime.getPlayerSkills(1).active, true)
  assert.equal(env.runtime.getPlayerSkills(0).hero.id, 11)
})

// Exercise the engine's frame-charge rules, including positive MP on an
// automatic next frame (not charged twice) and negative MP for sustained moves.
function manaProbe(env, heroId) {
  const data = env.objects.find(object => object.id === heroId).data
  const subject = {
    data, frame: { N: 0, PN: 0, D: data.frame[0] }, match: { F6_mode: false },
    health: { mp: 500, mp_usage: 0 }, opoint() {}, injury() {},
    trans: { frame(next) { subject.stoppedAt = next } }
  }
  return {
    subject,
    enter(next) {
      subject.frame.PN = subject.frame.N
      subject.frame.N = next
      subject.frame.D = data.frame[next]
      env.Character.prototype.states.generic.call(subject, 'frame')
    },
    naturalUntil(end) {
      for (let steps = 0; subject.frame.N !== end && steps < 100; steps++) this.enter(subject.frame.D.next)
      assert.equal(subject.frame.N, end)
    }
  }
}

test('Tangli projectile follow-ups use the native 40 / 40 / 70 mana stages and free linked restart', () => {
  const env = setup([9, 10])
  const probe = manaProbe(env, 9)
  probe.enter(235); probe.naturalUntil(241)
  assert.equal(probe.subject.health.mp_usage, 40)
  probe.enter(probe.subject.frame.D.hit_a); probe.naturalUntil(246)
  assert.equal(probe.subject.health.mp_usage, 80)
  probe.enter(probe.subject.frame.D.hit_a); probe.naturalUntil(261)
  assert.equal(probe.subject.health.mp_usage, 150)
  probe.enter(probe.subject.frame.D.hit_a); probe.naturalUntil(241)
  assert.equal(probe.subject.health.mp_usage, 150, '262.next -> 235 does not pay the first projectile twice')
  const projectileFrames = [239, 245, 255, 258].map(frame => probe.subject.data.frame[frame].opoint)
  assert.deepEqual(projectileFrames.map(point => point.oid), [205, 205, 205, 205])
  assert.equal(probe.subject.data.frame[298].opoint.oid, 215)
})

test('Tangli spinning kick charges each sustained cycle and supports both native stop inputs', () => {
  const env = setup([9, 10])
  const probe = manaProbe(env, 9)
  probe.enter(280); probe.naturalUntil(287)
  assert.equal(probe.subject.health.mp_usage, 109, '75 start plus two 17 MP sustain frames')
  probe.enter(284); probe.naturalUntil(287)
  assert.equal(probe.subject.health.mp_usage, 143)
  assert.equal(probe.subject.frame.D.hit_d, 288)
  assert.equal(probe.subject.frame.D.hit_j, 288)
  probe.enter(288); probe.naturalUntil(290)
  assert.equal(probe.subject.health.mp_usage, 143, 'early stop has no extra cost')
})

test('Shenzhou native fly-kick pays 200 once, including its landing and teleport continuations', () => {
  const env = setup([10, 9])
  const full = manaProbe(env, 10)
  full.enter(250); full.naturalUntil(257)
  assert.equal(full.subject.health.mp_usage, 200, 'the automatic move into frame 252 must not charge another 200')
  const data = full.subject.data
  for (const continuation of [215, 219, 271, 286, 287, 288, 301, 302, 303]) {
    const probe = manaProbe(env, 10)
    probe.subject.frame.N = continuation
    assert.equal(data.frame[continuation].hit_Fj, 252)
    probe.enter(data.frame[continuation].hit_Fj); probe.naturalUntil(257)
    assert.equal(probe.subject.health.mp_usage, 200)
  }
  assert.equal(data.frame[70].mp || 0, 0, 'the rising strike is free')
  assert.equal(data.frame[240].opoint.oid, 206)
  assert.equal(data.frame[244].opoint.oid, 206)
})

test('Shenzhou teleports target the nearest enemy and furthest ally without inventing a target', () => {
  const env = setup([10, 9])
  const targets = [
    { type: 'character', team: 1, ps: { x: 250, z: 250 } },
    { type: 'character', team: 2, ps: { x: 350, z: 350 } },
    { type: 'character', team: 2, ps: { x: 550, z: 450 } },
    { type: 'character', team: 1, ps: { x: 750, z: 400 } }
  ]
  for (const direction of [-1, 1]) {
    const subject = {
      ps: { x: 100, y: -20, z: 300 }, team: 1, dirh: () => direction,
      match: { scene: { query(volume, except, filter) {
        return targets.filter(target => filter.team === undefined ? target.team !== filter.not_team : target.team === filter.team)
      } } }
    }
    env.Character.prototype.states[400].call(subject, 'frame')
    assert.equal(subject.ps.x, 350 - 120 * direction)
    assert.equal(subject.ps.z, 350)
    assert.equal(subject.ps.y, 0)
    env.Character.prototype.states[401].call(subject, 'frame')
    assert.equal(subject.ps.x, 750 + 60 * direction)
    assert.equal(subject.ps.z, 400)
    const before = { ...subject.ps }
    subject.match.scene.query = () => []
    env.Character.prototype.states[401].call(subject, 'frame')
    assert.deepEqual(subject.ps, before)
  }
})
