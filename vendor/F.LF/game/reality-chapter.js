/* Chapter rules wrap individual matches. Free battles keep the original engine rules. */
define(['LF/global'], function (Global) {
  'use strict'

  const STORAGE_KEY = 'reality/chapter-01/v1'
  const FPS = Global.gameplay.framerate
  const REVIVE_FRAMES = Math.round(FPS * 1.5)
  const REVIVE_DISTANCE = 75
  const STAGES = [
    { title: '不要掉队 · 校门口', objective: '打散纸卷怪，和同伴一起走进校门。', enemies: 2, hp: 150, background: 0, monsterIds: [30, 30] },
    { title: '不要掉隊 · 一起進教室', objective: '打散訂正與催促，和同伴一起坐進教室。', enemies: 3, hp: 220, background: 3, monsterIds: [30, 31, 32] }
  ]

  function copy(value) { return JSON.parse(JSON.stringify(value)) }
  function emptySave() { return { version: 1, chapter: 'chapter-01', checkpoint: 0, completed: false, mementos: [], updatedAt: null } }

  return function attachChapter(manager, pack, onChange) {
    let current = null
    let configuration = null
    let checkpoint = 0
    let elapsedFrames = 0
    let rescues = 0
    let lastNotification = ''
    let savingError = null
    let saved = readSave()
    let state = initialState('idle')

    function encounter(index) {
      const stage = STAGES[index === 1 ? 1 : 0]
      const reality = pack.reality || {}
      const characters = pack.data && pack.data.object ? pack.data.object.filter(function (entry) { return entry.type === 'character' }) : []
      const paperIndex = characters.findIndex(function (entry) { return entry.id === 30 })
      const fallback = { id: 30, name: '紙卷怪', index: paperIndex >= 0 ? paperIndex : reality.enemyIndex }
      const monsters = stage.monsterIds.map(function (id) {
        const registered = (reality.monsters || []).find(function (entry) { return entry.id === id })
        const selected = characters.findIndex(function (entry) { return entry.id === id })
        return registered && selected >= 0 ? { id: id, name: registered.name, index: selected } : Object.assign({}, fallback)
      })
      const background = (reality.stages || []).some(function (entry, i) { return (entry.index === undefined ? i : entry.index) === stage.background }) ? stage.background : 0
      return Object.assign({}, stage, { background: background, monsters: monsters, monsterIds: monsters.map(function (entry) { return entry.id }) })
    }

    function readSave() {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        if (!value || value.version !== 1 || value.chapter !== 'chapter-01') return emptySave()
        return {
          version: 1,
          chapter: 'chapter-01',
          checkpoint: value.checkpoint === 1 || value.completed === true ? 1 : 0,
          completed: value.completed === true,
          mementos: value.completed === true ? ['第一张合照'] : [],
          updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
        }
      } catch (error) {
        savingError = '本地存档暂不可用，仍可继续试玩。'
        return emptySave()
      }
    }

    function saveProgress(completed) {
      const previous = readSave()
      const value = {
        version: 1,
        chapter: 'chapter-01',
        checkpoint: 1,
        completed: completed || previous.completed || saved.completed,
        mementos: completed || previous.completed || saved.completed ? ['第一张合照'] : [],
        updatedAt: new Date().toISOString()
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
        saved = value
        savingError = null
      } catch (error) {
        savingError = '存档未能写入。请保留此页面，当前进度仍可继续。'
      }
      state.saved = copy(saved)
      state.savingError = savingError
    }

    function initialState(phase) {
      const stage = encounter(checkpoint)
      return {
        phase: phase,
        checkpoint: checkpoint,
        title: stage.title,
        objective: stage.objective,
        background: stage.background,
        monsterIds: stage.monsterIds,
        enemiesRemaining: stage.enemies,
        rescues: rescues,
        reviveProgress: 0,
        reviveTarget: null,
        reviveHelper: null,
        downedPlayers: [],
        elapsedFrames: elapsedFrames,
        paused: false,
        saved: copy(saved),
        savingError: savingError
      }
    }

    function notify(force) {
      state.elapsedFrames = elapsedFrames
      state.rescues = rescues
      state.savingError = savingError
      // A second of elapsed time and 10% rescue steps are enough for the DOM HUD.
      const signature = JSON.stringify([
        state.phase, state.checkpoint, state.enemiesRemaining, state.rescues,
        Math.floor(state.reviveProgress * 10), state.reviveTarget, state.reviveHelper,
        state.downedPlayers, state.paused, Math.floor(elapsedFrames / FPS), savingError,
        saved.checkpoint, saved.completed
      ])
      if (!force && signature === lastNotification) return
      lastNotification = signature
      if (typeof onChange === 'function') onChange(copy(state))
    }

    function entries(match) {
      return (match.panel || []).reduce(function (list, panel, index) {
        const character = panel && match.character && match.character[panel.uid]
        if (character && character.health) list.push({ index: index, character: character })
        return list
      }, [])
    }

    function restore(record) {
      record.restores.splice(0).reverse().forEach(function (undo) { undo() })
    }

    function wrap(record, object, key, factory) {
      const original = object[key]
      const replacement = factory(original)
      object[key] = replacement
      record.restores.push(function () { if (object[key] === replacement) object[key] = original })
    }

    function resetRevive(record) {
      record.reviveFrames = 0
      record.reviveTarget = null
      record.reviveHelper = null
      state.reviveProgress = 0
      state.reviveTarget = null
      state.reviveHelper = null
    }

    function resetInput(record) {
      const controllers = record.humans.map(function (entry) { return entry.character.con }).concat(record.match.control || [])
      controllers.forEach(function (controller) {
        if (!controller) return
        if (typeof controller.flush === 'function') controller.flush()
        if (typeof controller.clear_states === 'function') controller.clear_states()
      })
    }

    function setPhase(phase) {
      state.phase = phase
      if (current && current.match.time) {
        current.match.time.paused = phase !== 'battle'
        state.paused = current.match.time.paused
        if (phase !== 'battle') resetInput(current)
      }
      notify(true)
    }

    function placeAtStart(record, entry) {
      const background = record.match.background || {}
      const width = Number.isFinite(background.width) && background.width > 0 ? background.width : 1000
      const bounds = background.zboundary || [330, 490]
      const near = Number.isFinite(bounds[0]) ? bounds[0] : 330
      const far = Number.isFinite(bounds[1]) && bounds[1] >= near ? bounds[1] : near + 160
      const depth = far - near
      const human = entry.index < record.humanCount
      const index = human ? entry.index : entry.index - record.humanCount
      const rx = human ? [0.28, 0.35][index] : [0.63, 0.70, 0.76][index]
      const rz = human ? [0.6875, 0.84375][index] : [0.5, 0.6875, 0.875][index]
      const xMargin = Math.min(40, width * 0.08)
      const zMargin = Math.min(16, depth * 0.1)
      const x = Math.max(xMargin, Math.min(width - xMargin, width * rx))
      const z = Math.max(near + zMargin, Math.min(far - zMargin, near + depth * rz))
      if (typeof entry.character.set_pos === 'function') entry.character.set_pos(x, 0, z)
      if (typeof entry.character.switch_dir === 'function') entry.character.switch_dir(human ? 'right' : 'left')
    }

    function initialize(record) {
      if (record.initialized || !record.match.time || record.match.destroyed) return
      const roster = entries(record.match)
      if (roster.length < record.total) return
      record.initialized = true
      record.humans = roster.slice(0, record.humanCount)
      record.enemies = roster.slice(record.humanCount)
      // Story dialogs consume key releases. Every encounter starts with a neutral
      // keyboard so holding a key through the previous scene cannot stick movement.
      resetInput(record)
      roster.forEach(function (entry) {
        const character = entry.character
        placeAtStart(record, entry)
        const hp = entry.index < record.humanCount ? 500 : STAGES[checkpoint].hp
        character.health.hp = character.health.hp_full = character.health.hp_bound = hp
        character.dead = false
        if (typeof character.injury === 'function') {
          wrap(record, character, 'injury', function (original) {
            return function () {
              const result = original.apply(this, arguments)
              // LF2 naturally regenerates zero HP; a downed partner must wait for help.
              if (this.health.hp <= 0) this.health.hp = -1
              return result
            }
          })
        }
      })
      state.enemiesRemaining = record.enemies.length
      setPhase('battle')
    }

    function revive(character) {
      character.health.hp = 180
      character.health.hp_bound = Math.max(180, character.health.hp_bound)
      character.health.fall = character.health.bdefend = 0
      character.dead = false
      character.catching = 0
      if (character.counter) character.counter.dead_blink_count = -1
      if (character.combo_buffer) {
        character.combo_buffer.combo = null
        character.combo_buffer.timeout = 0
      }
      Object.assign(character.effect, {
        num: -99, dvx: 0, dvy: 0, stuck: false, oscillate: 0,
        blink: true, super: true, timein: 0, timeout: FPS, heal: undefined
      })
      Object.assign(character.ps, { y: 0, vx: 0, vy: 0, vz: 0 })
      if (character.sp) character.sp.show()
      if (character.shadow) character.shadow.show()
      if (character.trans) {
        if (character.trans.reset_lock) character.trans.reset_lock(99)
        character.trans.frame(character.data && character.data.frame[219] ? 219 : 999, 99)
      }
    }

    function isOnGround(character) {
      return character.ps && Math.abs(character.ps.y || 0) < 4 && Math.abs(character.ps.vy || 0) < 2
    }

    function update(record) {
      if (record !== current || state.phase !== 'battle' || !record.initialized || record.match.destroyed) return
      if (record.match.time.paused && record.match.time.paused !== 'F2') return
      elapsedFrames++
      const living = record.humans.filter(function (entry) { return entry.character.health.hp > 0 })
      const downed = record.humans.filter(function (entry) { return entry.character.health.hp <= 0 })
      state.enemiesRemaining = record.enemies.filter(function (entry) { return entry.character.health.hp > 0 }).length
      state.downedPlayers = downed.map(function (entry) { return entry.index })
      if (!living.length) {
        resetRevive(record)
        setPhase('failed')
        return
      }
      if (downed.length && record.humanCount > 1) {
        const target = downed[0]
        const helper = living.find(function (entry) {
          const from = entry.character
          const to = target.character
          if (!from.con || !from.con.state.def || !isOnGround(from) || !isOnGround(to)) return false
          const dx = from.ps.x - to.ps.x
          const dz = from.ps.z - to.ps.z
          return dx * dx + dz * dz <= REVIVE_DISTANCE * REVIVE_DISTANCE
        })
        if (helper) {
          if (record.reviveTarget !== target.index || record.reviveHelper !== helper.index) resetRevive(record)
          record.reviveTarget = state.reviveTarget = target.index
          record.reviveHelper = state.reviveHelper = helper.index
          record.reviveFrames++
          state.reviveProgress = Math.min(1, record.reviveFrames / REVIVE_FRAMES)
          if (record.reviveFrames >= REVIVE_FRAMES) {
            revive(target.character)
            rescues++
            state.downedPlayers = []
            resetRevive(record)
          }
        } else resetRevive(record)
      } else resetRevive(record)

      // Let the last hit land before the story panel opens; a fallen friend still needs help.
      if (!state.enemiesRemaining && !state.downedPlayers.length) record.clearFrames++
      else record.clearFrames = 0
      if (record.clearFrames >= Math.round(FPS / 2)) {
        saveProgress(checkpoint === 1)
        setPhase(checkpoint === 0 ? 'interlude' : 'complete')
        return
      }
      notify(false)
    }

    function abandonLoading(record) {
      const match = record.match
      restore(record)
      match.destroyed = true
      // The loader is asynchronous and cannot be cancelled. Its callbacks must not
      // create another timer or draw stale objects over a later match.
      ;['create_background', 'create_effects', 'create_characters', 'drop_weapons', 'create_timer'].forEach(function (key) {
        match[key] = function () {}
      })
      if (typeof match.for_all === 'function') match.for_all('destroy')
      if (match.background) match.background.destroy()
      ;(match.panel || []).forEach(function (panel) {
        ;['hp', 'hp_bound', 'mp', 'mp_bound', 'spic'].forEach(function (key) { if (panel[key]) panel[key].remove() })
      })
      if (manager.activeMatch === match) manager.activeMatch = null
    }

    function release(record, destroy) {
      if (!record) return
      if (current === record) current = null
      resetInput(record)
      if (!record.match.time) {
        abandonLoading(record)
        return
      }
      restore(record)
      if (destroy && !record.match.destroyed) record.match.destroy()
    }

    function beginStage() {
      const stage = encounter(checkpoint)
      const players = configuration.players.map(function (player) {
        return Object.assign({}, player, { use: true, type: 'human', team: 1 })
      })
      for (let i = 0; i < stage.enemies; i++) {
        const monster = stage.monsters[i]
        players.push({ use: true, type: 'computer', name: monster.name + ' ' + (i + 1), selected: monster.index, selected_AI: 0, team: 2 })
      }
      state = initialState('loading')
      notify(true)
      const match = manager.start_match({ players: players, options: Object.assign({}, configuration.options, { background: stage.background }) })
      const record = current = {
        match: match, initialized: false, humanCount: configuration.players.length,
        total: players.length, humans: [], enemies: [], restores: [],
        reviveFrames: 0, reviveTarget: null, reviveHelper: null, clearFrames: 0
      }
      wrap(record, match, 'check_gameover', function () { return function () { update(record) } })
      wrap(record, match, 'frame', function (original) {
        return function () {
          if (record !== current || this.destroyed) return
          initialize(record)
          if (record.initialized) {
            record.humans.concat(record.enemies).forEach(function (entry) {
              if (entry.character.health.hp <= 0) entry.character.health.hp = -1
            })
          }
          const result = original.apply(this, arguments)
          if (record === current && this.time) {
            state.paused = Boolean(this.time.paused)
            notify(false)
          }
          return result
        }
      })
      wrap(record, match, 'destroy', function (original) {
        return function () {
          if (record === current) {
            resetInput(record)
            current = null
            if (!this.time) abandonLoading(record)
            else restore(record)
            state = initialState('idle')
            notify(true)
          }
          if (!this.destroyed) return original.apply(this, arguments)
        }
      })
      ;(match.control && match.control.child || []).forEach(function (listener) {
        if (typeof listener.key !== 'function') return
        wrap(record, listener, 'key', function (original) {
          return function (key, down) {
            if (record === current && (!match.time || state.phase !== 'battle')) {
              if ((key === 'esc' || key === 'F4') && down) {
                match.destroy()
                manager.match_end()
              }
              return
            }
            return original.apply(this, arguments)
          }
        })
      })
      initialize(record)
      return match
    }

    function start(config, requestedCheckpoint) {
      if (!config || !Array.isArray(config.players)) throw new Error('章节需要一至两位玩家。')
      const humans = config.players.filter(function (player) { return player.use !== false && player.type === 'human' })
      if (humans.length < 1 || humans.length > 2) throw new Error('章节需要一至两位玩家。')
      if (encounter(0).monsters.some(function (monster) { return !Number.isInteger(monster.index) || monster.index < 0 })) throw new Error('纸卷怪资源尚未准备好。')
      release(current, true)
      configuration = { players: copy(humans), options: copy(config.options || {}) }
      checkpoint = requestedCheckpoint === 1 ? 1 : 0
      elapsedFrames = 0
      rescues = 0
      saved = readSave()
      return beginStage()
    }

    function advance() {
      if (!current || state.phase !== 'interlude') return null
      release(current, true)
      checkpoint = 1
      return beginStage()
    }

    function retry() {
      if (!current || state.phase !== 'failed') return null
      release(current, true)
      return beginStage()
    }

    function stop() {
      release(current, false)
      state = initialState('idle')
      notify(true)
    }

    return {
      start: start, advance: advance, retry: retry, stop: stop,
      getEncounter: function (index) { return copy(encounter(index)) },
      getState: function () { return copy(state) },
      getSavedProgress: function () { saved = readSave(); return copy(saved) }
    }
  }
})
