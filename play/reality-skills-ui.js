/* Campus combo guide. Only the native LF2 input detector performs combat. */
define(function () {
  'use strict'

  return function attachSkillsUI(api, pack, runtime) {
    if (api.skillsUI) return api.skillsUI
    const manager = api.manager
    const root = document.querySelector('.LFroot')
    const frame = root.querySelector('.urban-frame')
    const heroes = api.heroes || pack.reality.heroes
    let player = 0
    let heroId = heroes[0].id
    let opened = false
    let pausedMatch = null
    let priorPaused = false
    let returnFocus = null
    let swallowEscapeUp = false
    let traySignature = ''
    let layoutSignature = ''
    let panelSignature = ''
    const rows = []

    function el(tag, className, text) {
      const node = document.createElement(tag)
      if (className) node.className = className
      if (text !== undefined) node.textContent = text
      return node
    }
    function button(text, className, action) {
      const node = el('button', className, text)
      node.type = 'button'
      node.addEventListener('click', action)
      return node
    }
    function keyLabel(value) {
      const key = String(value || '')
      return { up: '↑', down: '↓', left: '←', right: '→', space: '空格', esc: 'Esc', escape: 'Esc' }[key.toLowerCase()] || key.toUpperCase()
    }
    function getConfig(index) {
      const bindings = manager.getControlBindings ? manager.getControlBindings() : []
      return bindings[index] && bindings[index].config || (index === 0
        ? { up: 'w', left: 'a', down: 's', right: 'd', att: 'f', jump: 'g', def: 'h' }
        : { up: 'up', left: 'left', down: 'down', right: 'right', att: 'j', jump: 'k', def: 'l' })
    }
    function getPlayer(index) {
      const state = runtime.getPlayerSkills(index) || {}
      const selected = api.draft.selected[index]
      state.hero = state.hero || heroes.find(function (hero) { return hero.index === selected }) || heroes[0]
      state.skills = state.skills || runtime.getSkills(state.hero.id) || []
      return state
    }
    function displayCombo(skill, config) {
      const result = runtime.comboKeys ? runtime.comboKeys(skill, config) : (skill.sequence || []).map(function (action) {
        return action === 'forward' ? keyLabel(config.left) + ' / ' + keyLabel(config.right) : keyLabel(config[action])
      })
      return Array.isArray(result) ? result : [String(result || '')]
    }
    function setPause(match, value) {
      if (!match || match.destroyed || !match.time) return
      const changed = match.time.paused !== value
      match.time.paused = value
      if (changed && match.control && typeof match.control.paused === 'function') match.control.paused(Boolean(value))
      if (manager.overlay_mess && !value) manager.overlay_mess.hide()
      if (api.hud && api.hud.refresh) api.hud.refresh()
    }
    function releaseInputs(match) {
      if (!match || !match.character) return
      Object.values(match.character).forEach(function (character) {
        const con = character.con
        if (!con || con.type === 'AIcontroller') return
        if (con.flush) con.flush()
        if (con.state) Object.keys(con.state).forEach(function (action) {
          con.state[action] = 0
          if (con.child) con.child.forEach(function (listener) { if (listener.key) listener.key(action, 0) })
        })
        if (con.clear_states) con.clear_states()
      })
    }

    const dialog = el('dialog', 'reality-skills-dialog')
    dialog.setAttribute('aria-labelledby', 'reality-skills-title')
    const head = el('header', 'reality-skills-head')
    const heading = el('div')
    heading.appendChild(el('span', 'reality-skills-kicker', '每一种本领，都能派上用场。'))
    const title = el('h2', '', '全技能出招表')
    title.id = 'reality-skills-title'
    heading.appendChild(title)
    const closeButton = button('关闭 Esc', 'reality-skills-close', close)
    head.appendChild(heading)
    head.appendChild(closeButton)
    dialog.appendChild(head)
    const players = el('div', 'reality-skills-players')
    players.setAttribute('aria-label', '查看玩家键位')
    const playerButtons = [0, 1].map(function (index) {
      const node = button('P' + (index + 1), 'reality-skills-player', function () {
        player = index
        heroId = getPlayer(index).hero.id
        renderPanel(true)
      })
      players.appendChild(node)
      return node
    })
    dialog.appendChild(players)
    const heroTabs = el('div', 'reality-skills-heroes')
    heroTabs.style.setProperty('--reality-hero-columns', Math.min(6, heroes.length))
    heroTabs.style.setProperty('--reality-hero-mobile-columns', Math.min(3, heroes.length))
    heroTabs.setAttribute('aria-label', '查看伙伴技能')
    const tabButtons = heroes.map(function (hero) {
      const node = button(hero.name, 'reality-skills-hero', function () { heroId = hero.id; renderPanel(true) })
      const portrait = el('img')
      portrait.alt = ''
      portrait.src = hero.portrait
      node.prepend(portrait)
      heroTabs.appendChild(node)
      return node
    })
    dialog.appendChild(heroTabs)
    const context = el('p', 'reality-skills-context')
    dialog.appendChild(context)
    const body = el('div', 'reality-skills-body')
    const skillList = el('div', 'reality-skills-list')
    const heroNotes = el('section', 'reality-skills-notes')
    const basic = el('section', 'reality-skills-basics')
    basic.appendChild(el('h3', '', '所有伙伴共用的本领'))
    const basicText = el('div', 'reality-skills-basic-text')
    basic.appendChild(basicText)
    body.appendChild(skillList)
    body.appendChild(heroNotes)
    body.appendChild(basic)
    dialog.appendChild(body)
    const foot = el('footer', 'reality-skills-foot')
    const pauseHint = el('span')
    foot.appendChild(pauseHint)
    foot.appendChild(el('span', '', '连续依次按下，不必同时按 · 前方：左右二选一 · MP 不足时无法施放'))
    dialog.appendChild(foot)
    frame.appendChild(dialog)
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close() })
    dialog.addEventListener('click', function (event) { if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    } })

    const homeEntry = button('全技能出招表', 'urban-text-button reality-skills-home-entry', function () { open(homeEntry) })
    const homeActions = root.querySelector('.urban-home-actions')
    if (homeActions) homeActions.insertBefore(homeEntry, homeActions.querySelector('.urban-text-button'))
    const lobbyEntry = button('全技能出招表', 'urban-back reality-skills-lobby-entry', function () { open(lobbyEntry) })
    const lobbyActions = root.querySelector('.urban-lobby-back')
    if (lobbyActions) lobbyActions.prepend(lobbyEntry)
    const hudEntry = button('技能', 'urban-hud-button reality-skills-hud-entry', function () { open(hudEntry) })
    const hudActions = root.querySelector('.urban-hud-actions')
    if (hudActions) hudActions.prepend(hudEntry)

    const tray = el('section', 'reality-skills-tray')
    tray.hidden = true
    tray.setAttribute('aria-label', '双人组合键出招提示')
    const trayTop = el('div', 'reality-skills-tray-heading')
    trayTop.appendChild(el('span', '', '组合键出招 · 连续依次按，不必同时按'))
    trayTop.appendChild(button('查看完整出招表', 'reality-skills-tray-guide', function () { open(this) }))
    tray.appendChild(trayTop)
    const trayRows = el('div', 'reality-skills-tray-rows')
    tray.appendChild(trayRows)
    const notice = el('div', 'reality-skills-feedback')
    notice.textContent = '前方：按左 / 右决定出招方向，无需先转身。完整出招表可查看派生技。'
    tray.appendChild(notice)
    root.appendChild(tray)

    function renderPanel(force) {
      const chosenPlayer = getPlayer(player)
      const selectedHero = heroes.find(function (hero) { return hero.id === heroId }) || heroes[0]
      const config = getConfig(player)
      const list = runtime.getSkills(selectedHero.id) || []
      const signature = JSON.stringify([player, heroId, api.draft.humans, chosenPlayer.hero.id, config, Boolean(pausedMatch), priorPaused])
      playerButtons.forEach(function (node, index) {
        node.textContent = 'P' + (index + 1) + ' · ' + getPlayer(index).hero.name
        node.classList.toggle('is-current', player === index)
        node.setAttribute('aria-pressed', String(player === index))
        node.hidden = index >= api.draft.humans
      })
      tabButtons.forEach(function (node, index) {
        const active = heroes[index].id === heroId
        node.classList.toggle('is-current', active)
        node.setAttribute('aria-pressed', String(active))
      })
      if (!force && signature === panelSignature) return
      panelSignature = signature
      context.textContent = selectedHero.name + ' · ' + list.length + ' 招 ｜ 按 P' + (player + 1) + ' 当前键位显示' + (chosenPlayer.hero.id !== selectedHero.id ? '；切换到此伙伴后可使用' : '')
      skillList.replaceChildren()
      list.forEach(function (skill) {
        const item = el('article', 'reality-skill-card')
        item.dataset.skill = skill.id
        const titleRow = el('div', 'reality-skill-card-head')
        titleRow.appendChild(el('h3', '', skill.name))
        titleRow.appendChild(el('span', 'reality-skill-mp', String(skill.mp) + ' MP'))
        item.appendChild(titleRow)
        item.appendChild(el('p', 'reality-skill-description', skill.description || ''))
        const keyRow = el('div', 'reality-skill-inputs')
        const combo = el('div', 'reality-skill-combo')
        combo.appendChild(el('span', '', '依次按'))
        displayCombo(skill, config).forEach(function (key, keyIndex) {
          if (keyIndex) combo.appendChild(el('span', 'reality-skill-then', '›'))
          combo.appendChild(el('kbd', '', keyLabel(key)))
        })
        keyRow.appendChild(combo)
        item.appendChild(keyRow)
        const continuation = skill.followup ? String(skill.followup).replace(/\{(att|jump|def|up|down|left|right)\}/g, function (token, action) { return keyLabel(config[action]) }) : ''
        if (continuation) item.appendChild(el('p', 'reality-skill-followup', continuation))
        skillList.appendChild(item)
      })
      heroNotes.replaceChildren()
      const notes = runtime.getNotes ? runtime.getNotes(selectedHero.id) || [] : []
      heroNotes.hidden = !notes.length
      if (notes.length) heroNotes.appendChild(el('h3', '', selectedHero.name + '的进阶技巧'))
      notes.forEach(function (note) {
        heroNotes.appendChild(el('p', '', String(note).replace(/\{(att|jump|def|up|down|left|right)\}/g, function (token, action) { return keyLabel(config[action]) })))
      })
      basicText.replaceChildren()
      const basics = [
        ['连续依次按', '走动时先松开方向，再重新输入完整组合；按住同一个键不算新的按键输入。'],
        [keyLabel(config.left) + ' × 2 / ' + keyLabel(config.right) + ' × 2', '双击左右方向进入跑步；跑动中按攻击或跳跃衔接动作。'],
        [keyLabel(config.jump) + ' › ' + keyLabel(config.att), '跳跃后攻击；防御键 ' + keyLabel(config.def) + ' 用于格挡。'],
        [keyLabel(config.att), '靠近地上的道具攻击即可拾取，持物时攻击使用；跑动或空中攻击可投掷。'],
        [keyLabel(config.left) + ' / ' + keyLabel(config.right), '“前方”左右二选一；向左出招按 ' + keyLabel(config.left) + '，向右出招按 ' + keyLabel(config.right) + '，无需先转身。']
      ]
      basics.forEach(function (info) {
        const line = el('p')
        line.appendChild(el('b', '', info[0]))
        line.appendChild(el('span', '', info[1]))
        basicText.appendChild(line)
      })
      const skillCount = heroes.reduce(function (total, hero) { return total + runtime.getSkills(hero.id).length }, 0)
      pauseHint.textContent = pausedMatch ? (priorPaused ? '对战原本已暂停，关闭后仍暂停。' : '查阅时自动暂停，关闭后继续对战。') : heroes.length + ' 位夥伴的 ' + skillCount + ' 項技能均已開放。'
    }

    function open(trigger) {
      if (opened) return
      player = Math.min(api.draft.slot || 0, api.draft.humans - 1)
      heroId = getPlayer(player).hero.id
      returnFocus = trigger && trigger.focus ? trigger : document.activeElement
      pausedMatch = manager.active_UI === 'gameplay' ? manager.activeMatch : null
      priorPaused = pausedMatch && pausedMatch.time ? pausedMatch.time.paused : false
      if (pausedMatch) { releaseInputs(pausedMatch); setPause(pausedMatch, true) }
      opened = true
      renderPanel(true)
      dialog.showModal()
      closeButton.focus()
    }
    function close() {
      if (!opened) return
      opened = false
      dialog.close()
      if (pausedMatch && pausedMatch === manager.activeMatch && !pausedMatch.destroyed) setPause(pausedMatch, priorPaused)
      pausedMatch = null
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true })
      returnFocus = null
    }
    function isolateInput(event) {
      if (event.type === 'keyup' && event.key === 'Escape' && swallowEscapeUp) {
        swallowEscapeUp = false
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (!opened) return
      event.stopImmediatePropagation()
      if (event.key === 'Escape') {
        event.preventDefault()
        if (event.type === 'keydown' && !event.repeat) { swallowEscapeUp = true; close() }
      }
    }
    window.addEventListener('keydown', isolateInput, true)
    window.addEventListener('keyup', isolateInput, true)

    function layout() {
      const playing = manager.active_UI === 'gameplay' && Boolean(manager.activeMatch)
      const maxSkills = Math.max.apply(null, [0, 1].slice(0, api.draft.humans).map(function (index) { return getPlayer(index).skills.length }))
      const expanded = playing && innerHeight >= 700 && innerWidth >= (maxSkills > 5 ? 920 : 720)
      const signature = [playing, expanded, innerWidth, innerHeight].join(':')
      if (signature !== layoutSignature) {
        layoutSignature = signature
        root.classList.toggle('reality-skills-expanded', expanded)
        const reserved = expanded ? 112 : 0
        const scale = Math.max(0.25, Math.min((innerWidth - 28) / 794, (innerHeight - 56 - reserved) / 550, 1.85))
        root.style.setProperty('--urban-scale', scale)
      }
      tray.hidden = !expanded
      if (expanded) {
        const bounds = frame.getBoundingClientRect()
        tray.style.left = bounds.left + 'px'
        tray.style.top = (bounds.bottom + 9) + 'px'
        tray.style.width = bounds.width + 'px'
      }
    }

    function rebuildTray(states) {
      rows.length = 0
      trayRows.replaceChildren()
      states.forEach(function (state, index) {
        const row = el('div', 'reality-skills-row')
        row.dataset.player = index
        const name = el('strong', 'reality-skills-row-player', 'P' + (index + 1) + ' · ' + state.hero.name)
        row.appendChild(name)
        const labels = state.skills.map(function (skill) {
          const node = el('div', 'reality-skill-hint')
          node.dataset.skill = skill.id
          const name = el('div', 'reality-skill-hint-head')
          name.appendChild(el('span', 'reality-skill-hint-name', skill.name))
          name.appendChild(el('small', 'reality-skill-hint-mp', String(skill.mp) + ' MP'))
          node.appendChild(name)
          node.appendChild(el('div', 'reality-skill-hint-combo'))
          row.appendChild(node)
          return node
        })
        rows.push({ row: row, labels: labels })
        trayRows.appendChild(row)
      })
    }
    function refresh() {
      layout()
      if (opened) renderPanel(false)
      if (tray.hidden) return
      const states = [0, 1].slice(0, api.draft.humans).map(getPlayer)
      const signature = states.map(function (state) { return state.hero.id + ':' + state.skills.map(function (skill) { return skill.id }).join(',') }).join('|')
      if (signature !== traySignature) { traySignature = signature; rebuildTray(states) }
      states.forEach(function (state, playerIndex) {
        state.skills.forEach(function (skill, skillIndex) {
          const node = rows[playerIndex].labels[skillIndex]
          const keys = skill.comboKeys || displayCombo(skill, getConfig(playerIndex))
          const text = keys.join(' › ')
          const combo = node.querySelector('.reality-skill-hint-combo')
          if (combo.dataset.keys !== text) {
            combo.dataset.keys = text
            combo.replaceChildren()
            keys.forEach(function (key, keyIndex) {
              if (keyIndex) combo.appendChild(el('span', 'reality-skill-then', '›'))
              combo.appendChild(el('kbd', '', keyLabel(key)))
            })
          }
          node.classList.toggle('is-unavailable', !skill.enabled)
          node.title = skill.name + ' · 依次按 ' + text + ' · ' + skill.mp + ' MP' + (skill.disabledReason ? ' · ' + skill.disabledReason : '')
          node.setAttribute('aria-label', node.title)
        })
      })
    }
    const publicAPI = { open: open, close: close, isOpen: function () { return opened }, refresh: refresh }
    api.skillsUI = publicAPI
    window.addEventListener('resize', function () { layoutSignature = ''; layout() })
    window.addEventListener('lf2:controls-changed', function () { panelSignature = ''; refresh() })
    setInterval(refresh, 100)
    refresh()
    return publicAPI
  }
})
