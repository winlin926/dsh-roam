export function applyPendingCreatedSessions(workspaces, pending, serverItems, archivedIds) {
  return pending.filter(item => {
    const seen = serverItems.some(workspace => Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(item.sessionId)) || archivedIds.includes(item.sessionId)
    const workspace = workspaces.find(candidate => candidate.workspaceId === item.workspaceId)
    if (workspace && Array.isArray(workspace.sessionIds) && !workspace.sessionIds.includes(item.sessionId)) workspace.sessionIds = [item.sessionId, ...workspace.sessionIds]
    return !seen
  }).map(item => ({ workspaceId: item.workspaceId, sessionId: item.sessionId }))
}

export function sessionTitleOf(summary) {
  const values = summary?.projections?.values
  if (!values || typeof values !== 'object') return ''
  for (const key of ['title', 'sessionTitle', 'session.title']) if (typeof values[key] === 'string') return values[key]
  return ''
}

export function workspaceForSession(workspaces, sessionId) {
  return workspaces.find(workspace => workspace.sessionIds?.includes(sessionId))
}

export function relativeTime(value, now, L) {
  const parsed = typeof value === 'number' ? value : Date.parse(value)
  const elapsed = Math.max(0, now - (Number.isFinite(parsed) ? parsed : now))
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return L.justNow
  if (minutes < 60) return `${minutes}${L.minute}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}${L.hour}`
  return `${Math.floor(hours / 24)}${L.day}`
}

export function sessionRows({ summaries, workspaces, archivedIds, workspaceId, archivedView, query = '', remoteItems = [], remoteCache = {} }) {
  const archived = new Set(archivedIds)
  const allowed = new Set(workspaces.find(item => item.workspaceId === workspaceId)?.sessionIds ?? [])
  const base = summaries.filter(session => archivedView ? archived.has(session.sessionId) : allowed.has(session.sessionId) && !archived.has(session.sessionId))
  const needle = query.trim().toLocaleLowerCase()
  const result = new Map()
  for (const session of base) if (!needle || sessionTitleOf(session).toLocaleLowerCase().includes(needle)) result.set(session.sessionId, { session, snippet: '' })
  if (needle) for (const item of remoteItems) {
    const session = base.find(row => row.sessionId === item.sessionId) ?? remoteCache[item.sessionId]
    if (!session) continue
    if (result.has(item.sessionId)) {
      if (typeof item.snippet === 'string' && item.snippet) result.get(item.sessionId).snippet = item.snippet
      continue
    }
    const inScope = archivedView ? archived.has(item.sessionId) : allowed.has(item.sessionId) && !archived.has(item.sessionId)
    if (inScope) result.set(item.sessionId, { session, snippet: typeof item.snippet === 'string' ? item.snippet : '' })
  }
  return [...result.values()].sort((a, b) => (b.session.updatedAt ?? 0) - (a.session.updatedAt ?? 0))
}

export function normalizeSelection(value) {
  if (!value || typeof value.provider !== 'string' || !value.provider || typeof value.model !== 'string' || !value.model) return null
  const reasoningEffort = typeof value.reasoningEffort === 'string' ? value.reasoningEffort : ''
  return { provider: value.provider, model: value.model, ...(reasoningEffort ? { reasoningEffort } : {}) }
}

export function selectionOf(projections) {
  return normalizeSelection(projections?.values?.modelSelection?.next)
}

export function modelEntry(catalog, selection) {
  const group = catalog?.groups?.find(item => item.id === selection?.provider)
  return { group, model: group?.models?.find(item => item.id === selection?.model) }
}

export function flattenModels(catalog) {
  return (catalog?.groups ?? []).flatMap(group => (group.models ?? []).map(model => ({
    id: `${group.id}${model.id}`, provider: group.id, model: model.id,
    label: model.name, group: group.name, entry: model
  })))
}

export function presetLabel(preset, L) {
  const names = { standard: L.presetStandard, code: L.presetCode, minimal: L.presetMinimal, cordis: L.presetCordis }
  const name = preset.trust === 'system' && names[preset.id] ? names[preset.id] : preset.name || preset.id
  return preset.trust === 'user' ? `${name} · ${L.customPreset}` : name
}

export function sameSelection(a, b) {
  return Boolean(a && b && a.provider === b.provider && a.model === b.model && (a.reasoningEffort ?? '') === (b.reasoningEffort ?? ''))
}

export function eventSeq(entry) {
  const value = entry?.seq ?? entry?.event?.seq
  return typeof value === 'number' ? value : null
}

export function mergeEvents(older, live) {
  const seen = new Set(), result = []
  for (const entry of [...older, ...live]) {
    const seq = eventSeq(entry)
    if (seq !== null) { if (seen.has(seq)) continue; seen.add(seq) }
    result.push(entry)
  }
  return result
}

export function oldestSeq(events) {
  const seqs = events.map(eventSeq).filter(seq => seq !== null)
  return seqs.length ? Math.min(...seqs) : null
}

export function draftKey(sessionId) { return sessionId || 'home' }

export function loadDrafts(storage, key = 'dsh-roam-drafts-v1') {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}

export function saveDrafts(storage, drafts, key = 'dsh-roam-drafts-v1') {
  try {
    const compact = Object.fromEntries(Object.entries(drafts).filter(([, draft]) => draft?.text).slice(-20))
    if (Object.keys(compact).length) storage?.setItem(key, JSON.stringify(compact))
    else storage?.removeItem(key)
  } catch { /* Private mode may disable local drafts. */ }
}
