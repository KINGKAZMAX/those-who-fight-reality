const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

const engineRoot = path.join(__dirname, '../vendor/F.LF')
const upstreamRoot = path.join(__dirname, 'fixtures/upstream')
const dataRoot = path.join(__dirname, '../vendor/LF2_19/data')
const campusRules = { friendlySupport: true, fullManaHeroIds: [11, 2, 8, 4] }

// Load the production constructors, combat methods and original character data.
// Only rendering and scene geometry are replaced: these tests have no browser.
function createEngine(upstream = false) {
  const modules = {}
  const context = vm.createContext({ console })
  function load(id, file = path.join(engineRoot, id + '.js')) {
    if (Object.hasOwn(modules, id)) return modules[id]
    context.define = (dependencies, factory) => {
      if (!Array.isArray(dependencies)) {
        factory = dependencies
        dependencies = []
      }
      modules[id] = typeof factory === 'function' ? factory(...dependencies.map(dependency => load(dependency))) : factory
    }
    const code = upstream && file.startsWith(engineRoot + path.sep)
      ? fs.readFileSync(path.join(upstreamRoot, id + '.js'), 'utf8')
      : fs.readFileSync(file, 'utf8')
    vm.runInContext(code, context, { filename: file })
    return modules[id]
  }
  class NullSprite {
    constructor() { this.ani = [] }
    show_pic() {}
    show() {}
    hide() {}
    switch_lr() {}
    set_x_y() {}
  }
  class SceneMechanics {
    constructor(owner) { this.owner = owner; this.mass = 1 }
    create_metric() { return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dir: 'right' } }
    volume(itr) { return { ...itr, z: this.owner.ps.z, vx: 0, vy: 0 } }
    dynamics() {}
    project() {}
    coincideXY() {}
    make_point(point) { return point }
  }
  modules['LF/sprite'] = NullSprite
  modules['LF/sprite-select'] = NullSprite
  modules['LF/mechanics'] = SceneMechanics
  modules['LF/AI'] = { interface: class {} }
  const Character = load('LF/character')
  const SpecialAttack = load('LF/specialattack')
  const LightWeapon = load('LF/weapon')('lightweapon')
  const names = {
    1: 'deep', 2: 'john', 4: 'henry', 5: 'rudolf', 6: 'louis', 7: 'firen',
    8: 'freeze', 9: 'dennis', 10: 'woody', 11: 'davis', 30: 'bandit',
    200: 'john_ball', 201: 'henry_arrow1', 204: 'henry_louis_rudolf_wind',
    207: 'davis_ball', 208: 'henry_arrow2', 209: 'freeze_ball', 212: 'freeze_column',
    213: 'weapon7', 214: 'john_biscuit'
  }
  const records = Object.fromEntries(Object.entries(names).map(([id, name]) =>
    [id, load('data/' + name, path.join(dataRoot, name + '.js'))]))
  return { Character, SpecialAttack, LightWeapon, records, Global: modules['LF/global'] }
}

function createMatch(rules) {
  return {
    data: rules === undefined ? {} : { realityRules: rules },
    scene: { live: {}, query() { return [] } },
    background: { shadow: { img: 'unused' }, leaving() { return false } },
    visualeffect: { create() {} },
    sound: { play() {} },
    broken_list: {},
    spec: {},
    time: { t: 2 },
    random: () => 1
  }
}

function intersectingTargets(match, targets) {
  // The geometry fixture declares which objects overlap; production scene
  // exclusions are honored so held weapons and reflectors cannot hit themselves.
  match.scene.query = (volume, exclude, filter = {}) => targets.filter(target =>
    ![].concat(exclude || []).includes(target) &&
    (filter.not_team === undefined || target.team !== filter.not_team))
}

function setFrame(object, frame) {
  object.frame.N = frame
  object.frame.D = object.data.frame[frame]
}

function assertUnharmed(character, message) {
  assert.equal(character.health.hp, 500, message)
  assert.equal(character.health.fall, 0, message)
  assert.equal(character.health.bdefend, 0, message)
  assert.equal(character.effect.stuck, false, message)
  assert.equal(character.ps.vy, 0, message)
  assert.equal(character.trans.next(), 999, message)
}

function createCharacter(engine, match, id, team, controllerType = 'keyboard') {
  const controller = controllerType === null ? null : { type: controllerType, child: [], state: {} }
  const character = new engine.Character({ match, team, controller }, engine.records[id], id)
  character.uid = Object.keys(match.scene.live).length + 1
  match.scene.live[character.uid] = character
  return character
}

function fluteEncounter(rules) {
  const engine = createEngine()
  const match = createMatch(rules)
  const caster = createCharacter(engine, match, 4, 1)
  caster.frame.N = 251
  caster.frame.D = caster.data.frame[251]
  const ally = createCharacter(engine, match, 11, 1)
  const enemy = createCharacter(engine, match, 30, 2, 'AIscript')
  const distantEnemy = createCharacter(engine, match, 30, 2, 'AIscript')
  const drops = { ally: 0, enemy: 0, distantEnemy: 0 }
  for (const [name, character] of Object.entries({ ally, enemy, distantEnemy })) {
    character.ps.x = name === 'distantEnemy' ? 200 : 50
    character.frame.N = 182
    character.frame.D = character.data.frame[182]
    character.hold.obj = { drop() { drops[name]++ } }
  }
  caster.states[3].call(caster, 'TU')
  return { caster, ally, enemy, distantEnemy, drops }
}

test('campus flute lifts and damages nearby enemies without touching its ally or caster', () => {
  const { caster, ally, enemy, distantEnemy, drops } = fluteEncounter(campusRules)
  assert.equal(ally.health.hp, 500)
  assert.equal(ally.ps.vy, 0)
  assert.equal(ally.effect.super, false)
  assert.ok(ally.hold.obj, 'the ally keeps its held weapon')
  assert.equal(caster.health.hp, 500)
  assert.equal(caster.ps.vy, 0)
  assert.equal(enemy.health.hp, 498)
  assert.ok(enemy.ps.vy < 0, 'the real flute force launches the enemy upward')
  assert.equal(enemy.effect.super, true)
  assert.equal(enemy.hold.obj, null)
  assert.equal(distantEnemy.health.hp, 500)
  assert.equal(distantEnemy.ps.vy, 0)
  assert.deepEqual(drops, { ally: 0, enemy: 1, distantEnemy: 0 })
})

test('legacy packages and an explicitly disabled support rule preserve flute friendly fire', () => {
  for (const rules of [undefined, { friendlySupport: false }]) {
    const { ally, enemy, drops } = fluteEncounter(rules)
    assert.equal(ally.health.hp, 498)
    assert.ok(ally.ps.vy < 0)
    assert.equal(ally.hold.obj, null)
    assert.equal(enemy.health.hp, 498)
    assert.equal(drops.ally, 1)
  }
})

test('campus direct melee and skill hitboxes protect an overlapping ally without blocking enemy damage', () => {
  const engine = createEngine()
  // These real frames intentionally omit effect, including the original bug's
  // uppercut, flurry and the melee portion of John's shield skill.
  for (const [id, frame, damage] of [[11, 271, 25], [11, 301, 85], [11, 293, 50], [2, 274, 20], [2, 293, 30]]) {
    const match = createMatch(campusRules)
    const attacker = createCharacter(engine, match, id, 1)
    const ally = createCharacter(engine, match, 11, 1)
    const enemy = createCharacter(engine, match, 30, 2)
    setFrame(attacker, frame)
    intersectingTargets(match, [ally, enemy])
    attacker.post_interaction()
    assertUnharmed(ally, id + ':' + frame + ' ally')
    assert.equal(enemy.health.hp, 500 - damage, id + ':' + frame + ' enemy')
  }
})

test('melee friendly-fire protection is opt-in and team zero is not treated as a friendly team', () => {
  const engine = createEngine()
  for (const [rules, team] of [[undefined, 1], [{ friendlySupport: false }, 1], [campusRules, 0]]) {
    const match = createMatch(rules)
    const attacker = createCharacter(engine, match, 11, team)
    const target = createCharacter(engine, match, 11, team)
    setFrame(attacker, 301)
    intersectingTargets(match, [target])
    attacker.post_interaction()
    assert.equal(target.health.hp, 415)
  }
})

test('campus falling-body collisions retain native incidental damage', () => {
  const engine = createEngine()
  const match = createMatch(campusRules)
  const body = createCharacter(engine, match, 11, 1)
  const target = createCharacter(engine, match, 11, 1)
  const source = createCharacter(engine, match, 30, 2)
  body.itr.attacker = source
  setFrame(body, 180)
  intersectingTargets(match, [target])
  body.post_interaction()
  assert.equal(target.health.hp, 470)
})

test('a first flute hit on a standing enemy records its source before the falling body interacts', () => {
  const engine = createEngine()
  const match = createMatch(campusRules)
  const caster = createCharacter(engine, match, 4, 1)
  const enemy = createCharacter(engine, match, 30, 2)
  enemy.ps.x = 50
  setFrame(caster, 251)
  assert.equal(enemy.state(), 0)
  assert.equal(enemy.itr.attacker, undefined)
  caster.states[3].call(caster, 'TU')
  assert.equal(enemy.health.hp, 500, 'the initial lift precedes periodic falling-state damage')
  assert.ok(enemy.itr.attacker === caster, 'the initial lift records its actual caster')
  enemy.trans.trans()
  assert.equal(enemy.state(), 12, 'run the real flute-to-falling frame transition')
  const bystander = createCharacter(engine, match, 11, 3)
  intersectingTargets(match, [caster, bystander])
  assert.doesNotThrow(() => enemy.post_interaction())
  assert.equal(caster.health.hp, 500, 'a falling body cannot hit the person who lifted it')
  assert.equal(bystander.health.hp, 470, 'unrelated incidental body collisions still work')
  delete match.scene.live[bystander.uid]
  caster.states[3].call(caster, 'TU')
  assert.equal(enemy.health.hp, 498, 'subsequent flute ticks damage the airborne enemy')
})

test('a falling body without an attack source can interact without crashing', () => {
  const engine = createEngine()
  for (const rules of [campusRules, undefined]) {
    const match = createMatch(rules)
    const body = createCharacter(engine, match, 30, 2)
    const target = createCharacter(engine, match, 11, 1)
    setFrame(body, 180)
    assert.equal(body.itr.attacker, undefined)
    intersectingTargets(match, [target])
    assert.doesNotThrow(() => body.post_interaction())
    assert.equal(target.health.hp, 470)
  }
})

test('falling-body protection still recognizes a source character, projectile parent and weapon holder', () => {
  const engine = createEngine()
  for (const sourceKind of ['character', 'projectile', 'weapon']) {
    const match = createMatch(campusRules)
    const body = createCharacter(engine, match, 30, 2)
    const source = createCharacter(engine, match, 4, 1)
    const bystander = createCharacter(engine, match, 11, 3)
    body.itr.attacker = sourceKind === 'character' ? source : sourceKind === 'projectile'
      ? { uid: 99, parent: source } : { uid: 99, hold: { pre: source } }
    setFrame(body, 180)
    intersectingTargets(match, [source, bystander])
    body.post_interaction()
    assert.equal(source.health.hp, 500, sourceKind)
    assert.equal(bystander.health.hp, 470, sourceKind)
  }
})

test('all four heroes projectile, shield, ice, wind and arrow damage paths remain friendly-safe', () => {
  const engine = createEngine()
  const cases = [
    [11, 207, 0, 30], // Davis projectile
    [2, 200, 0, 55], // John projectile
    [2, 214, 0, 50], // John chasing disc
    [2, 200, 60, 40], // John shield
    [8, 209, 0, 45], // Freeze projectile
    [8, 212, 0, 60], [8, 212, 50, 60], [8, 212, 60, 60], // three ice columns
    [8, 212, 170, 75], // whirlwind freeze damage
    [4, 204, 0, 80], // Henry wind
    [4, 208, 0, 50], // Henry piercing arrow
    [4, 201, 141, 25], // Henry five-arrow volley
    [4, 201, 40, 40], [4, 201, 44, 40] // ordinary and airborne arrows
  ]
  for (const [hero, id, frame, damage] of cases) {
    const match = createMatch(campusRules)
    const parent = createCharacter(engine, match, hero, 1)
    const ally = createCharacter(engine, match, 11, 1)
    const enemy = createCharacter(engine, match, 30, 2)
    const projectile = new engine.SpecialAttack({ match, team: 1 }, engine.records[id], id)
    projectile.uid = 99
    projectile.parent = parent
    setFrame(projectile, frame)
    intersectingTargets(match, [ally, enemy])
    projectile.interaction()
    assertUnharmed(ally, id + ':' + frame + ' ally')
    assert.equal(enemy.health.hp, 500 - damage, id + ':' + frame + ' enemy')
  }
})

test('whirlwind attraction lifts only the enemy while preserving the teammate position', () => {
  const engine = createEngine()
  const match = createMatch(campusRules)
  const parent = createCharacter(engine, match, 8, 1)
  const ally = createCharacter(engine, match, 11, 1)
  const enemy = createCharacter(engine, match, 30, 2)
  const whirlwind = new engine.SpecialAttack({ match, team: 1 }, engine.records[212], 212)
  whirlwind.parent = parent
  setFrame(whirlwind, 153)
  intersectingTargets(match, [ally, enemy])
  whirlwind.interaction()
  assertUnharmed(ally)
  assert.ok(enemy.ps.vy < 0)
  assert.equal(enemy.health.hp, 500, 'attraction itself precedes the separate freeze hitbox')
})

test('campus flurry still reflects an enemy projectile without damaging a teammate', () => {
  const engine = createEngine()
  const match = createMatch(campusRules)
  const attacker = createCharacter(engine, match, 11, 1)
  const ally = createCharacter(engine, match, 11, 1)
  const enemy = createCharacter(engine, match, 30, 2)
  const projectile = new engine.SpecialAttack({ match, team: 2 }, engine.records[207], 207)
  projectile.parent = enemy
  projectile.uid = 99
  projectile.ps.dir = 'left'
  match.create_object = () => {}
  setFrame(attacker, 271)
  intersectingTargets(match, [ally, projectile])
  attacker.post_interaction()
  assertUnharmed(ally)
  assert.equal(projectile.team, 1, 'the original reflection handler changes projectile ownership')
  assert.ok([30, 31].includes(projectile.frame.N), 'the actual projectile rebound animation runs')
})

test('summoned ruler remains held and can hit enemies while excluding its owner and teammate', () => {
  const engine = createEngine()
  const match = createMatch(campusRules)
  const wielder = createCharacter(engine, match, 8, 1)
  const ally = createCharacter(engine, match, 11, 1)
  const enemy = createCharacter(engine, match, 30, 2)
  const ruler = new engine.LightWeapon({ match, team: 1 }, engine.records[213], 213)
  ruler.init({ opoint: { kind: 2 }, parent: wielder })
  assert.equal(wielder.hold.obj, ruler)
  assert.equal(ruler.hold.obj, wielder)
  setFrame(ruler, 20)
  intersectingTargets(match, [wielder, ally, enemy])
  const hit = ruler.act(wielder, { attacking: 1, cover: 0 }, { x: 0, y: 0 })
  assert.equal(hit.hit, enemy.uid)
  assert.equal(enemy.health.hp, 470)
  assertUnharmed(wielder)
  assertUnharmed(ally)
})

function healingEncounter(rules, targetTeams) {
  const engine = createEngine()
  const match = createMatch(rules)
  const caster = createCharacter(engine, match, 2, 1)
  const targets = targetTeams.map(team => createCharacter(engine, match, 11, team))
  const prop = { type: 'lightweapon', team: 1, heal() { throw new Error('a prop must not be healed') } }
  match.scene.query = () => targets.concat(prop)
  const ball = new engine.SpecialAttack({ match, team: 1 }, engine.records[200], 200)
  ball.parent = caster
  ball.frame.N = 50
  ball.frame.D = ball.data.frame[50]
  ball.interaction()
  return { ball, targets }
}

test('campus healing ball only starts recovery on teammates and is consumed by a valid recipient', () => {
  // Enemy first catches regressions where a heal is consumed by the wrong side.
  const { ball, targets: [enemy, ally] } = healingEncounter(campusRules, [2, 1])
  assert.equal(enemy.effect.heal, undefined)
  assert.equal(ally.effect.heal, 100)
  assert.equal(ball.trans.next(), 40, 'the real heal interaction transitions to its consumed animation')
})

test('campus healing ball survives enemy-only contact instead of healing or being consumed', () => {
  const { ball, targets } = healingEncounter(campusRules, [2, 3])
  assert.ok(targets.every(target => target.effect.heal === undefined))
  assert.equal(ball.trans.next(), 999)
})

test('legacy and disabled support packages retain healing for characters of either side', () => {
  for (const rules of [undefined, { friendlySupport: false }]) {
    const { targets } = healingEncounter(rules, [2, 1])
    assert.deepEqual(targets.map(target => target.effect.heal), [100, 100])
  }
})

function recoveryCharacter(rules, hp = 100) {
  const engine = createEngine()
  const match = createMatch(rules)
  const character = createCharacter(engine, match, 2, 1)
  character.health.hp = hp
  return { character, match }
}

function recoveryTick(subject, tick) {
  subject.match.time.t = tick
  subject.character.states.generic.call(subject.character, 'TU')
}

test('campus healing applies exactly 100 HP in addition to ordinary passive regeneration', () => {
  const treated = recoveryCharacter(campusRules)
  const untreated = recoveryCharacter(campusRules)
  treated.character.heal(100)
  // Run real successive ticks so passive recovery is measured rather than disabled.
  for (let tick = 1; tick <= 112; tick++) {
    recoveryTick(treated, tick)
    recoveryTick(untreated, tick)
  }
  assert.equal(treated.character.health.hp - untreated.character.health.hp, 100)
  assert.equal(treated.character.effect.heal, 0)
})

test('campus healing consumes a final four-point budget as exactly four HP', () => {
  const subject = recoveryCharacter(campusRules)
  subject.character.heal(4)
  recoveryTick(subject, 8)
  assert.equal(subject.character.health.hp, 104)
  assert.equal(subject.character.effect.heal, 0)
  recoveryTick(subject, 16)
  assert.equal(subject.character.health.hp, 104, 'an exhausted heal cannot apply another pulse')
})

test('campus healing fills a three-HP gap without exceeding the recoverable-health bound', () => {
  const subject = recoveryCharacter(campusRules, 397)
  subject.character.health.hp_bound = 400
  subject.character.heal(100)
  recoveryTick(subject, 8)
  assert.equal(subject.character.health.hp, 400)
  for (let tick = 9; tick <= 112; tick++) {
    recoveryTick(subject, tick)
    assert.equal(subject.character.health.hp, 400)
  }
  assert.equal(subject.character.effect.heal, 0)
  subject.character.heal(4)
  recoveryTick(subject, 120)
  assert.equal(subject.character.health.hp, 400, 'a fully recovered target never overheals')
  assert.equal(subject.character.effect.heal, 0)
})

test('legacy packages keep their original eight-HP healing pulses and final-gap behavior', () => {
  for (const rules of [undefined, { friendlySupport: false }]) {
    const treated = recoveryCharacter(rules)
    const untreated = recoveryCharacter(rules)
    treated.character.heal(100)
    for (let tick = 1; tick <= 112; tick++) {
      recoveryTick(treated, tick)
      recoveryTick(untreated, tick)
    }
    assert.equal(treated.character.health.hp - untreated.character.health.hp, 104)
    assert.equal(treated.character.effect.heal, -4)
    const lastPulse = recoveryCharacter(rules)
    lastPulse.character.heal(4)
    recoveryTick(lastPulse, 8)
    assert.equal(lastPulse.character.health.hp, 108)
    const nearBound = recoveryCharacter(rules, 397)
    nearBound.character.health.hp_bound = 400
    nearBound.character.heal(100)
    recoveryTick(nearBound, 8)
    assert.equal(nearBound.character.health.hp, 397)
  }
})

test('all four campus keyboard heroes begin with full mana; monsters and AI keep normal starting mana', () => {
  const engine = createEngine()
  for (const id of [11, 2, 8, 4]) {
    const keyboard = createCharacter(engine, createMatch(campusRules), id, 1)
    assert.equal(keyboard.health.mp, engine.Global.gameplay.default.health.mp_full)
    assert.equal(keyboard.health.mp_usage, 0)
    const ai = createCharacter(engine, createMatch(campusRules), id, 2, 'AIscript')
    assert.equal(ai.health.mp, engine.Global.gameplay.default.health.mp_start)
  }
  const monster = createCharacter(engine, createMatch(campusRules), 30, 2)
  assert.equal(monster.health.mp, engine.Global.gameplay.default.health.mp_start)
})

test('full-mana opt-in does not change legacy, unlisted or controller-free characters', () => {
  const engine = createEngine()
  for (const rules of [undefined, {}, { fullManaHeroIds: [] }]) {
    for (const id of [11, 2, 8, 4]) {
      const hero = createCharacter(engine, createMatch(rules), id, 1)
      assert.equal(hero.health.mp, engine.Global.gameplay.default.health.mp_start)
    }
  }
  const controllerFree = createCharacter(engine, createMatch(campusRules), 11, 1, null)
  assert.equal(controllerFree.health.mp, engine.Global.gameplay.default.health.mp_start)
})

// Differential checks use the exact checked-in upstream, rather than guessed LF2 values.
test('reskin default combat matches upstream MP, healing, melee and flute results', () => {
  function trace(upstream) {
    const engine = createEngine(upstream)
    const match = createMatch({})
    const result = { mana: [], healing: [], melee: [], flute: [] }
    for (const id of [11, 2, 8, 4]) {
      const hero = createCharacter(engine, match, id, 1)
      result.mana.push(hero.health.mp)
    }
    for (const hp of [100, 397]) {
      const hero = createCharacter(engine, match, 2, 1)
      hero.health.hp = hp; hero.health.hp_bound = 400
      hero.heal(100)
      for (let t = 1; t <= 112; t++) {
        match.time.t = t
        hero.states.generic.call(hero, 'TU')
        result.healing.push([hero.health.hp, hero.effect.heal])
      }
    }
    for (const [id, frame] of [[11, 271], [11, 301], [11, 293], [2, 274]]) {
      const hitMatch = createMatch({})
      const hero = createCharacter(engine, hitMatch, id, 1)
      const ally = createCharacter(engine, hitMatch, 11, 1)
      const enemy = createCharacter(engine, hitMatch, 30, 2)
      setFrame(hero, frame); intersectingTargets(hitMatch, [ally, enemy])
      hero.post_interaction()
      result.melee.push([ally.health.hp, enemy.health.hp, ally.health.fall, enemy.health.fall])
    }
    const fluteMatch = createMatch({})
    const caster = createCharacter(engine, fluteMatch, 4, 1)
    const ally = createCharacter(engine, fluteMatch, 11, 1)
    const enemy = createCharacter(engine, fluteMatch, 30, 2)
    setFrame(caster, 251)
    for (const target of [ally, enemy]) { target.ps.x = 50; setFrame(target, 182) }
    caster.states[3].call(caster, 'TU')
    result.flute = [ally, enemy].map(ch => [ch.health.hp, ch.ps.vy, ch.trans.next()])
    return result
  }
  assert.deepEqual(trace(false), trace(true))
})

test('monster variants retain native identity rules while all original characters keep upstream combos', () => {
  const current = createEngine()
  const upstream = createEngine(true)
  current.records[32] = JSON.parse(JSON.stringify(current.records[6]))
  current.records[32].realityNativeId = 6
  const frameBefore = JSON.stringify(current.records[32].frame)
  const bitmapBefore = JSON.stringify(current.records[32].bmp)
  for (const id of [6, 32]) {
    const character = createCharacter(current, createMatch({}), id, 2, 'AIscript')
    setFrame(character, 0)
    character.state_update('combo', 'DJA')
    assert.equal(character.id, id, 'the monster keeps its own roster and artwork identity')
    assert.equal(character.trans.next(), 999, 'Louis and its clock-monster variant must both block unsupported transformation')
    assert.equal(character.health.mp, 200)
  }
  assert.equal(JSON.stringify(current.records[32].frame), frameBefore)
  assert.equal(JSON.stringify(current.records[32].bmp), bitmapBefore)

  function trace(engine, id, combo) {
    const character = createCharacter(engine, createMatch({}), id, 1)
    setFrame(character, 0)
    character.state_update('combo', combo)
    return { next: character.trans.next(), dir: character.ps.dir, mp: character.health.mp }
  }
  for (const id of [30, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11]) {
    for (const combo of Object.keys(current.Global.combo_tag)) {
      assert.deepEqual(trace(current, id, combo), trace(upstream, id, combo), 'original character ' + id + ' / ' + combo)
    }
  }
})
