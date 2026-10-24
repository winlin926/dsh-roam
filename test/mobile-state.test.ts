import { describe, expect, it } from 'vitest'
import {
  applyPendingCreatedSessions,
  draftKey,
  flattenModels,
  loadDrafts,
  mergeEvents,
  normalizeSelection,
  oldestSeq,
  relativeTime,
  sameSelection,
  saveDrafts,
  sessionRows,
  sessionTitleOf,
  workspaceForSession,
} from '../lib/mobile/state.js'

describe('pending created sessions', () => {
  const pending = [{ workspaceId: 'w1', sessionId: 's1' }]

  it('reapplies a session the server snapshot has not caught up to without duplicating it', () => {
    const workspaces = [{ workspaceId: 'w1', sessionIds: ['s0'] }]
    const still = applyPendingCreatedSessions(workspaces, pending, [{ sessionIds: ['s0'] }], [])
    expect(workspaces[0]!.sessionIds).toEqual(['s1', 's0'])
    expect(applyPendingCreatedSessions(workspaces, still, [{ sessionIds: ['s0'] }], [])).toEqual(pending)
    expect(workspaces[0]!.sessionIds).toEqual(['s1', 's0'])
  })

  it('drops the pending entry once any workspace lists or archives the session', () => {
    expect(applyPendingCreatedSessions([{ workspaceId: 'w1', sessionIds: [] }], pending, [{ sessionIds: ['s1'] }], [])).toEqual([])
    expect(applyPendingCreatedSessions([{ workspaceId: 'w1', sessionIds: [] }], pending, [{ sessionIds: [] }], ['s1'])).toEqual([])
  })

  it('keeps a pending entry when its workspace is absent or has not supplied a session list', () => {
    expect(applyPendingCreatedSessions([], pending, [], [])).toEqual(pending)
    expect(applyPendingCreatedSessions([{ workspaceId: 'w1' }], pending, [{}], [])).toEqual(pending)
  })
})

describe('session list projection', () => {
  const workspaces = [
    { workspaceId: 'w1', sessionIds: ['s1', 's2'] },
    { workspaceId: 'w2', sessionIds: ['s3'] },
  ]
  const summaries = [
    { sessionId: 's1', updatedAt: 10, projections: { values: { title: 'Alpha' } } },
    { sessionId: 's2', updatedAt: 30, projections: { values: { title: 'Beta' } } },
    { sessionId: 's3', updatedAt: 20, projections: { values: { title: 'Other workspace' } } },
    { sessionId: 's4', updatedAt: 40, projections: { values: { title: 'Archived' } } },
  ]

  it('limits recent sessions to the selected workspace and sorts newest first', () => {
    const rows = sessionRows({ summaries, workspaces, archivedIds: ['s4'], workspaceId: 'w1', archivedView: false })
    expect(rows.map(row => row.session.sessionId)).toEqual(['s2', 's1'])
  })

  it('does not leak title matches from another workspace or the archived list', () => {
    const rows = sessionRows({ summaries, workspaces, archivedIds: [], workspaceId: 'w1', archivedView: false, query: 'workspace' })
    expect(rows).toEqual([])
  })

  it('includes remote full-text hits only when their cached session is in scope', () => {
    const rows = sessionRows({
      summaries: [summaries[0]!], workspaces, archivedIds: [], workspaceId: 'w1', archivedView: false, query: 'needle',
      remoteItems: [{ sessionId: 's1', snippet: 'local hit' }, { sessionId: 's2', snippet: 'other hit' }],
      remoteCache: { s2: summaries[1] },
    })
    expect(rows.map(row => ({ id: row.session.sessionId, snippet: row.snippet }))).toEqual([
      { id: 's2', snippet: 'other hit' },
      { id: 's1', snippet: 'local hit' },
    ])
  })

  it('merges a remote snippet into a local title hit without duplicating the row', () => {
    const rows = sessionRows({
      summaries, workspaces, archivedIds: [], workspaceId: 'w1', archivedView: false, query: 'alpha',
      remoteItems: [{ sessionId: 's1', snippet: 'full-text excerpt' }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ session: { sessionId: 's1' }, snippet: 'full-text excerpt' })
  })

  it('rejects remote search hits cached from another workspace', () => {
    const rows = sessionRows({
      summaries: [summaries[0]!], workspaces, archivedIds: [], workspaceId: 'w1', archivedView: false, query: 'needle',
      remoteItems: [{ sessionId: 's3', snippet: 'must not leak' }],
      remoteCache: { s3: summaries[2] },
    })
    expect(rows).toEqual([])
  })

  it('shows archived rows separately from active workspace rows', () => {
    const rows = sessionRows({ summaries, workspaces, archivedIds: ['s4'], workspaceId: 'w1', archivedView: true })
    expect(rows.map(row => row.session.sessionId)).toEqual(['s4'])
  })

  it('reads only supported title projections and resolves a session workspace by id', () => {
    expect(sessionTitleOf(summaries[0])).toBe('Alpha')
    expect(sessionTitleOf({ title: 'top-level is not a projection' })).toBe('')
    expect(workspaceForSession(workspaces, 's3')?.workspaceId).toBe('w2')
    expect(workspaceForSession(workspaces, 'missing')).toBeUndefined()
  })
})

describe('history and draft state', () => {
  it('deduplicates overlapping history pages by sequence while keeping unsequenced records', () => {
    const older = [{ seq: 1, event: { type: 'a' } }, { seq: 2, event: { type: 'b' } }]
    const live = [{ seq: 2, event: { type: 'replacement' } }, { seq: 3, event: { type: 'c' } }, { event: { type: 'unsequenced' } }]
    const merged = mergeEvents(older, live)

    expect(merged.map(item => item.seq ?? 'none')).toEqual([1, 2, 3, 'none'])
    expect(merged[1]).toBe(older[1])
    expect(oldestSeq(merged)).toBe(1)
    expect(oldestSeq([{ event: {} }])).toBeNull()
  })

  it('stores drafts per session and uses a dedicated home key', () => {
    expect(draftKey('session-1')).toBe('session-1')
    expect(draftKey('')).toBe('home')
    expect(draftKey(undefined)).toBe('home')
  })

  it('round trips non-empty drafts and removes storage once the final draft is cleared', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    saveDrafts(storage, { home: { text: 'keep me' }, s1: { text: '' } })
    expect(loadDrafts(storage)).toEqual({ home: { text: 'keep me' } })
    saveDrafts(storage, { home: { text: '' } })
    expect(values.size).toBe(0)
  })

  it('recovers from corrupt or unavailable local storage without losing the editor state', () => {
    expect(loadDrafts({ getItem: () => '{broken' })).toEqual({})
    expect(loadDrafts({ getItem: () => '[]' })).toEqual({})
    expect(() => saveDrafts({ setItem: () => { throw new Error('denied') } }, { home: { text: 'draft' } })).not.toThrow()
  })
})

describe('model and time state', () => {
  it('normalizes and compares only routable model selections', () => {
    expect(normalizeSelection({ provider: 'p', model: 'm', reasoningEffort: '' })).toEqual({ provider: 'p', model: 'm' })
    expect(normalizeSelection({ provider: '', model: 'm' })).toBeNull()
    expect(sameSelection({ provider: 'p', model: 'm' }, { provider: 'p', model: 'm', reasoningEffort: '' })).toBe(true)
    expect(sameSelection(null, null)).toBe(false)
  })

  it('flattens model groups into stable composite option ids', () => {
    const options = flattenModels({ groups: [{ id: 'provider', name: 'Provider', models: [{ id: 'model', name: 'Model' }] }] })
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ id: 'provider\u001fmodel', provider: 'provider', model: 'model', label: 'Model' })
  })

  it('formats elapsed time without producing negative durations for clock skew', () => {
    const L = { justNow: 'now', minute: 'm', hour: 'h', day: 'd' }
    const now = Date.parse('2026-01-02T00:00:00Z')
    expect(relativeTime(now + 60_000, now, L)).toBe('now')
    expect(relativeTime(now - 60_000, now, L)).toBe('1m')
    expect(relativeTime(now - 2 * 3_600_000, now, L)).toBe('2h')
    expect(relativeTime(now - 3 * 86_400_000, now, L)).toBe('3d')
  })
})
