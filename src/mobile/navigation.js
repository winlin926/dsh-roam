export class Navigation {
  constructor({ window: windowLike = window, drawer, mask, panel, page, closeButton, onHome, onChat }) {
    this.window = windowLike
    this.history = windowLike.history
    this.drawer = drawer
    this.mask = mask
    this.panel = panel
    this.page = page
    this.closeButton = closeButton
    this.onHome = onHome
    this.onChat = onChat
    this.drawerOpen = false
    this.current = { view: 'home' }
    this.overlays = null
    this.boundPopState = event => this.handlePopState(event.state)
    windowLike.addEventListener('popstate', this.boundPopState)
    mask.addEventListener('click', () => this.requestCloseDrawer())
    closeButton.addEventListener('click', () => this.requestCloseDrawer())
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && this.drawerOpen && !this.overlays?.stack.length) { event.preventDefault(); this.requestCloseDrawer() } })
    document.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || !this.drawerOpen || this.overlays?.stack.length) return
      const elements = [...panel.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex="0"]')].filter(element => element.getClientRects().length)
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    })
  }

  boot() {
    const route = this.route(this.history.state)
    this.history.replaceState({ view: route.view, sessionId: route.sessionId, title: route.title }, '')
    this.render(route)
  }

  route(state) { return state?.view === 'chat' && state.sessionId ? { view: 'chat', sessionId: state.sessionId, title: state.title } : { view: 'home' } }

  sameRoute(route) {
    const next = this.route(route)
    return next.view === this.current.view && next.sessionId === this.current.sessionId
  }

  render(route) {
    if (this.sameRoute(route)) return
    this.current = this.route(route)
    this.page.querySelector('#homeView').hidden = this.current.view !== 'home'
    this.page.querySelector('#chatView').hidden = this.current.view !== 'chat'
    document.body.classList.toggle('chat-open', this.current.view === 'chat')
    if (this.current.view === 'chat') this.onChat(this.current)
    else this.onHome()
  }

  home({ replace = false } = {}) {
    if (this.drawerOpen) this.closeDrawer(false)
    this.overlays?.closeAll()
    const state = { view: 'home' }
    if (replace || this.current.view === 'home') this.history.replaceState(state, '')
    else this.history.pushState(state, '')
    this.render(state)
  }

  chat(sessionId, title, { replace = false } = {}) {
    if (this.drawerOpen) this.closeDrawer(false)
    this.overlays?.closeAll()
    const state = { view: 'chat', sessionId, title }
    if (replace) this.history.replaceState(state, '')
    else this.history.pushState(state, '')
    this.render(state)
  }

  openDrawer() {
    if (this.drawerOpen || this.overlays?.stack.length) return
    this.drawerOpen = true
    this.trigger = document.activeElement
    this.drawer.hidden = false
    this.page.inert = true
    this.history.pushState({ ...(this.history.state ?? {}), drawer: true }, '')
    this.closeButton.focus({ preventScroll: true })
  }

  closeDrawer(restoreFocus = true) {
    if (!this.drawerOpen) return
    this.drawerOpen = false
    this.drawer.hidden = true
    if (!this.overlays?.stack.length) this.page.inert = false
    if (restoreFocus && this.trigger?.isConnected) this.trigger.focus({ preventScroll: true })
  }

  requestCloseDrawer() {
    if (!this.drawerOpen) return
    if (this.history.state?.drawer) this.history.back()
    else this.closeDrawer()
  }

  handlePopState(state) {
    if (this.overlays?.stack.length && this.overlays.handlePopState(state)) return
    if (this.drawerOpen) {
      const route = this.route(state)
      if (state?.drawer) { this.render(route); return }
      this.closeDrawer()
      if (this.sameRoute(route)) return
    }
    this.render(this.route(state))
  }
}
