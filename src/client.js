window.__ModuleLoader__.load({
  id: 'dsh-roam',
  factory(require) {
    const { createElement: h, useEffect, useState } = require('react')

    const STYLE_ID = 'dsh-roam/settings.css'
    const CSS = [
      '.dshp_root{--dshp-accent:#4f7cff;--dshp-accent-soft:rgba(79,124,255,.10);--dshp-danger:#e5484d;--dshp-success:#15803d;display:flex;flex-direction:column;gap:16px;width:100%;max-width:860px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
      '@supports (color: color-mix(in srgb, red, blue)){.dshp_root{--dshp-accent-soft:color-mix(in srgb, #4f7cff 12%, transparent);--dshp-success:color-mix(in srgb, var(--dsw-alias-label-primary) 30%, #16a34a)}}',
      '.dshp_card{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;min-width:0;padding:18px 20px;border:1px solid color-mix(in srgb, #4f7cff 14%, var(--dsw-alias-settings-card-stroke));border-radius:14px;background:color-mix(in srgb, #4f7cff 4%, var(--dsw-alias-settings-card-fill));box-shadow:0 1px 2px rgba(16,24,40,.035)}',
      '.dshp_qrCard{border-color:color-mix(in srgb, var(--dshp-accent) 32%, var(--dsw-alias-settings-card-stroke))}',
      '.dshp_hero{background:linear-gradient(180deg,rgba(79,124,255,.10),color-mix(in srgb, #4f7cff 4%, var(--dsw-alias-settings-card-fill)) 72%)}',
      '.dshp_cardHead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}',
      '.dshp_cardTitle{margin:0;font-size:14px;line-height:20px;font-weight:650;letter-spacing:.01em;color:var(--dsw-alias-label-primary)}',
      '.dshp_tag{padding:2px 9px;border-radius:999px;background:var(--dshp-accent-soft);color:var(--dshp-accent);font-size:11px;line-height:17px;font-weight:600;white-space:nowrap}',
      '.dshp_tagMuted{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);color:var(--dsw-alias-label-secondary)}',
      '.dshp_headerRow{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px}',
      '.dshp_titleBlock{min-width:0}',
      '.dshp_title{margin:0;font-size:18px;line-height:26px;font-weight:650;letter-spacing:-.01em}',
      '.dshp_subtitle{margin:5px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dshp_cardTitleRow{display:flex;align-items:center;gap:6px;min-width:0}',
      '.dshp_labelRow{display:flex;align-items:center;gap:6px;min-width:0}',
      '.dshp_help{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:16px;height:16px;border:1px solid color-mix(in srgb, #4f7cff 28%, var(--dsw-alias-settings-card-stroke));border-radius:50%;background:color-mix(in srgb, #4f7cff 8%, var(--dsw-alias-settings-card-fill));color:var(--dshp-accent);font-size:11px;line-height:1;font-weight:600;cursor:help;user-select:none}',
      '.dshp_help:hover,.dshp_help:focus-visible{border-color:var(--dshp-accent);background:var(--dshp-accent-soft);outline:none}',
      '.dshp_helpBubble{position:fixed;z-index:2147483000;box-sizing:border-box;max-width:320px;padding:9px 12px;border:1px solid color-mix(in srgb, #4f7cff 25%, var(--dsw-alias-settings-card-stroke, #d6deee));border-radius:10px;background:color-mix(in srgb, #4f7cff 8%, var(--dsw-alias-settings-card-fill, #ffffff));color:var(--dsw-alias-label-primary, #1f2430);font-size:12.5px;line-height:19px;font-weight:400;white-space:pre-line;text-align:left;box-shadow:0 12px 30px rgba(79,124,255,.18),0 2px 6px rgba(15,23,42,.08);pointer-events:none}',
      '.dshp_badges{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
      '.dshp_pill{display:inline-flex;align-items:center;gap:7px;padding:3px 11px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:999px;background:var(--dsw-alias-settings-card-fill);font-size:12px;line-height:18px;white-space:nowrap}',
      '.dshp_dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary)}',
      '.dshp_pillConnected .dshp_dot{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18)}',
      '.dshp_pillConnected{color:var(--dshp-success);border-color:color-mix(in srgb, #16a34a 40%, var(--dsw-alias-settings-card-stroke));background:color-mix(in srgb, #16a34a 8%, var(--dsw-alias-settings-card-fill))}',
      '.dshp_qrLayout{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}',
      '.dshp_qr{box-sizing:border-box;flex:0 0 224px;display:flex;align-items:center;justify-content:center;width:224px;height:224px;padding:12px;overflow:hidden;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:14px;background:#fff;box-shadow:inset 0 0 0 1px rgba(15,23,42,.02)}',
      '.dshp_qr svg{display:block;width:200px;height:200px}',
      '.dshp_qrPlaceholder{font-size:12px;line-height:18px;color:#6b7280}',
      '.dshp_qrDetails{display:flex;flex:1 1 300px;flex-direction:column;gap:14px;min-width:0}',
      '.dshp_field{display:flex;flex-direction:column;gap:7px;min-width:0}',
      '.dshp_label{font-size:11px;line-height:16px;font-weight:600;letter-spacing:.08em;color:var(--dsw-alias-label-secondary)}',
      '.dshp_valueRow{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dshp_addr{box-sizing:border-box;flex:1;min-width:0;margin:0;padding:8px 11px;overflow-wrap:anywhere;border:1px solid color-mix(in srgb, #4f7cff 16%, var(--dsw-alias-settings-card-stroke));border-radius:9px;background:color-mix(in srgb, #4f7cff 6%, var(--dsw-alias-settings-card-fill));font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dshp_pin{margin:0;font:30px/1.15 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;letter-spacing:.14em}',
      '.dshp_note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dshp_error{margin:0;font-size:12px;line-height:18px;color:var(--dshp-danger)}',
      '.dshp_success{color:var(--dshp-success)}',
      '.dshp_notice{margin:0;font-size:12px;line-height:18px;font-weight:600;color:var(--dshp-success)}',
      '.dshp_danger{color:var(--dshp-danger)}',
      '.dshp_warn{margin:0;padding:8px 10px;border-left:3px solid var(--dshp-danger);border-radius:8px;background:rgba(229,72,77,.08);font-size:12px;line-height:18px}',
      '.dshp_button{box-sizing:border-box;height:34px;padding:0 14px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:9px;background:var(--dsw-alias-settings-card-fill);color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;white-space:nowrap;cursor:pointer;transition:border-color .15s ease,background .15s ease,color .15s ease}',
      '.dshp_button:hover:not(:disabled){border-color:var(--dshp-accent);background:var(--dshp-accent-soft)}',
      '.dshp_button:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:1px}',
      '.dshp_button:disabled{opacity:.5;cursor:not-allowed}',
      '.dshp_primary{border-color:var(--dshp-accent);background:var(--dshp-accent);color:#fff;font-weight:600}',
      '.dshp_primary:hover:not(:disabled){background:var(--dshp-accent);filter:brightness(.95)}',
      '.dshp_copy{height:30px;padding:0 10px;font-size:12px}',
      '.dshp_button.dshp_success{color:var(--dshp-success);border-color:color-mix(in srgb, #16a34a 45%, var(--dsw-alias-settings-card-stroke))}',
      '.dshp_actions{display:flex;flex-wrap:wrap;gap:8px}',
      '.dshp_formRow{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
      '.dshp_input{box-sizing:border-box;flex:1 1 240px;min-width:0;height:36px;padding:0 11px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:9px;background:var(--dsw-alias-settings-card-fill);color:var(--dsw-alias-label-primary);font:13px/20px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dshp_input:focus-visible{outline:none;border-color:var(--dshp-accent);box-shadow:0 0 0 3px var(--dshp-accent-soft)}',
      '.dshp_input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dshp_connectedText{font-size:13px;line-height:20px;font-weight:600;color:var(--dshp-success)}',
      '.dshp_statusRow{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}',
      '.dshp_checkState{font-size:12px;line-height:18px;font-weight:600}',
      '.dshp_list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}',
      '.dshp_listItem{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dshp_deviceItem{align-items:flex-start;justify-content:space-between;padding:10px 12px;border:1px solid color-mix(in srgb, #4f7cff 12%, var(--dsw-alias-settings-card-stroke));border-radius:10px;background:color-mix(in srgb, #4f7cff 3%, var(--dsw-alias-settings-card-fill))}',
      '.dshp_deviceMain{display:flex;flex:1;flex-direction:column;gap:3px;min-width:0}',
      '.dshp_deviceName{overflow-wrap:anywhere;font-weight:600}',
      '.dshp_deviceDot{display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;background:#9aa4b2;vertical-align:middle}',
      '.dshp_deviceDotOnline{background:#22c55e}',
      '.dshp_detailsCard{padding:0}',
      '.dshp_details{padding:0}',
      '.dshp_detailsSummary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:16px 20px;font-size:14px;line-height:20px;font-weight:600;cursor:pointer;list-style:none}',
      '.dshp_detailsSummary::after{content:"▾";font-size:12px;color:var(--dsw-alias-label-secondary);transition:transform .15s ease}',
      '.dshp_details[open] .dshp_detailsSummary::after{transform:rotate(180deg)}',
      '.dshp_detailsSummary::-webkit-details-marker{display:none}',
      '.dshp_detailsBody{display:flex;flex-direction:column;gap:12px;padding:0 20px 18px}',
      '.dshp_diagRow{display:grid;grid-template-columns:132px minmax(0,1fr);gap:4px 12px;align-items:center}',
      '.dshp_diagLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dshp_diagValue{margin:0;overflow-wrap:anywhere;font:12px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dshp_link{font-size:13px;line-height:20px;color:var(--dshp-accent);font-weight:500;text-decoration:none;text-underline-offset:2px}',
      '.dshp_link:hover{text-decoration:underline}',
      '.dshp_skeleton{min-height:96px;justify-content:center}',
      '.dshp_skeletonLine{width:44%;height:12px;border-radius:6px;background:var(--dsw-alias-settings-card-stroke);opacity:.55}',
      '@media (max-width:640px){.dshp_qrLayout{justify-content:center}.dshp_qrDetails{width:100%;flex-basis:100%}.dshp_valueRow{align-items:stretch}.dshp_valueRow .dshp_button{height:auto}}',
    ].join('\n')
    if (typeof document !== 'undefined') {
      const legacyStyle = document.querySelector('style[data-plugin-css="dsh-phone-bridge/settings.css"]')
      if (legacyStyle) legacyStyle.remove()
      let tag = document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]')
      if (tag === null) {
        tag = document.createElement('style')
        tag.dataset.pluginCss = STYLE_ID
        document.head.appendChild(tag)
      }
      tag.textContent = CSS
    }

    const STATE_URL = '/phone-bridge/state'
    const SETTINGS_URL = '/phone-bridge/settings'
    const PUBLIC_URL_TEST_URL = '/phone-bridge/public-url/test'
    const TUNNEL_URL = '/phone-bridge/tunnel'
    const TUNNEL_FALLBACK_URL = '/phone-bridge/tunnel/fallback'
    const DISCONNECT_URL = '/phone-bridge/disconnect'
    const PIN_URL = '/phone-bridge/pin'
    const ROTATE_URL = '/phone-bridge/pairing/rotate'
    const DEVICE_REMOVE_URL = '/phone-bridge/devices/remove'
    const CERTIFICATE_URL = '/phone-bridge/certificate'
    const POLL_MS = 2000
    const NOTICE_MS = 4000
    const noticeTimers = new Map()

    function hideHelpBubble() {
      if (typeof document === 'undefined') return
      const host = document.getElementById('dshp-help-bubble')
      if (host) host.style.display = 'none'
    }

    function showHelpBubble(event, text) {
      if (typeof document === 'undefined' || typeof window === 'undefined') return
      const target = event && event.currentTarget
      if (!target || typeof target.getBoundingClientRect !== 'function') return
      let host = document.getElementById('dshp-help-bubble')
      if (!host) {
        host = document.createElement('div')
        host.id = 'dshp-help-bubble'
        host.className = 'dshp_helpBubble'
        host.setAttribute('role', 'tooltip')
        document.body.appendChild(host)
      }
      host.textContent = text
      host.style.display = 'block'
      host.style.visibility = 'hidden'
      host.style.left = '0px'
      host.style.top = '0px'
      host.style.width = 'auto'
      const width = Math.max(180, Math.min(320, window.innerWidth - 24))
      host.style.width = width + 'px'
      const height = host.getBoundingClientRect().height
      const rect = target.getBoundingClientRect()
      const gap = 8
      const fitsRight = rect.right + gap + width <= window.innerWidth - 12
      const fitsAbove = rect.top - height - gap >= 12
      let left = fitsRight ? rect.right + gap : rect.left - width - gap
      if (left < 12) left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12))
      let top = fitsAbove ? rect.top - height - gap : rect.bottom + gap
      if (top + height > window.innerHeight - 12) top = Math.max(12, window.innerHeight - height - 12)
      host.style.left = left + 'px'
      host.style.top = top + 'px'
      host.style.visibility = 'visible'
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('scroll', hideHelpBubble, true)
      window.addEventListener('resize', hideHelpBubble)
    }

    const IDLE = {
      ready: false,
      qrSvg: null,
      pairingUrl: null,
      lanUrls: [],
      desktopUrl: null,
      connected: false,
      tunnelActive: false,
      tunnelLoading: false,
      tunnelProvider: null,
      tunnelUrl: null,
      tunnelError: null,
      pairingPin: null,
      pinConsent: false,
      pinExpiresAt: null,
      expiresAt: null,
      publicUrl: null,
      publicUrlConfigured: false,
      mode: 'lan',
      bridgePort: null,
      expectedPort: 43128,
      portMatchesTunnel: true,
      lastPublicUrlCheck: null,
    }
    const STATE_KEYS = Object.keys(IDLE)
    const PROVIDER_LABELS = { cloudflare: 'Cloudflare', pinggy: 'Pinggy' }

    function mergeState(current, payload) {
      if (!payload || typeof payload !== 'object') return current
      const next = { ...current }
      for (const key of STATE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) next[key] = payload[key]
      }
      return next
    }

    function formatTime(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '未知'
      try {
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN', { hour12: false })
      } catch {
        return '未知'
      }
    }

    function formatClock(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      try {
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour12: false })
      } catch {
        return ''
      }
    }

    async function writeClipboard(value) {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value)
          return true
        }
      } catch {
        // The Clipboard API is permission-gated; the textarea path below still works.
      }
      try {
        if (typeof document === 'undefined') return false
        const area = document.createElement('textarea')
        area.value = value
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const copied = typeof document.execCommand === 'function' ? document.execCommand('copy') : false
        document.body.removeChild(area)
        return copied === true
      } catch {
        return false
      }
    }

    function PhoneBridgeSection() {
      const [state, setState] = useState(IDLE)
      const [draftUrl, setDraftUrl] = useState(null)
      const [draftPin, setDraftPin] = useState(null)
      const [busy, setBusy] = useState({})
      const [errors, setErrors] = useState({})
      const [notices, setNotices] = useState({})
      const [copiedKey, setCopiedKey] = useState('')

      useEffect(() => {
        let alive = true
        const load = async () => {
          try {
            const response = await fetch(STATE_URL, { cache: 'no-store', credentials: 'same-origin' })
            if (!alive || response.ok === false) return
            const payload = await response.json()
            if (alive) setState((current) => mergeState(current, payload))
          } catch {
            // The bridge route is not listening yet; the next poll retries.
          }
        }
        void load()
        const timer = setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return
          void load()
        }, POLL_MS)
        return () => {
          alive = false
          clearInterval(timer)
          for (const noticeTimer of noticeTimers.values()) clearTimeout(noticeTimer)
          noticeTimers.clear()
          hideHelpBubble()
        }
      }, [])

      const markBusy = (key, value) => setBusy((current) => ({ ...current, [key]: value }))
      const markError = (key, message) => setErrors((current) => ({ ...current, [key]: message }))
      const clearNotice = (key) => {
        const timer = noticeTimers.get(key)
        if (timer !== undefined) {
          clearTimeout(timer)
          noticeTimers.delete(key)
        }
        setNotices((current) => (current[key] ? { ...current, [key]: '' } : current))
      }
      const markNotice = (key, message) => {
        clearNotice(key)
        if (!message) return
        setNotices((current) => ({ ...current, [key]: message }))
        noticeTimers.set(
          key,
          setTimeout(() => {
            noticeTimers.delete(key)
            setNotices((current) => (current[key] ? { ...current, [key]: '' } : current))
          }, NOTICE_MS),
        )
      }
      const isBusy = (key) => busy[key] === true

      const perform = async (key, card, path, body, failureLabel, successMessage) => {
        markBusy(key, true)
        markError(card, '')
        clearNotice(card)
        try {
          const response = await fetch(path, {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body ?? {}),
          })
          const payload = await response.json().catch(() => null)
          if (payload && (payload.ok === true || payload.ready === true)) setState((current) => mergeState(current, payload))
          if (response.ok === false || !payload || payload.ok !== true) {
            const reason = payload && typeof payload.error === 'string' && payload.error ? payload.error : 'HTTP ' + (response.status || '?')
            markError(card, failureLabel + '：' + reason)
            return null
          }
          const message = typeof successMessage === 'function' ? successMessage(payload) : successMessage
          if (message) markNotice(card, message)
          return payload
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause)
          markError(card, failureLabel + '：无法连接到 DSH 主进程（' + message + '）')
          return null
        } finally {
          markBusy(key, false)
        }
      }

      const copyValue = async (key, card, value) => {
        if (!value) return
        const copied = await writeClipboard(value)
        if (!copied) {
          markError(card, '复制失败，请手动选择这段文字复制。')
          return
        }
        markError(card, '')
        setCopiedKey(key)
        setTimeout(() => {
          setCopiedKey((current) => (current === key ? '' : current))
        }, 2000)
      }

      const renderError = (card) => {
        const message = errors[card]
        return message ? h('p', { className: 'dshp_error' }, message) : null
      }

      const renderNotice = (card) => {
        const message = notices[card]
        return message ? h('p', { className: 'dshp_notice', role: 'status' }, message) : null
      }

      const copyButton = (key, card, value) =>
        h(
          'button',
          {
            type: 'button',
            className: 'dshp_button dshp_copy' + (copiedKey === key ? ' dshp_success' : ''),
            'data-copy': key,
            disabled: !value,
            onClick: () => copyValue(key, card, value),
          },
          copiedKey === key ? '已复制' : '复制',
        )

      if (!state.ready) {
        return h(
          'div',
          { className: 'dshp_root' },
          h(
            'section',
            { className: 'dshp_card dshp_skeleton', 'data-card': 'startup' },
            h(
              'div',
              { className: 'dshp_headerRow' },
              h('h2', { className: 'dshp_title' }, '连接手机'),
              h('span', { className: 'dshp_pill' }, h('span', { className: 'dshp_dot' }), '启动中'),
            ),
            h('div', { className: 'dshp_skeletonLine' }),
            h('p', { className: 'dshp_note' }, '还在启动'),
            h('p', { className: 'dshp_note' }, '正在等待手机桥接服务就绪…'),
          ),
        )
      }

      try {
        const lanUrls = Array.isArray(state.lanUrls) ? state.lanUrls.filter((url) => typeof url === 'string' && url.length > 0) : []
        const publicUrl = typeof state.publicUrl === 'string' && state.publicUrl.length > 0 ? state.publicUrl : ''
        const publicUrlConfigured = state.publicUrlConfigured === true || publicUrl.length > 0 || state.mode === 'fixed'
        const tunnelUrl = typeof state.tunnelUrl === 'string' && state.tunnelUrl.length > 0 ? state.tunnelUrl : ''
        const pairingUrl = typeof state.pairingUrl === 'string' && state.pairingUrl.length > 0 ? state.pairingUrl : ''
        const publicAvailable = publicUrlConfigured || tunnelUrl.length > 0
        const qrSvg = typeof state.qrSvg === 'string' ? state.qrSvg : ''
        const accessUrl = publicUrl || tunnelUrl || pairingUrl || lanUrls[0] || ''
        const addressLabel = publicUrlConfigured ? '固定公网地址' : tunnelUrl ? '临时隧道地址' : '局域网地址'
        const viewHint = publicAvailable
          ? '公网地址：任何网络可扫，需输入密码；同一 Wi-Fi 建议用下方局域网地址，速度更快。'
          : '局域网地址：仅限同一 Wi-Fi，不经过公网，无需密码。'
        const pin = state.pairingPin ? String(state.pairingPin) : '------'
        const lastCheck = state.lastPublicUrlCheck && typeof state.lastPublicUrlCheck === 'object' ? state.lastPublicUrlCheck : null
        const certificate = state.certificate && typeof state.certificate === 'object' ? state.certificate : null
        const certificateExpired =
          certificate && typeof certificate.expiresAt === 'number' ? certificate.expiresAt <= Date.now() : false
        const bridgePort = Number.isInteger(state.bridgePort) ? state.bridgePort : null
        const expectedPort = Number.isInteger(state.expectedPort) ? state.expectedPort : 43128
        const portMismatch = state.portMatchesTunnel === false || (bridgePort !== null && bridgePort !== expectedPort)
        const providerLabel = state.tunnelProvider ? PROVIDER_LABELS[state.tunnelProvider] ?? String(state.tunnelProvider) : '未开启'
        const draftValue = draftUrl === null ? publicUrl : draftUrl
        const saveDisabled = isBusy('save')
        const testDisabled = isBusy('test')
        const rotateDisabled = isBusy('rotate')
        const disconnectDisabled = isBusy('disconnect')
        const tunnelDisabled = isBusy('tunnel') || state.tunnelLoading === true
        const fallbackDisabled = isBusy('fallback')
        const helpTip = (text) =>
          h(
            'span',
            {
              className: 'dshp_help',
              tabIndex: 0,
              role: 'img',
              'aria-label': text,
              'data-tip': text,
              onMouseEnter: (event) => showHelpBubble(event, text),
              onMouseLeave: hideHelpBubble,
              onFocus: (event) => showHelpBubble(event, text),
              onBlur: hideHelpBubble,
              onClick: (event) => showHelpBubble(event, text),
            },
            '?',
          )

        const header = h(
          'section',
          { className: 'dshp_card dshp_hero', 'data-card': 'header' },
          h(
            'div',
            { className: 'dshp_headerRow' },
            h(
              'div',
              { className: 'dshp_titleBlock' },
              h(
                'div',
                { className: 'dshp_cardTitleRow' },
                h('h2', { className: 'dshp_title' }, '连接手机'),
                helpTip(
                  '局域网直连：同一 Wi-Fi，不经过公网，无需密码。\n公网入口：任意网络，需固定域名或临时隧道，并输入密码。',
                ),
              ),
              h('p', { className: 'dshp_subtitle' }, '手机扫码即可继续当前会话。'),
            ),
            h(
              'div',
              { className: 'dshp_badges' },
              h(
                'span',
                { className: 'dshp_pill' + (state.connected === true ? ' dshp_pillConnected dshp_success' : '') },
                h('span', { className: 'dshp_dot' }),
                state.connected === true ? '手机已连接' : '等待连接',
              ),
            ),
          ),
        )

        const qrCard = h(
          'section',
          { className: 'dshp_card dshp_qrCard', 'data-card': 'qr' },
          h(
            'div',
            { className: 'dshp_cardHead' },
            h(
              'div',
              { className: 'dshp_cardTitleRow' },
              h('h3', { className: 'dshp_cardTitle' }, '扫码连接'),
              helpTip(viewHint),
            ),
            h('span', { className: 'dshp_tag' }, publicAvailable ? '公网入口' : '局域网直连'),
          ),
          h(
            'div',
            { className: 'dshp_qrLayout' },
            qrSvg.length > 0
              ? h('div', { className: 'dshp_qr', dangerouslySetInnerHTML: { __html: qrSvg } })
              : h('div', { className: 'dshp_qr' }, h('span', { className: 'dshp_qrPlaceholder' }, '二维码生成中')),
            h(
              'div',
              { className: 'dshp_qrDetails' },
              h(
                'div',
                { className: 'dshp_field' },
                h('span', { className: 'dshp_label' }, addressLabel),
                h(
                  'div',
                  { className: 'dshp_valueRow' },
                  h('code', { className: 'dshp_addr' }, accessUrl || '暂无可用地址'),
                  copyButton('address', 'qr', accessUrl),
                ),
              ),
              publicAvailable
                ? h(
                    'div',
                    { className: 'dshp_field' },
                    h(
                      'div',
                      { className: 'dshp_labelRow' },
                      h('span', { className: 'dshp_label' }, '连接密码'),
                      helpTip('浏览器公网入口和 AI-HUB 共用此密码；修改后已连接的手机需重新输入。'),
                    ),
                    h(
                      'div',
                      { className: 'dshp_valueRow' },
                      h('code', { className: 'dshp_pin' }, pin),
                      copyButton('pin', 'qr', state.pairingPin ? String(state.pairingPin) : ''),
                    ),
                  )
                : null,
              lanUrls.length > 0 && (publicAvailable || lanUrls.length > 1)
                ? h(
                    'div',
                    { className: 'dshp_field' },
                    h(
                      'div',
                      { className: 'dshp_labelRow' },
                      h(
                        'span',
                        { className: 'dshp_label' },
                        publicAvailable ? '同一 Wi-Fi 更快：局域网直连地址' : '其他局域网地址',
                      ),
                      helpTip(
                        publicAvailable
                          ? '在手机浏览器打开，不经过公网，速度更快。'
                          : '其余为同网段的其他地址，打不开时可换一个。',
                      ),
                    ),
                    h(
                      'ul',
                      { className: 'dshp_list' },
                      ...(publicAvailable ? lanUrls : lanUrls.slice(1)).map((url) =>
                        h(
                          'li',
                          { className: 'dshp_listItem', key: url },
                          h('code', { className: 'dshp_addr' }, url),
                          copyButton('lan:' + url, 'qr', url),
                        ),
                      ),
                    ),
                  )
                : null,
              state.connected === true
                ? h('p', { className: 'dshp_connectedText' }, '手机已连接，可继续使用')
                : null,
              h(
                'div',
                { className: 'dshp_actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshp_button',
                    'data-action': 'rotate',
                    disabled: rotateDisabled,
                    onClick: () => perform('rotate', 'qr', ROTATE_URL, {}, '重新生成二维码失败', '二维码已重新生成。'),
                  },
                  rotateDisabled ? '正在重新生成…' : '重新生成二维码',
                ),
                state.connected === true
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshp_button',
                        'data-action': 'disconnect-qr',
                        disabled: disconnectDisabled,
                        onClick: () => perform('disconnect', 'qr', DISCONNECT_URL, {}, '断开失败', '已断开手机连接。'),
                      },
                      disconnectDisabled ? '正在断开…' : '断开手机',
                    )
                  : null,
              ),
              renderError('qr'),
              renderNotice('qr'),
            ),
          ),
        )

        const publicCard = h(
          'section',
          { className: 'dshp_card', 'data-card': 'public' },
          h(
            'div',
            { className: 'dshp_cardHead' },
            h(
              'div',
              { className: 'dshp_cardTitleRow' },
              h('h3', { className: 'dshp_cardTitle' }, '公网入口设置'),
              helpTip(
                publicUrlConfigured
                  ? '固定域名需由外部隧道转发到本机 ' + expectedPort + ' 端口；配置后临时隧道停用。'
                  : state.tunnelActive === true
                    ? '临时隧道已开启，地址随机生成，每次开启都会变化。'
                    : '未配置公网入口；可填固定域名，或开启临时隧道。',
              ),
            ),
            h(
              'span',
              {
                className:
                  'dshp_tag' +
                  (publicUrlConfigured || state.tunnelActive === true ? '' : ' dshp_tagMuted'),
              },
              publicUrlConfigured ? '固定域名' : state.tunnelActive === true ? '临时隧道' : '未配置',
            ),
          ),
          h(
            'div',
            { className: 'dshp_labelRow' },
            h('span', { className: 'dshp_label' }, '固定公网域名'),
            helpTip('例如 https://dsh.example.com；只填域名，不含路径。'),
          ),
          h(
            'div',
            { className: 'dshp_formRow' },
            h('input', {
              type: 'url',
              className: 'dshp_input',
              'data-field': 'public-url',
              value: draftValue,
              placeholder: 'https://dsh.example.com',
              'aria-label': '固定公网域名',
              spellCheck: false,
              autoComplete: 'off',
              onChange: (event) => setDraftUrl(event && event.target ? String(event.target.value) : ''),
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dshp_button dshp_primary',
                'data-action': 'save',
                disabled: saveDisabled,
                onClick: async () => {
                  const value = (draftUrl === null ? publicUrl : draftUrl).trim()
                  const saved = await perform(
                    'save',
                    'public',
                    SETTINGS_URL,
                    { publicUrl: value },
                    '保存失败',
                    (payload) => (payload.publicUrl ? '固定公网域名已保存。' : '已清除固定域名，可重新开启临时隧道。'),
                  )
                  if (saved) setDraftUrl(null)
                },
              },
              saveDisabled ? '保存中…' : '保存',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dshp_button',
                'data-action': 'test',
                disabled: testDisabled,
                onClick: () =>
                  perform('test', 'public', PUBLIC_URL_TEST_URL, {}, '检测失败', (payload) => {
                    const check = payload.lastPublicUrlCheck
                    if (!check || check.reachable !== true) return ''
                    return '域名检测通过' + (Number.isInteger(check.status) ? '（HTTP ' + check.status + '）' : '') + '。'
                  }),
              },
              testDisabled ? '检测中…' : '检测连通性',
            ),
          ),
          certificate && publicUrlConfigured
            ? h(
                'div',
                { className: 'dshp_statusRow' },
                h(
                  'span',
                  { className: 'dshp_checkState' + (certificateExpired ? ' dshp_danger' : '') },
                  certificateExpired
                    ? '证书已过期'
                    : certificate.selfSigned === true
                      ? '只有 frpc 自签证书'
                      : typeof certificate.expiresAt === 'number'
                        ? '证书有效至 ' + formatTime(certificate.expiresAt)
                        : '未申请证书',
                ),
                h('span', { className: 'dshp_note' }, certificate.pending ? '正在签发…' : '经 80 端口隧道自动续期'),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshp_button',
                    'data-action': 'issue-certificate',
                    disabled: certificate.pending === true,
                    onClick: () =>
                      perform(
                        'certificate',
                        'public',
                        CERTIFICATE_URL,
                        {},
                        '证书签发失败',
                        '正在申请证书，稍后在这里看结果。',
                      ),
                  },
                  typeof certificate.expiresAt === 'number' && certificate.selfSigned !== true ? '立即续期' : '申请证书',
                ),
              )
            : null,
          certificate && typeof certificate.error === 'string' && certificate.error
            ? h('p', { className: 'dshp_error' }, '证书错误：' + certificate.error)
            : null,
          h(
            'div',
            { className: 'dshp_statusRow' },
            h(
              'span',
              {
                className:
                  'dshp_checkState' +
                  (lastCheck ? (lastCheck.reachable === true ? ' dshp_success' : ' dshp_danger') : ''),
              },
              lastCheck
                ? lastCheck.reachable === true
                  ? lastCheck.status === 401 || lastCheck.status === 403
                    ? '已连通（等待配对）'
                    : '可访问'
                  : '无法访问'
                : '未检测',
            ),
            lastCheck
              ? h('span', { className: 'dshp_note' }, '上次检测：' + formatTime(lastCheck.at))
              : null,
            lastCheck && Number.isInteger(lastCheck.status)
              ? h('span', { className: 'dshp_note' }, 'HTTP ' + lastCheck.status)
              : null,
          ),
          lastCheck && typeof lastCheck.error === 'string' && lastCheck.error
            ? h('p', { className: 'dshp_error' }, '失败原因：' + lastCheck.error)
            : null,
          renderError('public'),
          renderNotice('public'),
          publicUrlConfigured
            ? null
            : h(
                'div',
                { className: 'dshp_actions' },
                state.tunnelActive !== true
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshp_button dshp_primary',
                        'data-action': 'tunnel-enable',
                        disabled: tunnelDisabled,
                        onClick: () =>
                          perform('tunnel', 'public', TUNNEL_URL, { enabled: true }, '开启临时隧道失败', '临时隧道已开启。'),
                      },
                      tunnelDisabled ? '正在开启…' : '开启临时隧道',
                    )
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshp_button',
                        'data-action': 'tunnel-disable',
                        disabled: tunnelDisabled,
                        onClick: () =>
                          perform('tunnel', 'public', TUNNEL_URL, { enabled: false }, '关闭临时隧道失败', '临时隧道已关闭。'),
                      },
                      tunnelDisabled ? '正在关闭…' : '关闭公网连接',
                    ),
                state.tunnelProvider === 'cloudflare' && state.connected !== true
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshp_button',
                        'data-action': 'tunnel-fallback',
                        disabled: fallbackDisabled,
                        onClick: () => perform('fallback', 'public', TUNNEL_FALLBACK_URL, {}, '切换线路失败', '已切换到备用线路。'),
                      },
                      fallbackDisabled ? '正在切换…' : '扫码无法打开？切换备用线路',
                    )
                  : null,
              ),
          publicUrlConfigured ? null : state.tunnelLoading === true
            ? h('p', { className: 'dshp_note' }, '正在创建临时隧道…')
            : null,
          publicUrlConfigured ? null : tunnelUrl
            ? h('p', { className: 'dshp_note' }, '隧道地址：' + tunnelUrl)
            : null,
          publicUrlConfigured ? null : state.tunnelError
            ? h('p', { className: 'dshp_error' }, '隧道建立失败：' + state.tunnelError)
            : null,
        )

        const pinDraftValue = draftPin === null ? (state.pinConsent === true && state.pairingPin ? String(state.pairingPin) : '') : draftPin
        const pinDraftInvalid = pinDraftValue !== '' && !/^[0-9]{6}$/.test(pinDraftValue)
        const securityCard = h(
          'section',
          { className: 'dshp_card', 'data-card': 'security' },
          h(
            'div',
            { className: 'dshp_cardHead' },
            h(
              'div',
              { className: 'dshp_cardTitleRow' },
              h('h3', { className: 'dshp_cardTitle' }, '连接密码'),
              helpTip('浏览器公网入口和 AI-HUB 共用；修改后已连接的手机需重新输入。'),
            ),
          ),
          h(
            'div',
            { className: 'dshp_field' },
            h(
              'div',
              { className: 'dshp_labelRow' },
              h('span', { className: 'dshp_label' }, '固定密码'),
              helpTip('6 位数字长期有效；留空恢复 5 分钟随机密码。'),
            ),
            h(
              'div',
              { className: 'dshp_formRow' },
              h('input', {
                className: 'dshp_input',
                'data-field': 'pairing-pin',
                type: 'text',
                inputMode: 'numeric',
                maxLength: 6,
                placeholder: '例如 000000（留空则随机）',
                value: pinDraftValue,
                disabled: isBusy('pin'),
                'aria-invalid': pinDraftInvalid ? 'true' : 'false',
                onChange: (event) => setDraftPin(String((event && event.target && event.target.value) || '').replace(/[^0-9]/g, '')),
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshp_button',
                  'data-action': 'save-pin',
                  disabled: isBusy('pin') || pinDraftInvalid,
                  onClick: async () => {
                    await perform(
                      'pin',
                      'security',
                      PIN_URL,
                      { pin: pinDraftValue.trim() },
                      '保存连接密码失败',
                      (payload) => (payload.pinConsent === true ? '连接密码已保存，立即生效。' : '已恢复 5 分钟随机密码。'),
                    )
                    setDraftPin(null)
                  },
                },
                isBusy('pin') ? '正在保存…' : '保存密码',
              ),
            ),
            pinDraftInvalid
              ? h('p', { className: 'dshp_error' }, '连接密码必须是 6 位数字；AI-HUB 配对需要固定密码。')
              : null,
            state.pinConsent === true
              ? h(
                  'p',
                  { className: 'dshp_note' },
                  state.pairingPin ? '当前固定为 ' + state.pairingPin : '已保存固定密码',
                )
              : null,
            renderNotice('security'),
          ),
          renderError('security'),
        )

        const diagnosticsCard = h(
          'section',
          { className: 'dshp_card dshp_detailsCard', 'data-card': 'diagnostics' },
          h(
            'details',
            { className: 'dshp_details', open: portMismatch ? true : undefined },
            h('summary', { className: 'dshp_detailsSummary' }, '诊断信息'),
            h(
              'div',
              { className: 'dshp_detailsBody' },
              h(
                'div',
                { className: 'dshp_diagRow' },
                h(
                  'div',
                  { className: 'dshp_labelRow' },
                  h('span', { className: 'dshp_diagLabel' }, '桥接端口'),
                  helpTip('本机监听端口；固定域名隧道默认按 43128 转发。'),
                ),
                h(
                  'code',
                  { className: 'dshp_diagValue' + (portMismatch ? ' dshp_danger' : '') },
                  bridgePort === null ? '未知' : String(bridgePort),
                ),
              ),
              h(
                'div',
                { className: 'dshp_diagRow' },
                h(
                  'div',
                  { className: 'dshp_labelRow' },
                  h('span', { className: 'dshp_diagLabel' }, '临时隧道'),
                  helpTip('插件内置的临时隧道；使用固定域名时不启用。'),
                ),
                h('span', { className: 'dshp_diagValue' + (state.tunnelActive === true ? ' dshp_success' : '') }, providerLabel),
              ),
              h(
                'div',
                { className: 'dshp_diagRow' },
                h(
                  'div',
                  { className: 'dshp_labelRow' },
                  h('span', { className: 'dshp_diagLabel' }, '临时隧道错误'),
                  helpTip('最近一次临时隧道启动失败原因。'),
                ),
                h(
                  'code',
                  { className: 'dshp_diagValue' + (state.tunnelError ? ' dshp_danger' : '') },
                  state.tunnelError ? String(state.tunnelError) : '无',
                ),
              ),
              portMismatch
                ? h(
                    'p',
                    { className: 'dshp_warn' },
                    '固定域名隧道按 ' +
                      expectedPort +
                      ' 端口转发，当前桥接端口' +
                      (bridgePort === null ? '未知。' : '为 ' + bridgePort + '。'),
                  )
                : null,
              typeof state.desktopUrl === 'string' && state.desktopUrl.length > 0
                ? h(
                    'div',
                    { className: 'dshp_labelRow' },
                    h(
                      'a',
                      { className: 'dshp_link', href: state.desktopUrl, target: '_blank', rel: 'noreferrer' },
                      '打开桌面配对页（仅本机）',
                    ),
                    helpTip('在本机打开桌面配对页。'),
                  )
                : null,
            ),
          ),
        )

        const deviceList = Array.isArray(state.devices) ? state.devices : []
        const deviceTitle = (device) => {
          const name = typeof device.name === 'string' ? device.name.trim() : ''
          const platform = typeof device.platform === 'string' ? device.platform.trim() : ''
          if (name && platform) return name + '（' + platform + '）'
          if (name) return name
          if (platform) return '未命名手机（' + platform + '）'
          return '未命名手机 ' + String(device.deviceId || '').slice(0, 8)
        }
        const onlineCount = deviceList.filter((device) => device.online === true).length
        const deviceTag = onlineCount > 0
          ? onlineCount + ' 在线 / ' + deviceList.length + ' 台'
          : deviceList.length + ' 台'
        const devicesCard = h(
          'section',
          { className: 'dshp_card', 'data-card': 'devices' },
          h(
            'div',
            { className: 'dshp_cardHead' },
            h(
              'div',
              { className: 'dshp_cardTitleRow' },
              h('h3', { className: 'dshp_cardTitle' }, '已连接设备'),
              helpTip('每台手机各有一条设备凭据，可以同时在线；绿点表示它此刻正握着事件流。经隧道转发的连接看不到手机 IP。'),
            ),
            h(
              'span',
              { className: 'dshp_tag' + (deviceList.length === 0 ? ' dshp_tagMuted' : '') },
              deviceTag,
            ),
          ),
          deviceList.length === 0
            ? h('p', { className: 'dshp_note' }, '还没有手机配对过，配好第一台后会出现在这里。')
            : h(
                'ul',
                { className: 'dshp_list' },
                ...deviceList.map((device) =>
                  h(
                    'li',
                    { className: 'dshp_listItem dshp_deviceItem', key: device.deviceId },
                    h(
                      'div',
                      { className: 'dshp_deviceMain' },
                      h(
                        'span',
                        { className: 'dshp_deviceName' },
                        h('span', { className: 'dshp_deviceDot' + (device.online === true ? ' dshp_deviceDotOnline' : '') }),
                        deviceTitle(device),
                      ),
                      h(
                        'span',
                        { className: 'dshp_note' },
                        device.lastIp
                          ? [device.lastIp, device.region || '归属地未知'].join(' · ')
                          : '经隧道转发，看不到手机 IP',
                      ),
                      h('span', { className: 'dshp_note' }, '最后在线：' + formatTime(device.lastSeenAt)),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshp_button',
                        'data-action': 'remove-device',
                        onClick: () =>
                          perform(
                            'remove:' + device.deviceId,
                            'devices',
                            DEVICE_REMOVE_URL,
                            { deviceId: device.deviceId },
                            '移除失败',
                            '设备已移除。',
                          ),
                      },
                      '移除',
                    ),
                  ),
                ),
              ),
          renderError('devices'),
          renderNotice('devices'),
        )

        return h('div', { className: 'dshp_root' }, header, publicCard, qrCard, devicesCard, securityCard, diagnosticsCard)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        return h(
          'div',
          { className: 'dshp_root' },
          h(
            'section',
            { className: 'dshp_card', 'data-card': 'error' },
            h('p', { className: 'dshp_error' }, '面板暂时无法显示：' + message),
          ),
        )
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'phone-bridge',
              order: 25,
              label: () => '连接手机',
            },
            PhoneBridgeSection,
          ),
        )
      },
    }
  },
})
