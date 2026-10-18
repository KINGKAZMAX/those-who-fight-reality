/* Original campus presentation over the F.LF combat engine. */
define(['LF/util', 'game/urban-hud', 'game/chapter-ui'], function (util, attachHud, attachChapterUI) {
  return function attachUrbanUI(manager, pack) {
    const root = util.root
    const chars = pack.data.object.filter(function (entry) { return entry.type === 'character' })
    const reality = pack.reality || {}
    const fallbackHeroes = [
      { id: 11, name: '小一', role: '書包衝鋒 · 近身', description: '總想跟上大家，也會回身接住同伴。' },
      { id: 2, name: '林夏', role: '紙飛機 · 遠程', description: '留意被忽略的角落，給夥伴留出空間。' },
      { id: 8, name: '周齊', role: '三角尺 · 控制', description: '認真觀察，也學著把求助說出口。' },
      { id: 4, name: '陳野', role: '小發明 · 突襲', description: '總想拆開看看，也願意認真修好。' }
    ]
    const heroes = reality.heroes || fallbackHeroes.map(function (hero) {
      hero.index = chars.findIndex(function (ch) { return ch.id === hero.id })
      hero.portrait = chars[hero.index] && chars[hero.index].pic
      return hero
    }).filter(function (hero) { return hero.index >= 0 })
    const stages = reality.stages || [
      { index: 0, name: '小學 · 不要掉隊', subtitle: '第一章 / 校門口', preview: '/F.LF/game/art/stage-primary.png' },
      { index: 1, name: '初中 · 名次巨像', subtitle: '第二章 / 排名廣場', preview: '/F.LF/game/art/stage-ranking.png' },
      { index: 2, name: '大學 · 前途無量', subtitle: '第四章 / 畢業校門', preview: '/F.LF/game/art/stage-graduation.png' }
    ]
    const paperIndex = chars.findIndex(function (entry) { return entry.id === 30 })
    const fallbackMonster = { id: 30, name: '紙卷怪', index: paperIndex >= 0 ? paperIndex : Math.max(0, reality.enemyIndex || 0) }
    const monsters = (reality.monsters || [fallbackMonster]).map(function (monster) {
      return Object.assign({}, monster, { index: chars.findIndex(function (entry) { return entry.id === monster.id }) })
    }).filter(function (monster) { return monster.index >= 0 })
    if (!monsters.some(function (monster) { return monster.id === 30 })) monsters.unshift(fallbackMonster)
    monsters.sort(function (a, b) { return a.id - b.id })
    const draft = { selected: [heroes[0].index, (heroes[1] || heroes[0]).index], slot: 0, humans: 2, bots: 2, background: 0, formation: 'mixed' }
    const originalSwitch = manager.switch_UI
    const originalKey = manager.key
    let chapterUI

    function el(tag, cls, text) {
      const node = document.createElement(tag)
      if (cls) node.className = cls
      if (text !== undefined) node.textContent = text
      return node
    }
    function asset(path) {
      if (!path) return ''
      if (/^(data:|blob:|https?:|\/)/.test(path)) return path
      return new URL(pack.location + path, window.location.href).href
    }
    function heroAt(index) { return heroes.find(function (hero) { return hero.index === index }) || heroes[0] }
    function picture(index) { return asset(heroAt(index).portrait || chars[index].pic) }
    function button(text, cls, action) {
      const node = el('button', cls, text)
      node.type = 'button'
      node.addEventListener('click', function () { action(); node.blur() })
      return node
    }
    function bindings() {
      if (manager.getControlBindings) return manager.getControlBindings()
      return [
        { player: 0, type: 'keyboard', config: { up: 'w', down: 's', left: 'a', right: 'd', att: 'f', jump: 'g', def: 'h' } },
        { player: 1, type: 'keyboard', config: { up: 'up', down: 'down', left: 'left', right: 'right', att: 'j', jump: 'k', def: 'l' } }
      ]
    }
    function keyLabel(key) {
      const value = String(key || '')
      return { up: '↑', down: '↓', left: '←', right: '→', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', space: '空格', ' ': '空格' }[value.toLowerCase()] || value.toUpperCase()
    }
    function controlLine(binding, index) {
      if (binding.type !== 'keyboard') return 'P' + (index + 1) + ' · 觸控輸入'
      const c = binding.config
      return 'P' + (index + 1) + '  ' + [c.up, c.left, c.down, c.right].map(keyLabel).join(' ') + ' 移動  /  ' + keyLabel(c.att) + ' 攻擊  ' + keyLabel(c.jump) + ' 跳躍  ' + keyLabel(c.def) + ' 防禦'
    }
    function pauseKey() { return manager.getControlShortcuts ? manager.getControlShortcuts().pause : 'P' }
    function cycleHero(slot, direction) {
      const position = heroes.findIndex(function (hero) { return hero.index === draft.selected[slot] })
      draft.selected[slot] = heroes[(position + direction + heroes.length) % heroes.length].index
    }
    function enemyLineup() {
      const selected = monsters.find(function (monster) { return String(monster.id) === draft.formation })
      return Array.from({ length: draft.bots }, function (_, i) { return selected || monsters[i % monsters.length] })
    }

    root.classList.add('urban-theme')
    document.title = '與名為現實的怪物戰鬥的人們 | THOSE WHO FIGHT THE MONSTER CALLED REALITY'
    manager.UI_list.frontpage.demax(true)
    manager.UI_list.frontpage.demax = function () {}
    manager.UI_list.gameplay.allow_wide = false
    const frame = root.querySelector('.container')
    frame.classList.add('urban-frame')
    function fit() {
      const skillsTray = window.realityGame && window.realityGame.skillsUI && manager.active_UI === 'gameplay' && innerHeight >= 700 && innerWidth >= 720
      const scale = Math.max(0.25, Math.min((innerWidth - 28) / 794, (innerHeight - 56 - (skillsTray ? 112 : 0)) / 550, 1.85))
      root.style.setProperty('--urban-scale', scale)
    }
    window.addEventListener('resize', fit)
    fit()
    root.appendChild(el('div', 'urban-ambient', 'THOSE WHO FIGHT THE MONSTER CALLED REALITY'))
    const shellFooter = el('div', 'urban-shell-footer')
    shellFooter.innerHTML = '<span>同屏合作格鬥 · 一台電腦，一起出發。</span><span>STILL HERE. STILL FIGHTING.</span>'
    root.appendChild(shellFooter)

    const home = el('section', 'urban-home')
    home.setAttribute('aria-label', '遊戲主選單')
    home.innerHTML = '<img class="urban-home-scene" src="/F.LF/game/art/stage-primary.png" alt="夕陽下的中式校園，通往成長旅程的第一站">' +
      '<header class="urban-topline"><span class="urban-brandmark" aria-hidden="true">R<span>/</span></span><span class="urban-toplabel">THE FIGHT IS OURS<br><b>前程市 · 放學以後</b></span><span class="urban-online"><i></i> 持續登入中</span></header>' +
      '<div class="urban-home-copy"><span class="urban-eyebrow">一起戰鬥，一起長大。</span><h1 class="reality-wordmark" aria-label="與名為現實的怪物戰鬥的人們"><span class="reality-title-line">與名為現實的</span><span class="reality-title-line">怪物戰鬥的人們</span></h1><div class="reality-title-en" lang="en"><span>THOSE WHO FIGHT THE</span><strong>MONSTER CALLED REALITY</strong></div><p>從小學到畢業，誰也不落下。</p><div class="urban-home-actions"></div></div>' +
      '<div class="urban-home-crew" aria-label="' + heroes.length + ' 位夥伴"></div>' +
      '<div class="urban-home-bottom"><span class="urban-issue">校園合作格鬥 · 線上體驗版</span><span>' + heroes.length + ' 位夥伴<span class="urban-divider">/</span>' + stages.length + ' 處場景<span class="urban-divider">/</span>' + monsters.length + ' 種怪物</span></div>'
    home.querySelector('.urban-home-actions').appendChild(button('開始戰鬥  ▶', 'urban-primary urban-start', function () { if (chapterUI) chapterUI.setMode('free'); manager.start_game() }))
    home.querySelector('.urban-home-actions').appendChild(button('雙人鍵位', 'urban-secondary', function () { manager.switch_UI('settings') }))
    home.querySelector('.urban-home-actions').appendChild(button('關於這段旅程', 'urban-text-button', showCredits))
    heroes.forEach(function (hero) {
      const member = el('div', 'urban-crew-member')
      const image = el('img'); image.src = picture(hero.index); image.alt = ''
      member.appendChild(image); member.appendChild(el('span', '', hero.name))
      home.querySelector('.urban-home-crew').appendChild(member)
    })
    util.div('frontpage_content').appendChild(home)

    const credits = el('section', 'urban-credits')
    credits.hidden = true
    credits.setAttribute('role', 'dialog')
    credits.setAttribute('aria-label', '關於這段旅程')
    credits.innerHTML = '<span class="urban-eyebrow">THOSE WHO FIGHT THE MONSTER CALLED REALITY</span><h2>與名為現實的<br>怪物戰鬥的人們</h2><p>中式荒誕 × 魔幻現實主義<br>從小學到大學畢業的同屏合作格鬥遊戲。</p><p>課本、考試、排名與選擇，成了橫在眼前的怪物。<br>我們一次次倒下，再拉著彼此站起來。</p><p>目前可玩：第一章「不要掉隊」、雙人援護與檢查點；自由對戰含 ' + heroes.length + ' 位夥伴、' + stages.length + ' 處場景、' + monsters.length + ' 種怪物與混合編隊。後續章節仍在製作。</p>'
    credits.appendChild(button('返回主選單', 'urban-primary', function () { credits.hidden = true }))
    home.appendChild(credits)
    function showCredits() { credits.hidden = false }

    const lobby = el('section', 'urban-lobby')
    lobby.setAttribute('aria-label', '角色與合作設定')
    lobby.innerHTML = '<header class="urban-lobby-header"><div><span class="urban-eyebrow">SELECT YOUR PARTNER</span><h2>選擇並肩作戰的人。</h2></div><div class="urban-lobby-back"></div></header>' +
      '<div class="urban-select-content"><aside class="urban-agent-detail"><span class="urban-agent-no"></span><div class="urban-agent-picture"><img alt="目前選擇角色"></div><div class="urban-agent-meta"><h3></h3><span></span><p></p></div></aside><div class="urban-roster-area"><div class="urban-player-tabs"></div><div class="urban-roster" role="group" aria-label="選擇夥伴"></div><div class="urban-match-options"><label>一起上場<select class="urban-humans"><option value="1">單人</option><option value="2" selected>雙人同屏合作</option></select></label><label>怪物數量<select class="urban-bots"></select></label><label>怪物編隊<select class="urban-monsters"></select></label><label>戰鬥場景<select class="urban-stage"></select></label></div><div class="urban-stage-preview"><img alt="目前場地預覽"><span></span></div><p class="urban-lobby-note"></p></div></div>' +
      '<footer class="urban-lobby-footer"><div class="urban-keyguide"></div><div class="urban-launch-wrap"></div></footer>'
    lobby.querySelector('.urban-lobby-back').appendChild(button('修改鍵位', 'urban-back', function () { manager.switch_UI('settings') }))
    lobby.querySelector('.urban-lobby-back').appendChild(button('← 主選單', 'urban-back', function () { manager.switch_UI('frontpage') }))
    const tabs = lobby.querySelector('.urban-player-tabs')
    const p1 = button('P1 / 玩家一', 'urban-slot is-current', function () { draft.slot = 0; renderRoster() })
    const p2 = button('P2 / 玩家二', 'urban-slot', function () { draft.slot = 1; renderRoster() })
    tabs.appendChild(p1); tabs.appendChild(p2)
    heroes.forEach(function (hero, heroPosition) {
      const card = button('', 'urban-fighter', function () { draft.selected[draft.slot] = hero.index; renderRoster() })
      card.dataset.index = hero.index
      card.setAttribute('aria-label', '選擇 ' + hero.name)
      const img = el('img'); img.src = picture(hero.index); img.alt = ''
      card.appendChild(img)
      card.appendChild(el('span', 'urban-fighter-name', hero.name))
      card.appendChild(el('span', 'urban-fighter-tag', String(heroPosition + 1).padStart(2, '0')))
      lobby.querySelector('.urban-roster').appendChild(card)
    })
    for (let i = 1; i <= 6; i++) {
      const option = el('option', '', String(i)); option.value = i
      lobby.querySelector('.urban-bots').appendChild(option)
    }
    lobby.querySelector('.urban-bots').value = draft.bots
    const mixedOption = el('option', '', '混合編隊'); mixedOption.value = 'mixed'
    lobby.querySelector('.urban-monsters').appendChild(mixedOption)
    monsters.forEach(function (monster) {
      const option = el('option', '', monster.name); option.value = String(monster.id)
      lobby.querySelector('.urban-monsters').appendChild(option)
    })
    stages.forEach(function (stage, i) {
      const option = el('option', '', stage.name); option.value = stage.index === undefined ? i : stage.index
      lobby.querySelector('.urban-stage').appendChild(option)
    })
    lobby.querySelector('.urban-humans').addEventListener('change', function (event) { draft.humans = +event.target.value; if (draft.humans === 1) draft.slot = 0; renderRoster() })
    lobby.querySelector('.urban-bots').addEventListener('change', function (event) { draft.bots = +event.target.value; renderRoster() })
    lobby.querySelector('.urban-monsters').addEventListener('change', function (event) { draft.formation = event.target.value; renderRoster() })
    lobby.querySelector('.urban-stage').addEventListener('change', function (event) { draft.background = +event.target.value; renderRoster() })
    lobby.querySelector('.urban-launch-wrap').appendChild(button('準備好了 · 出發 ▶', 'urban-primary urban-launch', launch))
    util.div('character_selection').appendChild(lobby)

    function renderRoster() {
      const current = draft.selected[draft.slot]
      const hero = heroAt(current)
      const detail = lobby.querySelector('.urban-agent-detail')
      detail.querySelector('.urban-agent-no').textContent = 'P' + (draft.slot + 1) + ' / 夥伴檔案'
      detail.querySelector('img').src = picture(current)
      detail.querySelector('h3').textContent = hero.name
      detail.querySelector('.urban-agent-meta > span').textContent = hero.role
      detail.querySelector('.urban-agent-meta p').textContent = hero.description
      p1.classList.toggle('is-current', draft.slot === 0)
      p2.classList.toggle('is-current', draft.slot === 1)
      p1.textContent = 'P1 / ' + heroAt(draft.selected[0]).name
      p2.textContent = 'P2 / ' + heroAt(draft.selected[1]).name
      p2.hidden = draft.humans === 1
      lobby.querySelectorAll('.urban-fighter').forEach(function (node) {
        const yes = +node.dataset.index === current
        node.classList.toggle('is-selected', yes)
        node.setAttribute('aria-pressed', String(yes))
        const chosenBy = draft.selected.slice(0, draft.humans).reduce(function (list, index, slot) { if (+node.dataset.index === index) list.push('P' + (slot + 1)); return list }, [])
        node.querySelector('.urban-fighter-tag').textContent = chosenBy.join(' + ') || '選擇'
      })
      const guide = lobby.querySelector('.urban-keyguide')
      guide.replaceChildren()
      bindings().slice(0, draft.humans).forEach(function (binding, index) { guide.appendChild(el('span', '', controlLine(binding, index))) })
      guide.appendChild(el('span', 'urban-menu-tip', '點擊切換玩家與夥伴 · Enter 出發 · ' + pauseKey() + ' 暫停 · Esc 退出'))
      const enemyNames = Array.from(new Set(enemyLineup().map(function (monster) { return monster.name })))
      lobby.querySelector('.urban-lobby-note').textContent = (draft.humans === 2 ? '兩位夥伴同隊' : '玩家一出戰') + '，迎戰 ' + draft.bots + ' 隻怪物：' + enemyNames.join('、') + '。'
      const stage = stages.find(function (entry, i) { return (entry.index === undefined ? i : entry.index) === draft.background }) || stages[0]
      lobby.querySelector('.urban-stage-preview img').src = asset(stage.preview)
      lobby.querySelector('.urban-stage-preview span').textContent = stage.subtitle || stage.title || stage.name
      if (chapterUI) chapterUI.refreshLobby()
    }
    function launch() {
      if (manager.active_UI !== 'character_selection') return
      const players = []
      const controls = bindings()
      for (let i = 0; i < draft.humans; i++) players.push({ use: true, name: controls[i] && controls[i].name || 'P' + (i + 1), type: 'human', selected: draft.selected[i], team: 1 })
      if (chapterUI && chapterUI.isStory()) { chapterUI.launch({ players: players, options: { background: 0, difficulty: 1 } }); return }
      enemyLineup().forEach(function (monster, i) { players.push({ use: true, name: monster.name + ' ' + (i + 1), type: 'computer', selected: monster.index, selected_AI: 0, team: 2 }) })
      manager.start_match({ players: players, options: { background: draft.background, difficulty: 1 } })
    }

    const settings = util.div('settings')
    const settingsHeader = el('header', 'urban-settings-header')
    settingsHeader.innerHTML = '<span class="urban-eyebrow">ONE MAC · TWO PLAYERS</span><h2>把鍵盤分成兩邊。</h2><p>點擊下表的鍵位，再按想用的鍵。兩位玩家可共用 Mac 鍵盤。</p><div class="urban-recommended"></div><div class="urban-settings-message" role="status"></div>'
    settings.appendChild(settingsHeader)
    settingsHeader.querySelector('.urban-recommended').appendChild(button('恢復推薦雙人鍵位', 'urban-back', function () {
      const result = manager.applyRecommendedControls ? manager.applyRecommendedControls() : { ok: false, message: '操作設定正在初始化，請稍後再試。' }
      settingsHeader.querySelector('.urban-settings-message').textContent = result.message || (result.ok ? '雙人鍵位已恢復。' : '未能恢復鍵位。')
      refreshSettingsRows()
      renderRoster()
    }))
    function refreshSettingsRows() {
      const labels = { name: '玩家名稱', type: '輸入方式', up: '向上', down: '向下', left: '向左', right: '向右', att: '攻擊 / 拾取', jump: '跳躍', def: '防禦' }
      settings.querySelectorAll('.keychanger tr').forEach(function (row) {
        const cell = row.querySelector('td')
        if (cell && labels[cell.textContent]) cell.textContent = labels[cell.textContent]
        row.querySelectorAll('td').forEach(function (td, index) {
          if (index > 0) { td.tabIndex = 0; td.setAttribute('role', 'button'); td.setAttribute('aria-label', '玩家 ' + index + ' ' + cell.textContent + '：' + td.textContent) }
        })
      })
    }
    const settingsBottom = el('footer', 'urban-settings-bottom')
    settingsBottom.innerHTML = '<div><span><kbd>P</kbd> 暫停 / 繼續　<kbd>Esc</kbd> 退出對戰</span><small>推薦 P1：WASD + F / G / H　P2：方向鍵 + J / K / L</small></div>'
    settingsBottom.appendChild(button('儲存並返回', 'urban-primary', function () { manager.save_settings(); manager.start_game() }))
    settings.appendChild(settingsBottom)
    refreshSettingsRows()

    manager.switch_UI = function (page) {
      const result = originalSwitch.call(this, page)
      root.dataset.screen = page
      if (page === 'character_selection') renderRoster()
      if (page === 'settings') { refreshSettingsRows(); settingsBottom.querySelector('kbd').textContent = pauseKey() }
      if (page === 'frontpage') credits.hidden = true
      fit()
      return result
    }
    manager.key = function (index, key) {
      if (chapterUI && chapterUI.isModalOpen()) return
      if (this.active_UI === 'character_selection') {
        if (index >= draft.humans) return
        draft.slot = index
        if (key === 'right') cycleHero(index, 1)
        if (key === 'left') cycleHero(index, -1)
        if (key === 'att') { launch(); return }
        if (key === 'jump') { this.switch_UI('frontpage'); return }
        renderRoster()
        return
      }
      return originalKey.apply(this, arguments)
    }
    function menuKey(event) {
      if (window.realityGame && window.realityGame.skillsUI && window.realityGame.skillsUI.isOpen()) return
      if (chapterUI && chapterUI.isModalOpen()) return
      const down = event.type === 'keydown'
      if (manager.active_UI === 'settings' && manager.isRebindingControls && manager.isRebindingControls()) return
      if (event.target.tagName === 'SELECT' && ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation()
        if (!down) return
        const select = event.target
        if (event.key === 'Enter') { select.blur(); return }
        const last = select.options.length - 1
        select.selectedIndex = event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.max(0, Math.min(last, select.selectedIndex + (event.key === 'ArrowDown' ? 1 : -1)))
        select.dispatchEvent(new Event('change', { bubbles: true }))
        return
      }
      if (event.key === 'Tab' || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || (event.target.tagName === 'BUTTON' && ['Enter', ' '].includes(event.key))) {
        event.stopPropagation()
        if (event.repeat) event.preventDefault()
        return
      }
      if (manager.active_UI === 'settings' && event.target.tagName === 'TD' && event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation()
        if (down && !event.repeat && event.target.onclick) event.target.onclick()
        return
      }
      const frontEnter = manager.active_UI === 'frontpage' && event.key === 'Enter' && credits.hidden
      const lobbyKey = manager.active_UI === 'character_selection' && ['ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(event.key)
      if (!frontEnter && !lobbyKey) return
      event.preventDefault(); event.stopPropagation()
      if (!down || event.repeat) return
      if (frontEnter) { if (chapterUI) chapterUI.setMode('free'); manager.start_game() }
      else if (event.key === 'Enter') launch()
      else if (event.key === 'Escape') manager.switch_UI('frontpage')
      else { draft.slot = draft.humans === 2 ? 1 : 0; cycleHero(draft.slot, event.key === 'ArrowRight' ? 1 : -1); renderRoster() }
    }
    window.addEventListener('lf2:controls-changed', function () { refreshSettingsRows(); renderRoster(); settingsBottom.querySelector('kbd').textContent = pauseKey() })
    window.addEventListener('keydown', menuKey, true)
    window.addEventListener('keyup', menuKey, true)

    const hud = attachHud(manager, pack)
    window.render_game_to_text = function () {
      const match = manager.activeMatch
      const skills = window.realityGame && window.realityGame.skills
      function skillState(player) {
        const value = skills.getPlayerSkills(player)
        return Object.assign({}, value, { hero: { id: value.hero.id, name: value.hero.name } })
      }
      const animation = window.realityGame && window.realityGame.animation
      return JSON.stringify({ screen: manager.active_UI, animation: animation ? { mode: animation.mode, sheets: animation.generatedSheets, pictures: animation.redrawnPictures } : null, selected: draft.selected.map(function (index) { const hero = heroAt(index); return { id: hero.id, name: hero.name, index: index } }), humans: draft.humans, computers: chapterUI && chapterUI.isStory() ? (chapterUI.getState().checkpoint ? 3 : 2) : draft.bots, stage: chapterUI && chapterUI.isStory() ? chapterUI.getState().background : draft.background, formation: draft.formation, monsterIds: chapterUI && chapterUI.isStory() ? chapterUI.getState().monsterIds : enemyLineup().map(function (monster) { return monster.id }), chapter: chapterUI && chapterUI.getState(), controls: bindings(), skills: skills ? [0, 1].slice(0, draft.humans).map(skillState) : [], skillsGuideOpen: Boolean(window.realityGame && window.realityGame.skillsUI && window.realityGame.skillsUI.isOpen()), coordinates: 'x right, z down along ground, y vertical (up is negative)', paused: Boolean(match && match.time && match.time.paused), players: match && match.character ? Object.values(match.character).map(function (ch) { return { id: ch.id, name: ch.data && ch.data.bmp && ch.data.bmp.name, team: ch.team, frame: ch.frame && ch.frame.N, controller: ch.con && ch.con.type, config: ch.con && ch.con.config, x: ch.ps.x, y: ch.ps.y, z: ch.ps.z, hp: ch.health.hp, mp: ch.health.mp } }) : [] })
    }
    root.dataset.screen = manager.active_UI
    renderRoster()
    const api = { manager: manager, hud: hud, draft: draft, heroes: heroes, stages: stages, monsters: monsters, renderRoster: renderRoster }
    chapterUI = api.chapter = attachChapterUI(api, pack)
    window.realityGame = api
    return api
  }
})
