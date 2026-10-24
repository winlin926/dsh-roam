import { escapeHtml, markdown, pretty } from './markdown.js'
import { nearBottom } from './viewport.js'

function icon(kind) {
  const paths = {
    chevron: '<path d="m6 3.5 4.5 4.5L6 12.5"/>',
    tool: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="m6 8 2 2-2 2m4 0h4"/>',
    think: '<path d="M10 3a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9ZM8 17h4"/>',
    file: '<path d="M5 2.5h6l4 4V18H5Z"/><path d="M11 2.5V7h4"/>',
    down: '<path d="M10 3v14m-6-6 6 6 6-6"/>'
  }
  return `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${paths[kind] ?? paths.tool}</g></svg>`
}

function imageSource(block, sessionId) {
  return block.dataUrl || (block.attachmentId ? `/api/attachment?sessionId=${encodeURIComponent(sessionId)}&attachmentId=${encodeURIComponent(block.attachmentId)}` : '')
}

function imageHtml(block, sessionId, L) {
  const source = imageSource(block, sessionId)
  if (!source) return ''
  const ratio = block.width > 0 && block.height > 0 ? `${block.width}/${block.height}` : '4/3'
  return `<button type="button" class="msg-image" data-image-src="${escapeHtml(source)}" data-image-alt="${escapeHtml(block.name)}" style="--ar:${ratio}" aria-label="${escapeHtml(L.imageView)}"><img loading="lazy" decoding="async" src="${escapeHtml(source)}" alt="${escapeHtml(block.name)}"${block.width ? ` width="${block.width}"` : ''}${block.height ? ` height="${block.height}"` : ''}></button>`
}

function fileHtml(block, L) {
  return `<div class="msg-file">${icon('file')}<span class="msg-file-copy"><strong>${escapeHtml(block.name || L.fileUnnamed)}</strong><span>${escapeHtml(`${formatBytes(block.bytes)} · ${L.fileDesktopOnly}`)}</span></span></div>`
}

export function formatBytes(value) {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let size = bytes, index = -1
  do { size /= 1024; index++ } while (size >= 1024 && index < units.length - 1)
  return `${size >= 10 ? Math.round(size) : Math.round(size * 10) / 10} ${units[index]}`
}

function blockHtml(block, streaming, sessionId, L) {
  if (block.kind === 'text') return `<div class="markdown">${markdown(block.text)}</div>`
  if (block.kind === 'reasoning') {
    const summary = String(block.text).split('\n').map(line => line.trim()).filter(Boolean).at(-1) ?? L.working
    return `<details class="activity thinking" data-state="${streaming ? 'running' : 'done'}"><summary><span class="activity-status"></span><span class="activity-title">${escapeHtml(L.thinking)}</span><span class="activity-summary">${escapeHtml(summary)}</span><span class="activity-chevron">${icon('chevron')}</span></summary><div class="activity-body markdown">${markdown(block.text)}</div></details>`
  }
  if (block.kind === 'tool') {
    const status = block.status === 'running' ? L.running : block.status === 'error' ? L.toolFailed : L.done
    const media = (block.resultImages ?? []).map(image => imageHtml(image, sessionId, L)).join('') + (block.resultFiles ?? []).map(file => fileHtml(file, L)).join('')
    return `<details class="activity tool" data-state="${escapeHtml(block.status)}" data-tool-id="${escapeHtml(block.id)}"><summary><span class="activity-status"></span><span class="activity-title">${escapeHtml(block.name || 'tool')}</span><span class="activity-summary">${escapeHtml(status)}</span><span class="activity-chevron">${icon('chevron')}</span></summary><div class="activity-body">${block.args ? `<strong>${escapeHtml(L.input)}</strong><pre>${escapeHtml(pretty(block.args))}</pre>` : ''}${block.result ? `<strong>${escapeHtml(L.output)}</strong><pre>${escapeHtml(block.result)}</pre>` : ''}${media}</div></details>`
  }
  if (block.kind === 'image') return imageHtml(block, sessionId, L)
  if (block.kind === 'file') return fileHtml(block, L)
  return ''
}

function contentHtml(blocks, streaming, sessionId, L) {
  let html = '', images = []
  const flush = () => {
    if (!images.length) return
    html += `<div class="msg-gallery count-${Math.min(images.length, 6)}">${images.map(image => imageHtml(image, sessionId, L)).join('')}</div>`
    images = []
  }
  for (const block of blocks.filter(Boolean)) {
    if (block.kind === 'image') { images.push(block); continue }
    flush()
    html += blockHtml(block, streaming, sessionId, L)
  }
  flush()
  return html
}

export class MessageRenderer {
  constructor({ container, scroll, sessionId, L }) {
    this.container = container
    this.scroll = scroll
    this.sessionId = sessionId
    this.L = L
    this.nodes = new Map()
    this.following = true
    this.unread = false
    this.onFollowChange = null
    scroll.addEventListener('scroll', () => {
      const next = nearBottom(scroll)
      if (next !== this.following) { this.following = next; if (next) this.unread = false; this.onFollowChange?.(this.following, this.unread) }
    }, { passive: true })
  }

  setSession(sessionId) {
    this.sessionId = sessionId
    this.container.replaceChildren()
    this.nodes.clear()
    this.following = true
    this.unread = false
  }

  scrollToLatest(smooth = false) {
    this.following = true
    this.unread = false
    this.scroll.scrollTo({ top: this.scroll.scrollHeight, behavior: smooth && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' })
    this.onFollowChange?.(true, false)
  }

  render(messages, { initial = false, running = false, runningLabel = '', historyHtml = '', preservePosition = false } = {}) {
    const wasFollowing = (this.following || initial) && !preservePosition
    const ids = new Set(messages.map(message => message.id))
    for (const [id, node] of this.nodes) if (!ids.has(id)) { node.remove(); this.nodes.delete(id) }
    let anchor = this.container.querySelector('[data-history-anchor]')
    if (!anchor) {
      anchor = document.createElement('div')
      anchor.dataset.historyAnchor = ''
      this.container.prepend(anchor)
    }
    const history = document.createElement('div')
    history.className = 'history-more'
    history.innerHTML = historyHtml
    anchor.replaceChildren(history)
    let previous = anchor
    for (const message of messages) {
      let node = this.nodes.get(message.id)
      if (!node) {
        node = document.createElement('article')
        node.dataset.messageId = message.id
        this.nodes.set(message.id, node)
      }
      const nextHtml = contentHtml(message.blocks, message.streaming, this.sessionId, this.L)
      if (node.dataset.content !== nextHtml || node.dataset.role !== message.role) {
        const expandedTools = new Set([...node.querySelectorAll('details[data-tool-id][open]')].map(details => details.dataset.toolId))
        const thinkingOpen = node.querySelector('details.thinking')?.open
        const focused = document.activeElement instanceof HTMLElement && node.contains(document.activeElement) && !document.activeElement.matches('textarea, input') ? document.activeElement : null
        node.innerHTML = nextHtml
        for (const details of node.querySelectorAll('details[data-tool-id]')) if (expandedTools.has(details.dataset.toolId)) details.open = true
        if (thinkingOpen && node.querySelector('details.thinking')) node.querySelector('details.thinking').open = true
        if (focused && !focused.matches('summary, a, button, [tabindex]')) {
          const replacement = node.querySelector(focused.tagName.toLowerCase())
          if (replacement instanceof HTMLElement) replacement.focus({ preventScroll: true })
        }
        node.dataset.content = nextHtml
      }
      node.className = `message ${message.role}${message.optimistic ? ' optimistic' : ''}${message.streaming ? ' streaming' : ''}`
      node.dataset.role = message.role
      if (previous.nextSibling !== node) previous.after(node)
      previous = node
    }
    let status = this.container.querySelector(':scope > .turn-status')
    if (running) {
      if (!status) { status = document.createElement('div'); status.className = 'turn-status'; status.setAttribute('role', 'status') }
      status.textContent = runningLabel
      if (previous.nextSibling !== status) previous.after(status)
    } else status?.remove()
    if (wasFollowing) this.scrollToLatest()
    else if (!preservePosition && messages.length) this.unread = true
    this.onFollowChange?.(this.following, this.unread)
  }
}
