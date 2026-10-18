const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const upstream = path.join(__dirname, 'fixtures/upstream')

test('the portable upstream baseline matches its pinned commit and checksums', () => {
  const { createHash } = require('node:crypto')
  const manifest = JSON.parse(fs.readFileSync(path.join(upstream, 'manifest.json'), 'utf8'))
  assert.equal(manifest.commit, '21341737e4154d06d9784e9a629c9dd4db9148d6')
  for (const [file, expected] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(path.join(upstream, file))
    assert.equal(bytes.length, expected.bytes, file)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, file)
  }
})
test('the shipped art package does not enable combat rule overrides', () => {
  const source = fs.readFileSync(path.join(root, 'vendor/F.LF/game/reality-art.js'), 'utf8')
  assert.doesNotMatch(source, /pack\.data\.realityRules\s*=\s*\{[^}]*friendlySupport:\s*true/)
  assert.doesNotMatch(source, /pack\.data\.realityRules\s*=\s*\{[^}]*fullManaHeroIds:/)
})
test('standard entry opens native free battle rather than chapter rules', () => {
  for (const file of ['urban-ui.js', 'chapter-ui.js']) {
    const source = fs.readFileSync(path.join(root, 'vendor/F.LF/game', file), 'utf8')
    if (file === 'chapter-ui.js') assert.match(source, /let mode = 'free'/)
    else assert.doesNotMatch(source, /setMode\('story'\)/)
  }
})

test('movement, simulation clock and native combo recognition stay byte-identical to upstream', () => {
  const engine = path.join(root, 'vendor/F.LF')
  for (const file of ['LF/mechanics.js', 'LF/match.js', 'LF/livingobject.js', 'LF/global.js', 'core/combodec.js']) {
    const baseline = fs.readFileSync(path.join(upstream, file), 'utf8')
    assert.equal(fs.readFileSync(path.join(engine, file), 'utf8'), baseline, file)
  }
})
