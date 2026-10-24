import { createServer } from 'node:http'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'
import { startPairedBridge } from './mobile-bridge.mjs'

const DEFAULT_PRESETS = [
  { id: 'standard', name: 'Standard', trust: 'system', isDefault: true },
  { id: 'code', name: 'Code', trust: 'system' },
  { id: 'minimal', name: 'Minimal', trust: 'system' },
]

const DEFAULT_MODEL_CATALOG = {
  groups: [{
    id: 'fixture', name: 'Fixture provider', models: [
      { id: 'model-a', name: 'Model Alpha', description: 'Default test model', reasoning: { defaultEffort: 'low', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } },
      { id: 'model-b', name: 'Model Beta', description: 'Alternative test model', reasoning: { defaultEffort: 'low', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } },
    ],
  }],
  routableProviders: ['fixture'],
  current: { provider: 'fixture', model: 'model-a', reasoningEffort: 'low' },
  default: { provider: 'fixture', model: 'model-a', reasoningEffort: 'low' },
}

async function waitForCondition(predicate, description, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for ${description}`)
}

class FakeHarnessError extends Error {
  constructor(code, message, { details, fixture = false } = {}) {
    super(message)
    this.code = code
    this.details = details
    this.fixture = fixture
  }
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sessionProjections(session) {
  const values = { title: session.title, todos: session.todos }
  if (session.queue) values.inbox = { 'next-turn': session.queue }
  if (session.modelSelection) values.modelSelection = { next: session.modelSelection }
  return { asOfSeq: session.cursor, values }
}

function sessionSummary(session) {
  return {
    sessionId: session.id,
    updatedAt: session.updatedAt,
    running: session.running,
    blank: session.records.length === 0,
    agentPreset: session.agentPreset,
    projections: sessionProjections(session),
  }
}

function makeSession({ id, title, records = [], cursor = 0, updatedAt = Date.now() }) {
  return {
    id, title, updatedAt, cursor, records,
    running: false, agentPreset: 'standard', todos: [], queue: null, modelSelection: null,
  }
}

function requiredSession(state, sessionId) {
  const session = state.sessions.get(sessionId)
  if (!session) throw new FakeHarnessError('unknown-session', `Unknown fake session: ${sessionId}`, { fixture: true })
  return session
}

function consumeFailure(state, method) {
  const failures = state.failures.get(method)
  if (!failures?.length) return
  const failure = failures.shift()
  throw new FakeHarnessError(failure.code ?? 'fixture-failure', failure.message ?? `Fake ${method} failure`, { details: failure.details })
}

async function resultValue(method, args, state) {
  const holds = state.holds.get(method)
  const index = holds?.findIndex(hold => hold.predicate(args)) ?? -1
  if (index >= 0) {
    const [hold] = holds.splice(index, 1)
    await hold.promise
    state.completedHolds.push({ id: hold.id, method, args: structuredClone(args) })
  }
  consumeFailure(state, method)
  if (method === 'session/list') return { items: [...state.sessions.values()].map(sessionSummary) }
  if (method === 'agentPresets/list') return { presets: structuredClone(state.presets) }
  if (method === 'session/modelCatalog') return structuredClone(state.modelCatalog)
  if (method === 'session/page') {
    const request = args.request
    const session = requiredSession(state, request?.address?.sessionId)
    if (request.address.kind !== 'session' || !Number.isSafeInteger(request.throughSeq) || request.throughSeq > session.cursor) {
      throw new FakeHarnessError('invalid-page-request', 'Fake session/page received an invalid bounded request.', { fixture: true })
    }
    const configured = state.historyPages.get(session.id)
    if (configured) {
      const page = configured.get(request.beforeSeq)
      if (!page) throw new FakeHarnessError('unexpected-history-page', `No fake history page for beforeSeq=${request.beforeSeq}`, { fixture: true })
      return { records: structuredClone(page.records), hasMore: page.hasMore }
    }
    if (request.beforeSeq !== undefined) throw new FakeHarnessError('unexpected-history-page', 'Default fake history has no earlier page.', { fixture: true })
    return { records: session.records.filter(record => record.seq <= request.throughSeq), hasMore: false }
  }
  if (method === 'session/create') {
    const workspace = state.workspaces.find(item => item.workspaceId === args.request?.workspaceId)
    if (!workspace) throw new FakeHarnessError('unknown-workspace', 'Fake session/create received an unknown workspace.', { fixture: true })
    const id = `created-${++state.createdSequence}`
    const session = makeSession({ id, title: 'Created from phone' })
    state.sessions.set(id, session)
    state.created++
    workspace.sessionIds.unshift(id)
    state.broadcastWorkspace()
    return { sessionId: id, session: sessionSummary(session) }
  }
  if (method === 'session/prompt') {
    const session = requiredSession(state, args.request?.sessionId)
    state.prompts.push(structuredClone(args.request))
    const seq = ++session.cursor
    session.records.push({ seq, event: { type: 'user/message', data: { message: {
      source: { kind: 'user', rpcId: args.request.requestId }, content: args.request.content,
    } } } })
    session.updatedAt = Date.now()
    return { accepted: true, requestId: args.request.requestId }
  }
  if (method === 'session/search') return { items: [], hasMore: false }
  if (method === 'session/rename') {
    const session = requiredSession(state, args.request?.sessionId)
    session.title = args.request.title
    return { title: session.title }
  }
  if (method === 'workspace/archiveSession') {
    const session = requiredSession(state, args.request?.sessionId)
    if (args.request.stopActivity === true) session.running = false
    if (!state.archivedSessionIds.includes(session.id)) state.archivedSessionIds.push(session.id)
    for (const workspace of state.workspaces) workspace.sessionIds = workspace.sessionIds.filter(sessionId => sessionId !== session.id)
    state.broadcastWorkspace()
    return { archivedSessionIds: [...state.archivedSessionIds] }
  }
  if (method === 'workspace/unarchiveSession') {
    const session = requiredSession(state, args.request?.sessionId)
    state.archivedSessionIds = state.archivedSessionIds.filter(sessionId => sessionId !== session.id)
    const workspace = state.workspaces.find(item => item.workspaceId === 'w1') ?? state.workspaces[0]
    if (workspace && !workspace.sessionIds.includes(session.id)) workspace.sessionIds.unshift(session.id)
    state.broadcastWorkspace()
    return { archivedSessionIds: [...state.archivedSessionIds] }
  }
  if (method === 'agentPresets/select') {
    const session = requiredSession(state, args.agentId)
    if (!state.presets.some(preset => preset.id === args.agentPreset)) throw new FakeHarnessError('unknown-preset', 'Fake agentPresets/select received an unknown preset.', { fixture: true })
    session.agentPreset = args.agentPreset
    return { agentPreset: args.agentPreset }
  }
  if (method === 'session/selectModel') {
    const session = requiredSession(state, args.request?.sessionId)
    const { provider, model, reasoningEffort } = args.request
    if (typeof provider !== 'string' || typeof model !== 'string') throw new FakeHarnessError('invalid-model-selection', 'Fake session/selectModel received an invalid selection.', { fixture: true })
    session.modelSelection = { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) }
    return { selected: structuredClone(session.modelSelection) }
  }
  if (method === 'session/cancel') return { accepted: true }
  if (method === 'session/updateQueue') {
    const { sessionId, itemId, action } = args.request ?? {}
    const session = requiredSession(state, sessionId)
    const item = session.queue?.find(row => row.id === itemId)
    if (!item) throw new FakeHarnessError('queue-item-not-pending', `Unknown fake queue item: ${itemId}`, { fixture: true })
    state.queueActions.push(structuredClone(args.request))
    if (action.kind === 'edit') item.content = structuredClone(action.content)
    else if (action.kind === 'remove' || action.kind === 'steer') session.queue = session.queue.filter(row => row.id !== itemId)
    else throw new FakeHarnessError('invalid-queue-action', 'Fake session/updateQueue received an invalid action.', { fixture: true })
    return { updated: true }
  }
  if (method === 'fileUploads/upload') {
    const session = requiredSession(state, args.agentId)
    const upload = { sessionId: session.id, ...structuredClone(args.request) }
    state.uploads.push(upload)
    return { receiptId: `receipt-${state.uploads.length}`, file: { name: upload.name, bytes: Buffer.from(upload.data, 'base64').length } }
  }
  if (method === '$events/result') {
    if (!state.pendingEvents.has(args.eventId)) throw new FakeHarnessError('event-not-pending', `Fake waterfall event is not pending: ${args.eventId}`, { fixture: true })
    state.pendingEvents.delete(args.eventId)
    state.eventResults.push(structuredClone(args))
    return { accepted: true }
  }
  throw new FakeHarnessError('unhandled-fixture-method', `Unhandled fake Harness method: ${method}`, { fixture: true })
}

export async function startMobileBrowserHarness() {
  const sessions = new Map()
  const workspaces = []
  const eventClients = new Set()
  const state = {
    sessions,
    workspaces,
    archivedSessionIds: [],
    prompts: [],
    uploads: [],
    queueActions: [],
    eventResults: [],
    rpcCalls: [],
    streamOpens: [],
    fixtureErrors: [],
    created: 0,
    createdSequence: 0,
    clients: new Set(),
    sessionClients: new Map(),
    snapshots: new Map(),
    cursorFloors: new Map(),
    removedSessionCursors: new Map(),
    pendingEvents: new Map(),
    failures: new Map(),
    holds: new Map(),
    completedHolds: [],
    holdSequence: 0,
    historyPages: new Map(),
    presets: [],
    modelCatalog: null,
    broadcastWorkspace: () => {},
    reset,
  }

  function reset() {
    for (const eventId of state.pendingEvents.keys()) {
      for (const client of eventClients) if (client.readyState === 1) client.send(JSON.stringify({ type: 'item', streamId: 'mobile-events', value: { type: 'cancel', eventId } }))
    }
    for (const [sessionId, session] of sessions) state.removedSessionCursors.set(sessionId, session.cursor)
    sessions.clear()
    state.pendingEvents.clear()
    state.sessionClients.clear()
    state.snapshots.clear()
    for (const [sessionId, cursor] of state.cursorFloors) {
      const session = sessions.get(sessionId)
      if (session) session.cursor = Math.max(session.cursor, cursor)
    }
    for (const [sessionId, cursor] of state.removedSessionCursors) {
      const session = sessions.get(sessionId)
      if (session) session.cursor = Math.max(session.cursor, cursor)
    }
    state.failures.clear()
    for (const holds of state.holds.values()) for (const hold of holds) hold.release()
    state.holds.clear()
    state.completedHolds.length = 0
    state.historyPages.clear()
    state.prompts.length = 0
    state.uploads.length = 0
    state.queueActions.length = 0
    state.eventResults.length = 0
    state.rpcCalls.length = 0
    state.streamOpens.length = 0
    state.fixtureErrors.length = 0
    state.created = 0
    state.archivedSessionIds.splice(0, state.archivedSessionIds.length)
    state.presets = structuredClone(DEFAULT_PRESETS)
    state.modelCatalog = structuredClone(DEFAULT_MODEL_CATALOG)
    workspaces.splice(0, workspaces.length,
      { workspaceId: 'w1', title: 'Test workspace', path: 'F:/work/test', sessionIds: ['s1'] },
      { workspaceId: 'w2', title: 'Second workspace', path: 'F:/work/second', sessionIds: [] },
    )
    sessions.set('s1', makeSession({
      id: 's1', title: 'Existing conversation', updatedAt: 1, cursor: 3,
      records: [
        { seq: 1, event: { type: 'user/message', data: { message: { source: { kind: 'user', rpcId: 'seed-user' }, content: [{ type: 'text', text: 'Question from the phone fixture' }] } } } },
        { seq: 2, event: { type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Answer before streaming' } } } },
        { seq: 3, event: { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'Answer before streaming' }] } } } },
      ],
    }))
    state.broadcastWorkspace()
  }
  reset()

  const server = createServer(async (request, response) => {
    let envelope
    try {
      if (request.method !== 'POST') {
        response.writeHead(404).end()
        return
      }
      envelope = await readJson(request)
      const args = envelope.payload?.args ?? {}
      state.rpcCalls.push({ rpcId: envelope.rpcId, method: envelope.method, args: structuredClone(args) })
      const value = await resultValue(envelope.method, args, state)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value } }))
    } catch (error) {
      if (error.fixture) state.fixtureErrors.push({ method: envelope?.method, args: envelope?.payload?.args, code: error.code, message: error.message })
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        type: 'server-response', rpcId: envelope?.rpcId ?? 'unknown',
        result: { ok: false, error: { code: error.code ?? 'invalid-fixture-request', message: error.message, ...(error.details ? { details: error.details } : {}) } },
      }))
    }
  })
  const sockets = new Set()
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  const wss = new WebSocketServer({ noServer: true })
  wss.on('connection', client => {
    state.clients.add(client)
    client.on('message', raw => {
      const frame = JSON.parse(String(raw))
      if (frame.type !== 'open') return
      state.streamOpens.push({ streamId: frame.streamId, endpoint: frame.endpoint, args: frame.payload?.args })
      if (frame.streamId === 'mobile-events') {
        eventClients.add(client)
        client.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: { type: 'ready', clientId: 'fake-events' } }))
      } else if (frame.streamId === 'mobile-workspaces') {
        client.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: { type: 'baseline', value: { items: state.workspaces, archivedSessionIds: state.archivedSessionIds } } }))
      } else if (frame.streamId.startsWith('mobile-session-')) {
        const sessionId = frame.payload?.args?.request?.address?.sessionId
        if (!state.sessionClients.has(sessionId)) state.sessionClients.set(sessionId, new Set())
        state.sessionClients.get(sessionId).add(client)
        client.mobileStreamId = frame.streamId
        const session = state.sessions.get(sessionId)
        if (session) {
          state.snapshots.set(sessionId, (state.snapshots.get(sessionId) ?? 0) + 1)
          client.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: {
            type: 'snapshot', cursor: session.cursor, records: session.records,
            projections: sessionProjections(session),
          } }))
        }
      }
    })
    client.once('close', () => {
      state.clients.delete(client)
      eventClients.delete(client)
      for (const [sessionId, candidates] of state.sessionClients) {
        candidates.delete(client)
        if (!candidates.size) state.sessionClients.delete(sessionId)
      }
    })
  })
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/api/remote.mux') { socket.destroy(); return }
    wss.handleUpgrade(request, socket, head, client => wss.emit('connection', client, request))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const harnessUrl = `http://127.0.0.1:${server.address().port}`
  const paired = await startPairedBridge({
    harnessUrl,
    brandLogoPaths: {
      light: join(process.cwd(), 'assets', 'logo-light.png'),
      dark: join(process.cwd(), 'assets', 'logo-dark.png'),
    },
  })
  state.broadcastWorkspace = () => {
    for (const client of state.clients) if (client.readyState === 1) client.send(JSON.stringify({
      type: 'item', streamId: 'mobile-workspaces',
      value: { type: 'baseline', value: { items: state.workspaces, archivedSessionIds: state.archivedSessionIds } },
    }))
  }

  async function sendWaterfall(value) {
    await waitForCondition(() => eventClients.size > 0, 'the real $events waterfall stream')
    if (!eventClients.size) throw new Error('No live $events stream for fake waterfall')
    state.pendingEvents.set(value.eventId, value)
    for (const client of eventClients) if (client.readyState === 1) client.send(JSON.stringify({ type: 'item', streamId: 'mobile-events', value }))
  }

  return {
    origin: paired.origin,
    cookie: paired.cookie,
    state,
    addSession({ id, title = 'Untitled fake session', workspaceId = 'w1', records = [], cursor = 0, updatedAt = Date.now() }) {
      const session = makeSession({ id, title, records, cursor, updatedAt })
      sessions.set(id, session)
      const workspace = workspaces.find(item => item.workspaceId === workspaceId)
      if (!workspace) throw new Error(`Unknown fake workspace: ${workspaceId}`)
      workspace.sessionIds.unshift(id)
      state.broadcastWorkspace()
      return session
    },
    failNext(method, error = {}) {
      const failures = state.failures.get(method) ?? []
      failures.push(error)
      state.failures.set(method, failures)
    },
    holdNext(method, predicate = () => true) {
      let release
      const promise = new Promise(resolve => { release = resolve })
      const holds = state.holds.get(method) ?? []
      const id = `${method}:${++state.holdSequence}`
      const hold = { id, predicate, promise, release }
      holds.push(hold)
      state.holds.set(method, holds)
      return { id, release, get pending() { return holds.includes(hold) } }
    },
    setModelCatalog(catalog) { state.modelCatalog = structuredClone(catalog) },
    setPresets(presets) { state.presets = structuredClone(presets) },
    setWorkspaces(items) {
      workspaces.splice(0, workspaces.length, ...structuredClone(items))
      state.broadcastWorkspace()
    },
    setHistoryPages(sessionId, pages) {
      const session = requiredSession(state, sessionId)
      const configured = new Map()
      for (const page of pages) configured.set(page.beforeSeq, { records: structuredClone(page.records), hasMore: page.hasMore === true })
      const tail = configured.get(undefined)
      if (!tail) throw new Error('Fake history pages require a tail page without beforeSeq')
      session.records = structuredClone(tail.records)
      session.cursor = Math.max(session.cursor, ...tail.records.map(record => record.seq))
      session.updatedAt = Date.now()
      state.historyPages.set(sessionId, configured)
    },
    async pushPendingQuestion(sessionId, { eventId = 'question-1', questions }) {
      await sendWaterfall({ type: 'waterfall', event: 'user-questions/request', eventId, agentId: sessionId, request: { questions } })
    },
    async pushPendingApproval(sessionId, { eventId = 'approval-1', ...request }) {
      await sendWaterfall({ type: 'waterfall', event: 'approval/request', eventId, agentId: sessionId, request })
    },
    async pushQueueProjection(sessionId, items) {
      await waitForCondition(() => (state.snapshots.get(sessionId) ?? 0) > 0 && state.rpcCalls.some(call => call.method === 'session/page' && call.args.request?.address?.sessionId === sessionId), `initial session history for ${sessionId}`)
      const session = requiredSession(state, sessionId)
      session.queue = structuredClone(items)
      const running = { type: 'turn/start', time: Date.now(), data: { turn: 20 } }
      const seq = ++session.cursor
      session.records.push({ seq, event: running, projections: sessionProjections(session) })
      session.running = true
      state.cursorFloors.set(sessionId, session.cursor)
      const clients = state.sessionClients.get(sessionId)
      if (!clients?.size) throw new Error(`No live session stream for ${sessionId}`)
      for (const client of clients) {
        if (client.readyState === 1) client.send(JSON.stringify({ type: 'item', streamId: client.mobileStreamId, value: { seq, event: running, projections: sessionProjections(session) } }))
      }
    },
    /** Push a native session/follow record through the real bridge SSE connection. */
    async pushSessionEvent(sessionId, event) {
      const clients = state.sessionClients.get(sessionId)
      if (!clients?.size) throw new Error(`No live session stream for ${sessionId}`)
      const session = requiredSession(state, sessionId)
      if (event.type === 'turn/start') session.running = true
      if (event.type === 'turn/end') session.running = false
      const seq = ++session.cursor
      state.cursorFloors.set(sessionId, session.cursor)
      const record = { seq, event, projections: sessionProjections(session) }
      session.records.push(record)
      for (const client of clients) {
        if (client.readyState === 1) client.send(JSON.stringify({ type: 'item', streamId: client.mobileStreamId, value: record }))
      }
    },
    async stop() {
      await paired.stop()
      for (const client of state.clients) client.terminate()
      for (const client of wss.clients) client.terminate()
      await new Promise(resolve => wss.close(resolve))
      for (const socket of sockets) socket.destroy()
      await new Promise(resolve => server.close(resolve))
    },
  }
}
