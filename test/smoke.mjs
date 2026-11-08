import assert from 'node:assert'
import { apply, inject, name } from '../lib/index.js'

assert.strictEqual(name, 'clear-ui')
assert.ok(Array.isArray(inject))
assert.strictEqual(typeof apply, 'function')
apply()
console.log('host smoke ok')
