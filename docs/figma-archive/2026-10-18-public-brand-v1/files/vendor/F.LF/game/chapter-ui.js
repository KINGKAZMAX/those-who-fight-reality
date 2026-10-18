/* First chapter presentation. Combat and persistence live in reality-chapter. */
define(['LF/util', 'game/reality-chapter'], function (util, attachChapter) {
  return function attachChapterUI(api, pack) {
    const manager = api.manager
    const root = util.root
    const lobby = root.querySelector('.urban-lobby')
    const home = root.querySelector('.urban-home')
    let mode = 'free'
    let pendingConfig = null
    let modalKind = ''
    let previousFocus = null
    let lastPhase = ''
    let primaryAction = null
    let cancelAction = null
    let chapter

    function el(tag, cls, text) {
      const node = document.createElement(tag)
      if (cls) node.className = cls
      if (text !== undefined) node.textContent = text
      return node
    }
    function button(text, cls, action) {
      const node = el('button', cls, text)
      node.type = 'button'
      node.addEventListener('click', function () { action(); node.blur() })
      return node
    }
    function keyLabel(key) { return { up: '↑', down: '↓', left: '←', right: '→', space: '空格' }[key] || String(key).toUpperCase() }
    function guardKeys() {
      const bindings = manager.getControlBindings ? manager.getControlBindings() : []
      return bindings.slice(0, api.draft.humans).map(function (binding, i) { return 'P' + (i + 1) + ' ' + keyLabel(binding.config && binding.config.def || (i ? 'l' : 'h')) }).join(' / ')
    }
    function saved() { return chapter ? chapter.getSavedProgress() : {} }
    function checkpoint() { const record = saved(); return !record.completed && record.checkpoint === 1 ? 1 : 0 }
    function stageAt(index) { return api.stages.find(function (stage, i) { return (stage.index === undefined ? i : stage.index) === index }) || api.stages[0] }
    function encounter(index) { return chapter.getEncounter(index) }
    function encounterNames(index) { return Array.from(new Set(encounter(index).monsters.map(function (monster) { return monster.name }))).join('、') }
    function savedLabel() {
      const record = saved()
      return record.completed ? '已收藏 · 第一张合照' : record.checkpoint === 1 ? '進度已保存 · 教室就在前面' : '第一章 · 不要掉队'
    }

    const modeBar = el('div', 'chapter-modebar')
    modeBar.setAttribute('role', 'group')
    modeBar.setAttribute('aria-label', '选择游戏模式')
    const storyButton = button('01 故事 · 不要掉队', 'chapter-mode', function () { setMode('story') })
    const freeButton = button('自由對戰', 'chapter-mode', function () { setMode('free') })
    const progressLabel = el('span', 'chapter-progress-label')
    modeBar.append(storyButton, freeButton, progressLabel)
    lobby.appendChild(modeBar)
    lobby.classList.add('chapter-lobby')
    const homeProgress = el('span', 'chapter-home-progress')
    home.querySelector('.urban-home-copy').appendChild(homeProgress)
    home.querySelector('.urban-issue').textContent = '校園合作格鬥 · 線上體驗版'

    const objective = el('aside', 'chapter-objective')
    objective.hidden = true
    objective.setAttribute('aria-label', '章节目标')
    objective.innerHTML = '<span class="chapter-objective-index">01 / 不要掉队</span><strong></strong><span class="chapter-objective-count"></span><div class="chapter-rescue" hidden><span></span><div class="chapter-rescue-track" role="progressbar" aria-label="援护进度" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>'
    root.querySelector('.gameplay').appendChild(objective)

    const overlay = el('section', 'chapter-overlay')
    overlay.hidden = true
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-labelledby', 'chapter-dialog-title')
    overlay.innerHTML = '<div class="chapter-sheet"><div class="chapter-scene"><img src="/F.LF/game/art/stage-primary.png" alt="前程市小学的校门与红色跑道"><span class="chapter-stamp">01<br><small>小学篇</small></span><div class="chapter-heading"><span class="chapter-kicker"></span><h2 id="chapter-dialog-title"></h2><span class="chapter-location">前程市 / 开学第一天</span></div><div class="chapter-companions"></div></div><div class="chapter-body"><span class="chapter-speaker"></span><blockquote></blockquote><p class="chapter-narration"></p><div class="chapter-details"></div><div class="chapter-actions"></div><span class="chapter-save-note"></span></div></div>'
    root.querySelector('.window').appendChild(overlay)
    const companions = overlay.querySelector('.chapter-companions')
    api.heroes.forEach(function (hero) {
      const image = el('img')
      image.src = hero.portrait
      image.alt = hero.name
      companions.appendChild(image)
    })

    function closeModal() {
      overlay.hidden = true
      root.classList.remove('chapter-dialog-open')
      modalKind = ''
      primaryAction = cancelAction = null
      if (previousFocus && previousFocus.isConnected && previousFocus.offsetParent) previousFocus.focus({ preventScroll: true })
    }
    function openModal(kind, content) {
      if (overlay.hidden) previousFocus = document.activeElement
      modalKind = kind
      overlay.dataset.kind = kind
      overlay.querySelector('.chapter-kicker').textContent = content.kicker
      overlay.querySelector('h2').textContent = content.title
      overlay.querySelector('.chapter-speaker').textContent = content.speaker
      overlay.querySelector('blockquote').textContent = content.quote
      overlay.querySelector('.chapter-narration').textContent = content.text
      overlay.querySelector('.chapter-details').textContent = content.details
      overlay.querySelector('.chapter-save-note').textContent = content.save || ''
      const scene = stageAt(content.background === undefined ? chapter.getState().background : content.background)
      if (scene && scene.preview) {
        overlay.querySelector('.chapter-scene > img').src = scene.preview
        overlay.querySelector('.chapter-scene > img').alt = scene.name
      }
      const actions = overlay.querySelector('.chapter-actions')
      actions.replaceChildren()
      primaryAction = content.action
      cancelAction = kind === 'complete' ? exitChapter : content.cancel
      if (content.action) actions.appendChild(button(content.actionLabel, 'urban-primary chapter-confirm', content.action))
      if (content.cancel) actions.appendChild(button(content.cancelLabel || '返回选角', 'urban-back chapter-cancel', content.cancel))
      overlay.hidden = false
      root.classList.add('chapter-dialog-open')
      const focus = actions.querySelector('button')
      if (focus) focus.focus({ preventScroll: true })
    }
    function exitChapter() {
      closeModal()
      const match = manager.activeMatch
      chapter.stop()
      if (match && !match.destroyed) match.destroy()
      if (manager.active_UI === 'gameplay') manager.match_end()
      else manager.switch_UI('character_selection')
      refreshLobby()
    }
    function saveNote(state) {
      return state.savingError ? '本次进度暂未能写入浏览器；保持本页打开可继续。' : '进度保存在这台设备的当前浏览器。'
    }
    function presentState(state) {
      objective.hidden = manager.active_UI !== 'gameplay' || state.phase !== 'battle'
      root.classList.toggle('chapter-active', state.phase !== 'idle')
      objective.querySelector('strong').textContent = state.objective || '清开纸卷怪，一起走进校门。'
      objective.querySelector('.chapter-objective-count').textContent = '第 ' + (state.checkpoint + 1) + ' 段 / 2　·　剩餘 ' + state.enemiesRemaining + ' 隻怪物'
      const downed = state.downedPlayers || []
      const rescue = objective.querySelector('.chapter-rescue')
      rescue.hidden = !downed.length
      rescue.querySelector('span').textContent = state.reviveProgress > 0 ? '正在扶起伙伴… ' + Math.round(state.reviveProgress * 100) + '%' : '靠近倒下的伙伴，按住防御 1.5 秒 · ' + guardKeys()
      const percent = Math.round((state.reviveProgress || 0) * 100)
      rescue.querySelector('i').style.width = percent + '%'
      rescue.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(percent))
      if (state.phase === lastPhase) return
      lastPhase = state.phase
      if (state.phase === 'battle' || state.phase === 'idle') { closeModal(); refreshLobby(); return }
      if (state.phase === 'loading') {
        openModal('loading', { kicker: '第一章 / 伙伴集合中', title: state.checkpoint ? '教室就在前面。' : '校门就在前面。', speaker: '请稍等', quote: '正在把大家叫到一起。', text: '整理书包，准备出发。', details: '', save: '', cancel: exitChapter })
      } else if (state.phase === 'interlude') {
        openModal('interlude', { kicker: '檢查點 01 / 已到達', title: '等等，大家都在。', speaker: '教室門口', quote: '跑慢一點，也能一起到。', text: '穿過校門，課桌之間又響起訂正與催促的聲音。先別急，把同伴一起帶進教室。', details: '下一段：' + encounterNames(1) + '，共 3 隻。夥伴恢復體力後一起出發。', background: encounter(1).background, save: saveNote(state), actionLabel: '繼續 · 一起進教室 ▶', action: function () { closeModal(); chapter.advance() }, cancel: exitChapter })
      } else if (state.phase === 'complete') {
        openModal('complete', { kicker: '第一章完成 / 持续登录中', title: '一个都没有落下。', speaker: '班主任', quote: '“先坐下，名字慢慢写。”', text: '大家挤在同一张照片里。今天的名字，还可以慢慢写。', details: '收藏获得：第一张合照　·　伙伴援护 ' + state.rescues + ' 次', save: saveNote(state), actionLabel: '收好合照 · 返回选角', action: exitChapter, cancelLabel: '再走一次', cancel: function () { closeModal(); chapter.start(pendingConfig, 0) } })
      } else if (state.phase === 'failed') {
        openModal('failed', { kicker: '休息一下 / 我们还在', title: '再一起走一段。', speaker: '伙伴们', quote: '“刚才太急了，这次慢一点。”', text: '从这一段重新出发。已经到达的检查点与收藏会留下。', details: api.draft.humans === 2 ? '有人倒下时，靠近并按住自己的防御键 1.5 秒。' : '单人倒下后可重试；也可以返回选角，叫上另一位伙伴。', save: saveNote(state), actionLabel: '从本段重新出发 ▶', action: function () { closeModal(); chapter.retry() }, cancel: exitChapter })
      }
      refreshLobby()
    }

    chapter = attachChapter(manager, pack, presentState)
    function refreshLobby() {
      const story = mode === 'story'
      lobby.dataset.mode = mode
      storyButton.setAttribute('aria-pressed', String(story))
      freeButton.setAttribute('aria-pressed', String(!story))
      progressLabel.textContent = story ? savedLabel() : '同屏合作 · ' + api.stages.length + ' 處場景'
      homeProgress.textContent = savedLabel()
      home.querySelector('.urban-start').textContent = '開始戰鬥 ▶'
      lobby.querySelector('.urban-bots').disabled = story
      lobby.querySelector('.urban-monsters').disabled = story
      lobby.querySelector('.urban-stage').disabled = story
      if (story) {
        const next = encounter(checkpoint())
        const scene = stageAt(next.background)
        lobby.querySelector('.urban-stage-preview img').src = scene.preview
        lobby.querySelector('.urban-stage-preview span').textContent = scene.name
        lobby.querySelector('.urban-stage').value = String(next.background)
        lobby.querySelector('.urban-monsters').value = checkpoint() ? 'mixed' : '30'
        lobby.querySelector('.urban-bots').value = checkpoint() ? '3' : '2'
        lobby.querySelector('.urban-lobby-note').textContent = '两段故事战斗 · ' + (api.draft.humans === 2 ? '靠近伙伴，按住防御可援护。' : '单人也可通关，倒下后从本段重试。')
        lobby.querySelector('.urban-launch').textContent = checkpoint() ? '繼續 · 一起進教室 ▶' : '第一章 · 不要掉队 ▶'
      } else {
        lobby.querySelector('.urban-stage').value = String(api.draft.background)
        lobby.querySelector('.urban-monsters').value = api.draft.formation
        lobby.querySelector('.urban-bots').value = String(api.draft.bots)
        lobby.querySelector('.urban-launch').textContent = '准备好了 · 出发 ▶'
      }
    }
    function setMode(value) { mode = value; api.renderRoster(); refreshLobby() }
    function launch(config) {
      pendingConfig = config
      const resume = checkpoint()
      openModal('intro', { kicker: '第一章 / 不要掉队', title: resume ? '教室就在前面。' : '今天，别走散了。', speaker: '校园广播', quote: '“新同学，请不要掉队。”', text: resume ? '校門的紅線已經清開。從檢查點繼續，和夥伴一起穿過教室裡的訂正與催促。' : '广播响起，纸上的催促挤成了怪物。新书包还很重，大家约好一起走进校门。', details: api.draft.humans === 2 ? '靠近倒下的伙伴，按住防御 1.5 秒扶起。' + guardKeys() : '清開擋路的怪物。倒下後可以從本段重試。', background: encounter(resume).background, save: resume ? '继续进度 · 第 2 段 / 2' : '两段短篇战斗 · 到达中途自动保存', actionLabel: resume ? '从检查点出发 ▶' : '一起走进校门 ▶', action: function () { closeModal(); chapter.start(config, resume) }, cancel: function () { closeModal() } })
    }
    function modalKey(event) {
      if (overlay.hidden || event.defaultPrevented) return
      if (event.key === 'Tab') {
        const buttons = Array.from(overlay.querySelectorAll('button'))
        if (!buttons.length) { event.preventDefault(); event.stopImmediatePropagation(); return }
        const current = buttons.indexOf(document.activeElement)
        event.preventDefault()
        if (event.type === 'keydown') buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus()
      } else {
        event.preventDefault()
        if (event.type === 'keydown' && !event.repeat) {
          if ((event.key === 'Enter' || event.key === ' ') && document.activeElement && overlay.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON') document.activeElement.click()
          else if (event.key === 'Enter' && primaryAction) primaryAction()
          else if (event.key === 'Escape' && cancelAction) cancelAction()
        }
      }
      // Other window-level helpers may clear their held-key bookkeeping on release.
      // Stop before the document-level game controller, while allowing that cleanup.
      if (event.type === 'keyup') event.stopPropagation()
      else event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', modalKey, true)
    window.addEventListener('keyup', modalKey, true)
    const previousSwitch = manager.switch_UI
    manager.switch_UI = function () {
      const result = previousSwitch.apply(this, arguments)
      if (this.active_UI !== 'gameplay') objective.hidden = true
      refreshLobby()
      return result
    }
    refreshLobby()
    return { controller: chapter, isStory: function () { return mode === 'story' }, isModalOpen: function () { return !overlay.hidden }, launch: launch, refreshLobby: refreshLobby, setMode: setMode, getState: function () { return Object.assign({}, chapter.getState(), { mode: mode, dialog: modalKind, saved: saved() }) } }
  }
})
