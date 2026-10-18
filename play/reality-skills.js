/* Read-only move guide. All combat input uses the original LF2 combo detector. */
define(function () {
  const catalog = {
    11: [
      { id: 'xiaoyi-draft', name: '草稿冲击', description: '向前打出冲击波，打断迎面而来的纸卷怪。', sequence: ['def', 'forward', 'att'], tag: 'hit_Fa', entryFrame: 240, mp: 40, followup: '出手后续按攻击 {att} 可连发，每发另耗 40 MP。' },
      { id: 'xiaoyi-punches', name: '不服输连拳', description: '近身连续出拳，接住被击退的敌人。', sequence: ['def', 'down', 'att'], tag: 'hit_Da', entryFrame: 270, mp: 75, followup: '末段输入 {def} › {up} › {att} 可接「破题升龙」（225 MP）；收招时按 {jump} 可接「向上一步」（25 MP）。' },
      { id: 'xiaoyi-step', name: '向上一步', description: '跃起踢击，跨过前方的阻拦。', sequence: ['def', 'up', 'jump'], tag: 'hit_Uj', entryFrame: 290, mp: 25, followup: '跃起后按攻击 {att} 追加空中踢击，无额外 MP 消耗。' },
      { id: 'xiaoyi-breakthrough', name: '破题升龙', description: '向上挥拳，把近处的敌人击飞。', sequence: ['def', 'up', 'att'], tag: 'hit_Ua', entryFrame: 300, mp: 225, followup: '' }
    ],
    2: [
      { id: 'linxia-plane', name: '纸飞机', description: '放出向前飞行的远程弹，牵制远处敌人。', sequence: ['def', 'forward', 'att'], tag: 'hit_Fa', entryFrame: 235, mp: 75, followup: '' },
      { id: 'linxia-notes', name: '回旋批注', description: '放出持续追击的回旋弹。', sequence: ['def', 'up', 'att'], tag: 'hit_Ua', entryFrame: 300, mp: 250, followup: '' },
      { id: 'linxia-desk', name: '课桌结界', description: '在身前留下防护力场，为伙伴争取空间。', sequence: ['def', 'forward', 'jump'], tag: 'hit_Fj', entryFrame: 270, mp: 100, followup: '' },
      { id: 'linxia-friend', name: '同桌补给', description: '為身前近處的角色逐步恢復生命，敵人也可能接取。', sequence: ['def', 'up', 'jump'], tag: 'hit_Uj', entryFrame: 260, mp: 350, followup: '先靠近需要帮助的伙伴；没有目标也会消耗 MP。' },
      { id: 'linxia-breathe', name: '深呼吸', description: '停下來照顧自己，每次恢復 8 HP，直到可恢復生命的上限。', sequence: ['def', 'down', 'jump'], tag: 'hit_Dj', entryFrame: 250, mp: 350, followup: '' }
    ],
    8: [
      { id: 'zhouqi-calm', name: '冷静一下', description: '向前放出冻结弹，暂时定住命中的敌人。', sequence: ['def', 'forward', 'att'], tag: 'hit_Fa', entryFrame: 235, mp: 100, followup: '' },
      { id: 'zhouqi-boundary', name: '划定边界', description: '在前方连续立起冰柱，拦住敌人的推进。', sequence: ['def', 'forward', 'jump'], tag: 'hit_Fj', entryFrame: 245, mp: 150, followup: '' },
      { id: 'zhouqi-formula', name: '公式风暴', description: '卷起身边的敌人，制造短暂的控制空间。', sequence: ['def', 'up', 'jump'], tag: 'hit_Uj', entryFrame: 260, mp: 300, followup: '' },
      { id: 'zhouqi-ruler', name: '纪律尺', description: '召出一把晶体三角尺，直接握在手中。', sequence: ['def', 'down', 'jump'], tag: 'hit_Dj', entryFrame: 270, mp: 150, followup: '按攻击 {att} 挥动；丢下后可再次拾取。' }
    ],
    4: [
      { id: 'chenye-bell', name: '下课冲击', description: '向前推出一阵劲风，把近处的敌人吹开。', sequence: ['def', 'forward', 'att'], tag: 'hit_Fa', entryFrame: 235, mp: 150, followup: '' },
      { id: 'chenye-arrow', name: '穿堂纸箭', description: '发射强力直线箭，穿过前方的阻拦。', sequence: ['def', 'forward', 'jump'], tag: 'hit_Fj', entryFrame: 270, mp: 200, followup: '' },
      { id: 'chenye-flute', name: '午后笛声', description: '用笛聲將周圍角色托起並持續攻擊，同隊夥伴也會受影響。', sequence: ['def', 'up', 'jump'], tag: 'hit_Uj', entryFrame: 250, mp: 350, followup: '演奏时按防御 {def} 可提前收招。' },
      { id: 'chenye-kites', name: '五向纸鸢', description: '同时发出五支散射箭，覆盖前方多个方向。', sequence: ['def', 'jump', 'att'], tag: 'hit_ja', entryFrame: 280, mp: 150, followup: '出手后续按攻击 {att} 可追加一轮，另耗 100 MP。' }
    ],
    9: [
      { id: 'tangli-chalk', name: '粉筆連彈', description: '向前踢出一道粉筆光彈，可逐段追加遠程攻擊。', sequence: ['def', 'forward', 'att'], tag: 'hit_Fa', entryFrame: 235, mp: 40, followup: '出手後按 {att} 追加第二發（40 MP），再按 {att} 追加兩發（70 MP）；四發收招時再按 {att} 可銜接下一輪首發，此次銜接不額外耗 MP。' },
      { id: 'tangli-recess', name: '課間連踢', description: '近身連續踢擊，把迎面的阻攔一腳腳踢開。', sequence: ['def', 'down', 'att'], tag: 'hit_Da', entryFrame: 265, mp: 75, followup: '' },
      { id: 'tangli-whirl', name: '放學旋風', description: '旋轉向前突進並持續踢擊，清出穿行的空間。', sequence: ['def', 'forward', 'jump'], tag: 'hit_Fj', entryFrame: 280, mp: 75, followup: '75 MP 為起動消耗；旋轉期間每輪另耗 34 MP，MP 用完會收招。按防禦 {def} 或跳躍 {jump} 可提前停止。' },
      { id: 'tangli-question', name: '追問光點', description: '放出會追蹤敵人的光彈，追上躲到遠處的目標。', sequence: ['def', 'up', 'att'], tag: 'hit_Ua', entryFrame: 295, mp: 100, followup: '' }
    ],
    10: [
      { id: 'shenzhou-pages', name: '雙頁推進', description: '接連發出兩道遠程光彈，打開前進的路。', sequence: ['def', 'forward', 'att'], tag: 'hit_Fa', entryFrame: 235, mp: 125, followup: '一次完整出招自動發出兩彈，共耗 125 MP。' },
      { id: 'shenzhou-rise', name: '逆風起身', description: '翻身上挑，把近處的敵人擊向空中。', sequence: ['def', 'up', 'att'], tag: 'hit_Ua', entryFrame: 70, mp: 0, followup: '落地收招時輸入 {def} › {left} / {right} › {jump}，可接「越線飛踢」（200 MP）。' },
      { id: 'shenzhou-crossing', name: '橫越題海', description: '向前旋身掃踢，同時攻擊身前與身後近處的敵人。', sequence: ['def', 'down', 'att'], tag: 'hit_Da', entryFrame: 260, mp: 50, followup: '收招時輸入 {def} › {up} › {att} 可接「逆風起身」（0 MP）；{def} › {left} / {right} › {jump} 可接「越線飛踢」（200 MP）。' },
      { id: 'shenzhou-leap', name: '越線飛踢', description: '躍起向前突進，用重踢擊退攔路的敵人。', sequence: ['def', 'forward', 'jump'], tag: 'hit_Fj', entryFrame: 250, mp: 200, followup: '跳躍落地、翻滾起身或部分招式收招時輸入同一組合，可更快接出飛踢；仍耗 200 MP。' },
      { id: 'shenzhou-face', name: '直面現實', description: '瞬移到最近的敵人附近，重新調整交戰位置。', sequence: ['def', 'up', 'jump'], tag: 'hit_Uj', entryFrame: 275, mp: 50, followup: '出現在目標同一縱深、身前約 120 距離處，並非直接貼身。沒有敵人也會消耗 MP。' },
      { id: 'shenzhou-return', name: '回到同伴', description: '瞬移到最遠的同隊夥伴附近，迅速回到搭檔身邊。', sequence: ['def', 'down', 'jump'], tag: 'hit_Dj', entryFrame: 290, mp: 50, followup: '出現在同伴同一縱深、前方約 60 距離處。沒有同伴時不會移動，仍會消耗 MP。' }
    ]
  }

  const notes = {
    11: [
      '近身重击收招时按 {jump} 可接「向上一步」（25 MP），再按 {att} 追加踢击。',
      '抓住敌人后输入 {def} › {down} › {att} 可接连拳（75 MP）；{def} › {up} › {att} 可接升龙（225 MP）。',
      '跑动攻击中续按 {att} 可追加一拳；翻滚中仍可用升龙或「向上一步」，按对应招式消耗 MP。'
    ],
    2: ['近身重击收招时按 {jump}，再按 {att}，可接腾跃追击；这套派生不消耗 MP。'],
    8: ['「纪律尺」召唤后直接持有；普通攻击挥动尺子，掉落后可走近按 {att} 拾回。'],
    4: ['普通射击 {att} 每箭消耗 12 MP；空中射击每箭消耗 20 MP，空中收招时续按 {att} 可连射。'],
    9: [
      '跑動攻擊收招時續按 {att} 可接近身重踢，不額外消耗 MP。',
      '近身重踢、跑動攻擊收招或抓住敵人時，可輸入原組合銜接「課間連踢」（75 MP）、「放學旋風」（75 MP 起動）或「追問光點」（100 MP）。',
      '「粉筆連彈」的續招窗口很短，需在每段收招時按下 {att}；按住不放不會自動連發。'
    ],
    10: [
      '兩種瞬移可在站定或跳躍中輸入；移動、防禦等動作中不能直接接出。先鬆開方向再輸入完整組合。',
      '瞬移收招時輸入 {def} › {up} › {att} 可接「逆風起身」（0 MP）；{def} › {left} / {right} › {jump} 可接「越線飛踢」（200 MP）。',
      '翻滾中輸入 {def} › {down} › {att} 可接「橫越題海」（50 MP）；跑動攻擊收招時續按 {att} 可延長近身連擊，不額外消耗 MP。'
    ]
  }

  function getSkills(heroId) { return catalog[heroId] || [] }
  function getNotes(heroId) { return notes[heroId] || [] }
  function keyLabel(key) {
    if (key === undefined || key === null) return '—'
    const names = { up: '↑', down: '↓', left: '←', right: '→', space: 'Space', esc: 'Esc' }
    return names[String(key).toLowerCase()] || String(key).toUpperCase()
  }
  function comboKeys(skill, config) {
    config = config || {}
    return skill.sequence.map(function (action) {
      return action === 'forward' ? keyLabel(config.left) + '/' + keyLabel(config.right) : keyLabel(config[action])
    })
  }

  function attach(api, pack) {
    const manager = api.manager
    const heroes = api.heroes || pack.reality && pack.reality.heroes || []
    let destroyed = false

    function controls() { return manager.getControlBindings ? manager.getControlBindings() : [] }
    function match() { return manager.activeMatch }
    function character(player) {
      const current = match()
      if (!current || !current.character) return null
      const panel = current.panel && current.panel[player]
      // Panel identity survives a defeated character being removed from the scene.
      if (panel) return current.character[panel.uid] || null
      return null
    }
    function heroFor(player) {
      const char = manager.active_UI === 'gameplay' && character(player)
      if (char) return heroes.find(function (hero) { return hero.id === char.id }) || { id: char.id, name: char.name || '' }
      const selected = api.draft && api.draft.selected && api.draft.selected[player]
      return heroes.find(function (hero) { return hero.index === selected }) || heroes[player] || heroes[0] || { id: null, name: '' }
    }
    function configFor(player) {
      const binding = controls()[player]
      return binding && binding.config || {}
    }
    function unavailable(player, skill) {
      const current = match()
      const char = character(player)
      if (destroyed || manager.active_UI !== 'gameplay' || !current || current.destroyed || !current.time || current.demo_mode) return '请进入本地对战后施放技能。'
      if (!Number.isInteger(player) || player < 0 || player >= (api.draft && api.draft.humans || 1)) return '该位置没有本地玩家。'
      if (current.time.paused || api.skillsUI && api.skillsUI.isOpen()) return '对战已暂停，继续后再施放。'
      if (current.gameover_state) return '本场对战已经结束。'
      if (!char || !char.health || char.health.hp <= 0) return '伙伴已倒下，暂时无法施放。'
      if (!char.con || char.con.type !== 'keyboard' || char.con.role || !Array.isArray(char.con.buf)) return '请使用当前玩家的基础键位输入组合。'
      if (!skill || !getSkills(char.id).some(function (entry) { return entry.id === skill.id })) return '当前伙伴没有这项技能。'
      const target = char.frame && char.frame.D && char.frame.D[skill.tag]
      if (!target || !char.data || !char.data.frame[target]) return '当前动作无法接招，请站稳后再试。'
      const required = Math.max(0, char.data.frame[target].mp || 0) % 1000
      if (char.health.mp < required) return 'MP 不足，需要 ' + required + ' MP。'
      return ''
    }
    function getPlayerSkills(player) {
      const hero = heroFor(player)
      const char = manager.active_UI === 'gameplay' && character(player)
      const config = configFor(player)
      return {
        player: player, hero: hero, notes: getNotes(hero.id),
        active: Boolean(char && char.health && char.health.hp > 0 && char.con && char.con.type === 'keyboard' && !char.con.role),
        mp: char && char.health ? char.health.mp : null,
        skills: getSkills(hero.id).map(function (skill) {
          const reason = unavailable(player, skill)
          return Object.assign({}, skill, {
            comboKeys: comboKeys(skill, config), enabled: !reason, disabledReason: reason
          })
        })
      }
    }
    return {
      catalog: catalog, getSkills: getSkills, getNotes: getNotes, comboKeys: comboKeys, getPlayerSkills: getPlayerSkills,
      destroy: function () { destroyed = true }
    }
  }

  return { catalog: catalog, getSkills: getSkills, getNotes: getNotes, comboKeys: comboKeys, attach: attach }
})
