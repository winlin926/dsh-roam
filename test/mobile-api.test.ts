import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorText, requestId, rpc, RpcError } from '../lib/mobile/api.js'

afterEach(() => vi.unstubAllGlobals())

describe('mobile RPC transport', () => {
  it('sends the method and payload as JSON and returns only the result value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, value: { answer: 42 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(rpc('session.test', { id: 'a' })).resolves.toEqual({ answer: 42 })
    expect(fetchMock).toHaveBeenCalledWith('/api/rpc', expect.objectContaining({ method: 'POST' }))
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ method: 'session.test', payload: { id: 'a' } })
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
  })

  it('preserves a structured bridge error for localized UI handling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false, code: 'payload-too-large', error: 'too big', details: { reason: 'limit' },
    }), { status: 413, headers: { 'content-type': 'application/json' } })))

    const error = await rpc('session.prompt').catch(value => value)
    expect(error).toBeInstanceOf(RpcError)
    expect(error).toMatchObject({ message: 'too big', code: 'payload-too-large', status: 413, details: { reason: 'limit' } })
  })

  it('marks network and authorization failures as disconnected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(rpc('session.list')).rejects.toMatchObject({ disconnected: true })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    await expect(rpc('session.list')).rejects.toMatchObject({ disconnected: true, status: 401 })
  })

  it('does not accept a non-JSON success response as a valid empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy error</html>', { status: 200 })))
    await expect(rpc('session.list')).rejects.toMatchObject({ message: 'Request failed', status: 200 })
  })
})

describe('mobile API errors and request ids', () => {
  it('maps machine errors to localized actionable text', () => {
    const L = {
      connectionLost: 'offline', imageModelUnsupported: 'no images', imageInvalidContent: 'invalid',
      imageTextTooLarge: 'text large', imageFormat: 'format', imageTooLarge: 'image large',
      attachmentTooLarge: 'attachments large', attachmentLimit: 'too many', imageCorrupt: 'corrupt',
      fileCorrupt: 'file corrupt', fileInvalidName: 'bad name', harnessUnavailable: 'unavailable', failed: 'failed',
    }
    expect(errorText({ disconnected: true }, L)).toBe('offline')
    expect(errorText({ code: 'payload-too-large' }, L)).toBe('attachments large')
    expect(errorText({ details: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' } }, L)).toBe('no images')
    expect(errorText(new Error('model does not support image'), L)).toBe('no images')
    expect(errorText(new Error('other'), L)).toBe('other')
  })

  it('creates unique RFC-shaped ids so equal prompts remain independently reconcilable', () => {
    const ids = new Set(Array.from({ length: 100 }, () => requestId()))
    expect(ids.size).toBe(100)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
