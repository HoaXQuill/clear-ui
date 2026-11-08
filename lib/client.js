// clear-ui · 浏览器半边：输入框上方一个「清爽」开关。
//
// 它不重写任何渲染，只读写内置设置 ui-chat.transcriptView（工作详情四档：
// compact / standard / detailed / verbose）。改成 compact 后，未完成的回合不再
// 逐步展开每一个工具行，历史回合也按分组折叠 —— 就是「清爽」。
window.__ModuleLoader__.load({
  id: 'clear-ui',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const h = React.createElement
    const inject = ['slots', 'configForms']

    // 注意：register 的 name 必须是「槽位键」，不是插件名。
    const SLOT = 'conversation.input.dock'
    const NS = 'ui-chat'
    const FIELD = 'transcriptView'
    const COMPACT = 'compact'
    // 把「切回哪个档」记在本地：默认 standard（桌面端出厂档）。
    const PREV_KEY = 'clear-ui:prev-transcript-view'
    const FALLBACK_PREV = 'standard'
    const MODES = ['compact', 'standard', 'detailed', 'verbose']
    // DSH 把 legacy 值 normal / expanded 读作 detailed，但永不写回。
    const LEGACY = { normal: 'detailed', expanded: 'detailed' }

    // 槽位锚点 div[data-slot] 带着行内 style="display:contents"，所以同一槽位的
    // 每个条目默认各占一整行。把它改成一行自适应横排：谁注册进这个槽位，谁就自动
    // 排到这一行里，宽度按内容自适应（放不下时自动换行）。
    const STYLE_ID = 'clear-ui-dock-row'
    const DOCK_ROW_CSS =
      'div[data-slot="conversation.input.dock"]{' +
      'display:flex!important;flex-direction:row;flex-wrap:wrap;' +
      'align-items:center;gap:8px;width:100%;min-width:0}'

    const warn = (stage, err) => {
      try {
        console.error('[clear-ui] ' + stage, err)
      } catch (e) {}
    }

    /** 只认四个正式档；legacy 值折到 detailed，认不出的返回空串。 */
    function normalizeMode(raw) {
      if (typeof raw !== 'string') return ''
      if (LEGACY[raw]) return LEGACY[raw]
      return MODES.indexOf(raw) >= 0 ? raw : ''
    }

    function readPrev() {
      try {
        const v = window.localStorage.getItem(PREV_KEY)
        if (v && v !== COMPACT && MODES.indexOf(v) >= 0) return v
      } catch (e) {}
      return FALLBACK_PREV
    }

    function writePrev(mode) {
      try {
        if (mode && mode !== COMPACT && MODES.indexOf(mode) >= 0) {
          window.localStorage.setItem(PREV_KEY, mode)
        }
      } catch (e) {}
    }

    /** 让 dock 槽位变成一行横排。重复执行是安全的。 */
    function ensureDockRow() {
      try {
        if (typeof document === 'undefined') return
        if (document.getElementById(STYLE_ID)) return
        const el = document.createElement('style')
        el.id = STYLE_ID
        el.textContent = DOCK_ROW_CSS
        document.head.appendChild(el)
      } catch (err) {
        warn('style inject failed', err)
      }
    }

    const S = {
      wrap: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: 'var(--dsw-alias-text-secondary, #8b949e)',
      },
      pill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 26,
        padding: '0 10px',
        borderRadius: 13,
        border: '1px solid rgba(127,127,127,0.35)',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        fontSize: 12,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      pillOn: {
        border: '1px solid rgba(79,124,255,0.75)',
        background: 'rgba(79,124,255,0.16)',
        color: 'var(--dsw-alias-text-primary, inherit)',
      },
      pillOff: { opacity: 0.8 },
      dot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        background: 'rgba(127,127,127,0.55)',
      },
      dotOn: { width: 7, height: 7, borderRadius: 4, background: '#4f7cff' },
      note: { fontSize: 12, opacity: 0.75, whiteSpace: 'nowrap' },
    }

    function merge(base, over) {
      return Object.assign({}, base, over || {})
    }

    /** 订阅不变式：useSyncExternalStore 要求 subscribe/getSnapshot 引用稳定。 */
    function makeSource(controller) {
      return {
        subscribe: (listener) => controller.subscribe(listener),
        getSnapshot: () => controller.getSnapshot(),
      }
    }

    function ClearDock(props) {
      const source = props && props.source
      const controller = props && props.controller
      const snap = source ? React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot) : null
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')

      const value = snap && snap.value && typeof snap.value === 'object' ? snap.value : null
      const mode = value ? normalizeMode(value[FIELD]) : ''
      const on = mode === COMPACT
      const writable = !!(snap && snap.writable)
      const ready = !!(snap && snap.status === 'ready')

      const toggle = () => {
        if (!controller || busy) return
        const next = on ? readPrev() : COMPACT
        setBusy(true)
        setNote('')
        let p
        try {
          p = controller.set(FIELD, next)
        } catch (err) {
          warn('set failed', err)
          setBusy(false)
          setNote('切换失败')
          return
        }
        Promise.resolve(p)
          .then((accepted) => {
            if (accepted === false) {
              setNote('保存被拒绝')
              return
            }
            if (next === COMPACT) {
              if (mode) writePrev(mode)
            }
            setNote(next === COMPACT ? '已切换：日志精简' : '已恢复：' + labelOf(next))
          })
          .catch(() => setNote('切换失败'))
          .then(() => setBusy(false))
      }

      // 状态没到（还在读 Host 设置）或这份设置不可写：按钮留着但禁用，别假装能切。
      const disabled = busy || !ready || !writable
      const title = !ready
        ? '正在读取工作详情设置…'
        : !writable
          ? '这份设置当前不可写（可能不在 Host 持久化模式下）'
          : on
            ? '当前：精简（日志只留一行汇总）。点一下恢复「' + labelOf(readPrev()) + '」'
            : '当前：' + labelOf(mode || FALLBACK_PREV) + '。点一下切到「精简」，日志行不再逐步展开'

      const text = !ready ? '清爽 · …' : on ? '清爽 · 开' : '清爽 · 关'

      return h(
        'div',
        { style: S.wrap },
        h(
          'button',
          {
            type: 'button',
            style: merge(merge(S.pill, on ? S.pillOn : S.pillOff), disabled ? { cursor: 'default', opacity: 0.55 } : null),
            onClick: toggle,
            disabled: disabled,
            title: title,
            'aria-pressed': on,
            'data-clear-ui': on ? 'on' : 'off',
          },
          h('span', { style: on ? S.dotOn : S.dot }),
          text,
        ),
        note ? h('span', { style: S.note }, note) : null,
      )
    }

    function labelOf(mode) {
      switch (mode) {
        case 'compact':
          return '精简'
        case 'standard':
          return '标准'
        case 'detailed':
          return '详细'
        case 'verbose':
          return '冗长'
        default:
          return mode || '标准'
      }
    }

    function apply(ctx) {
      const slots = ctx.slots || ctx.get('slots')
      if (!slots) {
        warn('apply: slots service unavailable')
        return
      }
      const forms = ctx.configForms || ctx.get('configForms')
      if (!forms) {
        warn('apply: configForms service unavailable')
        return
      }

      let controller = null
      try {
        controller = forms.get(NS)
      } catch (err) {
        warn('apply: configForms.get(' + NS + ') failed', err)
        return
      }
      if (!controller) return
      const source = makeSource(controller)

      ensureDockRow()

      slots.inject(SLOT, () =>
        slots.register(
          {
            name: SLOT,
            id: 'clear-ui',
            order: 41,
            inject: () => ({ controller, source }),
          },
          ClearDock,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    exports.Dock = ClearDock
    exports.labelOf = labelOf
    exports.DOCK_ROW_CSS = DOCK_ROW_CSS
    return module.exports
  },
})
