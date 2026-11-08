// clear-ui · 浏览器半边的冒烟测试：不开浏览器，直接跑 ModuleLoader 里的工厂函数。
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

function loadBundle() {
  let captured
  const store = new Map()
  const window = {
    __ModuleLoader__: {
      load(opts) {
        captured = opts
      },
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        store.set(k, String(v))
      },
    },
  }
  vm.runInContext(SRC, vm.createContext({ window, console }), { filename: 'client.js' })
  assert.ok(captured, 'client.js must call window.__ModuleLoader__.load')
  assert.strictEqual(captured.id, 'clear-ui')

  const react = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children }
    },
    useState(init) {
      return [init, () => {}]
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
  const mod = captured.factory((id) => {
    if (id === 'react') return react
    throw new Error('unexpected require: ' + id)
  })
  return { mod, store }
}

function walk(node, out) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  if (typeof node === 'object') {
    out.push(node)
    walk(node.children, out)
  }
  return out
}

const findButton = (tree) => walk(tree, []).find((node) => node.type === 'button')

function harness(initial) {
  const { mod, store } = loadBundle()
  assert.ok(mod.inject.includes('slots'), 'inject must include slots')
  assert.ok(mod.inject.includes('configForms'), 'inject must include configForms')

  const writes = []
  const snapshot = { status: 'ready', writable: true, value: Object.assign({}, initial) }
  const state = { snapshot }
  const controller = {
    getSnapshot: () => state.snapshot,
    subscribe: () => () => {},
    set(field, value) {
      writes.push([field, value])
      state.snapshot = Object.assign({}, state.snapshot, { value: Object.assign({}, state.snapshot.value, { [field]: value }) })
      return Promise.resolve(true)
    },
  }

  const registrations = []
  let injectedSlot = null
  const slots = {
    inject(name, factory) {
      injectedSlot = name
      factory()
    },
    register(opts, Comp) {
      registrations.push({ opts, Comp })
      return { dispose() {} }
    },
  }
  const forms = {
    get(ns) {
      assert.strictEqual(ns, 'ui-chat')
      return controller
    },
  }

  mod.apply({ slots, configForms: forms })
  assert.strictEqual(injectedSlot, 'conversation.input.dock')
  assert.strictEqual(registrations.length, 1)
  const reg = registrations[0]
  assert.strictEqual(reg.opts.name, 'conversation.input.dock')
  assert.strictEqual(reg.opts.id, 'clear-ui')

  const props = reg.opts.inject('session-1')
  return { reg, props, writes, store, state, snapshot }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function main() {
  // 1. 标准档 -> 点一下切到 compact，并记住回退档。
  const a = harness({ transcriptView: 'standard' })
  const btnOff = findButton(a.reg.Comp(a.props))
  assert.strictEqual(btnOff.props['data-clear-ui'], 'off')
  assert.strictEqual(btnOff.props.disabled, false)
  btnOff.props.onClick()
  await tick()
  assert.deepStrictEqual(a.writes[0], ['transcriptView', 'compact'])
  assert.strictEqual(a.store.get('clear-ui:prev-transcript-view'), 'standard')

  // 2. 切完按钮变「开」，再点一下回到记住的档位。
  const btnOn = findButton(a.reg.Comp(a.props))
  assert.strictEqual(btnOn.props['data-clear-ui'], 'on')
  btnOn.props.onClick()
  await tick()
  assert.deepStrictEqual(a.writes[1], ['transcriptView', 'standard'])

  // 3. 已经是 detailed 时，回退档跟着走。
  const b = harness({ transcriptView: 'detailed' })
  findButton(b.reg.Comp(b.props)).props.onClick()
  await tick()
  assert.strictEqual(b.store.get('clear-ui:prev-transcript-view'), 'detailed')
  findButton(b.reg.Comp(b.props)).props.onClick()
  await tick()
  assert.deepStrictEqual(b.writes[1], ['transcriptView', 'detailed'])

  // 3b. legacy 值 normal / expanded 当作 detailed：回退档记 detailed，不写回 legacy。
  const c = harness({ transcriptView: 'normal' })
  findButton(c.reg.Comp(c.props)).props.onClick()
  await tick()
  assert.strictEqual(c.store.get('clear-ui:prev-transcript-view'), 'detailed')
  findButton(c.reg.Comp(c.props)).props.onClick()
  await tick()
  assert.deepStrictEqual(c.writes[1], ['transcriptView', 'detailed'])

  // 4. 设置还没读到时禁用，不写 Host。
  const { mod, store } = loadBundle()
  const pending = { status: 'loading', writable: false, value: undefined }
  const pendingCtl = { getSnapshot: () => pending, subscribe: () => () => {}, set: () => assert.fail('must not write while loading') }
  let Comp = null
  mod.apply({
    slots: { inject: (n, f) => f(), register: (o, C) => { Comp = C; return { dispose() {} } } },
    configForms: { get: () => pendingCtl },
  })
  const tree = Comp({ controller: pendingCtl, source: { subscribe: pendingCtl.subscribe, getSnapshot: pendingCtl.getSnapshot } })
  const btn = findButton(tree)
  assert.strictEqual(btn.props.disabled, true)
  assert.strictEqual(btn.props['data-clear-ui'], 'off')

  // 5. dock 横排：靠一段覆盖 display:contents 的样式，条目自己会排成一行。
  assert.ok(/display:flex!important/.test(mod.DOCK_ROW_CSS), 'dock row must force flex')
  assert.ok(mod.DOCK_ROW_CSS.includes('flex-wrap:wrap'), 'dock row must wrap')
  assert.ok(mod.DOCK_ROW_CSS.includes('div[data-slot="conversation.input.dock"]'), 'dock row must target the slot anchor')

  console.log('client smoke ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
