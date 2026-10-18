const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')

// Exercise the real demo entry point without constructing the DOM-based manager.
const source = fs.readFileSync(path.join(__dirname, '../vendor/F.LF/LF/manager.js'), 'utf8')
const start = source.indexOf('this.start_demo = ') + 'this.start_demo = '.length
const demoSource = source.slice(start, source.indexOf('// constructor', start)).trim()

test('demo selects an existing stage after the package is reduced to three campus scenes', () => {
  for (const count of [3, 9]) {
    const backgrounds = Array.from({ length: count }, (_, id) => ({ id }))
    const startDemo = vm.runInNewContext('(' + demoSource + ')', { bg_list: backgrounds })
    let created = false
    startDemo.call({
      start_match(config) {
        assert.ok(backgrounds[config.options.background], 'demo must use a stage in this package')
        assert.equal(config.demo_mode, true)
        created = true
        return {}
      }
    }, false)
    assert.equal(created, true)
  }
})
