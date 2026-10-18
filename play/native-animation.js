/* One native picture -> one atlas cell. Frame data and anchors are immutable. */
define(['game/native-animation-data'], function (catalog) {
  'use strict'
  const cache = new Map()
  function plan(entry) {
    const nativeId = entry.realityNativeId || entry.id
    const original = catalog.objects.find(function (record) { return record.id === nativeId })
    if (!original || original.sheets.length !== entry.data.bmp.file.length) throw new Error('缺少原生动画图集：' + entry.id)
    return original.sheets.map(function (sheet) {
      const replacement = catalog.replacements[entry.id + ':' + sheet.source + ':' + sheet.start] || catalog.replacements[entry.id + ':' + sheet.source]
      const patches = (catalog.patches || []).filter(function (patch) { return patch.objectId === entry.id && patch.pic >= sheet.start && patch.pic < sheet.start + sheet.count })
      return Object.assign({}, sheet, { replacement: replacement && (replacement.registered || replacement.reviewed) ? replacement : null, patches: patches, lockAlpha: ['specialattack', 'effect', 'broken'].indexOf(entry.type) !== -1 })
    })
  }
  function bounds(pixels, width, height, rect, threshold) {
    if (threshold === undefined) threshold = 24
    let left = width; let top = height; let right = -1; let bottom = -1
    const x0 = Math.max(0, Math.floor(rect.x)); const y0 = Math.max(0, Math.floor(rect.y))
    const x1 = Math.min(width, Math.ceil(rect.x + rect.w)); const y1 = Math.min(height, Math.ceil(rect.y + rect.h))
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (pixels[(y * width + x) * 4 + 3] > threshold) {
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
      }
    }
    return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
  }
  function surface(width, height) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    canvas.getContext('2d').imageSmoothingEnabled = false
    return canvas
  }
  function load(url) {
    if (!cache.has(url)) cache.set(url, new Promise(function (resolve, reject) {
      const image = new Image()
      image.onload = function () {
        const canvas = surface(image.naturalWidth, image.naturalHeight)
        canvas.getContext('2d').drawImage(image, 0, 0)
        resolve({ image: image, width: canvas.width, height: canvas.height,
          pixels: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data })
      }
      image.onerror = function () { reject(new Error('无法加载逐帧图集：' + url)) }
      image.src = url
    }))
    return cache.get(url)
  }
  // Generated pages can have unequal gutters. Find the least occupied cut near
  // each declared grid boundary; calibrate artwork within each native picture.
  function seams(source, count, axis, explicit) {
    const size = axis === 'x' ? source.width : source.height
    if (explicit) return explicit.slice()
    const step = size / count
    const cuts = [0]
    for (let index = 1; index < count; index++) {
      const target = step * index
      let best = Math.round(target); let score = Infinity
      const radius = Math.ceil(step * 0.23)
      for (let cut = Math.max(cuts[index - 1] + 1, Math.floor(target - radius)); cut <= Math.min(size - 1, Math.ceil(target + radius)); cut++) {
        let occupied = 0
        const span = axis === 'x' ? source.height : source.width
        for (let pos = 0; pos < span; pos++) {
          const x = axis === 'x' ? cut : pos; const y = axis === 'x' ? pos : cut
          if (source.pixels[(y * source.width + x) * 4 + 3] > 24) occupied++
        }
        const candidate = occupied * 1000 + Math.abs(cut - target)
        if (candidate < score) { score = candidate; best = cut }
      }
      cuts.push(best)
    }
    cuts.push(size)
    return cuts
  }
  // Preserve coverage when reducing generated artwork to LF2's tiny cells.
  // Nearest-neighbour drops thin hands/feet and can move the visible extremity
  // by many pixels; choose the strongest alpha in each destination footprint.
  function fitPixels(source, rect, width, height) {
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const cx = rect.x + (x + 0.5) * rect.w / width
      const cy = rect.y + (y + 0.5) * rect.h / height
      const x0 = Math.floor(rect.x + x * rect.w / width)
      const y0 = Math.floor(rect.y + y * rect.h / height)
      const x1 = Math.min(source.width, Math.ceil(rect.x + (x + 1) * rect.w / width))
      const y1 = Math.min(source.height, Math.ceil(rect.y + (y + 1) * rect.h / height))
      let best = -1; let alpha = 0; let distance = Infinity
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const index = (sy * source.width + sx) * 4
        const a = source.pixels[index + 3]
        const d = (sx + 0.5 - cx) * (sx + 0.5 - cx) + (sy + 0.5 - cy) * (sy + 0.5 - cy)
        if (a > alpha || a === alpha && a > 0 && d < distance) { best = index; alpha = a; distance = d }
      }
      if (best >= 0) pixels.set(source.pixels.subarray(best, best + 4), (y * width + x) * 4)
    }
    return pixels
  }
  // FX animation is defined by its native silhouette and disappearance mask.
  // Keep new colors, but clip generation halos/grid lines and retain every
  // original fading pixel. Fill color gaps from the nearest generated pigment.
  function maskEffectPixels(pixels, native, rect) {
    const result = pixels.slice(); const size = rect.w * rect.h
    const seen = new Uint8Array(size); const queue = new Int32Array(size)
    let head = 0; let tail = 0
    for (let index = 0; index < size; index++) if (result[index * 4 + 3] > 0) { seen[index] = 1; queue[tail++] = index }
    while (head < tail) {
      const index = queue[head++]; const x = index % rect.w
      const neighbours = [x > 0 ? index - 1 : -1, x + 1 < rect.w ? index + 1 : -1, index - rect.w, index + rect.w]
      neighbours.forEach(function (next) {
        if (next < 0 || next >= size || seen[next]) return
        seen[next] = 1; queue[tail++] = next
        for (let color = 0; color < 3; color++) result[next * 4 + color] = result[index * 4 + color]
      })
    }
    for (let index = 0; index < size; index++) {
      const source = ((rect.y + Math.floor(index / rect.w)) * native.width + rect.x + index % rect.w) * 4
      const target = index * 4
      const energy = Math.min(255, Math.max(native.pixels[source], native.pixels[source + 1], native.pixels[source + 2]) * 1.2)
      const pigment = Math.max(1, result[target], result[target + 1], result[target + 2])
      const scale = Math.min(1, energy / pigment)
      for (let color = 0; color < 3; color++) result[target + color] = Math.round(result[target + color] * scale)
      result[target + 3] = native.pixels[source + 3]
    }
    return result
  }
  function normalize(native, artwork, spec, patchSources) {
    const result = surface(spec.width, spec.height)
    const context = result.getContext('2d')
    const cellWidth = spec.width / spec.columns; const cellHeight = spec.height / spec.rows
    const replacement = spec.replacement
    const usedPictures = spec.usedPictures ? new Set(spec.usedPictures) : null
    const xs = seams(artwork, replacement.columns, 'x', replacement.xCuts)
    const ys = seams(artwork, replacement.rows, 'y', replacement.yCuts)
    const cells = []
    for (let pic = 0; pic < spec.count; pic++) {
      const col = pic % spec.columns; const row = Math.floor(pic / spec.columns)
      if (usedPictures && !usedPictures.has(spec.start + pic)) { cells.push({ pic: spec.start + pic, empty: true, unused: true }); continue }
      const nativeBounds = bounds(native.pixels, native.width, native.height,
        { x: col * cellWidth, y: row * cellHeight, w: cellWidth - 1, h: cellHeight - 1 }, spec.lockAlpha ? 0 : 24)
      if (!nativeBounds) { cells.push({ pic: spec.start + pic, empty: true }); continue }
      // Teleport disappearance uses an almost empty native picture (Woody188
      // is one dark source pixel). Preserve it; never invent a visible body.
      if (nativeBounds.w * nativeBounds.h <= 4) {
        context.drawImage(native.image, nativeBounds.x, nativeBounds.y, nativeBounds.w, nativeBounds.h,
          nativeBounds.x, nativeBounds.y, nativeBounds.w, nativeBounds.h)
        cells.push({ pic: spec.start + pic, empty: false, nativeBounds: nativeBounds, nativeOnly: true })
        continue
      }
      const sourceRow = row - (replacement.rowOffset || 0)
      const sourceCol = col - (replacement.columnOffset || 0)
      if (sourceRow < 0 || sourceCol < 0 || sourceRow >= replacement.rows || sourceCol >= replacement.columns) throw new Error('逐帧图集缺少原生行：' + replacement.file + ' pic ' + (spec.start + pic))
      const patch = (spec.patches || []).find(function (item) { return item.pic === spec.start + pic })
      const active = patch && patchSources ? patchSources[patch.pic] : artwork
      const sourceRect = patch ? patch.sourceRect || { x: 0, y: 0, w: active.width, h: active.height }
        : { x: xs[sourceCol], y: ys[sourceRow], w: xs[sourceCol + 1] - xs[sourceCol], h: ys[sourceRow + 1] - ys[sourceRow] }
      const sourceBounds = bounds(active.pixels, active.width, active.height, sourceRect, 64)
      if (!sourceBounds) throw new Error('逐帧图集缺少动作：' + replacement.file + ' pic ' + (spec.start + pic))
      const fitted = context.createImageData(nativeBounds.w, nativeBounds.h)
      const pigment = fitPixels(active, sourceBounds, nativeBounds.w, nativeBounds.h)
      fitted.data.set(spec.lockAlpha ? maskEffectPixels(pigment, native, nativeBounds) : pigment)
      context.putImageData(fitted, nativeBounds.x, nativeBounds.y)
      cells.push({ pic: spec.start + pic, empty: false, sourceBounds: sourceBounds, nativeBounds: nativeBounds, patch: patch ? patch.file : null })
    }
    return { url: result.toDataURL('image/png'), cells: cells, xCuts: xs, yCuts: ys }
  }
  async function prepare(pack) {
    if (pack.reality.animation && pack.reality.animation.version === catalog.version) return pack
    const report = { version: catalog.version, mode: 'native-picture', sheets: [], nativeFrames: 0, generatedSheets: 0, originalSheets: 0 }
    const changes = await Promise.all(pack.data.object.map(async function (entry) {
      const specs = plan(entry)
      if (entry.type === 'character') report.nativeFrames += Object.keys(entry.data.frame).length
      const files = await Promise.all(specs.map(async function (spec, index) {
        const sourceUrl = '/those-who-fight-reality/content/' + spec.source
        const sheet = { object: entry.id, sheet: index, source: spec.source, start: spec.start, count: spec.count, width: spec.width, height: spec.height }
        let url = sourceUrl
        if (spec.replacement) {
          const loaded = await Promise.all([load(sourceUrl), load('/those-who-fight-reality/play/art/' + spec.replacement.file)])
          const patchSources = {}
          await Promise.all(spec.patches.map(async function (patch) { patchSources[patch.pic] = await load('/those-who-fight-reality/play/art/' + patch.file) }))
          const normalized = normalize(loaded[0], loaded[1], spec, patchSources)
          url = normalized.url
          sheet.artwork = spec.replacement.file
          sheet.lockAlpha = spec.lockAlpha
          sheet.cells = normalized.cells
          sheet.xCuts = normalized.xCuts; sheet.yCuts = normalized.yCuts
          report.generatedSheets++
        } else {
          // Unredrawn effects/hidden characters keep their full original motion,
          // never a static effect or a repeated sixteen-pose approximation.
          await load(sourceUrl)
          sheet.artwork = null
          report.originalSheets++
        }
        report.sheets.push(sheet)
        return { index: index, url: url }
      }))
      return { entry: entry, files: files }
    }))
    // Commit only after every image and every required native cell is validated.
    changes.forEach(function (change) {
      change.files.forEach(function (file) {
        const record = change.entry.data.bmp.file[file.index]
        const key = Object.keys(record).find(function (name) { return name.indexOf('file') === 0 && typeof record[name] === 'string' })
        record[key] = file.url
      })
    })
    report.redrawnPictures = report.sheets.filter(function (sheet) { return sheet.artwork }).reduce(function (sum, sheet) { return sum + sheet.cells.filter(function (cell) { return !cell.unused }).length }, 0)
    report.campusCharacterIds = (pack.reality.heroes || []).concat(pack.reality.monsters || []).map(function (entry) { return entry.id })
    report.missingFramePolicy = 'reject'
    report.sheets.sort(function (a, b) { return a.object - b.object || a.sheet - b.sheet })
    pack.reality.animation = report
    pack.reality.diagnostics.animationMode = 'native-picture'
    pack.reality.diagnostics.oneToOneArtwork = report.originalSheets === 0
    pack.reality.diagnostics.characterMapping.forEach(function (record) {
      record.authoredPoses = null
      record.exactArtwork = false
      record.animationMode = 'native-picture'
      record.frames.forEach(function (frame) { delete frame.sourcePose; frame.sourcePic = frame.pic })
    })
    cache.clear() // Release decoded template/candidate pixels after startup.
    return pack
  }
  return { prepare: prepare, plan: plan, bounds: bounds, seams: seams, normalize: normalize, fitPixels: fitPixels, maskEffectPixels: maskEffectPixels }
})
