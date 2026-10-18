/* Verifies the art adapter against the real LF2 dataset without a browser.
 * Browser screenshots remain necessary to judge the generated artwork itself.
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'vendor/LF2_19')
const drawing = []
let serial = 0

function readAMD(file, sandbox = {}) {
  let exported
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), Object.assign({
    define(value) { exported = typeof value === 'function' ? value() : value },
    setTimeout, clearTimeout, Image: FakeImage, document: { createElement: createCanvas }
  }, sandbox), { filename: file })
  return exported
}

class FakeImage {
  constructor() { this.naturalWidth = 256; this.naturalHeight = 256 }
  set src(value) {
    this.url = value
    if (value.includes('stage-')) { this.naturalWidth = 1672; this.naturalHeight = 941 }
    queueMicrotask(() => this.onload())
  }
}

function createCanvas(type) {
  assert.equal(type, 'canvas')
  const result = {
    width: 0, height: 0,
    toDataURL() { return 'data:image/png;base64,atlas' + serial++ },
    getContext() { return context }
  }
  const context = {
    imageSmoothingEnabled: false,
    drawImage(image, ...args) {
      assert(args.every(Number.isFinite), 'drawing coordinates must be finite')
      if (args.length === 8) {
        assert(args[2] > 0 && args[3] > 0, 'source dimensions must be positive')
        assert(args[6] > 0 && args[7] > 0, 'target dimensions must be positive')
        assert(args[4] >= 0 && args[5] >= 0, 'source must remain inside the atlas')
        assert(args[4] + args[6] <= result.width + 1, 'draw must remain inside atlas width')
        assert(args[5] + args[7] <= result.height + 1, 'draw must remain inside atlas height')
      }
      drawing.push({ url: image.url, args, width: result.width, height: result.height })
    },
    getImageData(x, y, width, height) {
      const pixels = new Uint8ClampedArray(width * height * 4)
      // Fake transparent sheets: standing figures 28x48; the falling figure 48x20.
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const cell = Math.floor(py / 64) * 4 + Math.floor(px / 64)
          const lx = px % 64; const ly = py % 64
          const visible = cell === 13 ? lx >= 8 && lx < 56 && ly >= 36 && ly < 56 : lx >= 18 && lx < 46 && ly >= 8 && ly < 56
          if (visible) pixels[(py * width + px) * 4 + 3] = 255
        }
      }
      return { data: pixels }
    }
  }
  return result
}

async function main() {
  const data = readAMD(path.join(source, 'data/data.js'))
  data.object.forEach(entry => { entry.data = readAMD(path.join(source, entry.file)) })
  data.background.forEach(entry => { entry.data = readAMD(path.join(source, entry.file)) })
  const nativeStages = [4, 3, 1, 4, 4].map(id => JSON.parse(JSON.stringify(data.background.find(entry => entry.id === id))))
  data.UI.data = readAMD(path.join(source, data.UI.file))
  const sharedRecords = data.object
  const original = JSON.parse(JSON.stringify(data.object))
  let loadCount = 0
  data.load = function (sets, done) {
    loadCount++
    assert.equal(sets.object.length, original.length, 'prepare must preload every object')
    done()
  }
  const pack = { data, location: '/LF2_19/' }
  const prepare = readAMD(path.join(root, 'vendor/F.LF/game/reality-art.js'))
  const prepared = await prepare(pack)
  assert.equal(prepared, pack)
  assert.equal(loadCount, 1)
  assert.equal(pack.reality.heroes.length, 6)
  assert.equal(JSON.stringify(pack.reality.heroes.map(hero => [hero.id, hero.index])), JSON.stringify([[11, 10], [2, 2], [8, 7], [4, 3], [9, 8], [10, 9]]))
  assert.equal(pack.reality.enemyIndex, 0)
  assert.equal(pack.data.background.length, 5)
  assert.equal(pack.reality.diagnostics.sourceSheets, 16)
  assert.equal(JSON.stringify(pack.reality.monsters.map(monster => monster.id)), '[30,31,32]')
  for (const monster of pack.reality.monsters) {
    assert(monster.portrait.startsWith('data:'))
    const entry = pack.data.object.filter(entry => entry.type === 'character')[monster.index]
    assert.equal(entry.id, monster.id)
    assert.equal(entry.name, monster.name)
    assert.equal(pack.reality.diagnostics.characterMapping.find(entry => entry.id === monster.id).source, monster.file)
  }

  pack.data.object.forEach((entry, index) => {
    const nativeIndex = original.findIndex(item => item.id === (entry.realityNativeId || entry.id))
    const native = original[nativeIndex]
    assert(native, 'each character must retain a documented native motion source')
    assert.equal(JSON.stringify(entry.data.frame), JSON.stringify(native.data.frame), 'frame timing, hitboxes and anchors must remain unchanged for ' + entry.id)
    const oldFiles = native.data.bmp.file
    entry.data.bmp.file.forEach((file, i) => {
      for (const field of ['w', 'h', 'row', 'col']) assert.equal(file[field], oldFiles[i][field], 'atlas grid must preserve original ' + field)
      const imageKey = Object.keys(file).find(key => key.startsWith('file'))
      assert(file[imageKey].startsWith('data:image/png;'), 'every drawable object must use a prepared atlas')
      assert(!sharedRecords[nativeIndex].data.bmp.file[i][imageKey].startsWith('data:'), 'shared AMD data must not be changed')
    })
    const physics = bmp => JSON.stringify(Object.fromEntries(Object.entries(bmp).filter(([key]) => !['file', 'name', 'head', 'small'].includes(key))))
    assert.equal(physics(entry.data.bmp), physics(native.data.bmp), 'movement and weapon statistics must remain unchanged')
  })
  assert.deepEqual(JSON.parse(JSON.stringify(pack.data.realityRules)), {}, 'a visual adapter must not opt into combat changes')
  for (const [i, stage] of pack.data.background.entries()) {
    const native = nativeStages[i].data
    assert.equal(stage.data.width, native.width, 'native horizontal arena boundary')
    assert.deepEqual(JSON.parse(JSON.stringify(stage.data.zboundary)), native.zboundary, 'native depth boundary')
    assert.deepEqual(JSON.parse(JSON.stringify(stage.data.shadowsize)), native.shadowsize)
    assert.equal(stage.data.layer[0].y, 128)
    assert.equal(stage.data.layer[0].x, -103)
    assert(stage.data.layer[0].pic.startsWith('data:'))
    assert.equal(pack.reality.stages[i].nativeId, nativeStages[i].id)
  }
  assert.equal(pack.resourcemap.get('/F.LF/game/art/test.png'), '/F.LF/game/art/test.png')
  assert.equal(pack.resourcemap.get('data:image/png;base64,test'), 'data:image/png;base64,test')
  assert.equal(pack.resourcemap.get('sprite/old.png'), null)

  const heroDraws = drawing.filter(draw => draw.url && draw.url.endsWith('xiaoyi.png') && draw.width === 800 && draw.args.length === 8)
  const falling = heroDraws.find(draw => draw.args[0] === 72 && draw.args[1] === 228)
  const standing = heroDraws.find(draw => draw.args[0] === 18 && draw.args[1] === 8)
  assert(falling && standing, 'standing and falling frames must both map to their source poses')
  assert(falling.args[7] < standing.args[7], 'falling pose must not be stretched to standing height')
  const previousDraws = drawing.length
  await prepare(pack)
  assert.equal(drawing.length, previousDraws, 'prepare must not redraw on repeated calls')
  assert.equal(pack.reality.diagnostics.oneToOneArtwork, false, 'reused poses must not be reported as complete artwork')
  const { characterMapping, ...counts } = pack.reality.diagnostics
  const report = { baseline: 'F.LF 21341737 / LF2_19 ac3df7ef', rules: pack.data.realityRules, counts,
    stages: pack.reality.stages.map(stage => ({ name: stage.name, nativeId: stage.nativeId, zboundary: stage.zboundary })), characterMapping }
  fs.writeFileSync(path.join(root, 'docs/verification/native-frame-mapping.json'), JSON.stringify(report, null, 2) + '\n')
  console.log('Reality art adapter checks passed:', counts)
  console.log('Native character frame mappings:', characterMapping.reduce((sum, ch) => sum + ch.nativeFrames, 0))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
