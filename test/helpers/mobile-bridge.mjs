import { request as httpRequest } from 'node:http'
import { LanMobileBridge } from '../../lib/bridge/lan-mobile-bridge.js'

/** Start an ephemeral real bridge and approve one phone through its one-time token. */
export async function startPairedBridge(options = {}) {
  const bridge = new LanMobileBridge({
    harnessUrl: () => options.harnessUrl ?? 'http://127.0.0.1:9',
    publicUrl: options.publicUrl ? () => options.publicUrl : undefined,
    pairingPinStore: options.pairingPinStore,
    brandLogoPaths: options.brandLogoPaths,
    port: 0,
  })
  try {
    const snapshot = await bridge.start()
    if (!snapshot.port || !snapshot.pairingUrl) throw new Error('Bridge did not publish a pairing endpoint')
    const pairingUrl = new URL(snapshot.pairingUrl)
    const origin = `http://127.0.0.1:${snapshot.port}`
    pairingUrl.protocol = 'http:'
    pairingUrl.host = `127.0.0.1:${snapshot.port}`
    const paired = await fetch(pairingUrl, { redirect: 'manual' })
    if (paired.status !== 302) throw new Error(`Pairing failed with HTTP ${paired.status}`)
    const cookie = paired.headers.get('set-cookie')?.split(';', 1)[0]
    if (!cookie) throw new Error('Pairing did not issue a mobile session cookie')
    return {
      bridge,
      origin,
      cookie,
      async stop() { await bridge.stop() },
    }
  } catch (error) {
    await bridge.stop()
    throw error
  }
}

/** A raw request preserves encoded traversal paths and exposes HEAD bodies. */
export function rawRequest(origin, options) {
  const url = new URL(origin)
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: url.hostname,
      port: Number(url.port),
      path: options.path,
      method: options.method ?? 'GET',
      headers: options.headers,
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.once('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }))
    })
    request.once('error', reject)
    request.setTimeout(5_000, () => request.destroy(new Error('HTTP test request timed out')))
    if (options.body !== undefined) request.write(options.body)
    request.end()
  })
}
