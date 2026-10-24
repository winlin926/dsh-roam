export function viewportMetrics(windowLike) {
  const viewport = windowLike.visualViewport
  const layoutHeight = windowLike.document?.documentElement?.clientHeight || windowLike.innerHeight
  if (!viewport) return { height: layoutHeight, top: 0, keyboard: false }
  const keyboard = windowLike.innerHeight - viewport.height > 80 || viewport.offsetTop > 0
  return {
    height: Math.round(keyboard ? viewport.height : Math.max(layoutHeight, viewport.height)),
    top: keyboard ? Math.round(viewport.offsetTop) : 0,
    keyboard
  }
}

export function createViewport({ window: windowLike = window, dock, composer, onChange } = {}) {
  let frame = null
  const apply = () => {
    frame = null
    const metrics = viewportMetrics(windowLike)
    const root = windowLike.document.documentElement
    root.style.setProperty('--app-height', `${metrics.height}px`)
    root.style.setProperty('--app-top', `${metrics.top}px`)
    root.style.setProperty('--keyboard-open', metrics.keyboard ? '1' : '0')
    windowLike.document.body.classList.toggle('keyboard-open', metrics.keyboard)
    const height = Math.round(dock?.getBoundingClientRect().height ?? 0)
    if (height) root.style.setProperty('--bottom-dock-h', `${height}px`)
    onChange?.(metrics)
  }
  const schedule = () => { if (frame === null) frame = windowLike.requestAnimationFrame(apply) }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
  if (dock) observer?.observe(dock)
  if (composer) observer?.observe(composer)
  windowLike.visualViewport?.addEventListener('resize', schedule)
  windowLike.visualViewport?.addEventListener('scroll', schedule)
  windowLike.addEventListener('resize', schedule)
  apply()
  return { refresh: schedule, disconnect() {
    if (frame !== null) windowLike.cancelAnimationFrame(frame)
    observer?.disconnect()
    windowLike.visualViewport?.removeEventListener('resize', schedule)
    windowLike.visualViewport?.removeEventListener('scroll', schedule)
    windowLike.removeEventListener('resize', schedule)
  } }
}

export function nearBottom(element, threshold = 100) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold
}

export function preservePrepend(element, update) {
  const previousHeight = element.scrollHeight, previousTop = element.scrollTop
  update()
  element.scrollTop = previousTop + (element.scrollHeight - previousHeight)
}
