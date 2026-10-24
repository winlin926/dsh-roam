export class SessionStream {
  constructor({ sessionId, onSnapshot, onEvent, onStatus }) {
    this.sessionId = sessionId
    this.onSnapshot = onSnapshot
    this.onEvent = onEvent
    this.onStatus = onStatus
    this.source = null
    this.connected = false
  }
  open() {
    this.close()
    const source = new EventSource(`/api/session/stream?sessionId=${encodeURIComponent(this.sessionId)}`)
    this.source = source
    source.addEventListener('snapshot', event => {
      try { this.onSnapshot(JSON.parse(event.data)) } catch { this.onStatus(false) }
    })
    source.addEventListener('event', event => {
      try { this.onEvent(JSON.parse(event.data)) } catch { this.onStatus(false) }
    })
    source.onerror = () => { this.connected = false; this.onStatus(false) }
  }
  close() { this.source?.close(); this.source = null; this.connected = false }
}

export function nextPollDelay({ streamConnected, running, pendingInteraction, idleMs }) {
  if (streamConnected) return 5000
  if (running || pendingInteraction) return 250
  return Math.min(Math.round(idleMs * 1.5), 5000)
}
