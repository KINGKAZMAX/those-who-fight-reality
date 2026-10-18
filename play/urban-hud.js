/* A lightweight DOM presentation layer; the original match remains authoritative. */
define(['LF/global', 'LF/sprite-select'], function (Global, Sprite) {
  'use strict'

  function element(tag, className, text) {
    const node = document.createElement(tag)
    node.className = className || ''
    if (text !== undefined) node.textContent = text
    return node
  }

  function setText(node, value) {
    const text = String(value)
    if (node.textContent !== text) node.textContent = text
  }

  function displayNumber(value) {
    return Number.isFinite(Number(value)) ? String(Math.max(0, Math.ceil(Number(value)))) : '—'
  }

  function ratio(value, full) {
    return full > 0 ? Math.max(0, Math.min(1, value / full)) : 0
  }

  function clock(frames) {
    const seconds = Math.max(0, Math.floor((frames || 0) / Global.gameplay.framerate))
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
  }

  return function attachHud(manager, pack) {
    if (manager.urbanHud) return manager.urbanHud
    const gameplay = manager.gameplay || document.querySelector('.LFroot .gameplay')
    if (!gameplay) return { getMatch: function () { return null }, refresh: function () {} }

    let activeMatch = null
    let cards = []
    let rosterKey = ''
    let resultVisible = false
    let resultDuration = ''
    let lastKeys = ''
    gameplay.classList.add('urban-hud-enabled')

    const hud = element('section', 'urban-hud')
    hud.setAttribute('aria-label', '對戰狀態')
    hud.hidden = true
    const topline = element('div', 'urban-hud-topline')
    const identity = element('div', 'urban-hud-identity')
    identity.appendChild(element('b', 'urban-hud-mark', 'R /'))
    identity.appendChild(element('span', 'urban-hud-mode', '前程市 · 持續登入中'))
    const timing = element('div', 'urban-hud-timing')
    const status = element('span', 'urban-hud-state', '準備中')
    const timer = element('time', 'urban-hud-clock', '00:00')
    timing.appendChild(status)
    timing.appendChild(timer)
    const actions = element('div', 'urban-hud-actions')
    const pauseButton = element('button', 'urban-hud-button urban-hud-pause-button', 'Ⅱ 暫停')
    const backButton = element('button', 'urban-hud-button', '退出 Esc')
    pauseButton.type = backButton.type = 'button'
    pauseButton.setAttribute('aria-label', '暫停或繼續對戰，快捷鍵 P')
    actions.appendChild(pauseButton)
    actions.appendChild(backButton)
    topline.appendChild(identity)
    topline.appendChild(timing)
    topline.appendChild(actions)
    const roster = element('div', 'urban-hud-roster')
    hud.appendChild(topline)
    hud.appendChild(roster)
    gameplay.appendChild(hud)

    const footer = element('div', 'urban-hud-footer')
    footer.hidden = true
    const keytips = element('div', 'urban-hud-keytips')
    const fps = element('span', 'urban-hud-fps', '')
    footer.appendChild(keytips)
    footer.appendChild(fps)
    gameplay.appendChild(footer)

    const pauseNotice = element('div', 'urban-hud-pause-notice')
    pauseNotice.hidden = true
    pauseNotice.appendChild(element('span', 'urban-hud-pause-kicker', 'TAKE YOUR TIME'))
    pauseNotice.appendChild(element('strong', '', '歇一會兒'))
    pauseNotice.appendChild(element('span', '', '按 P 或點擊「繼續」返回對戰'))
    gameplay.appendChild(pauseNotice)

    function isReady(match) {
      return Boolean(match && !match.destroyed && match.time && match.background && match.character)
    }

    function canPause(match) {
      if (!isReady(match) || !match.control) return false
      const control = match.control
      return Boolean((typeof control.key === 'function' && control.keycode && control.keycode.F1 !== undefined) ||
        (control.type === 'touch' && control.child && control.child.some(function (child) { return typeof child.key === 'function' })))
    }

    function sendControl(match, key) {
      const control = match.control
      if (!control) return false
      if (typeof control.key === 'function' && control.keycode && control.keycode[key] !== undefined) {
        control.key(control.keycode[key], 1)
        control.key(control.keycode[key], 0)
        return true
      }
      // Touchcontroller.fetch dispatches named keys to these same child handlers.
      if (control.type === 'touch' && control.child) {
        const listeners = control.child.slice().filter(function (child) { return typeof child.key === 'function' })
        listeners.forEach(function (child) { child.key(key, true) })
        listeners.forEach(function (child) { child.key(key, false) })
        return listeners.length > 0
      }
      return false
    }

    function bindAction(button, action) {
      let lastTouch = 0
      button.addEventListener('pointerup', function (event) {
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
        if (button.disabled) return
        // The original touch controller suppresses synthetic click events during play.
        lastTouch = Date.now()
        event.preventDefault()
        action()
      })
      button.addEventListener('click', function () {
        if (!button.disabled && Date.now() - lastTouch > 600) action()
      })
    }

    function leaveMatch() {
      const match = activeMatch
      if (!isReady(match)) return
      if (match.control && match.control.type === 'touch' && sendControl(match, 'F4')) return
      match.destroy()
      manager.match_end()
    }

    bindAction(pauseButton, function () {
      const match = activeMatch
      if (!canPause(match)) return
      sendControl(match, 'F1')
      pauseButton.blur()
    })
    bindAction(backButton, leaveMatch)

    function resetHud() {
      hud.hidden = footer.hidden = pauseNotice.hidden = true
      resultVisible = false
      resultDuration = ''
      cards = []
      rosterKey = ''
      lastKeys = ''
      roster.replaceChildren()
    }

    const originalStart = manager.start_match
    manager.start_match = function () {
      resetHud()
      const match = originalStart.apply(this, arguments)
      activeMatch = this.activeMatch = match
      if (match && typeof match.destroy === 'function') {
        const destroy = match.destroy
        match.destroy = function () {
          if (this.destroyed) return
          const result = destroy.apply(this, arguments)
          if (activeMatch === this) {
            activeMatch = null
            manager.activeMatch = null
            resetHud()
          }
          return result
        }
      }
      refresh()
      return match
    }

    function playerList(match) {
      return (match.panel || []).reduce(function (list, panel, index) {
        const character = panel && panel.uid !== undefined && match.character && match.character[panel.uid]
        if (character && character.health) list.push({ panel: panel, character: character, index: index })
        return list
      }, []).slice(0, 8)
    }

    function createCard(entry) {
      const character = entry.character
      const card = element('article', 'urban-hud-player')
      const portrait = element('img', 'urban-hud-portrait')
      portrait.alt = ''
      portrait.draggable = false
      const hero = pack.reality && pack.reality.heroes.find(function (entry) { return entry.id === character.id })
      const source = hero && hero.portrait || character.data && character.data.bmp && character.data.bmp.small
      if (source) portrait.src = /^(data:|blob:|https?:|\/)/.test(source) ? source : Sprite.resolve_resource(source)
      const content = element('div', 'urban-hud-player-content')
      const nameRow = element('div', 'urban-hud-name-row')
      const name = hero && hero.name || character.data && character.data.bmp && character.data.bmp.name
      const human = character.con && character.con.type !== 'AIcontroller'
      card.dataset.controller = human ? 'human' : 'computer'
      card.dataset.team = String(character.team)
      const slot = element('span', 'urban-hud-slot', human ? 'P' + (entry.index + 1) : '怪')
      const label = element('strong', 'urban-hud-player-name', name || entry.panel.name || '角色 ' + (entry.index + 1))
      label.title = (entry.panel.name || '') + (name ? ' · ' + name : '')
      const hpValue = element('span', 'urban-hud-value')
      nameRow.appendChild(slot)
      nameRow.appendChild(label)
      nameRow.appendChild(hpValue)
      const hp = element('div', 'urban-hud-meter urban-hud-hp')
      hp.setAttribute('role', 'meter')
      hp.setAttribute('aria-label', label.textContent + ' 生命值')
      const hpBound = element('span', 'urban-hud-hp-bound')
      const hpFill = element('span', 'urban-hud-hp-fill')
      hp.appendChild(hpBound)
      hp.appendChild(hpFill)
      const mpRow = element('div', 'urban-hud-mp-row')
      mpRow.appendChild(element('span', 'urban-hud-mp-label', 'MP'))
      const mp = element('div', 'urban-hud-meter urban-hud-mp')
      mp.setAttribute('role', 'meter')
      mp.setAttribute('aria-label', label.textContent + ' 能量值')
      const mpFill = element('span', 'urban-hud-mp-fill')
      mp.appendChild(mpFill)
      const mpValue = element('span', 'urban-hud-mp-value')
      mpRow.appendChild(mp)
      mpRow.appendChild(mpValue)
      content.appendChild(nameRow)
      content.appendChild(hp)
      content.appendChild(mpRow)
      card.appendChild(portrait)
      card.appendChild(content)
      roster.appendChild(card)
      return { card: card, hp: hp, hpFill: hpFill, hpBound: hpBound, hpValue: hpValue, mp: mp, mpFill: mpFill, mpValue: mpValue, lastHealth: '' }
    }

    function pauseKey() { return manager.getControlShortcuts ? manager.getControlShortcuts().pause : 'P' }

    function updateKeys(players) {
      const humans = players.filter(function (entry) { return entry.character.con && entry.character.con.type !== 'AIcontroller' }).slice(0, 2)
      const keyNames = { up: '↑', down: '↓', left: '←', right: '→', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', control: 'CTRL', controlleft: 'CTRL', controlright: 'CTRL', shiftleft: 'SHIFT', shiftright: 'SHIFT', space: 'SPACE', ' ': 'SPACE', escape: 'ESC' }
      function keyLabel(value) {
        if (value === undefined || value === null || value === '') return ''
        const key = String(value)
        return keyNames[key.toLowerCase()] || key.toUpperCase()
      }
      const configured = manager.getControlBindings ? manager.getControlBindings() : []
      const groups = humans.map(function (entry, index) {
        const controller = entry.character.con
        const config = controller.config || configured[index] && configured[index].config
        const touch = controller.type === 'touch' || (config && config.layout === 'gamepad')
        if (touch) return ['P' + (index + 1), '觸控移動與攻擊']
        if (!config) return ['P' + (index + 1), '鍵位請見設定']
        return ['P' + (index + 1), [config.up, config.left, config.down, config.right].map(keyLabel).join(' ') + ' 移動  ·  ' + keyLabel(config.att) + ' 攻擊  ' + keyLabel(config.jump) + ' 跳躍  ' + keyLabel(config.def) + ' 防禦']
      })
      if (!groups.length) groups.push(['DEMO', '自動演示'])
      groups.push([pauseKey() + ' / ESC', '暫停 / 退出'])
      const signature = JSON.stringify(groups)
      if (signature === lastKeys && keytips.childNodes.length) return
      lastKeys = signature
      keytips.replaceChildren()
      groups.forEach(function (group, index) {
        const tip = element('span', 'urban-hud-keytip' + (index === groups.length - 1 ? ' urban-hud-system-keys' : ''))
        tip.title = group[0] + ' · ' + group[1]
        tip.appendChild(element('kbd', '', group[0]))
        tip.appendChild(element('span', '', group[1]))
        keytips.appendChild(tip)
      })
    }

    function refresh() {
      const match = activeMatch
      const playing = Boolean(match && !match.destroyed && manager.active_UI === 'gameplay')
      hud.hidden = footer.hidden = !playing
      if (!playing) {
        pauseNotice.hidden = true
        return
      }
      if (manager.panel_layer) manager.panel_layer.set_alpha(0)
      const ready = isReady(match)
      pauseButton.disabled = !canPause(match) || resultVisible
      backButton.disabled = !ready
      const paused = ready && Boolean(match.time.paused)
      setText(status, !ready ? '正在集合' : resultVisible ? '對戰結束' : paused ? '已暫停' : '對戰進行中')
      status.classList.toggle('urban-hud-state-paused', paused)
      setText(timer, resultVisible && resultDuration ? resultDuration : clock(match.time && match.time.t))
      setText(pauseButton, paused ? '▶ 繼續' : 'Ⅱ 暫停')
      pauseButton.setAttribute('aria-pressed', String(paused))
      const touch = match.control && match.control.type === 'touch'
      pauseButton.setAttribute('aria-label', touch ? '暫停或繼續對戰' : '暫停或繼續對戰，快捷鍵 ' + pauseKey())
      setText(pauseNotice.lastChild, touch ? '點擊上方「繼續」返回對戰' : '按 ' + pauseKey() + ' 或點擊「繼續」返回對戰')
      pauseNotice.hidden = !paused || resultVisible
      const players = playerList(match)
      const key = players.map(function (entry) { return entry.panel.uid + ':' + entry.character.id }).join('|')
      if (key !== rosterKey) {
        rosterKey = key
        roster.replaceChildren()
        cards = players.map(createCard)
        roster.dataset.count = String(players.length)
      }
      players.forEach(function (entry, index) {
        const health = entry.character.health
        const card = cards[index]
        const healthKey = [health.hp, health.hp_full, health.hp_bound, health.mp, health.mp_full].join('|')
        if (card.lastHealth === healthKey) return
        card.lastHealth = healthKey
        card.card.classList.toggle('urban-hud-player-out', health.hp <= 0)
        setText(card.hpValue, displayNumber(health.hp) + ' / ' + displayNumber(health.hp_full))
        setText(card.mpValue, displayNumber(health.mp))
        card.hpFill.style.transform = 'scaleX(' + ratio(health.hp, health.hp_full) + ')'
        card.hpBound.style.transform = 'scaleX(' + ratio(health.hp_bound, health.hp_full) + ')'
        card.mpFill.style.transform = 'scaleX(' + ratio(health.mp, health.mp_full) + ')'
        card.hp.setAttribute('aria-valuemin', '0')
        card.hp.setAttribute('aria-valuemax', displayNumber(health.hp_full))
        card.hp.setAttribute('aria-valuenow', displayNumber(health.hp))
        card.mp.setAttribute('aria-valuemin', '0')
        card.mp.setAttribute('aria-valuemax', displayNumber(health.mp_full))
        card.mp.setAttribute('aria-valuenow', displayNumber(health.mp))
      })
      updateKeys(players)
      const originalFps = gameplay.querySelector('.fps')
      if (originalFps) setText(fps, String(originalFps.value).replace(/fps/i, ' FPS'))
      attachSummary()
    }

    function attachSummary() {
      const summary = manager.summary
      if (!summary || summary.urbanHudAttached) return
      summary.urbanHudAttached = true
      const host = gameplay.querySelector('.summary_dialog')
      if (!host) return
      host.classList.add('urban-hud-summary')
      host.setAttribute('role', 'dialog')
      host.setAttribute('aria-label', '本場對戰結算')
      const result = element('section', 'urban-hud-results')
      const resultHeader = element('header', 'urban-hud-results-header')
      const titles = element('div', '')
      titles.appendChild(element('span', 'urban-hud-results-kicker', 'STILL LOGGED IN'))
      titles.appendChild(element('h2', '', '這一程，記住了。'))
      const duration = element('div', 'urban-hud-result-duration')
      duration.appendChild(element('span', '', '對戰用時'))
      const resultTime = element('strong', '', '00:00')
      duration.appendChild(resultTime)
      resultHeader.appendChild(titles)
      resultHeader.appendChild(duration)
      const table = element('table', 'urban-hud-result-table')
      const head = element('thead', '')
      const headings = element('tr', '')
      ;['出戰角色', '擊倒', '傷害', '承傷', 'MP 消耗', '拾取', '結果'].forEach(function (name) {
        const heading = element('th', '', name)
        heading.scope = 'col'
        headings.appendChild(heading)
      })
      head.appendChild(headings)
      table.appendChild(head)
      const tbody = element('tbody', '')
      table.appendChild(tbody)
      const resultFooter = element('footer', 'urban-hud-results-footer')
      resultFooter.appendChild(element('span', '', '所有人，持續登入中。'))
      const returnButton = element('button', 'urban-hud-result-return', '再一起出發 ▶')
      returnButton.type = 'button'
      bindAction(returnButton, leaveMatch)
      resultFooter.appendChild(returnButton)
      result.appendChild(resultHeader)
      result.appendChild(table)
      result.appendChild(resultFooter)
      host.appendChild(result)

      const setInfo = summary.set_info
      summary.set_info = function (info) {
        const value = setInfo.apply(this, arguments)
        tbody.replaceChildren()
        info.forEach(function (data, index) {
          const row = element('tr', '')
          const player = element('td', 'urban-hud-result-player')
          const icon = element('img', '')
          icon.alt = ''
          icon.src = /^(data:|blob:|https?:|\/)/.test(data[0]) ? data[0] : Sprite.resolve_resource(data[0])
          player.appendChild(icon)
          const entry = activeMatch && playerList(activeMatch)[index]
          const characterName = entry && entry.character.data.bmp.name
          player.appendChild(element('span', '', characterName || String(data[1])))
          row.appendChild(player)
          for (let i = 2; i <= 6; i++) row.appendChild(element('td', '', String(data[i])))
          const win = String(data[7]).indexOf('Win') !== -1
          const alive = String(data[7]).indexOf('Alive') !== -1
          const outcome = element('td', 'urban-hud-outcome' + (win ? ' urban-hud-outcome-win' : ''), win ? '勝利' : '落敗')
          outcome.appendChild(element('small', '', alive ? '存活' : '倒下'))
          row.appendChild(outcome)
          tbody.appendChild(row)
        })
        return value
      }
      const setTime = summary.set_time
      summary.set_time = function (time) {
        const value = setTime.apply(this, arguments)
        resultDuration = String(time)
        setText(resultTime, time)
        return value
      }
      const show = summary.show
      summary.show = function () {
        const value = show.apply(this, arguments)
        resultVisible = true
        pauseNotice.hidden = true
        return value
      }
      const hide = summary.hide
      summary.hide = function () {
        const value = hide.apply(this, arguments)
        resultVisible = false
        return value
      }
    }

    attachSummary()
    window.setInterval(refresh, 100)
    manager.urbanHud = { getMatch: function () { return activeMatch }, refresh: refresh }
    return manager.urbanHud
  }
})
