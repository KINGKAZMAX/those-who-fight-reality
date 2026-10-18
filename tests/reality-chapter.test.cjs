const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '../vendor/F.LF/game/reality-chapter.js'), 'utf8')
const saveKey = 'reality/chapter-01/v1'

function harness(options = {}) {
  const memory = new Map(options.saved ? [[saveKey, JSON.stringify(options.saved)]] : [])
  const storage = {
    getItem(key) { if (options.readError) throw new Error('disabled'); return memory.get(key) || null },
    setItem(key, value) { if (options.writeError) throw new Error('full'); memory.set(key, value) }
  }
  const context = vm.createContext({ localStorage: storage, Date, console })
  let attach
  context.define = (dependencies, factory) => { attach = factory({ gameplay: { framerate: 30 } }) }
  vm.runInContext(source, context)
  const changes = []
  const matches = []
  let uiReturns = 0
  const manager = {
    start_match(config) {
      const match = {
        config, character: {}, panel: [], destroyed: false, originalGameoverCalls: 0,
        time: options.loading ? null : { t: 0, paused: false },
        background: Object.assign({ width: 1000, zboundary: [330, 490], destroy() {} }, options.background),
        for_all() {}, create_background() {}, create_effects() {}, create_characters() {}, drop_weapons() {},
        create_timer() { this.time = { t: 0, paused: false }; this.timerCreated = true },
        check_gameover() { this.originalGameoverCalls++ },
        frame() {
          this.control.fetch()
          if (this.destroyed) return
          if (!this.time.paused || this.time.paused === 'F2') {
            this.check_gameover()
            this.time.t++
          }
        },
        destroy() { this.destroyed = true; this.time.paused = true; this.destroyCalls = (this.destroyCalls || 0) + 1 },
        game_state() { return { time: this.time.t } }
      }
      const queued = []
      match.control = {
        child: [{ key(key, down) {
          if (!down) return
          if (key === 'F1') match.time.paused = !match.time.paused
          if (key === 'F2') match.time.paused = 'F2'
          if (key === 'esc' || key === 'F4') { match.destroy(); manager.match_end() }
        } }],
        fetch() { while (queued.length) { const event = queued.shift(); this.child.slice().forEach(item => item.key(...event)) } },
        queue(key) { queued.push([key, true], [key, false]) }
      }
      config.players.forEach((player, index) => {
        const uid = index + 10
        const character = {
          health: { hp: 500, hp_full: 500, hp_bound: 500, mp: 150, fall: 20, bdefend: 2 },
          con: {
            type: player.type === 'human' ? 'keyboard' : 'AIcontroller',
            state: { def: false }, buf: [],
            flush() { this.buf.length = 0 },
            clear_states() { for (const key in this.state) this.state[key] = 0 }
          },
          ps: { x: 200 + index * 50, y: 0, z: 440, vx: 0, vy: 0, vz: 0 },
          set_pos(x, y, z) { Object.assign(this.ps, { x, y, z }) },
          switch_dir(dir) { this.ps.dir = dir },
          dead: false, effect: { stuck: false }, counter: { dead_blink_count: -1 },
          data: { frame: { 219: { state: 15 } } },
          combo_buffer: { combo: null, timeout: 0 },
          sp: { show() {} }, shadow: { show() {} },
          trans: { frame(number) { character.nextFrame = number }, reset_lock() {} },
          injury(amount) { this.health.hp -= amount; this.health.hp_bound -= amount / 3 }
        }
        match.panel.push({ uid, name: player.name })
        match.character[uid] = character
      })
      match.roster = Object.values(match.character)
      matches.push(match)
      this.activeMatch = match
      return match
    },
    match_end() { uiReturns++ }
  }
  const api = attach(manager, options.pack || { reality: { enemyIndex: 7 } }, state => changes.push(state))
  function config(count = 2) {
    return { players: Array.from({ length: count }, (_, index) => ({ use: true, type: 'human', selected: index, team: 0, name: 'P' + (index + 1) })), options: { background: 2 } }
  }
  function tick(match, count = 1) { for (let i = 0; i < count; i++) match.frame() }
  function clear(match) { match.roster.filter(item => item.con.type === 'AIcontroller').forEach(item => item.injury(999)) }
  return { api, manager, config, tick, clear, memory, changes, matches, get uiReturns() { return uiReturns } }
}

test('a fresh chapter creates the first encounter and preserves the supplied lineup', () => {
  const h = harness()
  const config = h.config()
  const before = JSON.stringify(config)
  const match = h.api.start(config)
  assert.equal(match.config.players.length, 4)
  assert.equal(match.config.options.background, 0)
  assert.deepEqual(Array.from(match.config.players, player => player.team), [1, 1, 2, 2])
  assert.deepEqual(Array.from(match.config.players.slice(2), player => player.selected), [7, 7])
  assert.deepEqual(match.roster.map(character => character.health.hp), [500, 500, 150, 150])
  assert.equal(JSON.stringify(config), before)
  assert.equal(h.api.getState().phase, 'battle')
  assert.equal(h.api.getState().title, '不要掉队 · 校门口')
  assert.equal(h.api.getSavedProgress().completed, false)
  h.tick(match, 30)
  assert.equal(h.api.getState().elapsedFrames, 30)
  assert.ok(h.changes.length <= 5, 'ordinary frames do not cause DOM-rate callbacks')
  assert.equal(match.originalGameoverCalls, 0)
})

test('two encounters save the checkpoint and award the photo exactly once', () => {
  const h = harness()
  const first = h.api.start(h.config())
  h.clear(first)
  h.tick(first, 15)
  assert.equal(h.api.getState().phase, 'interlude')
  assert.equal(first.time.paused, true)
  assert.equal(h.api.getSavedProgress().checkpoint, 1)
  const next = h.api.advance()
  assert.equal(first.destroyed, true)
  assert.equal(next.config.players.length, 5)
  assert.deepEqual(next.roster.slice(2).map(character => character.health.hp), [220, 220, 220])
  assert.equal(h.api.getState().checkpoint, 1)
  assert.equal(h.uiReturns, 0, 'checkpoint transitions do not reopen character selection')
  h.clear(next)
  h.tick(next, 15)
  assert.equal(h.api.getState().phase, 'complete')
  const progress = JSON.parse(h.memory.get(saveKey))
  assert.equal(progress.completed, true)
  assert.deepEqual(progress.mementos, ['第一张合照'])
  assert.equal(h.api.advance(), null)
  const restarted = h.api.start(h.config(1), 0)
  restarted.roster[0].injury(600)
  h.tick(restarted)
  assert.equal(h.api.getState().phase, 'failed')
  assert.equal(h.api.getSavedProgress().completed, true)
})

test('reloading and retrying retain a reached checkpoint without carrying damage', () => {
  const h = harness({ saved: { version: 1, chapter: 'chapter-01', checkpoint: 1, completed: false, mementos: [] } })
  assert.equal(h.api.getSavedProgress().checkpoint, 1)
  const match = h.api.start(h.config(), h.api.getSavedProgress().checkpoint)
  match.roster[0].injury(600)
  match.roster[1].injury(600)
  h.tick(match)
  assert.equal(h.api.getState().phase, 'failed')
  assert.equal(match.time.paused, true)
  const retry = h.api.retry()
  assert.equal(match.destroyed, true)
  assert.equal(h.api.getState().checkpoint, 1)
  assert.equal(retry.roster[0].health.hp, 500)
  assert.equal(retry.roster[1].health.hp, 500)
  assert.equal(h.api.getSavedProgress().checkpoint, 1)
})

test('nearby held defence revives a grounded teammate after 45 active frames', () => {
  const h = harness()
  const match = h.api.start(h.config())
  const [helper, target] = match.roster
  target.injury(500)
  target.dead = true
  target.effect.stuck = true
  helper.con.state.def = true
  h.tick(match, 44)
  assert.equal(target.health.hp, -1, 'zero HP cannot naturally regenerate into a revive')
  assert.equal(h.api.getState().reviveTarget, 1)
  assert.equal(h.api.getState().reviveHelper, 0)
  assert.equal(h.api.getState().downedPlayers[0], 1)
  assert.ok(h.api.getState().reviveProgress > 0.9)
  h.tick(match)
  assert.equal(target.health.hp, 180)
  assert.equal(target.dead, false)
  assert.equal(target.effect.stuck, false)
  assert.equal(target.effect.super, true)
  assert.equal(target.nextFrame, 219)
  assert.equal(h.api.getState().rescues, 1)
  assert.equal(h.api.getState().reviveTarget, null)
})

test('pause freezes rescue progress and distance or released defence resets it', () => {
  const h = harness()
  const match = h.api.start(h.config())
  const [helper, target] = match.roster
  target.injury(600)
  helper.con.state.def = true
  h.tick(match, 15)
  const progress = h.api.getState().reviveProgress
  match.control.queue('F1')
  h.tick(match, 60)
  assert.equal(h.api.getState().reviveProgress, progress)
  assert.equal(h.api.getState().elapsedFrames, 15)
  assert.equal(h.api.getState().paused, true)
  match.control.queue('F1')
  h.tick(match)
  helper.ps.x -= 100
  h.tick(match)
  assert.equal(h.api.getState().reviveProgress, 0)
  helper.ps.x += 100
  h.tick(match, 20)
  helper.con.state.def = false
  h.tick(match)
  assert.equal(h.api.getState().reviveProgress, 0)
  helper.con.state.def = true
  helper.ps.y = -25
  h.tick(match, 60)
  assert.equal(target.health.hp, -1, 'an airborne helper cannot rescue')
})

test('clearing enemies does not leave a downed partner behind', () => {
  const h = harness()
  const match = h.api.start(h.config())
  h.clear(match)
  match.roster[1].injury(600)
  h.tick(match, 50)
  assert.equal(h.api.getState().phase, 'battle')
  assert.equal(h.api.getState().enemiesRemaining, 0)
  match.roster[0].con.state.def = true
  h.tick(match, 60)
  assert.equal(h.api.getState().phase, 'interlude')
  assert.equal(h.api.getState().rescues, 1)
})

test('solo failure pauses the encounter and ignores resume until retry', () => {
  const h = harness()
  const match = h.api.start(h.config(1))
  match.roster[0].injury(600)
  h.tick(match)
  assert.equal(h.api.getState().phase, 'failed')
  const elapsed = h.api.getState().elapsedFrames
  match.control.queue('F1')
  h.tick(match, 20)
  assert.equal(match.time.paused, true)
  assert.equal(h.api.getState().elapsedFrames, elapsed)
  match.control.queue('esc')
  h.tick(match)
  assert.equal(match.destroyed, true)
  assert.equal(h.api.getState().phase, 'idle')
  assert.equal(h.uiReturns, 1)
})

test('stop restores the match and does not modify subsequent free battles', () => {
  const h = harness()
  const match = h.api.start(h.config(1))
  h.api.stop()
  h.tick(match)
  assert.equal(match.originalGameoverCalls, 1)
  const free = h.manager.start_match(h.config(1))
  h.tick(free, 5)
  assert.equal(free.originalGameoverCalls, 5)
  assert.equal(free.roster[0].health.hp, 500)
  free.roster[0].injury(500)
  assert.equal(free.roster[0].health.hp, 0, 'only chapter characters clamp lethal damage')
  assert.equal(h.api.getState().phase, 'idle')
})

test('a storage error is visible without preventing the next encounter', () => {
  const h = harness({ writeError: true })
  const first = h.api.start(h.config(1))
  h.clear(first)
  h.tick(first, 15)
  assert.equal(h.api.getState().phase, 'interlude')
  assert.match(h.api.getState().savingError, /未能写入/)
  assert.equal(h.api.getState().saved.checkpoint, 0)
  assert.ok(h.api.advance())
  assert.equal(h.api.getState().checkpoint, 1)
})

test('leaving while loading prevents a late loader from creating a timer', () => {
  const h = harness({ loading: true })
  const match = h.api.start(h.config(1))
  assert.equal(h.api.getState().phase, 'loading')
  match.control.child[0].key('esc', true)
  assert.equal(h.api.getState().phase, 'idle')
  assert.equal(match.destroyed, true)
  match.create_timer()
  assert.equal(match.timerCreated, undefined)
  assert.equal(h.uiReturns, 1)
})

test('scene dialogs cannot leave movement or queued attacks held into the next encounter', () => {
  const h = harness()
  const match = h.api.start(h.config())
  const controller = match.roster[0].con
  controller.state.right = 1
  controller.state.att = 1
  controller.buf.push(['att', 1])
  h.clear(match)
  h.tick(match, 15)
  assert.equal(h.api.getState().phase, 'interlude')
  assert.equal(controller.state.right, 0)
  assert.equal(controller.state.att, 0)
  assert.equal(controller.buf.length, 0)
  // The real manager reuses controllers; simulate held keys before async loading ends.
  const loading = harness({ loading: true })
  const pending = loading.api.start(loading.config())
  pending.roster[0].con.state.right = 1
  pending.roster[0].con.buf.push(['att', 1])
  pending.create_timer()
  loading.tick(pending)
  assert.equal(pending.roster[0].con.state.right, 0)
  assert.equal(pending.roster[0].con.buf.length, 0)
  assert.equal(loading.api.getState().phase, 'battle')
})

test('chapter spawns keep partners together and monsters across the playground', () => {
  const h = harness()
  const match = h.api.start(h.config(), 1)
  const people = match.roster.slice(0, 2)
  const monsters = match.roster.slice(2)
  assert.deepEqual(people.map(character => [character.ps.x, character.ps.z, character.ps.dir]), [[280, 440, 'right'], [350, 465, 'right']])
  assert.deepEqual(monsters.map(character => [character.ps.x, character.ps.z, character.ps.dir]), [[630, 410, 'left'], [700, 440, 'left'], [760, 470, 'left']])
  assert.ok(monsters.every(monster => people.every(person => monster.ps.x - person.ps.x >= 280)))
  const narrow = harness({ background: { width: 200, zboundary: [100, 120] } })
  const smallMatch = narrow.api.start(narrow.config(), 1)
  assert.ok(smallMatch.roster.every(character => character.ps.x >= 16 && character.ps.x <= 184 && character.ps.z >= 102 && character.ps.z <= 118))
  h.api.stop()
  const free = h.manager.start_match(h.config())
  assert.equal(free.roster[0].ps.x, 200, 'free matches retain their original placement')
})

function expandedPack() {
  return {
    data: { object: [{ type: 'character', id: 11 }, { type: 'character', id: 32 }, { type: 'character', id: 30 }, { type: 'character', id: 31 }] },
    reality: {
      enemyIndex: 2,
      monsters: [{ id: 30, name: '紙卷怪' }, { id: 31, name: '訂正獵手' }, { id: 32, name: '催促鐘怪' }],
      stages: [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }, { index: 4 }]
    }
  }
}

test('registered classroom encounter uses all three monsters without changing chapter team or HP rules', () => {
  const pack = expandedPack()
  const h = harness({ pack })
  const first = h.api.start(h.config())
  assert.equal(first.config.options.background, 0)
  assert.deepEqual(Array.from(first.config.players.slice(2), player => player.selected), [2, 2])
  assert.deepEqual(Array.from(h.api.getState().monsterIds), [30, 30])
  h.clear(first)
  h.tick(first, 15)
  const second = h.api.advance()
  assert.equal(second.config.options.background, 3)
  assert.equal(h.api.getState().background, 3)
  assert.deepEqual(Array.from(second.config.players.slice(2), player => player.selected), [2, 3, 1], 'native character index is resolved by id rather than registry order')
  assert.deepEqual(Array.from(second.config.players.slice(2), player => player.name), ['紙卷怪 1', '訂正獵手 2', '催促鐘怪 3'])
  assert.deepEqual(Array.from(second.config.players, player => player.team), [1, 1, 2, 2, 2])
  assert.deepEqual(second.roster.map(character => character.health.hp), [500, 500, 220, 220, 220])
  assert.deepEqual(Array.from(h.api.getState().monsterIds), [30, 31, 32])
})

test('unregistered expansion resources fall back to the original stage and paper monsters', () => {
  const pack = expandedPack()
  pack.reality.stages = pack.reality.stages.slice(0, 3)
  pack.reality.monsters = pack.reality.monsters.slice(0, 1)
  const h = harness({ pack })
  const match = h.api.start(h.config(), 1)
  assert.equal(match.config.options.background, 0)
  assert.deepEqual(Array.from(match.config.players.slice(2), player => player.selected), [2, 2, 2])
  assert.deepEqual(Array.from(h.api.getState().monsterIds), [30, 30, 30])
  assert.deepEqual(match.roster.slice(2).map(character => character.health.hp), [220, 220, 220])
})

test('a missing native monster falls back individually and encounter inspection cannot mutate the chapter', () => {
  const pack = expandedPack()
  pack.data.object = pack.data.object.filter(entry => entry.id !== 31)
  const h = harness({ pack })
  const preview = h.api.getEncounter(1)
  assert.deepEqual(Array.from(preview.monsterIds), [30, 30, 32])
  preview.monsters[0].name = 'changed'
  preview.monsterIds[0] = 999
  const match = h.api.start(h.config(1), 1)
  assert.equal(match.config.options.background, 3)
  assert.deepEqual(Array.from(match.config.players.slice(1), player => player.name), ['紙卷怪 1', '紙卷怪 2', '催促鐘怪 3'])
  assert.deepEqual(Array.from(h.api.getState().monsterIds), [30, 30, 32])
})
