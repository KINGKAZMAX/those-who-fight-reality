/* Shared keyboard presets and validation for the local two-player game. */
define(['core/controller'], function (Controller) {
  const profile = 'mac-duo-v1'
  const actions = ['up', 'down', 'left', 'right', 'def', 'jump', 'att']
  const actionLabels = { up: '上移', down: '下移', left: '左移', right: '右移', att: '攻击', jump: '跳跃', def: '防御' }
  const legacy = [
    { up: 'w', down: 'x', left: 'a', right: 'd', def: 'z', jump: 'q', att: 's' },
    { up: 'u', down: 'm', left: 'h', right: 'k', def: ',', jump: 'i', att: 'j' }
  ]

  function copy(value) { return JSON.parse(JSON.stringify(value)) }
  function recommended() {
    return [
      { type: 'keyboard', config: { up: 'w', down: 's', left: 'a', right: 'd', def: 'h', jump: 'g', att: 'f' } },
      { type: 'keyboard', config: { up: 'up', down: 'down', left: 'left', right: 'right', def: 'l', jump: 'k', att: 'j' } }
    ]
  }
  function keyCode(key) {
    return (typeof key === 'number' || typeof key === 'string') ? Controller.keyname_to_keycode(key) : undefined
  }
  function validSettings(saved, defaults) {
    return saved && saved.version === defaults.version && Array.isArray(saved.control) && saved.control.length === 2 &&
      saved.control.every(function (control) {
        return control && ['keyboard', 'touch'].indexOf(control.type) !== -1 && control.config &&
          actions.every(function (action) { return Number.isFinite(keyCode(control.config[action])) })
      }) && Array.isArray(saved.player) && saved.player.length >= 2 &&
      saved.player.every(function (player) { return player && typeof player.name === 'string' })
  }
  function loadSettings(saved, defaults) {
    if (!validSettings(saved, defaults)) {
      const initial = copy(defaults)
      initial.controls_profile = profile
      return initial
    }
    const result = copy(saved)
    const original = !saved.controls_profile && saved.control.every(function (control, index) {
      return control.type === 'keyboard' && actions.every(function (action) {
        return keyCode(control.config[action]) === keyCode(legacy[index][action])
      })
    })
    if (original) {
      result.control = recommended()
      result.controls_profile = profile
    }
    return result
  }
  function keyLabel(key) {
    const named = { up: '↑', down: '↓', left: '←', right: '→', space: 'Space', esc: 'Esc' }
    const name = Controller.keycode_to_keyname(keyCode(key))
    return named[name] || String(name).toUpperCase()
  }
  function validateBinding(controls, player, action, key) {
    const code = keyCode(key)
    if (!controls[player] || actions.indexOf(action) === -1) return { ok: false, message: '请选择玩家和动作。' }
    if (code === 80 || code === 27 || (code >= 112 && code <= 123)) {
      return { ok: false, message: keyLabel(key) + ' 是暂停或系统快捷键，请换一个按键。' }
    }
    const playable = code === 32 || (code >= 37 && code <= 40) || (code >= 48 && code <= 90) ||
      (code >= 96 && code <= 111) || [186, 187, 188, 189, 190, 191, 192, 219, 220, 221, 222].indexOf(code) !== -1
    if (!playable) return { ok: false, message: '请使用字母、数字、方向键、空格或标点键。' }
    for (let i = 0; i < controls.length; i++) {
      if (controls[i].type !== 'keyboard') continue
      for (const other of actions) {
        if (i === player && other === action) continue
        if (keyCode(controls[i].config[other]) === code) {
          return { ok: false, message: keyLabel(key) + ' 已用于玩家 ' + (i + 1) + ' 的' + actionLabels[other] + '，请换一个按键。' }
        }
      }
    }
    return { ok: true, key: Controller.keycode_to_keyname(code), code: code }
  }
  function pauseKey(controls) {
    const occupied = controls.some(function (control) {
      return control.type === 'keyboard' && actions.some(function (action) { return keyCode(control.config[action]) === 80 })
    })
    return occupied ? 'F1' : 'P'
  }
  return { recommended: recommended, loadSettings: loadSettings, validateBinding: validateBinding, keyLabel: keyLabel, pauseKey: pauseKey, profile: profile }
})
