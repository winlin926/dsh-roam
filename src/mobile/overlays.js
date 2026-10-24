const focusable = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export class OverlayManager {
  constructor({ root, page, history = globalThis.history } = {}) {
    this.root = root
    this.page = page
    this.backgrounds = [page, document.getElementById('navigationDrawer')].filter(Boolean)
    this.browserHistory = history
    this.closeLabel = document.documentElement.lang.startsWith('en') ? 'Close' : '关闭'
    this.stack = []
    this.sequence = 0
    this.closingTokens = new Set()
    this.onKeyDown = this.onKeyDown.bind(this)
    document.addEventListener('keydown', this.onKeyDown)
  }

  open({ name, content, className = '', dismissible = true, onClose, focus = true }) {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const id = `overlay-${++this.sequence}`
    const entry = { id, name, dismissible, onClose, trigger, content, history: false }
    const token = `${id}:${name}`
    this.browserHistory?.pushState({ ...(this.browserHistory.state ?? {}), overlay: token }, '')
    entry.history = true
    entry.token = token
    const element = document.createElement('div')
    element.className = `overlay ${className}`
    element.dataset.overlayId = id
    element.dataset.overlay = name
    const mask = document.createElement('button')
    mask.type = 'button'
    mask.className = 'overlay-mask'
    mask.setAttribute('aria-label', this.closeLabel)
    mask.tabIndex = -1
    mask.addEventListener('click', () => { if (dismissible) this.requestClose(id) })
    element.append(mask)
    const panel = document.createElement('section')
    panel.className = 'overlay-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.tabIndex = -1
    if (typeof content === 'string') panel.innerHTML = content
    else if (content) panel.append(content)
    element.append(panel)
    this.root.append(element)
    entry.element = element
    entry.panel = panel
    this.stack.push(entry)
    this.sync()
    if (focus) (panel.querySelector('[data-autofocus], button:not([disabled]), input:not([disabled]), textarea:not([disabled])') ?? panel).focus({ preventScroll: true })
    return id
  }

  find(id) { return this.stack.find(entry => entry.id === id) }

  replace(id, options) {
    const index = this.stack.findIndex(entry => entry.id === id)
    if (index < 0) return this.open(options)
    const entry = this.stack[index]
    const token = entry.history ? `${id}:${options.name}` : `${id}:${options.name}:forward`
    entry.name = options.name
    entry.token = token
    this.closingTokens.delete(entry.token)
    entry.history = true
    entry.onClose = options.onClose
    if (options.dismissible !== undefined) entry.dismissible = options.dismissible
    this.browserHistory?.replaceState({ ...(this.browserHistory.state ?? {}), overlay: token }, '')
    entry.element.className = `overlay ${options.className ?? ''}`
    entry.element.dataset.overlay = options.name
    entry.panel.replaceChildren()
    if (typeof options.content === 'string') entry.panel.innerHTML = options.content
    else if (options.content) entry.panel.append(options.content)
    this.sync()
    if (options.focus !== false) (entry.panel.querySelector('[data-autofocus], button:not([disabled]), input:not([disabled]), textarea:not([disabled])') ?? entry.panel).focus({ preventScroll: true })
    return id
  }

  requestClose(id) {
    const entry = this.find(id)
    if (!entry || !entry.dismissible) return false
    if (entry.history && this.browserHistory?.state?.overlay === entry.token) {
      entry.history = false
      this.closingTokens.add(entry.token)
      this.browserHistory.back()
    } else this.remove(entry.id)
    return true
  }

  handlePopState(state) {
    const overlay = state?.overlay
    if (this.closingTokens.delete(overlay)) return false
    const current = this.stack.at(-1)
    if (!current) return false
    if (overlay && overlay !== current.token) {
      const index = this.stack.findIndex(entry => entry.token === overlay)
      if (index >= 0) {
        for (const entry of this.stack.slice(index + 1).reverse()) this.remove(entry.id, false)
        this.sync()
        return true
      }
    }
    this.remove(current.id, false)
    this.sync()
    return true
  }

  remove(id, notify = true) {
    const index = this.stack.findIndex(entry => entry.id === id)
    if (index < 0) return
    const [entry] = this.stack.splice(index, 1)
    entry.element.remove()
    if (notify) entry.onClose?.()
    this.sync()
    const parent = this.stack.at(-1)
    if (parent) (parent.panel.querySelector(focusable) ?? parent.panel).focus({ preventScroll: true })
    else if (entry.trigger?.isConnected) entry.trigger.focus({ preventScroll: true })
  }

  closeAll() { for (const entry of [...this.stack].reverse()) this.remove(entry.id, false) }

  sync() {
    const top = this.stack.at(-1)
    for (const background of this.backgrounds) background.inert = Boolean(top)
    for (const entry of this.stack) {
      const active = entry === top
      entry.element.inert = !active
      entry.element.setAttribute('aria-hidden', String(!active))
    }
    document.body.classList.toggle('overlay-open', Boolean(top))
  }

  onKeyDown(event) {
    const top = this.stack.at(-1)
    if (!top) return
    if (event.key === 'Escape' && top.dismissible) { event.preventDefault(); this.requestClose(top.id); return }
    if (event.key !== 'Tab') return
    const elements = [...top.panel.querySelectorAll(focusable)].filter(element => !element.hidden && element.getClientRects().length)
    if (!elements.length) { event.preventDefault(); top.panel.focus(); return }
    const first = elements[0], last = elements.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === top.panel)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
}
