/* Original school-world artwork, adapted once to the existing LF2 frame data.
 * The engine keeps its animation timing, attacks, movement and collision boxes.
 * Source sheets: four columns by four rows, transparent, facing right.
 */
define(function () {
  'use strict'

  const ROOT = '/F.LF/game/art/'
  const VERSION = 'reality-20261017-expanded-2'
  const HEROES = [
    { id: 11, name: '小一', file: 'xiaoyi.png', role: '近身 · 书包冲锋', description: '总想跟上大家，也会回身接住同伴。' },
    { id: 2, name: '林夏', file: 'linxia.png', role: '支援 · 粉笔守护', description: '用纸飞机开路，为同伴留下一点喘息。' },
    { id: 8, name: '周齐', file: 'zhouqi.png', role: '控场 · 三角尺阵', description: '把解题的专注，变成保护大家的力量。' },
    { id: 4, name: '陈野', file: 'chenye.png', role: '远程 · 手工弹射', description: '书包里装着零件，还有没试过的新办法。' },
    { id: 9, name: '唐梨', file: 'tangli.png', role: '連擊 · 放學旋風', description: '把沒能說出口的話，化成不肯停下的腳步。' },
    { id: 10, name: '沈舟', file: 'shenzhou.png', role: '機動 · 越線飛踢', description: '跨過名次的界線，也記得回到同伴身邊。' }
  ]
  const MONSTERS = [
    { id: 30, nativeId: 30, name: '纸卷怪', file: 'paper-monster.png', role: '近身 · 紙團拳', description: '錯題與揉皺的試卷，堆成不肯散去的小怪。' },
    { id: 31, nativeId: 4, name: '訂正獵手', file: 'stapler-monster.png', role: '遠程 · 紙鏢追問', description: '訂書機咬住每一次錯誤，從遠處追來訂正紙鏢。' },
    { id: 32, nativeId: 6, name: '催促鐘怪', file: 'clock-monster.png', role: '重擊 · 鈴聲衝撞', description: '快一點的催促長出拳頭，把時間推向每個人。' }
  ]
  const STAGES = [
    { id: 401, name: '小学 · 不要掉队', subtitle: '放学后的校门，今天也要一起过去。', file: 'stage-primary.png', nativeId: 4, floorLine: 570 / 941 },
    { id: 402, name: '初中 · 名次巨像', subtitle: '课桌堆成高墙，同伴仍在身旁。', file: 'stage-ranking.png', nativeId: 3, floorLine: 735 / 941 },
    { id: 403, name: '大学 · 前途无量', subtitle: '穿过毕业季，把出口留给每一种选择。', file: 'stage-graduation.png', nativeId: 1, floorLine: 600 / 941 },
    { id: 404, name: '教室 · 名字慢慢寫', subtitle: '午後的粉筆還沒落下，先把自己的名字寫完。', file: 'stage-classroom.png', nativeId: 4, floorLine: 0.55 },
    { id: 405, name: '高中 · 下一題', subtitle: '鐘聲彎成紙帶，下一題仍然可以一起想。', file: 'stage-exam.png', nativeId: 4, floorLine: 0.67 }
  ]

  function clone(value) {
    return JSON.parse(JSON.stringify(value))
  }

  function imageFile(name) {
    return new Promise(function (resolve, reject) {
      const image = new Image()
      image.onload = function () { resolve(image) }
      image.onerror = function () { reject(new Error('无法加载校园美术资源：' + name)) }
      image.src = ROOT + name
    })
  }

  function canvas(width, height) {
    const result = document.createElement('canvas')
    result.width = Math.max(1, Math.round(width))
    result.height = Math.max(1, Math.round(height))
    const context = result.getContext('2d')
    if (!context) throw new Error('当前浏览器无法准备游戏图集。')
    context.imageSmoothingEnabled = false
    return result
  }

  // Alpha bounds are measured per cell. Every pose shares the idle scale:
  // a lying or crouching pose must never grow to the height of a standing one.
  function inspectSheet(image) {
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (width < 16 || height < 16) throw new Error('精灵表尺寸不足。')
    const sample = canvas(width, height)
    const context = sample.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, width, height).data
    const cells = []
    for (let pose = 0; pose < 16; pose++) {
      const left = Math.floor((pose % 4) * width / 4)
      const top = Math.floor(Math.floor(pose / 4) * height / 4)
      const right = Math.floor((pose % 4 + 1) * width / 4)
      const bottom = Math.floor((Math.floor(pose / 4) + 1) * height / 4)
      let x0 = right; let y0 = bottom; let x1 = left; let y1 = top
      let found = false
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          if (pixels[(y * width + x) * 4 + 3] > 24) {
            found = true
            x0 = Math.min(x0, x); x1 = Math.max(x1, x)
            y0 = Math.min(y0, y); y1 = Math.max(y1, y)
          }
        }
      }
      if (!found) throw new Error('精灵表第 ' + (pose + 1) + ' 格没有可见图像。')
      cells.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 })
    }
    return { image: image, cells: cells }
  }

  function poseForFrame(frame) {
    const name = String(frame.name || '').toLowerCase()
    const beat = Math.abs(frame.pic || 0) % 2
    if (/lying|falling/.test(name) || frame.state === 14) return 13
    if (/injured|picked_caught|broken_defend|ice|fire/.test(name) || frame.state === 11) return 12
    if (/rowing/.test(name)) return beat ? 14 : 13
    if (/jump.*(?:attack|atck)|sky_|dash.*(?:attack|atck)/.test(name)) return 11
    if (/defend/.test(name) || frame.state === 7) return 9
    if (name === 'jump' || name === 'dash' || frame.state === 4 || frame.state === 5) return 10
    if (/walk/.test(name) || frame.state === 1) return 2 + beat
    if (/running|heavy_obj_run/.test(name) || frame.state === 2) return 4 + beat
    if (/super_punch|run_attack/.test(name)) return 8
    if (/punch|weapon_atck|weapon_thw|throw|catching/.test(name)) return 6 + beat
    if (/crouch|picking|tired|stop_run/.test(name)) return 14
    if (/standing|weapon_drink|dummy/.test(name) || frame.state === 0) return beat
    return 15
  }

  function fileKey(file) {
    return Object.keys(file).find(function (key) { return key.indexOf('file') === 0 && typeof file[key] === 'string' }) || 'file'
  }

  function frameLookup(data) {
    const frames = {}
    Object.keys(data.frame || {}).forEach(function (key) {
      const frame = data.frame[key]
      // LF2 reuses the same picture for a caught body, a fall and lying down.
      // Prefer the final horizontal pose so a defeated character cannot stand.
      if (frame.pic >= 0 && (!frames[frame.pic] || /lying|falling/.test(frame.name || ''))) frames[frame.pic] = frame
    })
    return frames
  }

  function drawCell(context, sheet, pose, x, y, width, height) {
    const source = sheet.cells[pose]
    context.drawImage(sheet.image, source.x, source.y, source.w, source.h,
      Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
  }

  function characterAtlas(data, sheet, effects, heroId) {
    const lookup = frameLookup(data)
    const idle = sheet.cells[0]
    let start = 0
    data.bmp.file.forEach(function (file) {
      const width = file.w + 1; const height = file.h + 1
      const atlas = canvas(width * file.row, height * file.col)
      const context = atlas.getContext('2d')
      const baseScale = Math.min((height - 12) / idle.h, (width - 22) / idle.w)
      for (let local = 0; local < file.row * file.col; local++) {
        const frame = lookup[start + local] || lookup[0] || { centerx: width / 2, centery: height - 1, pic: 0 }
        const pose = poseForFrame(frame)
        const cell = sheet.cells[pose]
        // Fit broad attack/fall poses without stretching or clipping adjacent cells.
        const scale = Math.min(baseScale, (width - 4) / cell.w, (height - 4) / cell.h)
        const drawWidth = cell.w * scale; const drawHeight = cell.h * scale
        const center = Number.isFinite(frame.centerx) ? frame.centerx : width / 2
        const baseline = Number.isFinite(frame.centery) ? frame.centery : height - 1
        const x = Math.max(1, Math.min(width - drawWidth - 2, center - drawWidth / 2))
        const y = Math.max(1, Math.min(height - drawHeight - 2, baseline - drawHeight))
        drawCell(context, sheet, pose, local % file.row * width + x,
          Math.floor(local / file.row) * height + y, drawWidth, drawHeight)
        const name = String(frame.name || '')
        let accent = -1
        if (heroId === 11 && /singlong/.test(name)) accent = 1
        else if (heroId === 11 && /many_punch/.test(name)) accent = 2
        else if (heroId === 4 && /flute/.test(name)) accent = 14
        if (accent >= 0) {
          const source = effects.cells[accent]
          const effectScale = Math.min(34 / source.w, 52 / source.h)
          drawCell(context, effects, accent, local % file.row * width + width - 36,
            Math.floor(local / file.row) * height + 9, source.w * effectScale, source.h * effectScale)
        }
      }
      start += file.row * file.col
      file[fileKey(file)] = atlas.toDataURL('image/png')
    })
    return start
  }

  function portrait(sheet, size) {
    const cell = sheet.cells[0]
    const result = canvas(size, size)
    const context = result.getContext('2d')
    const crop = Math.min(cell.h * 0.61, cell.w * 1.3)
    const cropWidth = Math.min(cell.w, crop)
    const scale = Math.min(size * 0.88 / cropWidth, size * 0.94 / crop)
    const width = Math.round(cropWidth * scale); const height = Math.round(crop * scale)
    context.drawImage(sheet.image, cell.x + (cell.w - cropWidth) / 2, cell.y,
      cropWidth, crop, Math.round((size - width) / 2), size - height, width, height)
    return result.toDataURL('image/png')
  }

  function propForObject(entry, frame) {
    if (entry.id === 100 || entry.id === 213) return 8 // ruler
    if (entry.id === 101) return 7 // umbrella
    if (entry.id === 150) return 10 // crumpled paper
    if (entry.id === 151) return 9 // carton
    if (entry.type === 'broken') return 11 // paper confetti
    if (entry.id === 301) return 5 // paper burst instead of blood
    if (entry.type === 'effect') return 4 // star impact
    if (entry.id === 200 || entry.id === 201 || entry.id === 208) return 0 // paper plane
    if (entry.id === 209 || entry.id === 202) return 1 // triangular ruler
    if (entry.id === 212 || entry.id === 214) return 3 // chalk shield
    if (entry.id === 207) return 12 // correction stamp
    if (entry.id === 204) return 14 // blue arc
    if (entry.id === 211) return 13 // chalk spark
    return frame && frame.state === 3000 ? 2 : 4
  }

  function skillEffect(entry, frame) {
    const name = String(frame.name || '')
    if (entry.id === 200) return /stars|heal/.test(name) ? 7 : /forcefield/.test(name) ? 6 : 4
    if (entry.id === 207) return 0
    if (entry.id === 205) return 0 // Tangli's native Dennis ball
    if (entry.id === 215) return 5 // Tangli's tracking ball
    if (entry.id === 206) return 4 // Shenzhou's paired Woody balls
    if (entry.id === 214) return 5
    if (entry.id === 209) return 8
    if (entry.id === 212) return /whirlwind/.test(name) ? 10 : 9
    if (entry.id === 213) return 11
    if (entry.id === 201) return 12
    if (entry.id === 208) return 13
    if (entry.id === 204 && !/smoke|louis/.test(name)) return 15
    return -1
  }

  function propAtlas(entry, sheet, effects) {
    const data = entry.data
    const lookup = frameLookup(data)
    let start = 0
    data.bmp.file.forEach(function (file) {
      const width = file.w + 1; const height = file.h + 1
      const atlas = canvas(width * file.row, height * file.col)
      const context = atlas.getContext('2d')
      for (let local = 0; local < file.row * file.col; local++) {
        const frame = lookup[start + local] || lookup[0] || {}
        // Picture 6 is the invisible spawner shared by columns and the tornado.
        if (entry.id === 212 && start + local === 6) continue
        const effect = skillEffect(entry, frame)
        const activeSheet = effect >= 0 ? effects : sheet
        const pose = effect >= 0 ? effect : propForObject(entry, frame)
        const source = activeSheet.cells[pose]
        const isEffect = entry.type === 'effect' || entry.type === 'broken'
        const scale = Math.min((width - 4) / source.w, (height - 4) / source.h) * (isEffect ? 0.72 + local % 3 * 0.08 : 0.9)
        const drawWidth = source.w * scale; const drawHeight = source.h * scale
        const center = Number.isFinite(frame.centerx) ? frame.centerx : width / 2
        const anchored = entry.type === 'heavyweapon' || entry.id === 212
        const bottom = anchored ? (frame.centery || height - 1) : (frame.centery || height / 2) + drawHeight / 2
        const x = Math.max(1, Math.min(width - drawWidth - 2, center - drawWidth / 2))
        const y = Math.max(1, Math.min(height - drawHeight - 2, bottom - drawHeight))
        context.globalAlpha = isEffect ? 1 - local % 4 * 0.12 : 1
        drawCell(context, activeSheet, pose, local % file.row * width + x,
          Math.floor(local / file.row) * height + y, drawWidth, drawHeight)
      }
      context.globalAlpha = 1
      start += file.row * file.col
      file[fileKey(file)] = atlas.toDataURL('image/png')
    })
    return start
  }

  function stageData(stage, image, shadow, panelHeight, native) {
    const width = native.data.width; const height = 400
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    const overdraw = 103
    const result = canvas(width + overdraw * 2, height)
    const context = result.getContext('2d')
    // Match the picture's floor to the original arena, never derive physics
    // from painted scenery. Backdrop and floor can have different art scales.
    const sourceFloor = sourceHeight * stage.floorLine
    const floorY = native.data.zboundary[0] - panelHeight - 18
    context.drawImage(image, 0, 0, sourceWidth, sourceFloor,
      overdraw, 0, width, floorY)
    context.drawImage(image, 0, sourceFloor, sourceWidth, sourceHeight - sourceFloor,
      overdraw, floorY, width, height - floorY)
    context.drawImage(result, overdraw, 0, overdraw, height, 0, 0, overdraw, height)
    context.drawImage(result, width, 0, overdraw, height, width + overdraw, 0, overdraw, height)
    const data = clone(native.data)
    data.name = stage.name
    data.shadow = shadow
    data.layer = [{ pic: result.toDataURL('image/png'), width: width, x: -overdraw, y: panelHeight, transparency: 0 }]
    return { id: stage.id, name: stage.name, data: data }
  }

  function loadObjects(pack) {
    return new Promise(function (resolve, reject) {
      if (typeof pack.data.load !== 'function') { resolve(); return }
      // Match the public loader's allowance for a first network visit.
      const timeout = setTimeout(function () { reject(new Error('角色動作資料載入逾時，請重新集合。')) }, 120000)
      pack.data.load({ object: pack.data.object.map(function (entry) { return entry.id }),
        background: Array.from(new Set(STAGES.map(function (stage) { return stage.nativeId }))) }, function () {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  async function prepareRealityArt(pack, options) {
    const nativeAnimation = Boolean(options && options.nativeAnimation)
    if (pack.reality && pack.reality.version === VERSION) return pack
    const spriteFiles = HEROES.concat(MONSTERS).map(function (entry) { return entry.file }).concat(['props.png', 'skills-effects.png'])
    const files = spriteFiles.concat(STAGES.map(function (stage) { return stage.file }))
    const loaded = await Promise.all([loadObjects(pack), Promise.all(files.map(imageFile))])
    const images = {}
    files.forEach(function (name, index) { images[name] = loaded[1][index] })
    const sheets = {}
    spriteFiles.forEach(function (name) { sheets[name] = inspectSheet(images[name]) })

    // AMD modules may be shared by viewers: detach this game's records before editing.
    pack.data.object = clone(pack.data.object)
    // This bundled dataset has no Hunter/Mark. New enemy IDs reuse complete,
    // existing Henry/Louis records without altering any original character.
    MONSTERS.forEach(function (monster) {
      if (pack.data.object.some(function (entry) { return entry.id === monster.id })) return
      const native = pack.data.object.find(function (entry) { return entry.id === monster.nativeId })
      if (!native) throw new Error('缺少怪物動作範本：' + monster.name)
      const variant = clone(native)
      variant.id = monster.id
      variant.realityNativeId = monster.nativeId
      variant.data.realityNativeId = monster.nativeId
      pack.data.object.push(variant)
    })
    const chars = pack.data.object.filter(function (entry) { return entry.type === 'character' })
    const heroes = HEROES.map(function (hero) {
      const result = Object.assign({}, hero)
      result.index = chars.findIndex(function (entry) { return entry.id === hero.id })
      if (result.index < 0) throw new Error('缺少角色动作：' + hero.name)
      result.portrait = portrait(sheets[hero.file], 120)
      return result
    })
    const monsters = MONSTERS.map(function (monster) {
      const result = Object.assign({}, monster)
      result.index = chars.findIndex(function (entry) { return entry.id === monster.id })
      if (result.index < 0) throw new Error('缺少怪物動作：' + monster.name)
      result.portrait = portrait(sheets[monster.file], 120)
      return result
    })
    const monsterPortrait = monsters[0].portrait
    const diagnostics = { sourceSheets: files.length, characterAtlases: 0, propAtlases: 0, framePictures: 0, oneToOneArtwork: false, characterMapping: [] }
    pack.data.object.forEach(function (entry) {
      if (!entry.data || entry.data === 'lazy' || !entry.data.bmp || !entry.data.bmp.file) {
        throw new Error('未加载可替换的动作素材：' + entry.id)
      }
      if (entry.type === 'character') {
        const hero = heroes.find(function (item) { return item.id === entry.id })
        const artwork = hero || monsters.find(function (item) { return item.id === entry.id }) || monsters[0]
        entry.name = artwork.name
        entry.pic = artwork.portrait
        entry.data.bmp.name = entry.name
        entry.data.bmp.head = entry.pic
        entry.data.bmp.small = portrait(sheets[artwork.file], 32)
        entry.realityPlayable = !!hero
        if (!nativeAnimation) diagnostics.framePictures += characterAtlas(entry.data, sheets[artwork.file], sheets['skills-effects.png'], entry.id)
        diagnostics.characterAtlases += entry.data.bmp.file.length
        const pictures = frameLookup(entry.data)
        diagnostics.characterMapping.push({
          id: entry.id, nativeId: entry.realityNativeId || entry.id, name: entry.name, nativeFrames: Object.keys(entry.data.frame).length,
          nativePictures: Object.keys(pictures).length, authoredPoses: 16,
          source: artwork.file, exactArtwork: false,
          frames: Object.keys(entry.data.frame).map(function (key) {
            const frame = entry.data.frame[key]
            return { frame: Number(key), name: frame.name, pic: frame.pic, wait: frame.wait, next: frame.next,
              sourcePose: poseForFrame(pictures[frame.pic] || frame) }
          })
        })
      } else {
        if (!nativeAnimation) diagnostics.framePictures += propAtlas(entry, sheets['props.png'], sheets['skills-effects.png'])
        diagnostics.propAtlases += entry.data.bmp.file.length
      }
    })

    const shadowCanvas = canvas(38, 12)
    drawCell(shadowCanvas.getContext('2d'), sheets['props.png'], 15, 0, 0, 38, 12)
    const shadow = shadowCanvas.toDataURL('image/png')
    const panelHeight = pack.data.UI.data.panel.height
    const nativeBackgrounds = pack.data.background
    pack.data.background = STAGES.map(function (stage) {
      const native = nativeBackgrounds.find(function (entry) { return entry.id === stage.nativeId })
      if (!native || !native.data || native.data === 'lazy') throw new Error('缺少原生场地数据：' + stage.nativeId)
      return stageData(stage, images[stage.file], shadow, panelHeight, native)
    })
    pack.data.icon = heroes[0].portrait
    // A reskin must not change MP, friendly hits, flute targets or healing pulses.
    pack.data.realityRules = {}
    // LF2's normal resource fallback prefixes package.location to relative paths.
    // Let the new same-origin absolute paths and prepared images pass unchanged.
    pack.resourcemap = {
      condition: 'location contain http at 0',
      resource: {},
      get: function (resource) {
        return /^(?:data:|blob:|https?:\/\/|\/)/.test(resource) ? resource : null
      }
    }
    pack.reality = {
      version: VERSION,
      heroes: heroes,
      monsters: monsters,
      stages: STAGES.map(function (stage, index) {
        return { id: stage.id, nativeId: stage.nativeId, index: index, name: stage.name, title: stage.name, subtitle: stage.subtitle,
          description: stage.subtitle, preview: ROOT + stage.file,
          zboundary: pack.data.background[index].data.zboundary.slice() }
      }),
      enemyIndex: chars.findIndex(function (entry) { return entry.id === 30 }),
      enemyName: '纸卷怪',
      enemyPortrait: monsterPortrait,
      diagnostics: diagnostics
    }
    return pack
  }

  return prepareRealityArt
})
