import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { probePublicUrl } from '../lib/index.js'

async function withServer(status, run) {
  const server = createServer((request, response) => {
    response.writeHead(status, { 'content-type': 'text/plain' })
    response.end('probe')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    return await run('http://127.0.0.1:' + port + '/')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

describe('public URL probe', () => {
  it('treats the pairing gate (401) as reachable', async () => {
    const result = await withServer(401, (url) => probePublicUrl(url))
    expect(result.reachable).toBe(true)
    expect(result.status).toBe(401)
    expect(result.error).toBeNull()
  })

  it('treats a 200 answer as reachable', async () => {
    const result = await withServer(200, (url) => probePublicUrl(url))
    expect(result.reachable).toBe(true)
    expect(result.status).toBe(200)
  })

  it('reports a 5xx tunnel-down page as unreachable', async () => {
    const result = await withServer(502, (url) => probePublicUrl(url))
    expect(result.reachable).toBe(false)
    expect(result.status).toBe(502)
    expect(result.error).toBe('HTTP 502')
  })

  it('reports a closed port as unreachable without a status', async () => {
    const server = createServer()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    await new Promise((resolve) => server.close(resolve))
    const result = await probePublicUrl('http://127.0.0.1:' + port + '/')
    expect(result.reachable).toBe(false)
    expect(result.status).toBeNull()
    expect(typeof result.error).toBe('string')
  })
})
