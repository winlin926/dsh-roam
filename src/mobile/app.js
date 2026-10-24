import { createCopy } from './copy.js'
import { rpc, errorText, requestId } from './api.js'
import { applyPendingCreatedSessions, sessionTitleOf, workspaceForSession, sessionRows, normalizeSelection, selectionOf, flattenModels, presetLabel, modelEntry, sameSelection, mergeEvents, oldestSeq, loadDrafts, saveDrafts } from './state.js'
import { visibleMessages, isRunning, reconcileOptimistic, queueBlocks, queueSummary, queueSignature } from './transcript.js'
import { MessageRenderer, formatBytes } from './messages.js'
import { OverlayManager } from './overlays.js'
import { Navigation } from './navigation.js'
import { createViewport, preservePrepend } from './viewport.js'
import { pickerContent, renderWorkspace, renderSessionList, sheetActions } from './drawer.js'
import { AttachmentManager } from './composer.js'
import { SessionStream, nextPollDelay } from './stream.js'
import { escapeHtml } from './markdown.js'

const $ = id => document.getElementById(id)
const preferredLanguages = [...(navigator.languages ?? []), document.documentElement.lang]
const locale = preferredLanguages.find(language => /^en(?:-|$)/i.test(language) || /^zh(?:-|$)/i.test(language))
document.documentElement.lang = locale?.startsWith('en') ? 'en' : 'zh-CN'
const L = createCopy(locale)
const icons = {
  menu: '<path d="M3 5h14M3 10h14M3 15h14"/>',
  settings: '<path d="M3 5h7m4 0h3M3 15h3m4 0h7M10 2v6M6 12v6"/>',
  send: '<path d="M10 16V4m-5 5 5-5 5 5"/>',
  stop: '<rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  down: '<path d="M10 3v14m-6-6 6 6 6-6"/>',
  folder: '<path d="M2.5 6A2 2 0 0 1 4.5 4H8l1.5 2h6A2 2 0 0 1 17.5 8v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2Z"/>',
  plus: '<path d="M10 3v14M3 10h14"/>',
  search: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>',
  chevronDown: '<path d="m5 7 5 5 5-5"/>',
  chevronRight: '<path d="m7 4 6 6-6 6"/>',
  refresh: '<path d="M16 7a6.5 6.5 0 1 0 .2 6M16 3v4h-4"/>',
  archive: '<path d="M3 5h14v12H3ZM2 2h16v3H2Zm6 7h4"/>'
}
const svg = path => `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</g></svg>`

for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = svg(icons[element.dataset.icon] ?? icons.settings)
for (const id of ['homeDrawerButton', 'chatDrawerButton']) $(id).innerHTML = svg(icons.menu)
$('chatHomeButton').innerHTML = svg('<path d="m12 4-6 6 6 6M6 10h11"/>')
$('chatHomeButton').setAttribute('aria-label', L.home)
$('chatMore').textContent = '⋯'
for (const element of document.querySelectorAll('[data-copy]')) if (L[element.dataset.copy]) element.textContent = L[element.dataset.copy]
for (const element of document.querySelectorAll('[data-copy-placeholder]')) element.placeholder = L[element.dataset.copyPlaceholder] ?? ''
$('homePrompt').setAttribute('aria-label', L.newTask)
$('chatPrompt').setAttribute('aria-label', L.promptChat)
$('homeSend').setAttribute('aria-label', L.send)
$('chatSend').setAttribute('aria-label', L.send)
$('stopButton').setAttribute('aria-label', L.stop)
$('sessionSearch').placeholder = L.searchPlaceholder
$('sessionSearch').setAttribute('aria-label', L.searchLabel)
$('homeDrawerButton').setAttribute('aria-label', L.openNavigation)
$('chatDrawerButton').setAttribute('aria-label', L.openNavigation)
$('chatMore').setAttribute('aria-label', L.sessionActions)
$('drawerClose').setAttribute('aria-label', L.closeNavigation)
$('homeView').setAttribute('aria-label', L.newTask)
$('chatView').setAttribute('aria-label', L.conversation)
$('messageScroll').setAttribute('aria-label', L.conversationMessages)

const state = {
  epoch: 0,
  workspaces: [], workspaceId: '', summaries: [], archivedIds: [], pendingCreated: [], remoteCache: {},
  archivedView: false, query: '', remoteItems: [], searchHasMore: false, searchUnavailable: false, searchNote: '', searchSequence: 0,
  activeSession: '', activeWorkspaceId: '', sessionBlank: true, currentPreset: 'standard', homePreset: 'standard',
  homeModels: null, homeSelection: null, chatModels: null, presets: [], settingsBusy: false,
  historyEvents: [], olderEvents: [], liveEvents: [], streamProjections: null, hasMore: false, oldestSeq: null, throughSeq: 0, historyBusy: false, historyRequest: 0, historyLoading: false, historyLoadRequest: 0, historyError: '',
  todos: [], todoExpanded: false, running: false, awaitingSince: 0, optimistic: [], pendingQueue: [], queue: [], queueEditing: null, queueBusy: false, queueError: '',
  question: null, questionIndex: 0, questionDrafts: {}, questionBusy: false,
  approval: null, approvalBusy: false, solvedApprovals: new Set(),
  sendBusy: false, stream: null, pollTimer: null, pollIdle: 750, streamConnected: false, pendingTimer: null,
  drafts: loadDrafts(globalThis.localStorage),
  connected: false, unreachable: 0, tunnelExpiresAt: null, interactionOverlay: null
}

const overlays = new OverlayManager({ root: $('overlayRoot'), page: $('appShell') })
const attachments = new AttachmentManager({ L, onChange: () => { syncComposer(); attachments.render(attachmentOwner(), { home: document.querySelector('[data-attachment-tray="home"]'), chat: $('chatAttachmentTray') }) } })
const messages = new MessageRenderer({ container: $('messageList'), scroll: $('messageScroll'), sessionId: '', L })
messages.onFollowChange = (following, unread) => {
  $('bottomButton').hidden = following
  $('bottomButtonLabel').textContent = unread ? L.newMessages : L.backToBottom
}
const navigation = new Navigation({
  drawer: $('navigationDrawer'), mask: $('drawerMask'), panel: $('drawerPanel'), page: $('appShell'), closeButton: $('drawerClose'),
  onHome: showHome, onChat: openChat
})
navigation.overlays = overlays

const viewport = createViewport({ dock: $('bottomDock'), composer: $('chatComposer'), onChange: () => { if (messages.following && !state.readingHistory) messages.scrollToLatest() } })

function toast(text) {
  clearTimeout(toast.timer)
  $('toast').textContent = text
  $('toast').classList.add('visible')
  toast.timer = setTimeout(() => $('toast').classList.remove('visible'), 2200)
}

function showError(error, target = state.activeSession ? $('chatError') : $('homeError')) {
  target.textContent = error ? errorText(error, L) : ''
}

function saveDraft(scope) {
  const input = scope === 'home' ? $('homePrompt') : $('chatPrompt')
  state.drafts[scope] = { text: input.value }
  saveDrafts(localStorage, state.drafts)
}

function restoreDraft(scope) {
  const input = scope === 'home' ? $('homePrompt') : $('chatPrompt')
  input.value = state.drafts[scope]?.text ?? ''
  fitPrompt(input)
}

function fitPrompt(input) {
  input.style.height = 'auto'
  const min = input === $('homePrompt') ? 52 : 30
  input.style.height = `${Math.min(150, Math.max(min, input.scrollHeight))}px`
}

function syncComposer() {
  const owner = state.activeSession || 'home'
  const items = attachments.list(owner)
  const ready = items.filter(item => item.state === 'ready')
  const preparing = attachments.preparing(owner)
  const failed = items.some(item => item.state === 'failed')
  for (const [scope, input, button] of [['home', $('homePrompt'), $('homeSend')], ['chat', $('chatPrompt'), $('chatSend')]]) {
    const own = scope === 'home' ? !state.activeSession : Boolean(state.activeSession)
    const hasDraft = Boolean(input.value.trim() || (own && ready.length))
    button.disabled = state.sendBusy || preparing || failed || !hasDraft || (scope === 'home' && !state.workspaceId)
    fitPrompt(input)
  }
  $('homeSend').setAttribute('aria-label', state.sendBusy ? L.sending : L.send)
  $('chatSend').setAttribute('aria-label', state.sendBusy ? L.sending : state.running ? L.queueSend : L.send)
  $('chatSend').dataset.queue = String(state.running)
  $('sendLabel').textContent = state.running ? L.queueSend : ''
  $('steerButton').hidden = !state.running
  $('steerButton').disabled = $('chatSend').disabled
  $('steerButton').textContent = L.steer
  $('steerButton').setAttribute('aria-label', L.steerHint)
  $('stopButton').hidden = !state.running
  document.querySelectorAll('[data-attach]').forEach(button => { button.disabled = state.sendBusy })
  for (const button of document.querySelectorAll('[data-settings]')) button.disabled = state.settingsBusy
}

function attachmentOwner() { return state.activeSession || 'home' }
function renderAttachments(owner = attachmentOwner()) {
  attachments.active(owner)
  attachments.render(owner, { home: document.querySelector('[data-attachment-tray="home"]'), chat: $('chatAttachmentTray') })
}

function workspaceTitle(id) {
  const workspace = state.workspaces.find(item => item.workspaceId === id)
  return workspace?.title || workspace?.path || ''
}

function updateWorkspaceUi() {
  renderWorkspace({ workspaces: state.workspaces, workspaceId: state.workspaceId, elements: { workspaceName: $('workspaceName'), workspacePath: $('workspacePath') } })
  $('homeWorkspace').replaceChildren()
  const prefix = document.createElement('span'); prefix.textContent = `${L.createIn} `
  const name = document.createElement('strong'); name.textContent = workspaceTitle(state.workspaceId) || L.chooseWorkspace
  const suffix = document.createElement('span'); suffix.textContent = ` · ${L.switchWorkspace}`
  $('homeWorkspace').append(prefix, name, suffix)
  syncComposer()
}

function currentRows() {
  return sessionRows({ summaries: state.summaries, workspaces: state.workspaces, archivedIds: state.archivedIds, workspaceId: state.workspaceId, archivedView: state.archivedView, query: state.query, remoteItems: state.remoteItems, remoteCache: state.remoteCache })
}

function renderDrawer() {
  $('sessionListTitle').textContent = state.archivedView ? L.archivedSessions : L.recentSessions
  $('archiveButton').setAttribute('aria-pressed', String(state.archivedView))
  $('archiveButton').querySelector('span:nth-child(2)').textContent = state.archivedView ? L.recentSessions : L.archivedSessions
  $('searchClear').hidden = !state.query
  $('searchNote').textContent = state.searchNote
  renderSessionList({ rows: currentRows(), activeSession: state.activeSession, archivedView: state.archivedView, L, list: $('sessionList') })
}

async function loadWorkspaces() {
  const value = await rpc('workspace.list')
  const serverItems = value.items ?? []
  state.workspaces = serverItems.map(item => ({ ...item, sessionIds: [...(Array.isArray(item.sessionIds) ? item.sessionIds : [])] }))
  state.pendingCreated = applyPendingCreatedSessions(state.workspaces, state.pendingCreated, serverItems, value.archivedSessionIds ?? [])
  state.archivedIds = value.archivedSessionIds ?? []
  if (!state.workspaces.some(item => item.workspaceId === state.workspaceId)) state.workspaceId = state.workspaces[0]?.workspaceId ?? ''
  updateWorkspaceUi()
}

async function loadSessions() {
  const value = await rpc('session.list')
  state.summaries = value.items ?? []
  renderDrawer()
}

async function refreshAll() {
  const button = $('refreshButton')
  button.disabled = true; button.setAttribute('aria-busy', 'true')
  try { await loadWorkspaces(); await loadSessions(); toast(L.refreshed) }
  catch (error) { state.searchNote = L.refreshFailed + errorText(error, L); renderDrawer() }
  finally { setTimeout(() => { button.disabled = false; button.setAttribute('aria-busy', 'false') }, 250) }
}

async function retryWorkspaces() {
  let error
  for (let index = 0; index < 6; index++) {
    try { return await loadWorkspaces() } catch (cause) { error = cause; await new Promise(resolve => setTimeout(resolve, 200 * (index + 1))) }
  }
  throw error
}

function rememberCreated(created) {
  const workspace = state.workspaces.find(item => item.workspaceId === state.workspaceId)
  if (workspace && !workspace.sessionIds.includes(created.sessionId)) workspace.sessionIds.unshift(created.sessionId)
  state.pendingCreated.push({ workspaceId: state.workspaceId, sessionId: created.sessionId })
  state.summaries.unshift({ sessionId: created.sessionId, updatedAt: Date.now(), running: false, blank: true, agentPreset: created.agentPreset ?? state.homePreset, projections: { values: { title: L.untitled } } })
}

function showHome() {
  state.epoch++
  closeChat()
  restoreDraft('home')
  renderAttachments('home')
  syncComposer()
  void retryWorkspaces().then(loadSessions).catch(error => showError(error, $('homeError')))
}

function closeChat() {
  if (state.activeSession) saveDraft(state.activeSession)
  state.stream?.close()
  state.stream = null
  clearTimeout(state.pollTimer)
  clearTimeout(state.pendingTimer)
  state.activeSession = ''
  state.streamConnected = false
  if (state.interactionOverlay) { overlays.remove(state.interactionOverlay, false); state.interactionOverlay = null }
}

function openChat(route) {
  const sessionId = route.sessionId
  if (!sessionId) return
  closeChat()
  const epoch = ++state.epoch
  state.activeSession = sessionId
  const summary = state.summaries.find(item => item.sessionId === sessionId)
  const workspace = workspaceForSession(state.workspaces, sessionId)
  state.activeWorkspaceId = workspace?.workspaceId ?? ''
  state.sessionBlank = summary?.blank ?? true
  state.currentPreset = summary?.agentPreset ?? 'standard'
  state.chatModels = null
  state.queueBusy = false
  state.historyEvents = []; state.olderEvents = []; state.liveEvents = []; state.streamProjections = null; state.hasMore = false; state.historyBusy = false; state.historyLoading = false; state.historyError = ''
  state.todos = []; state.todoExpanded = false; state.optimistic = []; state.pendingQueue = []; state.queue = []; state.queueEditing = null
  state.question = null; state.approval = null; state.questionDrafts = {}; state.questionBusy = false; state.approvalBusy = false
  state.awaitingSince = 0; state.running = summary?.running === true
  state.readingHistory = false
  $('chatTitle').textContent = route.title || sessionTitleOf(summary) || L.untitled
  renderChatStatus()
  messages.setSession(sessionId)
  messages.render([], { running: state.running, runningLabel: L.working })
  $('messageList').insertAdjacentHTML('beforeend', '<div class="loading-state"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>')
  $('chatError').textContent = ''
  restoreDraft(sessionId)
  renderAttachments(sessionId)
  syncComposer(); renderTodo(); renderQueue(); renderDrawer()
  state.stream = new SessionStream({ sessionId, onSnapshot: value => { if (valid(epoch, sessionId)) { state.streamProjections = value.projections; applyHistory(value, false, epoch) } }, onEvent: frame => { if (valid(epoch, sessionId)) applyStreamEvent(frame, epoch) }, onStatus: connected => { if (valid(epoch, sessionId)) { state.streamConnected = connected; schedulePoll() } } })
  state.stream.open()
  void loadHistory(true, epoch)
}

function valid(epoch, sessionId = state.activeSession) { return epoch === state.epoch && sessionId === state.activeSession }

function renderChatStatus() {
  if (!state.activeSession) return
  const workspace = workspaceTitle(state.activeWorkspaceId)
  const status = state.question || state.approval ? L.questionNeeded : state.running ? L.running : ''
  $('chatSubtitle').textContent = [workspace, status].filter(Boolean).join(' · ')
}

function closeLoading() { $('messageList').querySelector('.loading-state')?.remove() }

function applyHistory(value, initial, epoch) {
  if (!valid(epoch)) return
  closeLoading()
  const records = value.events ?? value.records ?? []
  if (initial || !state.throughSeq || !state.olderEvents.length) {
    if (initial || !state.olderEvents.length) {
      state.hasMore = value.hasMore === true
      state.oldestSeq = typeof value.oldestSeq === 'number' ? value.oldestSeq : oldestSeq(records)
      state.throughSeq = value.throughSeq ?? 0
    }
  }
  const cursor = typeof value.throughSeq === 'number' ? value.throughSeq : state.throughSeq
  state.liveEvents = state.liveEvents.filter(entry => oldestSeq([entry]) === null || oldestSeq([entry]) > cursor)
  state.historyEvents = records
  if (value.pending !== undefined) syncQuestion(value.pending)
  updateProjections(value.projections ?? state.streamProjections)
  renderHistory(epoch)
  state.pollIdle = 750
}

function applyStreamEvent(frame, epoch) {
  closeLoading()
  const entry = frame.event ?? frame
  const type = String(entry.type ?? '').toLowerCase()
  state.liveEvents.push(frame)
  if (type === 'model/selection' && state.chatModels) {
    const next = normalizeSelection(entry.data)
    if (next) state.chatModels.current = next
  }
  updateProjections(frame.projections)
  renderHistory(epoch)
  clearTimeout(state.pendingTimer)
  state.pendingTimer = setTimeout(() => refreshPending(epoch), 150)
}

function updateProjections(projections) {
  if (projections?.values?.todos === null) state.todos = []
  else if (Array.isArray(projections?.values?.todos)) state.todos = projections.values.todos.filter(item => item && typeof item.content === 'string')
  const inbox = projections?.values?.inbox
  if (inbox && Array.isArray(inbox['next-turn'])) {
    state.queue = inbox['next-turn'].map(row => {
      const blocks = queueBlocks(row.content)
      return { id: typeof row.id === 'string' ? row.id : '', blocks, requestId: row.source?.rpcId ?? '', summary: queueSummary(blocks, L), text: blocks.every(block => block.kind === 'text') ? blocks.map(block => block.text).join('') : null }
    })
    const claimed = new Set()
    state.pendingQueue = state.pendingQueue.filter(pending => {
      const found = state.queue.find(item => item.id && !claimed.has(item.id) && (item.requestId === pending.requestId || queueSignature(item.blocks) === pending.signature))
      if (found) claimed.add(found.id)
      return !found
    })
  }
  const model = selectionOf(projections)
  if (model && state.chatModels) state.chatModels.current = model
  renderTodo(); renderQueue()
}

function renderHistory(epoch, initial = false, preserveReading = false) {
  if (!valid(epoch)) return
  if (preserveReading) { messages.following = false; state.readingHistory = true }
  closeLoading()
  const currentEvents = mergeEvents(state.historyEvents, state.liveEvents)
  const durable = visibleMessages(mergeEvents(state.olderEvents, currentEvents))
  if (durable.some(message => message.role === 'user')) state.sessionBlank = false
  const now = Date.now()
  state.optimistic = state.optimistic.filter(item => !item.sentAt || now - item.sentAt < 30000)
  const reconciled = reconcileOptimistic(durable, state.optimistic)
  state.optimistic = reconciled.pending
  const awaitingSince = state.awaitingSince && Date.now() - state.awaitingSince < 15000 ? state.awaitingSince : 0
  if (state.awaitingSince && !awaitingSince) state.awaitingSince = 0
  const running = isRunning(currentEvents, awaitingSince)
  state.running = running.running
  if (running.started) state.awaitingSince = 0
  messages.render(reconciled.messages, { initial, running: state.running && !state.question && !state.approval, runningLabel: L.working, historyHtml: historyHtml(), preservePosition: preserveReading || state.readingHistory })
  syncComposer()
  renderQueue()
  renderChatStatus()
  renderDrawer()
}

function historyHtml() {
  if (!state.hasMore) return ''
  return `<button type="button" data-load-earlier ${state.historyLoading ? 'disabled aria-busy="true"' : ''}>${escapeHtml(state.historyLoading ? L.loadingEarlier : L.loadEarlier)}</button>${state.historyError ? `<p role="alert">${escapeHtml(state.historyError)}</p>` : ''}`
}

async function loadHistory(initial, epoch = state.epoch) {
  if (!state.activeSession || state.historyBusy) return
  state.historyBusy = true
  const request = ++state.historyRequest
  const sessionId = state.activeSession
  try {
    const [history, question, approval] = await Promise.all([rpc('session.history', { sessionId, maxMessages: 100 }), rpc('interaction.pending', { sessionId }), rpc('approval.pending', { sessionId }).catch(() => undefined)])
    if (!valid(epoch, sessionId)) return
    applyHistory({ ...history, pending: question }, initial, epoch)
    if (approval !== undefined) syncApproval(approval?.approval ?? null)
  } catch (error) { if (valid(epoch, sessionId)) { closeLoading(); showError(error) } }
  finally { if (request === state.historyRequest) state.historyBusy = false; if (valid(epoch, sessionId)) schedulePoll() }
}

function schedulePoll() {
  clearTimeout(state.pollTimer)
  if (!state.activeSession || document.hidden) return
  const delay = nextPollDelay({ streamConnected: state.streamConnected, running: state.running, pendingInteraction: Boolean(state.question || state.approval), idleMs: state.pollIdle })
  state.pollTimer = setTimeout(() => {
    if (!state.streamConnected && !state.running && !state.question && !state.approval) state.pollIdle = Math.min(state.pollIdle * 1.5, 5000)
    void loadHistory(false)
  }, delay)
}

async function refreshPending(epoch = state.epoch) {
  const sessionId = state.activeSession
  if (!sessionId) return
  const [question, approval] = await Promise.all([rpc('interaction.pending', { sessionId }).catch(() => undefined), rpc('approval.pending', { sessionId }).catch(() => undefined)])
  if (!valid(epoch, sessionId)) return
  if (question !== undefined) syncQuestion(question)
  if (approval !== undefined) syncApproval(approval?.approval ?? null)
}

async function loadEarlier() {
  if (!state.hasMore || state.historyLoading || !state.activeSession) return
  state.historyLoading = true; state.historyError = ''
  const request = ++state.historyLoadRequest
  const sessionId = state.activeSession, epoch = state.epoch
  try {
    const value = await rpc('session.history', { sessionId, maxMessages: 100, beforeSeq: state.oldestSeq ?? undefined })
    if (!valid(epoch, sessionId)) return
    state.olderEvents = mergeEvents(value.events ?? [], state.olderEvents)
    state.hasMore = value.hasMore === true
    state.oldestSeq = typeof value.oldestSeq === 'number' ? value.oldestSeq : oldestSeq(mergeEvents(state.olderEvents, state.historyEvents))
    preservePrepend($('messageScroll'), () => {
      messages.following = false
      renderHistory(epoch, false, true)
    })
  } catch (error) { if (valid(epoch, sessionId) && request === state.historyLoadRequest) state.historyError = L.loadEarlierFailed + errorText(error, L) }
  finally {
    if (request === state.historyLoadRequest) state.historyLoading = false
    if (valid(epoch, sessionId)) renderHistory(epoch, false, true)
  }
}

function renderTodo() {
  const host = $('todoDock')
  host.hidden = !state.todos.length || Boolean(state.question || state.approval)
  if (host.hidden) return
  const done = state.todos.filter(item => item.status === 'completed').length
  const active = state.todos.filter(item => item.status === 'in_progress').length
  const pending = state.todos.length - done - active
  host.innerHTML = `<button class="dock-header" type="button" aria-expanded="${state.todoExpanded}"><strong>${escapeHtml(L.todoTitle)}</strong><span>${done} ${escapeHtml(L.todoDone)} · ${active} ${escapeHtml(L.todoActive)} · ${pending} ${escapeHtml(L.todoPending)}</span><span>${state.todoExpanded ? '⌃' : '⌄'}</span></button>${state.todoExpanded ? `<ul class="todo-list">${state.todos.map(item => `<li class="todo-item" data-status="${escapeHtml(item.status)}"><span>${item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '◌' : '○'}</span><span>${escapeHtml(item.content)}</span></li>`).join('')}</ul>` : ''}`
  viewport.refresh()
}

function queueRow(item) {
  const busy = state.queueBusy
  if (state.queueEditing?.id === item.id) return `<li class="queue-item"><textarea data-queue-edit>${escapeHtml(state.queueEditing.text)}</textarea><div class="queue-actions"><button data-queue-action="cancel-edit" ${busy ? 'disabled' : ''}>${escapeHtml(L.cancel)}</button><button data-queue-action="save-edit" ${busy ? 'disabled' : ''}>${escapeHtml(L.queueSave)}</button></div></li>`
  const image = item.blocks.find(block => block.kind === 'image')
  const imageSource = image?.dataUrl || (image?.attachmentId ? `/api/attachment?sessionId=${encodeURIComponent(state.activeSession)}&attachmentId=${encodeURIComponent(image.attachmentId)}` : '')
  return `<li class="queue-item"><div class="queue-line">${imageSource ? `<img class="queue-thumb" src="${escapeHtml(imageSource)}" alt="">` : ''}<span class="queue-summary">${escapeHtml(item.summary)}</span></div><div class="queue-actions"><button data-queue-action="edit" data-queue-id="${escapeHtml(item.id)}" ${!item.id || item.text === null || busy ? 'disabled' : ''}>${escapeHtml(L.queueEdit)}</button><button data-queue-action="remove" data-queue-id="${escapeHtml(item.id)}" ${!item.id || busy ? 'disabled' : ''}>${escapeHtml(L.queueRemove)}</button><button data-queue-action="steer" data-queue-id="${escapeHtml(item.id)}" ${!item.id || !state.running || busy ? 'disabled' : ''}>${escapeHtml(L.queueSteer)}</button></div></li>`
}

function renderQueue() {
  const host = $('queueDock'), visible = state.queue.length > 0 || state.pendingQueue.length > 0
  host.hidden = !visible || Boolean(state.question || state.approval)
  if (host.hidden) { viewport.refresh(); return }
  const pending = state.pendingQueue.map(item => `<li class="queue-item"><div class="queue-line"><span class="queue-summary">${escapeHtml(L.queueSending)} · ${escapeHtml(item.summary)}</span></div></li>`).join('')
  host.innerHTML = `<div class="dock-header"><strong>${escapeHtml(L.queueTitle)}</strong><span>${state.queue.length + state.pendingQueue.length}</span></div><ul class="queue-list">${state.queue.map(queueRow).join('')}${pending}</ul>${state.queueError ? `<p class="inline-error">${escapeHtml(state.queueError)}</p>` : ''}`
  viewport.refresh()
}

async function queueAction(id, action) {
  if (state.queueBusy || !id) return
  const sessionId = state.activeSession, epoch = state.epoch, previous = state.queue
  state.queueBusy = true; state.queueError = ''; renderQueue()
  try {
    await rpc('session.updateQueue', { sessionId, itemId: id, action })
    if (!valid(epoch, sessionId)) return
    if (action.kind === 'remove') state.queue = state.queue.filter(item => item.id !== id)
    if (action.kind === 'edit') {
      const blocks = action.content.map(block => ({ kind: 'text', text: block.text }))
      state.queue = state.queue.map(item => item.id === id ? { ...item, blocks, summary: queueSummary(blocks, L), text: blocks[0].text } : item)
      state.queueEditing = null
    }
    if (action.kind === 'steer') state.queue = state.queue.filter(item => item.id !== id)
    state.queueBusy = false
    renderQueue()
    toast(action.kind === 'remove' ? L.queueRemoved : action.kind === 'steer' ? L.queueSteered : L.queueSaved)
    await loadHistory(false, epoch)
  } catch (error) { if (valid(epoch, sessionId)) { state.queue = previous; state.queueError = L.queueActionFailed + errorText(error, L) } }
  finally { if (valid(epoch, sessionId)) { state.queueBusy = false; renderQueue() } }
}

function taskOverlay(name, dismissible) {
  const dock = $('interactionDock')
  if (!dock) return
  const current = state.interactionOverlay ? overlays.find(state.interactionOverlay) : null
  if (current?.name === name) overlays.replace(current.id, { name, className: 'task-overlay', content: dock, focus: false, dismissible })
  else {
    if (state.interactionOverlay) overlays.remove(state.interactionOverlay, false)
    state.interactionOverlay = overlays.open({ name, className: 'task-overlay', content: dock, dismissible, focus: true, onClose: () => { state.interactionOverlay = null } })
  }
  dock.hidden = false
  syncComposer()
}

function syncQuestion(next) {
  const changed = (state.question?.rpcId ?? null) !== (next?.rpcId ?? null)
  state.question = next
  if (changed) { state.questionIndex = 0; state.questionDrafts = {}; state.questionBusy = false }
  renderInteraction()
}

function syncApproval(next) {
  const effective = next && state.solvedApprovals.has(next.eventId) ? null : next
  const changed = (state.approval?.eventId ?? null) !== (effective?.eventId ?? null)
  state.approval = effective
  if (changed) state.approvalBusy = false
  renderInteraction()
}

function renderInteraction() {
  if (!state.activeSession) return
  $('chatComposer').hidden = Boolean(state.question || state.approval)
  if (state.question) {
    const questions = state.question.questions ?? []
    state.questionIndex = Math.max(0, Math.min(state.questionIndex, questions.length - 1))
    const question = questions[state.questionIndex]
    if (!question) { state.question = null; renderInteraction(); return }
    const active = document.activeElement
    const customDraft = active?.matches('[data-question-custom]') ? active.value : null
    const draft = state.questionDrafts[question.id] ??= { selected: [], custom: '', skipped: false }
    if (customDraft !== null) draft.custom = customDraft
    const options = question.options ?? [], last = state.questionIndex === questions.length - 1
    $('interactionDock').innerHTML = `<div class="interaction-head"><strong>${escapeHtml(question.header || L.questionNeeded)} · ${state.questionIndex + 1}/${questions.length}</strong><button data-interaction="cancel-question" aria-label="${escapeHtml(L.cancelQuestions)}">×</button></div><div class="interaction-body"><h2>${escapeHtml(question.question)}</h2>${question.detail ? `<p>${escapeHtml(question.detail)}</p>` : ''}${options.map((option, index) => { const selected = draft.selected.includes(option.label); return `<button class="question-option ${selected ? 'selected' : ''}" data-question-option="${index}" aria-pressed="${selected}"><span class="option-mark">${selected ? '✓' : '○'}</span><span>${escapeHtml(option.label)}${option.description ? `<small>${escapeHtml(option.description)}</small>` : ''}</span></button>` }).join('')}<textarea class="interaction-custom" data-question-custom placeholder="${escapeHtml(L.customPlaceholder)}">${escapeHtml(draft.custom)}</textarea><p class="inline-error" id="questionError"></p></div><div class="interaction-actions">${state.questionIndex ? `<button data-interaction="previous">${escapeHtml(L.previous)}</button>` : ''}<button data-interaction="skip">${escapeHtml(L.skip)}</button><button class="primary-action" data-interaction="answer" ${state.questionBusy ? 'disabled' : ''}>${escapeHtml(state.questionBusy ? L.answering : last ? L.submitAnswer : L.next)}</button></div>`
    taskOverlay('question', false)
    if (customDraft !== null) {
      const input = $('interactionDock').querySelector('[data-question-custom]')
      input?.focus({ preventScroll: true })
      input?.setSelectionRange(customDraft.length, customDraft.length)
    }
  } else if (state.approval) {
    const approval = state.approval
    const primary = String(approval.displayReason || approval.reason || '').trim()
    const extra = String(approval.reason || '').trim()
    $('interactionDock').innerHTML = `<div class="interaction-head"><strong>${escapeHtml(L.approvalTitle(approval.toolName || 'tool'))}</strong></div><div class="interaction-body"><p>${escapeHtml(primary || L.approvalNoReason)}</p>${extra && extra !== primary ? `<p>${escapeHtml(extra)}</p>` : ''}<p class="inline-error" id="approvalError"></p></div><div class="interaction-actions"><button data-interaction="reject" ${state.approvalBusy ? 'disabled' : ''}>${escapeHtml(L.approvalReject)}</button><button class="primary-action" data-interaction="allow" ${state.approvalBusy ? 'disabled' : ''}>${escapeHtml(state.approvalBusy ? L.approvalSubmitting : L.approvalAllow)}</button></div>`
    taskOverlay('approval', false)
  } else {
    const dock = $('interactionDock')
    if (state.interactionOverlay) overlays.remove(state.interactionOverlay, false)
    state.interactionOverlay = null
    if (dock) {
      $('bottomDock').append(dock)
      dock.hidden = true
      dock.replaceChildren()
    }
  }
  renderHistory(state.epoch)
  renderTodo(); renderQueue(); syncComposer(); viewport.refresh(); renderChatStatus()
}

function questionAnswer() {
  const question = state.question?.questions?.[state.questionIndex]
  if (!question) return
  const draft = state.questionDrafts[question.id]
  draft.custom = $('interactionDock').querySelector('[data-question-custom]')?.value.trim() ?? ''
  if (!draft.selected.length && !draft.custom) { $('questionError').textContent = L.chooseAnswer; return }
  if (state.questionIndex < state.question.questions.length - 1) { state.questionIndex++; renderInteraction(); return }
  void submitAnswers()
}

async function submitAnswers() {
  if (!state.question || state.questionBusy) return
  const current = state.question, sessionId = state.activeSession, epoch = state.epoch
  state.questionBusy = true; renderInteraction()
  try {
    const answers = current.questions.map(question => { const draft = state.questionDrafts[question.id] ?? { selected: [], custom: '' }; return { id: question.id, selected: !question.multiSelect && draft.custom ? [] : draft.selected, ...(draft.custom ? { custom: draft.custom } : {}) } })
    await rpc('interaction.answer', { rpcId: current.rpcId, sessionId, answers })
    if (!valid(epoch, sessionId)) return
    state.question = null; state.questionBusy = false; renderInteraction(); await loadHistory(false, epoch)
  } catch (error) { state.questionBusy = false; renderInteraction(); if ($('questionError')) $('questionError').textContent = errorText(error, L) }
}

async function cancelQuestion() {
  if (!state.question || state.questionBusy) return
  const current = state.question, sessionId = state.activeSession, epoch = state.epoch
  state.questionBusy = true; renderInteraction()
  try { await rpc('interaction.cancel', { rpcId: current.rpcId, sessionId }); if (valid(epoch, sessionId)) { state.question = null; state.questionBusy = false; renderInteraction(); await loadHistory(false, epoch) } }
  catch (error) { state.questionBusy = false; renderInteraction(); if ($('questionError')) $('questionError').textContent = errorText(error, L) }
}

async function answerApproval(outcome) {
  if (!state.approval || state.approvalBusy) return
  const current = state.approval, sessionId = state.activeSession, epoch = state.epoch
  state.approvalBusy = true; renderInteraction()
  try {
    await rpc('approval.answer', { sessionId, eventId: current.eventId, outcome })
    if (!valid(epoch, sessionId)) return
    state.solvedApprovals.add(current.eventId); state.approval = null; state.approvalBusy = false
    renderInteraction(); toast(outcome === 'allowed-once' ? L.approvalApproved : L.approvalRejected); await loadHistory(false, epoch)
  } catch (error) {
    if (!valid(epoch, sessionId)) return
    state.approvalBusy = false
    if (error?.status === 409 || ['conflict', 'approval-gone', 'approval-expired'].includes(error?.code)) { state.solvedApprovals.add(current.eventId); state.approval = null; renderInteraction(); showError(L.approvalGone) }
    else { renderInteraction(); if ($('approvalError')) $('approvalError').textContent = error?.disconnected ? L.approvalDisconnected : errorText(error, L) }
  }
}

async function uploadFiles(sessionId, items) {
  for (const item of items.filter(item => item.kind === 'file' && !item.receiptId)) {
    item.state = 'uploading'; renderAttachments()
    try {
      const value = await rpc('fileUploads.upload', { agent: sessionId, request: { data: item.base64, name: item.name } })
      if (typeof value?.receiptId !== 'string' || !value.receiptId) throw new Error('invalid-file-data')
      item.receiptId = value.receiptId
      item.name = value.file?.name || item.name
      item.bytes = value.file?.bytes ?? item.bytes
      item.state = 'ready'
    } catch (error) { item.state = 'failed'; item.error = errorText(error, L); throw error }
  }
}

async function sendPrompt(delivery) {
  if (state.sendBusy) return false
  const home = !state.activeSession
  const owner = home ? 'home' : state.activeSession
  const input = home ? $('homePrompt') : $('chatPrompt')
  const text = input.value.trim(), items = attachments.ready(owner)
  if ((!text && !items.length) || attachments.preparing(owner) || items.some(item => item.state === 'failed')) return false
  if (home && !state.workspaceId) { $('homeError').textContent = L.chooseWorkspace; return false }
  const epoch = state.epoch, workspaceId = state.workspaceId
  const attachmentSnapshot = items.map(item => ({ ...item }))
  let id = '', queueing = false, optimisticallyRunning = false
  state.sendBusy = true; showError(null); syncComposer()
  let sessionId = state.activeSession, opened = false
  try {
    if (home) {
      const created = await rpc('session.create', { workspaceId })
      if (epoch !== state.epoch) return false
      rememberCreated(created)
      sessionId = created.sessionId
      if (state.homePreset) await rpc('agentPreset.select', { sessionId, agentPreset: state.homePreset })
      if (state.homeSelection) await rpc('session.selectModel', { sessionId, ...state.homeSelection })
      if (epoch !== state.epoch) return false
      navigation.chat(sessionId, L.untitled)
      opened = true
    }
    if (!sessionId) return false
    await uploadFiles(sessionId, items)
    const content = []
    if (text) content.push({ type: 'text', text })
    for (const item of items.filter(item => item.kind === 'image')) content.push({ type: 'image', mediaType: item.mediaType, data: item.base64, name: item.name })
    for (const item of items.filter(item => item.kind === 'file')) content.push({ type: 'file', receiptId: item.receiptId })
    id = requestId()
    queueing = !home && state.running && delivery !== 'steer'
    const summary = queueSummary(contentBlocksForQueue(content), L)
    if (queueing) {
      state.pendingQueue.push({ requestId: id, signature: queueSignature(contentBlocksForQueue(content)), summary })
      renderQueue()
    } else {
      const activeSummary = state.summaries.find(item => item.sessionId === sessionId)
      if (activeSummary) { activeSummary.running = true; activeSummary.blank = false }
      state.optimistic.push({ requestId: id, text, images: items.filter(item => item.kind === 'image'), files: items.filter(item => item.kind === 'file') })
      if (!state.running) { state.awaitingSince = Date.now() - 1000; state.running = true; optimisticallyRunning = true }
      renderHistory(state.epoch)
    }
    input.value = ''; delete state.drafts[owner]; saveDrafts(localStorage, state.drafts)
    await rpc('session.prompt', { sessionId, mode: queueing ? 'queue' : 'steer', requestId: id, content, clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    const optimistic = state.optimistic.find(item => item.requestId === id)
    if (optimistic) optimistic.sentAt = Date.now()
    attachments.replace(owner, attachments.list(owner).filter(item => !items.some(sent => sent.id === item.id)))
    if (state.activeSession === sessionId) await loadHistory(false)
    if (home) { $('homePrompt').value = ''; fitPrompt($('homePrompt')) }
    if (opened) toast(L.refreshed)
    return true
  } catch (error) {
    if (id) {
      state.optimistic = state.optimistic.filter(item => item.requestId !== id)
      state.pendingQueue = state.pendingQueue.filter(item => item.requestId !== id)
      if (optimisticallyRunning) { state.awaitingSince = 0; state.running = false }
    }
    const recoveryOwner = opened ? sessionId : owner
    const recoveryInput = opened ? $('chatPrompt') : input
    attachments.replace(recoveryOwner, items.map(item => {
      const snapshot = attachmentSnapshot.find(candidate => candidate.id === item.id)
      return snapshot ? { ...item, ...snapshot, receiptId: snapshot.receiptId ?? item.receiptId } : item
    }))
    renderAttachments(recoveryOwner)
    if (epoch === state.epoch || (opened && state.activeSession === sessionId)) {
      recoveryInput.value = text
      state.drafts[recoveryOwner] = { text }
      saveDrafts(localStorage, state.drafts)
      showError(error)
      if (home && !opened) showError(new Error(`${L.settingsFailed}${errorText(error, L)} ${L.settingsRetry}`), $('homeError'))
      if (state.activeSession) renderHistory(state.epoch)
      else renderQueue()
    }
    return false
  } finally { state.sendBusy = false; renderAttachments(); syncComposer() }
}

function contentBlocksForQueue(content) { return content.map(block => block.type === 'text' ? { kind: 'text', text: block.text } : block.type === 'image' ? { kind: 'image', name: block.name } : { kind: 'file', name: block.name ?? block.receiptId }) }

async function stopGeneration() {
  if (!state.activeSession || $('stopButton').disabled) return
  const sessionId = state.activeSession
  $('stopButton').disabled = true; $('stopButton').setAttribute('aria-busy', 'true')
  try { await rpc('session.cancel', { sessionId }); toast(L.stopped); await loadHistory(false) }
  catch (error) { showError(new Error(L.cancelFailed + errorText(error, L))) }
  finally { $('stopButton').disabled = false; $('stopButton').removeAttribute('aria-busy') }
}

function openPicker({ title, options, selected, onPick, searchable = false, replace = null }) {
  const picker = pickerContent({ title, options, selected, L, searchable })
  const id = replace ? overlays.replace(replace, { name: 'picker', className: 'sheet-overlay', content: picker.fragment }) : overlays.open({ name: 'picker', className: 'sheet-overlay', content: picker.fragment })
  const panel = overlays.find(id).panel
  picker.close.addEventListener('click', () => overlays.requestClose(id))
  picker.list.addEventListener('click', event => {
    const button = event.target.closest('[data-picker-value]')
    if (!button) return
    const value = button.dataset.pickerValue
    if (!replace) overlays.requestClose(id)
    void onPick(value)
  })
  return id
}

function openWorkspacePicker() {
  openPicker({ title: L.workspaceTitle, selected: state.workspaceId, options: state.workspaces.map(workspace => ({ id: workspace.workspaceId, label: workspace.title || workspace.path, detail: workspace.path })), onPick: async id => {
    state.workspaceId = id; state.archivedView = false; state.query = ''; $('sessionSearch').value = ''; state.remoteItems = []
    updateWorkspaceUi(); renderDrawer()
  }, replace: overlays.stack.at(-1)?.id })
}

async function loadHomeSettings() {
  if (state.homeModels) return
  try {
    const [catalog, presets] = await Promise.all([rpc('session.models'), rpc('agentPreset.list')])
    state.homeModels = catalog
    state.presets = (presets.presets ?? []).filter(item => !item.broken)
    if (!state.presets.some(item => item.id === state.homePreset)) state.homePreset = state.presets.find(item => item.isDefault)?.id ?? state.presets[0]?.id ?? 'standard'
    if (!state.homeSelection) state.homeSelection = normalizeSelection(catalog.current) ?? normalizeSelection(catalog.default)
  } catch (error) { showError(error, $('homeError')) }
}

async function openSettings(scope) {
  if (state.settingsBusy) return
  const home = scope === 'home'
  if (home && !state.homeModels) await loadHomeSettings()
  if (!home) {
    const sessionId = state.activeSession, epoch = state.epoch
    if (!sessionId) return
    state.settingsBusy = true; syncComposer()
    try {
      const [models, presets, sessions] = await Promise.all([rpc('session.models', { sessionId }), rpc('agentPreset.list'), rpc('session.list')])
      if (!valid(epoch, sessionId)) return
      state.chatModels = models; state.presets = (presets.presets ?? []).filter(item => !item.broken); state.summaries = sessions.items ?? []
      const summary = state.summaries.find(item => item.sessionId === sessionId)
      state.sessionBlank = summary?.blank ?? true; state.currentPreset = summary?.agentPreset ?? state.currentPreset
      const selected = selectionOf(summary?.projections)
      if (selected) state.chatModels.current = selected
    } catch (error) { showError(error); state.settingsBusy = false; syncComposer(); return }
    state.settingsBusy = false; syncComposer()
  }
  const catalog = home ? state.homeModels : state.chatModels
  const current = home ? state.homeSelection : normalizeSelection(catalog?.current) ?? normalizeSelection(catalog?.default)
  const models = flattenModels(catalog)
  const selection = current ?? (models[0] ? { provider: models[0].provider, model: models[0].model } : null)
  const chosen = { selection, effort: selection?.reasoningEffort ?? '', preset: home ? state.homePreset : state.currentPreset }
  openSettingsFromChoice(home, chosen)
}

function openSettingsFromChoice(home, chosen, replaceId = null) {
  const catalog = home ? state.homeModels : state.chatModels
  const selection = chosen.selection
  const entry = modelEntry(catalog, selection).model
  const efforts = entry?.reasoning?.efforts ?? []
  if (!chosen.effort) chosen.effort = entry?.reasoning?.defaultEffort || efforts[0]?.id || ''
  const models = flattenModels(catalog)
  const locked = !home && !state.sessionBlank
  const fragment = document.createDocumentFragment()
  const handle = document.createElement('div'); handle.className = 'sheet-handle'
  const header = document.createElement('header'); header.className = 'sheet-header'
  const heading = document.createElement('h2'); heading.textContent = home ? L.homeSettings : L.sessionSettings
  const close = document.createElement('button'); close.type = 'button'; close.className = 'icon-button'; close.textContent = '×'; close.setAttribute('aria-label', L.close)
  header.append(heading, close)
  const body = document.createElement('div'); body.className = 'sheet-body'
  const error = document.createElement('p'); error.className = 'sheet-error'; error.setAttribute('role', 'alert')
  const field = (label, value, onPick, disabled = false) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'picker-option'; button.disabled = disabled
    const copy = document.createElement('span'); copy.className = 'picker-option-copy'
    const title = document.createElement('strong'); title.textContent = label
    const detail = document.createElement('small'); detail.textContent = value
    copy.append(title, detail); button.append(copy)
    button.addEventListener('click', () => { onPick(id) })
    body.append(button)
  }
  field(L.model, models.find(item => item.provider === selection?.provider && item.model === selection?.model)?.label ?? selection?.model ?? L.noModels, id => openPicker({
    title: L.chooseModel, selected: selection ? `${selection.provider}${selection.model}` : '', searchable: true, replace: id,
    options: models.map(item => ({ id: item.id, label: item.label, group: item.group })),
    onPick: value => { const [provider, model] = value.split(''); chosen.selection = { provider, model }; chosen.effort = ''; openSettingsFromChoice(home, chosen, id) }
  }))
  if (efforts.length) field(L.reasoningEffort, efforts.find(item => item.id === chosen.effort)?.name ?? chosen.effort, id => openPicker({
    title: L.chooseEffort, selected: chosen.effort, options: efforts.map(item => ({ id: item.id, label: item.name })), replace: id,
    onPick: value => { chosen.effort = value; openSettingsFromChoice(home, chosen, id) }
  }))
  field(L.preset, state.presets.find(item => item.id === chosen.preset) ? presetLabel(state.presets.find(item => item.id === chosen.preset), L) : chosen.preset, id => openPicker({
    title: L.choosePreset, selected: chosen.preset, options: state.presets.map(item => ({ id: item.id, label: presetLabel(item, L) })), replace: id,
    onPick: value => { chosen.preset = value; openSettingsFromChoice(home, chosen, id) }
  }), locked)
  const note = document.createElement('p'); note.className = 'sheet-copy'; note.textContent = home ? L.settingsAppliedHome : locked ? L.presetLocked : L.presetEditable
  const actions = document.createElement('div'); actions.className = 'sheet-actions'
  const save = document.createElement('button'); save.className = 'primary-action'; save.textContent = L.save
  actions.append(save); body.append(note, error, actions); fragment.append(handle, header, body)
  const id = replaceId ? overlays.replace(replaceId, { name: 'settings', className: 'sheet-overlay', content: fragment }) : overlays.open({ name: 'settings', className: 'sheet-overlay', content: fragment })
  close.addEventListener('click', () => overlays.requestClose(id))
  save.addEventListener('click', async () => {
    save.disabled = true; save.textContent = L.sending
    try {
      const next = { ...selection, ...(chosen.effort ? { reasoningEffort: chosen.effort } : {}) }
      if (home) { state.homeSelection = next.provider && next.model ? next : null; state.homePreset = chosen.preset }
      else {
        const original = normalizeSelection(catalog?.current) ?? normalizeSelection(catalog?.default)
        if (next.provider && next.model && !sameSelection(next, original)) {
          const result = await rpc('session.selectModel', { sessionId: state.activeSession, ...next })
          state.chatModels.current = normalizeSelection(result?.selected) ?? next
        }
        if (chosen.preset !== state.currentPreset) { await rpc('agentPreset.select', { sessionId: state.activeSession, agentPreset: chosen.preset }); state.currentPreset = chosen.preset }
        toast(L.settingsUpdated)
      }
      overlays.requestClose(id)
    } catch (cause) { error.textContent = errorText(cause, L); save.disabled = false; save.textContent = L.save }
  })
}

function openSessionActions(sessionId) {
  const session = state.summaries.find(item => item.sessionId === sessionId) ?? state.remoteCache[sessionId]
  if (!session) return
  const archived = state.archivedIds.includes(sessionId)
  const sheet = sheetActions([{ id: 'rename', label: L.renameSession }, { id: archived ? 'unarchive' : 'archive', label: archived ? L.unarchive : L.archive, danger: !archived }], L)
  const id = overlays.open({ name: 'session-actions', className: 'sheet-overlay', content: sheet.fragment })
  sheet.close.addEventListener('click', () => overlays.requestClose(id))
  overlays.find(id).panel.addEventListener('click', event => {
    const action = event.target.closest('[data-sheet-action]')?.dataset.sheetAction
    if (!action) return
    if (action === 'rename' || action === 'archive') overlays.replace(id, { name: action, className: 'sheet-overlay', content: null })
    else overlays.requestClose(id)
    if (action === 'rename') openRename(session, id)
    else if (action === 'archive') openArchive(session, id)
    else void unarchive(session)
  })
}

function openRename(session, replaceId = null) {
  const fragment = document.createDocumentFragment()
  const handle = document.createElement('div'); handle.className = 'sheet-handle'
  const header = document.createElement('header'); header.className = 'sheet-header'
  const title = document.createElement('h2'); title.textContent = L.renameTitle
  header.append(title)
  const body = document.createElement('div'); body.className = 'sheet-body'
  const input = document.createElement('input'); input.className = 'sheet-input'; input.value = sessionTitleOf(session); input.maxLength = 200; input.setAttribute('aria-label', L.renameLabel)
  const error = document.createElement('p'); error.className = 'sheet-error'; error.setAttribute('role', 'alert')
  const actions = document.createElement('div'); actions.className = 'sheet-actions'
  const cancel = document.createElement('button'); cancel.textContent = L.cancel
  const save = document.createElement('button'); save.className = 'primary-action'; save.textContent = L.save
  actions.append(cancel, save); body.append(input, error, actions); fragment.append(handle, header, body)
  const id = replaceId ? overlays.replace(replaceId, { name: 'rename', className: 'sheet-overlay', content: fragment }) : overlays.open({ name: 'rename', className: 'sheet-overlay', content: fragment })
  cancel.addEventListener('click', () => overlays.requestClose(id))
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); save.click() } })
  save.addEventListener('click', async () => {
    const value = input.value.trim()
    if (!value) { error.textContent = L.renameEmpty; return }
    save.disabled = true; cancel.disabled = true; input.disabled = true; save.textContent = L.renameSaving
    try {
      const result = await rpc('session.rename', { sessionId: session.sessionId, title: value })
      session.projections ??= { values: {} }; session.projections.values ??= {}; session.projections.values.title = result?.title || value
      if (state.activeSession === session.sessionId) $('chatTitle').textContent = result?.title || value
      overlays.requestClose(id); renderDrawer(); toast(L.renamed)
    } catch (cause) { error.textContent = cause?.code === 'session/rename-unavailable' ? L.renameUnavailable : L.renameFailed + errorText(cause, L); save.disabled = false; cancel.disabled = false; input.disabled = false; save.textContent = L.save }
  })
}

function openArchive(session, replaceId = null) {
  const running = session.running === true
  const fragment = document.createDocumentFragment()
  const handle = document.createElement('div'); handle.className = 'sheet-handle'
  const header = document.createElement('header'); header.className = 'sheet-header'
  const title = document.createElement('h2'); title.textContent = L.archiveTitle; header.append(title)
  const body = document.createElement('div'); body.className = 'sheet-body'
  const copy = document.createElement('p'); copy.className = 'sheet-copy'; copy.textContent = running ? L.archiveRunningBody : L.archiveBody
  const error = document.createElement('p'); error.className = 'sheet-error'
  const actions = document.createElement('div'); actions.className = 'sheet-actions'
  const cancel = document.createElement('button'); cancel.textContent = L.cancel
  const confirm = document.createElement('button'); confirm.className = 'danger-action'; confirm.textContent = running ? L.archiveStopConfirm : L.archiveConfirm
  actions.append(cancel, confirm); body.append(copy, error, actions); fragment.append(handle, header, body)
  const id = replaceId ? overlays.replace(replaceId, { name: 'archive', className: 'sheet-overlay', content: fragment }) : overlays.open({ name: 'archive', className: 'sheet-overlay', content: fragment })
  cancel.addEventListener('click', () => overlays.requestClose(id))
  confirm.addEventListener('click', async () => {
    confirm.disabled = true; cancel.disabled = true; confirm.textContent = L.archiving
    try {
      const value = await rpc('workspace.archiveSession', { sessionId: session.sessionId, ...(running ? { stopActivity: true } : {}) })
      state.archivedIds = value.archivedSessionIds ?? [...new Set([...state.archivedIds, session.sessionId])]
      overlays.requestClose(id); renderDrawer(); toast(L.archived)
    } catch (cause) { error.textContent = cause?.code === 'workspace/archive-unavailable' ? L.archiveUnavailable : L.archiveFailed + errorText(cause, L); confirm.disabled = false; cancel.disabled = false; confirm.textContent = running ? L.archiveStopConfirm : L.archiveConfirm }
  })
}

async function unarchive(session) {
  try { const value = await rpc('workspace.unarchiveSession', { sessionId: session.sessionId }); state.archivedIds = value.archivedSessionIds ?? state.archivedIds.filter(id => id !== session.sessionId); renderDrawer(); toast(L.unarchived) }
  catch (error) { showError(error) }
}

function openImage(source, alt) {
  const fragment = document.createDocumentFragment()
  const close = document.createElement('button'); close.type = 'button'; close.className = 'image-close'; close.setAttribute('aria-label', L.close); close.textContent = '×'
  const viewer = document.createElement('div'); viewer.className = 'image-viewer'
  const image = document.createElement('img'); image.src = source; image.alt = alt || L.imageAlt
  viewer.append(image); fragment.append(close, viewer)
  const id = overlays.open({ name: 'image', className: 'image-overlay', content: fragment })
  close.addEventListener('click', () => overlays.requestClose(id))
}

function openAttachmentMenu(owner) {
  const actions = [
    { id: 'album', label: `${L.album} · ${L.albumHint}` }, { id: 'camera', label: `${L.camera} · ${L.cameraHint}` },
    { id: 'file', label: `${L.file} · ${L.fileHint}` }, { id: 'paste', label: `${L.paste} · ${L.pasteHint}` }
  ]
  const fragment = document.createDocumentFragment()
  const handle = document.createElement('div'); handle.className = 'sheet-handle'
  const header = document.createElement('header'); header.className = 'sheet-header'
  const title = document.createElement('h2'); title.textContent = L.attachmentTitle; header.append(title)
  const body = document.createElement('div'); body.className = 'sheet-body'
  for (const action of actions) { const button = document.createElement('button'); button.type = 'button'; button.className = 'sheet-action'; button.dataset.mediaAction = action.id; button.textContent = action.label; body.append(button) }
  fragment.append(handle, header, body)
  const id = overlays.open({ name: 'attachments', className: 'sheet-overlay', content: fragment })
  body.addEventListener('click', event => {
    const action = event.target.closest('[data-media-action]')?.dataset.mediaAction
    if (!action) return
    overlays.requestClose(id)
    if (action === 'paste') { (owner === 'home' ? $('homePrompt') : $('chatPrompt')).focus(); toast(L.imagePasteHint) }
    else $(action === 'album' ? 'albumInput' : action === 'camera' ? 'cameraInput' : 'fileInput').click()
  })
}

function setConnection(connected) {
  state.connected = connected
  const label = connected ? L.connected : L.disconnected
  $('homeConnection').dataset.state = connected ? 'connected' : 'disconnected'
  $('homeConnection').setAttribute('aria-label', label)
  $('drawerConnectionDot').dataset.state = connected ? 'connected' : 'disconnected'
  $('drawerConnection').textContent = label
}

async function checkConnection() {
  if (document.hidden) return
  try {
    const response = await fetch('/api/status', { cache: 'no-store' })
    if (response.status === 401) { location.replace('/disconnected'); return }
    if (!response.ok) throw new Error('offline')
    const body = await response.json()
    state.unreachable = 0; setConnection(true)
    if (state.interactionOverlay && overlays.find(state.interactionOverlay)?.name === 'connection') {
      overlays.remove(state.interactionOverlay)
      state.interactionOverlay = null
    }
    state.tunnelExpiresAt = typeof body.tunnelExpiresAt === 'number' ? body.tunnelExpiresAt : null
    const minutes = state.tunnelExpiresAt ? Math.max(0, Math.ceil((state.tunnelExpiresAt - Date.now()) / 60000)) : 0
    $('tunnelWarning').hidden = !minutes; $('drawerTunnelWarning').hidden = !minutes
    if (minutes) { $('tunnelWarning').textContent = L.tunnelExpires(minutes); $('drawerTunnelWarning').textContent = L.tunnelExpires(minutes) }
    viewport.refresh()
  } catch {
    setConnection(false)
    if (++state.unreachable >= 3 && !state.interactionOverlay) {
      const fragment = document.createDocumentFragment()
      const title = document.createElement('h2'); title.textContent = L.connectionOverlayTitle
      const copy = document.createElement('p'); copy.className = 'sheet-copy'; copy.textContent = L.connectionOverlayBody
      fragment.append(title, copy)
      state.interactionOverlay = overlays.open({ name: 'connection', className: 'sheet-overlay', content: fragment, dismissible: false, onClose: () => { state.interactionOverlay = null } })
    }
  }
}

$('chatHomeButton').addEventListener('click', () => navigation.home())
for (const button of document.querySelectorAll('[data-open-drawer]')) button.addEventListener('click', () => { void loadSessions().catch(error => showError(error)); navigation.openDrawer() })
$('newTaskButton').addEventListener('click', () => navigation.home({ replace: navigation.drawerOpen }))
$('homeWorkspace').addEventListener('click', openWorkspacePicker)
$('workspaceButton').addEventListener('click', openWorkspacePicker)
$('refreshButton').addEventListener('click', refreshAll)
$('connectionButton').addEventListener('click', async () => { await checkConnection(); if (state.connected) { overlays.closeAll(); void refreshAll() } })
$('archiveButton').addEventListener('click', () => { state.archivedView = !state.archivedView; state.query = ''; $('sessionSearch').value = ''; state.remoteItems = []; renderDrawer() })
$('sessionList').addEventListener('click', event => {
  const menu = event.target.closest('[data-session-menu]')
  if (menu) { openSessionActions(menu.dataset.sessionMenu); return }
  const button = event.target.closest('[data-open-session]')
  if (button) navigation.chat(button.dataset.openSession, button.dataset.sessionTitle, { replace: navigation.drawerOpen })
})
$('sessionSearch').addEventListener('input', event => {
  state.query = event.target.value; state.remoteItems = []; state.searchNote = ''; state.searchHasMore = false
  const sequence = ++state.searchSequence, query = state.query.trim()
  clearTimeout(state.searchTimer)
  if (query.length >= 2 && !state.searchUnavailable) {
    state.searchNote = L.searching
    state.searchTimer = setTimeout(async () => {
      try {
        const value = await rpc('session.search', { query })
        if (sequence !== state.searchSequence) return
        state.remoteItems = value.items ?? []; state.searchHasMore = value.hasMore === true
        state.searchNote = state.searchHasMore ? L.searchPartial : ''
        for (const item of state.remoteItems) if (!state.summaries.some(session => session.sessionId === item.sessionId)) state.remoteCache[item.sessionId] ??= { sessionId: item.sessionId, updatedAt: 0, projections: { values: { title: L.untitled } } }
      } catch (error) {
        if (sequence !== state.searchSequence) return
        const message = String(error?.message ?? '').toLowerCase()
        if (error?.code === 'session/search-unavailable' || message.includes('session search is unavailable') || message.includes('does not mount')) { state.searchUnavailable = true; state.searchNote = L.searchLocalOnly }
        else state.searchNote = L.searchFailed
      }
      renderDrawer()
    }, 300)
  }
  renderDrawer()
})
$('searchClear').addEventListener('click', () => { $('sessionSearch').value = ''; $('sessionSearch').dispatchEvent(new Event('input')); $('sessionSearch').focus() })
$('chatMore').addEventListener('click', () => { if (state.activeSession) openSessionActions(state.activeSession) })
$('chatIdentity').addEventListener('click', () => { if (state.activeSession) openSessionActions(state.activeSession) })

for (const [form, scope] of [[$('homeComposer'), 'home'], [$('chatComposer'), 'chat']]) {
  const input = scope === 'home' ? $('homePrompt') : $('chatPrompt')
  form.addEventListener('submit', event => { event.preventDefault(); void sendPrompt() })
  input.addEventListener('input', () => { saveDraft(scope === 'home' ? 'home' : state.activeSession); fitPrompt(input); syncComposer() })
  input.addEventListener('keydown', event => {
    const coarse = globalThis.matchMedia?.('(pointer:coarse)').matches
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && (!coarse || event.ctrlKey || event.metaKey)) { event.preventDefault(); void sendPrompt(event.ctrlKey || event.metaKey ? 'steer' : undefined) }
  })
  input.addEventListener('blur', () => saveDraft(scope === 'home' ? 'home' : state.activeSession))
}
$('steerButton').addEventListener('click', () => void sendPrompt('steer'))
$('stopButton').addEventListener('click', stopGeneration)
$('bottomButton').addEventListener('click', () => { state.readingHistory = false; messages.scrollToLatest(true) })
$('todoDock').addEventListener('click', event => { if (event.target.closest('.dock-header')) { state.todoExpanded = !state.todoExpanded; renderTodo() } })
$('queueDock').addEventListener('click', event => {
  const button = event.target.closest('[data-queue-action]')
  if (!button) return
  const action = button.dataset.queueAction, id = button.dataset.queueId
  if (action === 'edit') { const item = state.queue.find(row => row.id === id); if (item) { state.queueEditing = { id, text: item.text }; renderQueue(); $('queueDock').querySelector('[data-queue-edit]')?.focus() } }
  else if (action === 'cancel-edit') { state.queueEditing = null; renderQueue() }
  else if (action === 'save-edit') { const text = $('queueDock').querySelector('[data-queue-edit]')?.value ?? ''; if (!text.trim()) { state.queueError = L.queueEditEmpty; renderQueue() } else void queueAction(state.queueEditing.id, { kind: 'edit', content: [{ type: 'text', text }] }) }
  else void queueAction(id, { kind: action })
})
$('interactionDock').addEventListener('click', event => {
  const option = event.target.closest('[data-question-option]')
  if (option && state.question && !state.questionBusy) {
    const question = state.question.questions[state.questionIndex], draft = state.questionDrafts[question.id]
    const label = question.options[Number(option.dataset.questionOption)]?.label
    if (label) { draft.selected = question.multiSelect ? draft.selected.includes(label) ? draft.selected.filter(item => item !== label) : [...draft.selected, label] : [label]; if (!question.multiSelect) draft.custom = ''; renderInteraction() }
    return
  }
  const action = event.target.closest('[data-interaction]')?.dataset.interaction
  if (action === 'answer') questionAnswer()
  else if (action === 'skip') { const question = state.question.questions[state.questionIndex]; state.questionDrafts[question.id] = { selected: [], custom: '', skipped: true }; if (state.questionIndex < state.question.questions.length - 1) { state.questionIndex++; renderInteraction() } else void submitAnswers() }
  else if (action === 'previous') { state.questionIndex--; renderInteraction() }
  else if (action === 'cancel-question') void cancelQuestion()
  else if (action === 'allow') void answerApproval('allowed-once')
  else if (action === 'reject') void answerApproval('rejected')
})
$('messageScroll').addEventListener('click', event => {
  if (event.target.closest('[data-load-earlier]')) { void loadEarlier(); return }
  const button = event.target.closest('[data-image-src]')
  if (button) openImage(button.dataset.imageSrc, button.dataset.imageAlt)
})
$('messageScroll').addEventListener('error', event => {
  const image = event.target
  if (image?.tagName !== 'IMG') return
  const fallback = document.createElement('span'); fallback.className = 'sheet-copy'; fallback.textContent = L.imageUnavailable
  image.closest('.msg-image')?.replaceWith(fallback)
}, true)
for (const element of document.querySelectorAll('[data-attachment-tray]')) element.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove-attachment]'), retry = event.target.closest('[data-retry-attachment]'), owner = state.activeSession || 'home'
  if (remove) attachments.remove(owner, remove.dataset.removeAttachment)
  if (retry) void attachments.retry(owner, retry.dataset.retryAttachment)
})
for (const button of document.querySelectorAll('[data-attach]')) button.addEventListener('click', () => openAttachmentMenu(state.activeSession || 'home'))
for (const button of document.querySelectorAll('[data-settings]')) button.addEventListener('click', () => void openSettings(button.dataset.settings))
for (const [id, kind] of [['albumInput', 'image'], ['cameraInput', 'image'], ['fileInput', 'file']]) $(id).addEventListener('change', async event => {
  const files = [...(event.target.files ?? [])]; event.target.value = ''
  try { await attachments.add(state.activeSession || 'home', files, kind) } catch (error) { showError(error) }
  syncComposer()
})
document.addEventListener('paste', event => {
  if (state.sendBusy || overlays.stack.length) return
  const files = [...(event.clipboardData?.items ?? [])].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean)
  if (!files.length) return
  event.preventDefault(); void attachments.add(state.activeSession || 'home', files, 'image').catch(error => showError(error))
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(state.pollTimer); return }
  if (state.activeSession) void loadHistory(false)
  void checkConnection()
})

export async function startMobileApp() {
  navigation.boot()
  updateWorkspaceUi()
  try { await retryWorkspaces(); await loadSessions() } catch (error) { showError(error, $('homeError')) }
  void loadHomeSettings()
  void checkConnection()
  setInterval(checkConnection, 1500)
}
