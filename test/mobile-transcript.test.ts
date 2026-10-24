import { describe, expect, it } from 'vitest'
import {
  contentBlocks,
  isRunning,
  optimisticMessage,
  queueBlocks,
  queueSignature,
  queueSummary,
  reconcileOptimistic,
  visibleMessages,
} from '../lib/mobile/transcript.js'

function event(seq: number, type: string, data: Record<string, unknown> = {}, time?: number) {
  return { seq, event: { type, data, ...(time === undefined ? {} : { time }) } }
}

describe('mobile transcript projection', () => {
  it('joins streamed deltas by turn, step, channel and chunk index', () => {
    const messages = visibleMessages([
      event(1, 'assistant/chunk', { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Hello ' } }),
      event(2, 'assistant/chunk', { turn: 2, step: 1, chunk: { type: 'reasoning-delta', index: 0, delta: 'Think' } }),
      event(3, 'assistant/chunk', { turn: 2, step: 1, chunk: { type: 'text-delta', index: 1, text: 'second' } }),
      event(4, 'assistant/chunk', { turn: 2, step: 1, chunk: { type: 'text-delta', index: 0, text: 'world' } }),
    ])

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ id: 'assistant:2:1', role: 'assistant', streaming: true })
    expect(messages[0]!.blocks).toEqual([
      { kind: 'text', text: 'Hello world', _streamKey: 'text:0' },
      { kind: 'reasoning', text: 'Think', _streamKey: 'reasoning:0' },
      { kind: 'text', text: 'second', _streamKey: 'text:1' },
    ])
  })

  it('replaces streaming blocks with the complete assistant message and keeps stable ids', () => {
    const streaming = visibleMessages([
      event(8, 'assistant/chunk', { turn: 4, step: 0, chunk: { type: 'text-delta', text: 'partial' } }),
    ])
    const completed = visibleMessages([
      event(8, 'assistant/chunk', { turn: 4, step: 0, chunk: { type: 'text-delta', text: 'partial' } }),
      event(9, 'assistant/message', { turn: 4, step: 0, message: { content: [
        { type: 'text', text: 'complete' },
        { type: 'reasoning', text: 'why' },
      ] } }),
    ])

    expect(completed).toHaveLength(1)
    expect(completed[0]!.id).toBe(streaming[0]!.id)
    expect(completed[0]!.streaming).toBe(false)
    expect(completed[0]!.blocks).toEqual([
      { kind: 'text', text: 'complete' },
      { kind: 'reasoning', text: 'why' },
    ])
  })

  it('ignores non-user events and empty content while preserving attachments and file receipts', () => {
    const messages = visibleMessages([
      event(1, 'user/message', { message: { source: { kind: 'agent' }, content: [{ type: 'text', text: 'hidden' }] } }),
      event(2, 'user/message', { message: { source: { kind: 'user', rpcId: 'rpc-1' }, content: [
        { type: 'text', text: 'look' },
        { type: 'image', attachment: { attachmentId: 'a/1', mediaType: 'image/png', width: 640, height: 480, name: 'photo.png' } },
        { type: 'file', receiptId: 'receipt-1', name: 'notes.txt', bytes: 12 },
        { type: 'reasoning', text: 'not a user-visible reasoning block' },
      ] } }),
      event(3, 'user/message', { message: { source: { kind: 'user' }, content: [] } }),
    ])

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ id: 'user:2', role: 'user', rpcId: 'rpc-1' })
    expect(messages[0]!.blocks).toEqual([
      { kind: 'text', text: 'look' },
      { kind: 'image', attachmentId: 'a/1', mediaType: 'image/png', dataUrl: '', width: 640, height: 480, name: 'photo.png' },
      { kind: 'file', name: 'notes.txt', bytes: 12, receiptId: 'receipt-1' },
    ])
  })

  it('updates one tool call instead of duplicating it and exposes result media', () => {
    const messages = visibleMessages([
      event(1, 'tool/call', { turn: 1, step: 3, callId: 'call-1', name: 'read', arguments: '{"path":"a"}' }),
      event(2, 'tool/call', { turn: 1, step: 3, callId: 'call-1', name: 'read', arguments: '{"path":"a"}' }),
      event(3, 'tool/result', { turn: 1, step: 3, message: { content: [{ type: 'tool-result', toolCallId: 'call-1', content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
        { type: 'image', data: 'aGVsbG8=', mediaType: 'image/png' },
        { type: 'file', name: 'result.txt', bytes: 5 },
      ] }] } }),
    ])

    const tools = messages[0]!.blocks.filter(block => block.kind === 'tool')
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({ id: 'call-1', status: 'done', result: 'first\nsecond' })
    expect(tools[0]!.resultImages).toHaveLength(1)
    expect(tools[0]!.resultFiles).toEqual([{ kind: 'file', name: 'result.txt', bytes: 5, receiptId: '' }])
    expect(messages[0]!.streaming).toBe(false)
  })

  it('marks a failed tool result as an error even when no error text is returned', () => {
    const messages = visibleMessages([
      event(1, 'tool/result', { turn: 1, step: 1, message: { content: [{
        type: 'tool-result', toolCallId: 'call-x', isError: true, content: [],
      }] } }),
    ])
    expect(messages[0]!.blocks[0]).toMatchObject({ id: 'call-x', status: 'error' })
  })

  it('drops empty unsupported content instead of allocating image nodes with no source', () => {
    expect(contentBlocks([
      null,
      { type: 'image' },
      { type: 'file' },
      { type: 'unknown', text: 'ignored' },
      { type: 'text', text: '' },
    ])).toEqual([])
  })
})

describe('optimistic transcript reconciliation', () => {
  const pending = [
    { requestId: 'request-a', text: 'same words' },
    { requestId: 'request-b', text: 'same words' },
  ]

  it('does not collapse equal text with different request ids', () => {
    const result = reconcileOptimistic([], pending)

    expect(result.pending).toEqual(pending)
    expect(result.messages.map(message => message.id)).toEqual(['optimistic:request-a', 'optimistic:request-b'])
  })

  it('retires only the optimistic prompt acknowledged by the durable rpc id', () => {
    const durable = [{ id: 'user:10', role: 'user', rpcId: 'request-a', blocks: [{ kind: 'text', text: 'same words' }] }]
    const result = reconcileOptimistic(durable, pending)

    expect(result.pending).toEqual([pending[1]])
    expect(result.messages).toHaveLength(2)
    expect(result.messages[1]).toMatchObject({ id: 'optimistic:request-b', optimistic: true })
  })

  it('carries optimistic image and file content through reconciliation', () => {
    const message = optimisticMessage({
      requestId: 'request-c', text: 'caption',
      images: [{ dataUrl: 'data:image/png;base64,AA==', width: 2, height: 3, name: 'a.png' }],
      files: [{ name: 'a.txt', bytes: 2 }],
    })
    expect(message.blocks.map(block => block.kind)).toEqual(['text', 'image', 'file'])
    expect(message.rpcId).toBe('request-c')
  })
})

describe('turn and queue state', () => {
  it('tracks a turn ending and clears optimistic waiting after its turn starts', () => {
    expect(isRunning([event(1, 'turn/start', {}, 100)], 50)).toEqual({ running: true, started: true })
    expect(isRunning([event(1, 'turn/start', {}, 100), event(2, 'turn/end', {}, 110)], 50)).toEqual({ running: false, started: true })
    expect(isRunning([], 100)).toEqual({ running: true, started: false })
  })

  it('summarizes mixed queue content and changes signature when real content changes', () => {
    const blocks = queueBlocks([
      { type: 'text', text: '  edit\nthis  ' },
      { type: 'image', attachmentId: 'image-1', name: 'one.png' },
      { type: 'file', receiptId: 'receipt-1', name: 'one.txt' },
    ])
    const L = { queueImage: (count: number) => `${count} images`, queueFile: 'file', queueEmptyMessage: 'empty' }

    expect(queueSummary(blocks, L)).toBe('edit this · 1 images · one.txt')
    expect(queueSummary([], L)).toBe('empty')
    expect(queueSignature(blocks)).not.toBe(queueSignature(queueBlocks([{ type: 'text', text: 'different' }])))
  })
})
