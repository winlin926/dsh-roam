import { eventSeq } from './state.js'

function imageBlock(block) {
  const attachment = block?.attachment && typeof block.attachment === 'object' ? block.attachment : null
  const mediaType = String(attachment?.mediaType ?? block?.mediaType ?? 'image/jpeg')
  const attachmentId = String(attachment?.attachmentId ?? block?.attachmentId ?? '')
  const inlineData = typeof block?.data === 'string' ? block.data : typeof attachment?.data === 'string' ? attachment.data : ''
  if (!attachmentId && !inlineData) return null
  return {
    kind: 'image', attachmentId, mediaType,
    dataUrl: inlineData ? `data:${mediaType};base64,${inlineData}` : '',
    width: Number(attachment?.width ?? block?.width) || 0,
    height: Number(attachment?.height ?? block?.height) || 0,
    name: String(attachment?.name ?? block?.name ?? '')
  }
}

export function contentBlocks(content) {
  return (Array.isArray(content) ? content : []).flatMap(block => {
    if (block?.type === 'text' && block.text) return [{ kind: 'text', text: block.text }]
    if (block?.type === 'reasoning' && block.text) return [{ kind: 'reasoning', text: block.text }]
    if (block?.type === 'tool-call') return [{ kind: 'tool', id: block.id, name: block.name, args: block.arguments, status: 'running' }]
    if (block?.type === 'image') { const image = imageBlock(block); return image ? [image] : [] }
    if (block?.type === 'file') {
      const attachment = block.attachment && typeof block.attachment === 'object' ? block.attachment : null
      const name = String(attachment?.name ?? block.name ?? '')
      const bytes = Number(attachment?.bytes ?? block.bytes) || 0
      const receiptId = String(block.receiptId ?? '')
      return name || bytes || receiptId ? [{ kind: 'file', name, bytes, receiptId }] : []
    }
    return []
  })
}

export function visibleMessages(events) {
  const messages = [], steps = new Map()
  const ensureStep = (data, seq) => {
    const key = `assistant:${data.turn}:${data.step}`
    if (!steps.has(key)) {
      const message = { id: key, role: 'assistant', blocks: [], streaming: true }
      steps.set(key, message)
      messages.push(message)
    }
    const step = steps.get(key)
    if (seq !== null) step.seq = seq
    return step
  }
  for (const entry of events) {
    const event = entry.event ?? entry
    const data = event.data ?? {}
    const type = String(event.type ?? '').toLowerCase()
    const seq = eventSeq(entry)
    if (type === 'user/message') {
      const message = data.message ?? data
      if (message.source?.kind !== 'user') continue
      const blocks = contentBlocks(message.content).filter(block => ['text', 'image', 'file'].includes(block.kind))
      const rpcId = message.source?.rpcId ?? message.rpcId ?? ''
      if (blocks.length) messages.push({ id: `user:${seq ?? rpcId}`, role: 'user', blocks, rpcId })
      continue
    }
    if (type === 'assistant/chunk') {
      const chunk = data.chunk ?? {}
      if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') continue
      const step = ensureStep(data, seq)
      const kind = chunk.type === 'text-delta' ? 'text' : 'reasoning'
      const streamKey = `${kind}:${chunk.index ?? 0}`
      let block = step.blocks.find(item => item?._streamKey === streamKey)
      if (!block) { block = { kind, text: '', _streamKey: streamKey }; step.blocks.push(block) }
      block.text += chunk.text ?? chunk.delta ?? ''
      continue
    }
    if (type === 'assistant/message') {
      const step = ensureStep(data, seq)
      step.blocks = contentBlocks(data.message?.content)
      step.streaming = false
      continue
    }
    if (type === 'tool/call') {
      const step = ensureStep(data, seq)
      if (!step.blocks.some(block => block?.kind === 'tool' && block.id === data.callId)) step.blocks.push({ kind: 'tool', id: data.callId, name: data.name, args: data.arguments, status: 'running' })
      continue
    }
    if (type === 'tool/result') {
      const step = ensureStep(data, seq)
      const result = (data.message?.content ?? []).find(block => block?.type === 'tool-result')
      const id = result?.toolCallId
      let tool = step.blocks.find(block => block?.kind === 'tool' && block.id === id)
      if (!tool) { tool = { kind: 'tool', id, name: id ?? 'tool', args: '', status: 'running' }; step.blocks.push(tool) }
      tool.status = data.error || result?.isError ? 'error' : 'done'
      tool.result = (result?.content ?? []).filter(block => block?.type === 'text').map(block => block.text).join('\n')
      tool.resultImages = contentBlocks(result?.content).filter(block => block.kind === 'image')
      tool.resultFiles = contentBlocks(result?.content).filter(block => block.kind === 'file')
      step.streaming = false
    }
  }
  return messages.filter(message => message.blocks.some(Boolean))
}

export function isRunning(events, awaitingSince = 0) {
  let running = false, latestStart = 0
  for (const entry of events) {
    const event = entry.event ?? entry, type = String(event.type ?? '').toLowerCase()
    if (type === 'turn/start') { running = true; latestStart = Math.max(latestStart, Number(event.time) || 0) }
    else if (type === 'turn/end') running = false
  }
  return { running: running || (awaitingSince > 0 && latestStart < awaitingSince), started: awaitingSince > 0 && latestStart >= awaitingSince }
}

export function optimisticMessage(prompt) {
  const blocks = []
  if (prompt.text) blocks.push({ kind: 'text', text: prompt.text })
  for (const image of prompt.images ?? []) blocks.push({ kind: 'image', dataUrl: image.dataUrl, width: image.width, height: image.height, name: image.name })
  for (const file of prompt.files ?? []) blocks.push({ kind: 'file', name: file.name, bytes: file.bytes })
  return { id: `optimistic:${prompt.requestId}`, role: 'user', blocks, optimistic: true, rpcId: prompt.requestId }
}

export function reconcileOptimistic(messages, pending) {
  const durable = new Set(messages.filter(message => message.role === 'user').map(message => message.rpcId).filter(Boolean))
  return { messages: [...messages, ...pending.filter(item => !durable.has(item.requestId)).map(optimisticMessage)], pending: pending.filter(item => !durable.has(item.requestId)) }
}

export function queueBlocks(content) {
  return (Array.isArray(content) ? content : []).flatMap(block => {
    if (block?.type === 'text' && typeof block.text === 'string' && block.text) return [{ kind: 'text', text: block.text }]
    if (block?.type === 'image') { const image = imageBlock(block); return image ? [image] : [] }
    if (block?.type === 'file') {
      const attachment = block.attachment && typeof block.attachment === 'object' ? block.attachment : null
      const name = String(attachment?.name ?? block.name ?? ''), bytes = Number(attachment?.bytes ?? block.bytes) || 0, receiptId = String(block.receiptId ?? '')
      return name || receiptId ? [{ kind: 'file', name, bytes, receiptId }] : []
    }
    return []
  })
}

export function queueSummary(blocks, L) {
  const parts = [blocks.filter(block => block.kind === 'text').map(block => block.text).join(' ').replace(/\s+/g, ' ').trim()]
  const images = blocks.filter(block => block.kind === 'image').length
  if (images) parts.push(L.queueImage(images))
  parts.push(...blocks.filter(block => block.kind === 'file').map(block => block.name || L.queueFile))
  return parts.filter(Boolean).join(' · ') || L.queueEmptyMessage
}

export function queueSignature(blocks) {
  return blocks.map(block => block.kind === 'text' ? `text:${block.text}` : block.kind === 'image' ? `image:${block.name || block.attachmentId || ''}` : `file:${block.name || block.receiptId || ''}`).join('')
}
