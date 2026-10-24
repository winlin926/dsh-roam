import { escapeHtml } from './markdown.js'
import { relativeTime, sessionTitleOf } from './state.js'

export function renderWorkspace({ workspaces, workspaceId, elements }) {
  const workspace = workspaces.find(item => item.workspaceId === workspaceId)
  elements.workspaceName.textContent = workspace?.title || workspace?.path || '—'
  elements.workspacePath.textContent = workspace?.path || ''
  elements.workspacePath.title = workspace?.path || ''
}

export function renderSessionList({ rows, activeSession, archivedView, L, list, emptyTitle, emptyHint }) {
  list.replaceChildren()
  list.setAttribute('aria-busy', 'false')
  if (!rows.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    const title = document.createElement('strong')
    title.textContent = emptyTitle || (archivedView ? L.archivedEmpty : L.noSessions)
    const hint = document.createElement('p')
    hint.textContent = emptyHint || (archivedView ? L.archivedEmptyHint : L.emptyHint)
    empty.append(title, hint)
    list.append(empty)
    return
  }
  const fragment = document.createDocumentFragment()
  for (const { session, snippet } of rows) {
    const title = sessionTitleOf(session) || L.untitled
    const row = document.createElement('div')
    row.className = 'session-row'
    row.dataset.sessionId = session.sessionId
    if (session.sessionId === activeSession) row.setAttribute('aria-current', 'page')
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'session-open'
    open.dataset.openSession = session.sessionId
    open.dataset.sessionTitle = title
    const status = document.createElement('span')
    status.className = 'session-status'
    status.dataset.running = String(Boolean(session.running))
    status.setAttribute('aria-hidden', 'true')
    const copy = document.createElement('span')
    copy.className = 'session-copy'
    const heading = document.createElement('strong')
    heading.textContent = title
    const meta = document.createElement('span')
    meta.textContent = snippet || `${session.running ? `${L.running} · ` : ''}${relativeTime(session.updatedAt, Date.now(), L)}`
    if (snippet) meta.className = 'session-snippet'
    copy.append(heading, meta)
    open.append(status, copy)
    const menu = document.createElement('button')
    menu.type = 'button'
    menu.className = 'session-menu'
    menu.dataset.sessionMenu = session.sessionId
    menu.setAttribute('aria-label', `${L.sessionActions}: ${title}`)
    menu.setAttribute('aria-haspopup', 'dialog')
    menu.textContent = '⋯'
    row.append(open, menu)
    fragment.append(row)
  }
  list.append(fragment)
}

export function pickerContent({ title, options, selected, L, searchable = false }) {
  const fragment = document.createDocumentFragment()
  const handle = document.createElement('div'); handle.className = 'sheet-handle'; handle.setAttribute('aria-hidden', 'true')
  const header = document.createElement('header'); header.className = 'sheet-header'
  const heading = document.createElement('h2'); heading.textContent = title
  const close = document.createElement('button'); close.type = 'button'; close.className = 'icon-button'; close.dataset.pickerClose = ''; close.setAttribute('aria-label', L.close); close.textContent = '×'
  header.append(heading, close)
  const body = document.createElement('div'); body.className = 'sheet-body'
  const list = document.createElement('div'); list.setAttribute('role', 'listbox')
  const draw = (filter = '') => {
    const needle = filter.trim().toLocaleLowerCase()
    const filtered = options.filter(option => !needle || `${option.label} ${option.detail ?? ''} ${option.group ?? ''}`.toLocaleLowerCase().includes(needle))
    list.replaceChildren()
    if (!filtered.length) {
      const empty = document.createElement('p'); empty.className = 'sheet-copy'; empty.textContent = L.searchNoResults
      list.append(empty)
      return
    }
    for (const option of filtered) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'picker-option'
      button.dataset.pickerValue = option.id
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', String(option.id === selected))
      const text = document.createElement('span'); text.className = 'picker-option-copy'
      const label = document.createElement('strong'); label.textContent = option.label
      const detail = document.createElement('small'); detail.textContent = [option.group, option.detail].filter(Boolean).join(' · ')
      text.append(label, detail)
      const check = document.createElement('span'); check.className = 'picker-option-check'; check.textContent = option.id === selected ? '✓' : ''
      button.append(text, check)
      list.append(button)
    }
  }
  if (searchable || options.length > 10) {
    const input = document.createElement('input'); input.className = 'picker-search'; input.type = 'search'; input.placeholder = L.searchPlaceholder; input.setAttribute('aria-label', L.searchLabel)
    input.addEventListener('input', () => draw(input.value))
    body.append(input)
  }
  draw()
  body.append(list)
  fragment.append(handle, header, body)
  return { fragment, close, body, list }
}

export function sheetActions(actions, L) {
  const fragment = document.createDocumentFragment()
  const handle = document.createElement('div'); handle.className = 'sheet-handle'
  const header = document.createElement('header'); header.className = 'sheet-header'
  const title = document.createElement('h2'); title.textContent = L.sessionActions
  const close = document.createElement('button'); close.type = 'button'; close.className = 'icon-button'; close.dataset.actionClose = ''; close.setAttribute('aria-label', L.close); close.textContent = '×'
  header.append(title, close)
  const body = document.createElement('div'); body.className = 'sheet-body'
  for (const action of actions) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `sheet-action${action.danger ? ' danger' : ''}`; button.dataset.sheetAction = action.id; button.textContent = action.label
    body.append(button)
  }
  fragment.append(handle, header, body)
  return { fragment, close }
}
