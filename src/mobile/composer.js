import { errorText, requestId } from './api.js'

export const MAX_ATTACHMENTS = 6
const MAX_BYTES = 20 * 1024 * 1024
const SKIP_COMPRESS_BYTES = 600 * 1024
const MAX_IMAGE_EDGE = 1568
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function attachmentError(code) { return Object.assign(new Error(code), { code }) }
function cleanName(name, fallback) { return String(name || '').split('/').join('-').split('\\').join('-').trim().slice(0, 200) || fallback }
function readDataUrl(file, code) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(attachmentError(code))
    reader.readAsDataURL(file)
  })
}
function base64(dataUrl) { const index = dataUrl.indexOf(','); if (index < 0) throw attachmentError('invalid-image-data'); return dataUrl.slice(index + 1) }
function imageType(file) { const type = String(file?.type ?? '').toLowerCase(); return IMAGE_TYPES.includes(type) ? type : '' }
function decodeElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image()
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) })
    image.onerror = () => { URL.revokeObjectURL(url); reject(attachmentError('invalid-image-data')) }
    image.src = url
  })
}
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { const bitmap = await createImageBitmap(file); return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() } } catch { /* Older engines fall back to an image element. */ }
  }
  return decodeElement(file)
}

export class AttachmentManager {
  constructor({ L, onChange }) {
    this.L = L
    this.onChange = onChange
    this.drafts = new Map()
    this.queue = Promise.resolve()
  }
  list(owner) { return this.drafts.get(owner) ?? [] }
  replace(owner, items) { this.drafts.set(owner, items); this.active(owner) }
  active(owner) { this.owner = owner; this.onChange() }
  preparing(owner) { return this.list(owner).some(item => ['compressing', 'reading'].includes(item.state)) }
  ready(owner) { return this.list(owner).filter(item => item.state === 'ready') }

  async add(owner, fileList, kind) {
    const existing = this.list(owner)
    const available = MAX_ATTACHMENTS - existing.length
    if (available <= 0) throw attachmentError('attachment-limit')
    const files = [...fileList].slice(0, available)
    const items = files.map(file => ({ id: requestId(), owner, file, kind, name: cleanName(file.name, kind === 'image' ? 'image' : 'file'), state: kind === 'image' ? 'compressing' : 'reading', bytes: file.size }))
    this.drafts.set(owner, [...existing, ...items])
    this.onChange()
    for (const item of items) this.queue = this.queue.then(() => this.prepare(owner, item))
    await this.queue
  }

  async prepare(owner, item) {
    try {
      if (item.file.size > MAX_BYTES) throw attachmentError('file-too-large')
      if (item.kind === 'file') {
        const dataUrl = await readDataUrl(item.file, 'invalid-file-data')
        Object.assign(item, { dataUrl, base64: base64(dataUrl), state: 'ready' })
      } else {
        const mediaType = imageType(item.file)
        if (!mediaType) throw attachmentError('unsupported-image')
        const prepared = await this.prepareImage(item.file, mediaType, item.name)
        Object.assign(item, prepared)
      }
    } catch (error) {
      item.state = 'failed'
      item.error = errorText(error, this.L)
    }
    this.onChange()
  }

  async prepareImage(file, mediaType, name) {
    if (mediaType === 'image/gif') {
      const dataUrl = await readDataUrl(file, 'invalid-image-data')
      return { dataUrl, base64: base64(dataUrl), mediaType, state: 'ready', name }
    }
    const decoded = await decode(file)
    try {
      if (!decoded.width || !decoded.height) throw attachmentError('invalid-image-data')
      if (file.size <= SKIP_COMPRESS_BYTES && Math.max(decoded.width, decoded.height) <= MAX_IMAGE_EDGE) {
        const dataUrl = await readDataUrl(file, 'invalid-image-data')
        return { dataUrl, base64: base64(dataUrl), mediaType, state: 'ready', name, width: decoded.width, height: decoded.height }
      }
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(decoded.width, decoded.height))
      const width = Math.max(1, Math.round(decoded.width * scale)), height = Math.max(1, Math.round(decoded.height * scale))
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      try {
        const context = canvas.getContext('2d')
        if (!context) throw attachmentError('invalid-image-data')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(decoded.source, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', .85)
        return { dataUrl, base64: base64(dataUrl), mediaType: 'image/jpeg', state: 'ready', name: `${name.replace(/\.[^.]+$/, '')}.jpg`, width, height }
      } finally { canvas.width = 0; canvas.height = 0 }
    } finally { decoded.release() }
  }

  remove(owner, id) {
    this.drafts.set(owner, this.list(owner).filter(item => item.id !== id))
    this.onChange()
  }

  async retry(owner, id) {
    const item = this.list(owner).find(candidate => candidate.id === id)
    if (!item || item.state !== 'failed') return
    item.state = item.kind === 'file' ? 'reading' : 'compressing'
    item.error = ''
    this.onChange()
    this.queue = this.queue.then(() => this.prepare(owner, item))
    await this.queue
  }

  render(owner, elements) {
    for (const [scope, element] of Object.entries(elements)) {
      const items = this.list(owner)
      const visible = scope === 'home' ? owner === 'home' : owner !== 'home'
      element.hidden = !visible || !items.length
      element.replaceChildren()
      if (!visible) continue
      for (const item of items) {
        const node = document.createElement('div')
        node.className = `attachment-item${item.kind === 'file' ? ' attachment-file' : ''}`
        node.dataset.state = item.state
        if (item.kind === 'image' && item.dataUrl) {
          const image = document.createElement('img'); image.src = item.dataUrl; image.alt = item.name
          node.append(image)
        } else if (item.kind === 'file') {
          const copy = document.createElement('span'); copy.className = 'attachment-file-copy'
          const name = document.createElement('strong'); name.textContent = item.name
          const meta = document.createElement('span'); meta.textContent = item.error || item.state
          copy.append(name, meta); node.append(copy)
        }
        if (item.state === 'failed') {
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'attachment-retry'; retry.dataset.retryAttachment = item.id; retry.textContent = this.L.attachmentRetry; node.append(retry)
        } else {
          const state = document.createElement('span'); state.className = 'attachment-state'; state.textContent = this.stateLabel(item); node.append(state)
        }
        if (!['uploading', 'sending'].includes(item.state)) {
          const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'attachment-remove'; remove.dataset.removeAttachment = item.id; remove.setAttribute('aria-label', this.L.attachmentRemove); remove.textContent = '×'; node.append(remove)
        }
        element.append(node)
      }
    }
  }

  stateLabel(item) {
    const labels = { reading: this.L.fileReading, uploading: this.L.fileUploading, compressing: this.L.imageCompressing, ready: this.L.attachmentReady, sending: this.L.attachmentSending, failed: this.L.attachmentFailed }
    return labels[item.state] ?? item.state
  }
}
