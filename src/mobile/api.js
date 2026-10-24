export class RpcError extends Error {
  constructor(message, options = {}) { super(message); Object.assign(this, options) }
}

export async function rpc(method, payload = {}) {
  let response
  try {
    response = await fetch('/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, payload }) })
  } catch { throw new RpcError('', { disconnected: true }) }
  if (response.status === 401) throw new RpcError('', { disconnected: true, status: 401 })
  let body
  try { body = await response.json() } catch { throw new RpcError('Request failed', { status: response.status }) }
  if (!response.ok || !body.ok) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message ?? 'Request failed'
    throw new RpcError(message, { code: body.code, details: body.details, status: response.status })
  }
  return body.value
}

export function errorText(error, L) {
  if (error?.disconnected) return L.connectionLost
  if (error?.details?.reason === 'MODEL_DOES_NOT_SUPPORT_IMAGES') return L.imageModelUnsupported
  const map = {
    'invalid-content': L.imageInvalidContent, 'text-too-large': L.imageTextTooLarge,
    'unsupported-image': L.imageFormat, 'image-unsupported': L.imageFormat,
    'image-too-large': L.imageTooLarge, 'payload-too-large': L.attachmentTooLarge,
    'request-too-large': L.attachmentTooLarge, 'too-many-images': L.attachmentLimit,
    'too-many-files': L.attachmentLimit, 'invalid-image-data': L.imageCorrupt,
    'invalid-file-data': L.fileCorrupt, 'invalid-file-name': L.fileInvalidName,
    'model-without-image': L.imageModelUnsupported, 'harness-unavailable': L.harnessUnavailable
  }
  if (map[error?.code]) return map[error.code]
  const message = String(error?.message ?? error ?? L.failed)
  if (/model/i.test(message) && /image/i.test(message)) return L.imageModelUnsupported
  if (/too large/i.test(message) && /body|payload/i.test(message)) return L.attachmentTooLarge
  return message
}

export function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < 16; index++) bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = bytes[6] & 15 | 64
  bytes[8] = bytes[8] & 63 | 128
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
