window.__ModuleLoader__.load({
  id: 'dsh-roam',
  factory(require) {
    const { createElement: h, useEffect, useState } = require('react')

    const STYLE_ID = 'dsh-roam/settings.css'
    const CSS = [
      '.dshp_root{--dshp-ink:#1f2430;--dshp-muted:#62666d;--dshp-line:#e4e6ea;--dshp-line-soft:#eff0f2;--dshp-card:#fff;--dshp-surface:#f6f7f9;--dshp-accent:#3556d8;--dshp-accent-soft:#eef2ff;--dshp-danger:#c6353f;--dshp-danger-soft:#fff1f2;--dshp-success:#15803d;--dshp-warn:#a15c07;display:flex;flex-direction:column;gap:16px;width:100%;max-width:880px;min-width:0;container-type:inline-size;color:var(--dsw-alias-label-primary,var(--dshp-ink));font-size:13px;line-height:20px}',
      '.dshp_top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;min-width:0}.dshp_heading{display:flex;flex-direction:column;gap:3px;min-width:0}.dshp_title{margin:0;font-size:17px;line-height:25px;font-weight:600;letter-spacing:-.01em}.dshp_sub{margin:0;color:var(--dshp-muted);font-size:12px;line-height:18px}.dshp_statusWrap{display:flex;align-items:center;gap:6px;flex:none;padding-top:3px}',
      '.dshp_status{display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:2px 10px;border:1px solid var(--dshp-line);border-radius:999px;background:var(--dshp-card);color:var(--dshp-muted);font-size:11.5px;line-height:17px;white-space:nowrap}.dshp_status[data-online=true]{border-color:color-mix(in srgb,#16a34a 38%,var(--dshp-line));background:color-mix(in srgb,#16a34a 8%,var(--dshp-card));color:var(--dshp-success)}.dshp_dot{width:7px;height:7px;flex:none;border-radius:50%;background:#9aa4b2}.dshp_status[data-online=true] .dshp_dot{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15)}',
      '.dshp_disconnect{display:inline-flex;align-items:center;min-height:26px;padding:0 6px;border:0;border-radius:7px;background:transparent;color:var(--dshp-muted);font:inherit;font-size:11.5px;font-weight:600;cursor:pointer}.dshp_disconnect:hover:not(:disabled){background:var(--dshp-danger-soft);color:var(--dshp-danger)}.dshp_disconnect:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:1px}.dshp_disconnect:disabled{color:#9ca3af;cursor:not-allowed}',
      '.dshp_card{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;min-width:0;padding:18px;border:1px solid var(--dshp-line);border-radius:16px;background:var(--dshp-card)}',
      '.dshp_modes{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border-radius:12px;background:var(--dshp-surface)}.dshp_mode{min-height:36px;padding:0 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--dshp-muted);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}.dshp_mode:hover{color:var(--dshp-ink)}.dshp_mode[aria-pressed=true]{border-color:color-mix(in srgb,var(--dshp-accent) 50%,var(--dshp-line));background:var(--dshp-card);color:var(--dshp-ink);font-weight:600;box-shadow:0 1px 2px rgba(16,24,40,.08)}.dshp_mode:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:1px}',
      '.dshp_hint{margin:-4px 2px 0;color:var(--dshp-muted);font-size:12px;line-height:18px}',
      '.dshp_body{display:grid;grid-template-columns:200px minmax(0,1fr);gap:20px;align-items:start}.dshp_scan{display:flex;flex-direction:column;gap:8px;min-width:0}.dshp_qr{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:200px;height:200px;padding:10px;border:1px solid var(--dshp-line);border-radius:14px;background:#fff}.dshp_qr svg{display:block;width:100%;height:100%}.dshp_qrEmpty{flex-direction:column;gap:5px;padding:16px;border-style:dashed;background:var(--dshp-surface);color:var(--dshp-muted);text-align:center}.dshp_qrEmpty strong{color:var(--dshp-ink);font-size:12px;line-height:18px}.dshp_qrEmpty span{font-size:11px;line-height:16px}.dshp_qrEmpty .dshp_button{margin-top:4px}.dshp_qrMeta{display:flex;align-items:center;justify-content:flex-start;gap:12px;width:200px;color:var(--dshp-muted);font-size:11px;line-height:16px}',
      '.dshp_fields{display:flex;flex-direction:column;gap:10px;min-width:0}.dshp_lead{margin:0;font-size:14px;line-height:20px;font-weight:600}.dshp_note{margin:0;color:var(--dshp-muted);font-size:12px;line-height:18px;overflow-wrap:anywhere}.dshp_steps{display:flex;flex-wrap:wrap;gap:2px 14px;margin:0;padding:0;list-style:none;color:var(--dshp-muted);font-size:11px;line-height:17px}.dshp_steps li{display:flex;align-items:center;gap:5px}.dshp_stepNo{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:var(--dshp-surface);color:var(--dshp-muted);font-size:9.5px;font-weight:600}',
      '.dshp_row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}.dshp_label{flex:0 0 auto;min-width:50px;color:var(--dshp-muted);font-size:11px;line-height:16px;font-weight:600}.dshp_addr{box-sizing:border-box;flex:1 1 140px;max-width:520px;min-width:0;margin:0;padding:4px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:7px;background:var(--dshp-surface);font:11.5px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.dshp_pin{margin:0;flex:1 1 auto;min-width:96px;font:22px/28px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.08em;white-space:nowrap}',
      '.dshp_button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;padding:0 12px;border:1px solid var(--dshp-line);border-radius:10px;background:var(--dshp-card);color:var(--dshp-ink);font:inherit;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;transition:border-color .15s ease,background .15s ease,color .15s ease}.dshp_button:hover:not(:disabled){border-color:color-mix(in srgb,var(--dshp-accent) 45%,var(--dshp-line));background:var(--dshp-accent-soft)}.dshp_button:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:1px}.dshp_button:disabled{border-color:#eceef1;background:#f1f2f4;color:#9ca3af;cursor:not-allowed}.dshp_primary{border-color:var(--dshp-accent);background:var(--dshp-accent);color:#fff}.dshp_primary:hover:not(:disabled){border-color:var(--dshp-accent);background:var(--dshp-accent);color:#fff;filter:brightness(.95)}.dshp_primary:disabled{border-color:#eceef1;background:#f1f2f4;color:#9ca3af;filter:none}',
      '.dshp_textButton{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:0 4px;border:0;border-radius:6px;background:transparent;color:var(--dshp-accent);font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}.dshp_textButton:hover:not(:disabled){background:var(--dshp-accent-soft)}.dshp_textButton:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:1px}.dshp_textButton:disabled{color:#9ca3af;cursor:not-allowed}.dshp_icon{flex:none;display:block}',
      '.dshp_field{display:flex;flex-direction:column;gap:6px;min-width:0}.dshp_fieldLabel{color:var(--dshp-muted);font-size:11px;line-height:16px;font-weight:600}.dshp_fieldRow{display:flex;align-items:center;gap:8px;min-width:0}.dshp_input{box-sizing:border-box;flex:1 1 auto;min-width:0;height:36px;padding:0 10px;border:1px solid var(--dshp-line);border-radius:10px;background:var(--dshp-card);color:var(--dshp-ink);font:12px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.dshp_input:focus{outline:none;border-color:var(--dshp-accent);box-shadow:0 0 0 3px var(--dshp-accent-soft)}',
      '.dshp_state{display:inline-flex;align-items:center;gap:6px;color:var(--dshp-muted);font-size:12px;line-height:18px}.dshp_state::before{content:"";width:6px;height:6px;flex:none;border-radius:50%;background:#c4c9d1}.dshp_state[data-tone=ok]{color:var(--dshp-success)}.dshp_state[data-tone=ok]::before{background:#22c55e}.dshp_state[data-tone=bad]{color:var(--dshp-danger)}.dshp_state[data-tone=bad]::before{background:#ef4444}',
      '.dshp_actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dshp_error{margin:0;color:var(--dshp-danger);font-size:12px;line-height:18px;overflow-wrap:anywhere}.dshp_notice{margin:0;color:var(--dshp-success);font-size:12px;line-height:18px;overflow-wrap:anywhere}.dshp_warn{margin:0;padding:8px 10px;border-left:3px solid var(--dshp-warn);border-radius:8px;background:#fffbeb;color:#7c4a03;font-size:12px;line-height:18px}',
      '.dshp_devices{gap:0;padding:0}.dshp_deviceBody{display:flex;flex-direction:column;gap:12px;padding:0 18px 18px}.dshp_deviceList{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none}.dshp_deviceRow{display:flex;align-items:center;gap:12px;min-width:0;padding:12px 0;border-top:1px solid var(--dshp-line-soft)}.dshp_deviceRow:first-child{border-top:0;padding-top:2px}.dshp_deviceIcon{display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:9px;background:var(--dshp-surface);color:var(--dshp-muted);font-size:19px;transform:rotate(90deg)}.dshp_deviceCopy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.dshp_deviceName{display:flex;align-items:center;gap:10px;min-width:0}.dshp_deviceName strong{font-size:13px;font-weight:600}.dshp_deviceStatus{flex:none;padding:1px 6px;border-radius:999px;background:var(--dshp-surface);color:var(--dshp-muted);font-size:10px;line-height:16px}.dshp_deviceStatus[data-status=active]{background:color-mix(in srgb,#16a34a 10%,var(--dshp-card));color:var(--dshp-success)}.dshp_deviceStatus[data-status=disconnected]{background:var(--dshp-danger-soft);color:var(--dshp-danger)}.dshp_deviceMeta{color:var(--dshp-muted);font-size:11px;line-height:17px;overflow-wrap:anywhere}.dshp_deviceId{flex:none;max-width:76px;overflow:hidden;color:var(--dshp-muted);font:10px/16px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-overflow:ellipsis}.dshp_deviceEmpty{margin:0;padding:10px 0;color:var(--dshp-muted);font-size:12px;line-height:18px}.dshp_advanced{gap:0;padding:0}.dshp_advHeading{margin:0;font:inherit;font-weight:inherit}.dshp_summary{display:flex;align-items:center;gap:8px;width:100%;min-height:50px;padding:0 18px;border:0;border-radius:16px;background:transparent;color:var(--dshp-ink);font:inherit;font-size:13px;font-weight:600;text-align:left;cursor:pointer}.dshp_summary:hover{background:#fafbfc}.dshp_summary:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:-2px}.dshp_summaryHint{margin-left:auto;color:var(--dshp-muted);font-size:11.5px;font-weight:400}.dshp_chevron{flex:none;color:var(--dshp-muted);transition:transform .15s ease}.dshp_summary[aria-expanded=true] .dshp_chevron{transform:rotate(180deg)}',
      '.dshp_advBody{display:flex;flex-direction:column;padding:0 18px 18px}.dshp_advBody[hidden]{display:none}.dshp_group{display:flex;flex-direction:column;gap:10px;padding:16px 0;border-top:1px solid var(--dshp-line-soft)}.dshp_group:first-child{border-top:0;padding-top:2px}.dshp_groupTitle{margin:0;color:var(--dshp-muted);font-size:11.5px;line-height:17px;font-weight:600;letter-spacing:.02em}',
      '.dshp_help{display:flex;flex-direction:column;gap:5px;margin:0;padding:0;list-style:none;color:var(--dshp-muted);font-size:12px;line-height:19px}.dshp_help li{display:flex;gap:7px}.dshp_help b{color:var(--dshp-ink);font-weight:600}.dshp_diag{display:grid;grid-template-columns:92px minmax(0,1fr);gap:5px 12px;margin:0;align-items:baseline}.dshp_diag dt{color:var(--dshp-muted);font-size:11px;line-height:16px}.dshp_diag dd{margin:0;font:11px/16px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}',
      '.dshp_loading{display:flex;flex-direction:column;gap:10px;padding:18px;border:1px solid var(--dshp-line);border-radius:16px;background:var(--dshp-card)}.dshp_skeleton{width:44%;height:10px;border-radius:5px;background:var(--dshp-line);opacity:.55}',
      '@container (max-width:560px){.dshp_body{grid-template-columns:minmax(0,1fr);gap:16px}.dshp_scan{align-items:center}.dshp_qr{width:200px;height:200px}.dshp_qrMeta{width:200px}.dshp_fields{width:100%}}',
      '@container (max-width:380px){.dshp_card{padding:14px;border-radius:14px}.dshp_summary{padding:0 14px}.dshp_deviceBody{padding:0 14px 14px}.dshp_deviceId{display:none}.dshp_deviceRow{gap:9px}.dshp_deviceName{flex-wrap:wrap;gap:5px}.dshp_advBody{padding:0 14px 14px}.dshp_top{flex-wrap:wrap;gap:8px}.dshp_statusWrap{padding-top:0}.dshp_row{align-items:stretch}.dshp_label{width:100%;min-width:0}.dshp_addr{flex-basis:100%}.dshp_button,.dshp_input{min-height:40px}.dshp_pin{font-size:20px;line-height:26px}}',
      '@media (prefers-reduced-motion:reduce){.dshp_summary .dshp_chevron,.dshp_mode{transition:none}}',
    ].join('\n')
    if (typeof document !== 'undefined') {
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
    const CERTIFICATE_URL = '/phone-bridge/certificate'
    const POLL_MS = 2000
    const NOTICE_MS = 4000
    const noticeTimers = new Map()

    const IDLE = {
      ready: false,
      qrSvg: null,
      lanQrSvg: null,
      pairingUrl: null,
      lanUrls: [],
      connected: false,
      browserConnected: false,
      browserDevices: [],
      tunnelActive: false,
      tunnelLoading: false,
      tunnelProvider: null,
      tunnelUrl: null,
      tunnelError: null,
      pairingPin: null,
      pinConsent: false,
      pinExpiresAt: null,
      expiresAt: null,
      certificate: null,
      version: null,
      now: null,
      publicUrl: null,
      publicUrlConfigured: false,
      mode: 'lan',
      bridgePort: null,
      expectedPort: 43128,
      portMatchesTunnel: true,
      lastPublicUrlCheck: null,
    }

    const ICON_PATHS = {
      copy: [
        'M5.5 5.5V3.75A1.25 1.25 0 0 1 6.75 2.5h5A1.25 1.25 0 0 1 13 3.75v5a1.25 1.25 0 0 1-1.25 1.25H10',
        'M3.75 5.5h5A1.25 1.25 0 0 1 10 6.75v5a1.25 1.25 0 0 1-1.25 1.25h-5A1.25 1.25 0 0 1 2.5 11.75v-5A1.25 1.25 0 0 1 3.75 5.5Z',
      ],
      refresh: [
        'M13.25 3.5v3.25h-3.25',
        'M13 6.6A5.25 5.25 0 1 0 8 13.25a5.25 5.25 0 0 0 4.9-3.35',
      ],
      chevron: ['M3.75 6.25 8 10.5l4.25-4.25'],
    }

    const icon = (name) => h('svg', {
      className: 'dshp_icon',
      viewBox: '0 0 16 16',
      width: 14,
      height: 14,
      'aria-hidden': 'true',
      focusable: 'false',
    }, ICON_PATHS[name].map((d, index) => h('path', {
      key: String(index),
      d,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })))

    function snapshotFingerprint(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return ''
      const { now, ...rest } = snapshot
      return JSON.stringify({ ...rest, minute: typeof now === 'number' ? Math.floor(now / 60000) : null })
    }

    function formatRemaining(value, now) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      const remaining = Math.max(0, Math.ceil((value - (typeof now === 'number' ? now : Date.now())) / 60000))
      return remaining > 0 ? '约 ' + remaining + ' 分钟后失效' : '已失效，正在刷新'
    }

    function formatTime(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      try {
        return new Date(value).toLocaleString('zh-CN', { hour12: false })
      } catch {
        return ''
      }
    }

    function formatDeviceTime(value, now) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '时间未知'
      const elapsed = Math.max(0, (typeof now === 'number' ? now : Date.now()) - value)
      if (elapsed < 30_000) return '刚刚有请求'
      if (elapsed < 60_000) return '1 分钟前有请求'
      if (elapsed < 3_600_000) return Math.floor(elapsed / 60_000) + ' 分钟前有请求'
      if (elapsed < 86_400_000) return Math.floor(elapsed / 3_600_000) + ' 小时前有请求'
      if (elapsed < 7 * 86_400_000) return Math.floor(elapsed / 86_400_000) + ' 天前有请求'
      return formatTime(value)
    }

    function shortAddress(value) {
      try {
        return new URL(value).host || value
      } catch {
        return value
      }
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await fetch(url, { ...options, signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }
    }

    async function writeClipboard(value) {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value)
          return true
        }
      } catch {
        // Clipboard permission is optional; the textarea fallback still works.
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
      const [view, setView] = useState('lan')
      const [advancedOpen, setAdvancedOpen] = useState(false)
      const [devicesOpen, setDevicesOpen] = useState(false)
      const [draftUrl, setDraftUrl] = useState(null)
      const [draftPin, setDraftPin] = useState(null)
      const [pinEditing, setPinEditing] = useState(false)
      const [busy, setBusy] = useState({})
      const [errors, setErrors] = useState({})
      const [notices, setNotices] = useState({})
      const [copiedKey, setCopiedKey] = useState('')
      const [pollError, setPollError] = useState('')

      useEffect(() => {
        let alive = true
        let inFlight = false
        let latest = 0
        const load = async () => {
          if (inFlight) return
          inFlight = true
          const request = ++latest
          try {
            const response = await fetchWithTimeout(STATE_URL, { cache: 'no-store', credentials: 'same-origin' })
            if (!alive || request !== latest) return
            if (response.ok === false) {
              setPollError('HTTP ' + (response.status || '?'))
              return
            }
            const payload = await response.json()
            if (!alive || request !== latest) return
            setPollError('')
            setState((current) => (snapshotFingerprint(current) === snapshotFingerprint(payload) ? current : { ...IDLE, ...payload }))
          } catch (cause) {
            if (!alive || request !== latest) return
            setPollError(cause instanceof Error ? cause.message : String(cause))
          } finally {
            inFlight = false
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
          for (const timer of noticeTimers.values()) clearTimeout(timer)
          noticeTimers.clear()
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
        noticeTimers.set(key, setTimeout(() => {
          noticeTimers.delete(key)
          setNotices((current) => (current[key] ? { ...current, [key]: '' } : current))
        }, NOTICE_MS))
      }
      const isBusy = (key) => busy[key] === true

      const perform = async (key, card, path, body, failureLabel, successMessage) => {
        markBusy(key, true)
        markError(card, '')
        clearNotice(card)
        try {
          const response = await fetchWithTimeout(path, {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body ?? {}),
          })
          const payload = await response.json().catch(() => null)
          if (payload && payload.ready === true) setState({ ...IDLE, ...payload })
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
        setTimeout(() => setCopiedKey((current) => (current === key ? '' : current)), 2000)
      }

      const renderError = (card) => errors[card] ? h('p', { className: 'dshp_error', role: 'alert' }, errors[card]) : null
      const renderNotice = (card) => notices[card] ? h('p', { className: 'dshp_notice', role: 'status', 'aria-live': 'polite' }, notices[card]) : null
      const copyButton = (key, card, value, label) => h('button', {
        type: 'button',
        className: 'dshp_button',
        'data-copy': key,
        disabled: !value,
        onClick: () => copyValue(key, card, value),
      }, icon('copy'), copiedKey === key ? '已复制' : label || '复制')

      if (!state.ready) {
        return h('div', { className: 'dshp_root' },
          h('header', { className: 'dshp_top' },
            h('div', { className: 'dshp_heading' },
              h('h2', { className: 'dshp_title' }, '连接手机'),
              h('p', { className: 'dshp_sub' }, '扫码后，在手机浏览器继续电脑上的会话'),
            ),
            h('span', { className: 'dshp_status' }, h('span', { className: 'dshp_dot' }), pollError ? '读取失败' : '启动中'),
          ),
          h('section', { className: 'dshp_loading', 'data-card': 'startup' },
            h('div', { className: 'dshp_skeleton' }),
            pollError
              ? h('div', { className: 'dshp_actions' },
                  h('p', { className: 'dshp_error', role: 'alert' }, '无法读取连接状态：' + pollError),
                  h('button', {
                    type: 'button',
                    className: 'dshp_button',
                    onClick: () => { if (typeof window !== 'undefined') window.location.reload() },
                  }, '重试'),
                )
              : h('p', { className: 'dshp_note' }, '正在等待手机桥接服务就绪…'),
          ),
        )
      }

      const lanUrls = Array.isArray(state.lanUrls) ? state.lanUrls.filter((url) => typeof url === 'string' && url.length > 0) : []
      const publicUrl = typeof state.publicUrl === 'string' && state.publicUrl.length > 0 ? state.publicUrl : ''
      const publicUrlConfigured = state.publicUrlConfigured === true || publicUrl.length > 0
      const tunnelUrl = typeof state.tunnelUrl === 'string' && state.tunnelUrl.length > 0 ? state.tunnelUrl : ''
      const publicAvailable = publicUrlConfigured || tunnelUrl.length > 0
      const pairingUrl = typeof state.pairingUrl === 'string' ? state.pairingUrl : ''
      const lanPairingUrl = lanUrls[0] || (!publicAvailable ? pairingUrl : '')
      const anywherePairingUrl = publicAvailable ? pairingUrl : ''
      const activePairingUrl = view === 'lan' ? lanPairingUrl : anywherePairingUrl
      const qrSvg = typeof state.qrSvg === 'string' ? state.qrSvg : ''
      const lanQrSvg = typeof state.lanQrSvg === 'string' ? state.lanQrSvg : ''
      const activeQrSvg = activePairingUrl ? (view === 'lan' ? lanQrSvg : qrSvg) : ''
      const pin = state.pairingPin ? String(state.pairingPin) : ''
      const pinFixed = state.pinConsent === true
      const pinDraftValue = draftPin === null ? (pinFixed && pin ? pin : '') : draftPin
      const pinDraftInvalid = pinDraftValue !== '' && !/^[0-9]{6}$/.test(pinDraftValue)
      const browserConnected = typeof state.browserConnected === 'boolean' ? state.browserConnected : state.connected === true
      const browserDevices = Array.isArray(state.browserDevices)
        ? state.browserDevices.filter((device) => device && typeof device.id === 'string' && Number.isFinite(device.pairedAt) && Number.isFinite(device.lastSeenAt))
        : []
      const activeDeviceCount = browserDevices.filter((device) => device.status === 'active').length
      const bridgePort = Number.isInteger(state.bridgePort) ? state.bridgePort : null
      const expectedPort = Number.isInteger(state.expectedPort) ? state.expectedPort : 43128
      const portMismatch = state.portMatchesTunnel === false || (bridgePort !== null && bridgePort !== expectedPort)
      const draftValue = draftUrl === null ? publicUrl : draftUrl
      const draftDirty = draftUrl !== null && draftUrl.trim() !== publicUrl
      const draftInvalid = draftValue !== '' && !/^https:\/\/[^/\s?#]+\.[^/\s?#]+$/.test(draftValue.trim())
      const certificate = state.certificate && typeof state.certificate === 'object' ? state.certificate : null
      const certificateExpired = certificate && typeof certificate.expiresAt === 'number' ? certificate.expiresAt <= (state.now || Date.now()) : false
      const certificateBusy = isBusy('certificate') || (certificate && certificate.pending === true)
      const tunnelBusy = isBusy('tunnel') || state.tunnelLoading === true
      const statusText = pollError
        ? '状态读取失败'
        : browserConnected
          ? `手机已连接 · ${activeDeviceCount} 个`
          : activePairingUrl
            ? '等待扫码'
            : view === 'anywhere' && !publicAvailable
              ? '待配置'
              : '未就绪'
      const providerLabel = state.tunnelProvider === 'cloudflare' ? 'Cloudflare' : state.tunnelProvider === 'pinggy' ? 'Pinggy' : '未开启'
      const modeButton = (id, label) => h('button', {
        type: 'button',
        className: 'dshp_mode',
        'data-mode': id,
        'aria-pressed': view === id ? 'true' : 'false',
        onClick: () => {
          setView(id)
          if (id === 'anywhere' && !publicAvailable) setAdvancedOpen(true)
        },
      }, label)

      const modeNote = view === 'lan'
        ? publicUrlConfigured
          ? '手机与电脑需在同一 Wi-Fi；已配置固定域名，扫码需要连接密码。'
          : '手机与电脑在同一 Wi-Fi 时直连，不需要连接密码。'
        : publicAvailable
          ? '手机不在同一 Wi-Fi 时使用，扫码后输入连接密码。'
          : '先配置固定域名或开启临时隧道，再用手机扫码。'

      const step = (number, label) => h('li', null,
        h('span', { className: 'dshp_stepNo' }, String(number)),
        label,
      )
      const steps = h('ol', { className: 'dshp_steps' },
        step(1, '手机相机扫码'),
        step(2, '打开链接'),
        step(3, view === 'lan' ? '继续会话' : '输入连接密码'),
      )

      const pinNote = publicAvailable
        ? h('p', { className: 'dshp_note' },
            pinFixed
              ? publicUrlConfigured
                ? '此密码同时用于同一 Wi-Fi 与任意网络配对。'
                : view === 'anywhere'
                  ? '扫码后需要输入这个密码。'
                  : '仅手动打开公网地址时需要；同一 Wi-Fi 扫码不需要密码。'
              : state.pinExpiresAt
                ? '临时密码，' + formatRemaining(state.pinExpiresAt, state.now) + '；设为固定后长期有效。'
                : '扫码进入不需要密码；手动打开公网地址时需要。')
        : null

      const pinEditor = pinEditing && publicAvailable
        ? h('div', { className: 'dshp_field' },
            h('span', { className: 'dshp_fieldLabel' }, '固定连接密码'),
            h('div', { className: 'dshp_fieldRow' },
              h('input', {
                className: 'dshp_input',
                'data-field': 'pairing-pin',
                type: 'text',
                inputMode: 'numeric',
                maxLength: 6,
                placeholder: '6 位数字，留空恢复随机密码',
                value: pinDraftValue,
                disabled: isBusy('pin'),
                'aria-label': '固定连接密码',
                'aria-invalid': pinDraftInvalid ? 'true' : 'false',
                onChange: (event) => setDraftPin(String((event && event.target && event.target.value) || '').replace(/[^0-9]/g, '')),
              }),
              h('button', {
                type: 'button',
                className: 'dshp_button dshp_primary',
                'data-action': 'save-pin',
                disabled: isBusy('pin') || pinDraftInvalid,
                onClick: async () => {
                  const saved = await perform('pin', 'connect', PIN_URL, { pin: pinDraftValue.trim() }, '保存连接密码失败',
                    (payload) => payload.pinConsent === true ? '连接密码已保存，立即生效。' : '已恢复随机密码。')
                  if (saved) {
                    setDraftPin(null)
                    setPinEditing(false)
                  }
                },
              }, isBusy('pin') ? '正在保存…' : '保存'),
            ),
            pinDraftInvalid ? h('p', { className: 'dshp_error' }, '连接密码必须是 6 位数字。') : null,
          )
        : null

      const pinRow = publicAvailable
        ? h('div', { className: 'dshp_row' },
            h('span', { className: 'dshp_label' }, '连接密码'),
            h('code', { className: 'dshp_pin', 'data-role': 'pin' }, pin || '------'),
            copyButton('pin', 'connect', pin, '复制密码'),
            h('button', {
              type: 'button',
              className: 'dshp_textButton',
              'data-action': 'edit-pin',
              onClick: () => setPinEditing((open) => !open),
            }, pinFixed ? (pinEditing ? '收起' : '修改') : '设为固定'),
          )
        : null

      const qrFrame = activeQrSvg
        ? h('div', { className: 'dshp_qr', dangerouslySetInnerHTML: { __html: activeQrSvg } })
        : h('div', { className: 'dshp_qr dshp_qrEmpty' },
            h('strong', null, view === 'lan' ? '未检测到局域网地址' : '暂无公网地址'),
            h('span', null, view === 'lan' ? '请确认电脑已连接 Wi-Fi 或网线。' : '配置固定域名或开启临时隧道后即可扫码。'),
            view === 'lan' ? null : h('button', {
              type: 'button',
              className: 'dshp_button',
              onClick: () => setAdvancedOpen(true),
            }, '去配置'),
          )

      const qrMeta = activeQrSvg
        ? h('div', { className: 'dshp_qrMeta' },
            h('span', null, state.expiresAt ? formatRemaining(state.expiresAt, state.now) : '5 分钟内有效'),
            h('button', {
              type: 'button',
              className: 'dshp_textButton',
              'data-action': 'rotate',
              disabled: isBusy('rotate'),
              onClick: () => perform('rotate', 'connect', ROTATE_URL, {}, '重新生成二维码失败', '二维码已重新生成。'),
            }, icon('refresh'), isBusy('rotate') ? '刷新中…' : '换一张'),
          )
        : null

      const connectBody = h('div', { className: 'dshp_body' },
        h('div', { className: 'dshp_scan' }, qrFrame, qrMeta),
        h('div', { className: 'dshp_fields' },
          activePairingUrl
            ? h('div', { className: 'dshp_row' },
                h('span', { className: 'dshp_label' }, view === 'lan' ? '局域网' : '公网'),
                h('code', { className: 'dshp_addr', title: activePairingUrl }, shortAddress(activePairingUrl)),
                copyButton('link', 'connect', activePairingUrl, '复制链接'),
              )
            : null,
          pinRow,
          pinNote,
          pinEditor,
          renderError('connect'),
          renderNotice('connect'),
        ),
      )

      const connectCard = h('section', { className: 'dshp_card', 'data-card': 'connect', 'aria-label': '连接方式' },
        h('div', { className: 'dshp_modes', role: 'group', 'aria-label': '连接方式' },
          modeButton('lan', '同一 Wi-Fi'),
          modeButton('anywhere', '任意网络'),
        ),
        h('p', { className: 'dshp_hint' }, modeNote),
        h('p', { className: 'dshp_lead' }, view === 'lan' ? '用手机相机扫码' : publicAvailable ? '用手机相机扫码进入' : '开启任意网络'),
        steps,
        connectBody,
      )

      const publicSection = h('section', { className: 'dshp_group', 'data-card': 'public' },
        h('h4', { className: 'dshp_groupTitle' }, '网络配置'),
        portMismatch ? h('p', { className: 'dshp_warn' }, '固定域名隧道按 ' + expectedPort + ' 端口转发，当前桥接端口' + (bridgePort === null ? '未知。' : '为 ' + bridgePort + '。')) : null,
        h('div', { className: 'dshp_field' },
          h('span', { className: 'dshp_fieldLabel' }, '固定域名'),
          h('div', { className: 'dshp_fieldRow' },
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
            h('button', {
              type: 'button',
              className: 'dshp_button dshp_primary',
              'data-action': 'save',
              disabled: isBusy('save') || !draftDirty || draftInvalid,
              onClick: async () => {
                const saved = await perform('save', 'public', SETTINGS_URL, { publicUrl: draftValue.trim() }, '保存失败',
                  (payload) => payload.publicUrl ? '固定公网域名已保存。' : '已清除固定域名。')
                if (saved) setDraftUrl(null)
              },
            }, isBusy('save') ? '保存中…' : '保存'),
          ),
          h('p', { className: 'dshp_note' }, '只接受 https:// 域名；留空保存即清除。'),
          draftInvalid ? h('p', { className: 'dshp_error' }, '请输入完整的 https:// 域名。') : null,
        ),
        h('div', { className: 'dshp_fieldRow' },
          h('button', {
            type: 'button',
            className: 'dshp_button',
            'data-action': 'test',
            disabled: isBusy('test') || !publicUrlConfigured || draftDirty || isBusy('save'),
            onClick: () => perform('test', 'public', PUBLIC_URL_TEST_URL, {}, '检测失败', (payload) => {
              const check = payload.lastPublicUrlCheck
              return check && check.reachable === true ? '域名检测通过' + (Number.isInteger(check.status) ? '（HTTP ' + check.status + '）' : '') + '。' : ''
            }),
          }, isBusy('test') ? '检测中…' : '检测连通性'),
          h('span', {
            className: 'dshp_state',
            'data-tone': state.lastPublicUrlCheck ? state.lastPublicUrlCheck.reachable === true ? 'ok' : 'bad' : undefined,
          }, state.lastPublicUrlCheck
            ? state.lastPublicUrlCheck.reachable === true ? '可访问' : '无法访问'
            : publicUrlConfigured ? '尚未检测' : '保存域名后可检测'),
        ),
        !publicUrlConfigured
          ? h('div', { className: 'dshp_field' },
              h('span', { className: 'dshp_fieldLabel' }, '临时隧道'),
              h('div', { className: 'dshp_fieldRow' },
                h('span', { className: 'dshp_state', 'data-tone': state.tunnelActive === true ? 'ok' : undefined },
                  state.tunnelActive === true ? providerLabel + ' 已开启' : '未开启'),
                state.tunnelActive !== true
                  ? h('button', {
                      type: 'button',
                      className: 'dshp_button',
                      'data-action': 'tunnel-enable',
                      disabled: tunnelBusy || browserConnected,
                      onClick: () => perform('tunnel', 'public', TUNNEL_URL, { enabled: true }, '开启临时隧道失败', '临时隧道已开启。'),
                    }, tunnelBusy ? '正在开启…' : '开启临时隧道')
                  : h('button', {
                      type: 'button',
                      className: 'dshp_button',
                      'data-action': 'tunnel-disable',
                      disabled: tunnelBusy || browserConnected,
                      onClick: () => perform('tunnel', 'public', TUNNEL_URL, { enabled: false }, '关闭临时隧道失败', '临时隧道已关闭。'),
                    }, tunnelBusy ? '正在关闭…' : '关闭临时隧道'),
                state.tunnelProvider === 'cloudflare' && !browserConnected
                  ? h('button', {
                      type: 'button',
                      className: 'dshp_textButton',
                      'data-action': 'tunnel-fallback',
                      disabled: isBusy('fallback') || browserConnected,
                      onClick: () => perform('fallback', 'public', TUNNEL_FALLBACK_URL, {}, '切换线路失败', '已切换到备用线路。'),
                    }, isBusy('fallback') ? '正在切换…' : '扫码打不开？换线路')
                  : null,
              ),
              h('p', { className: 'dshp_note' }, '地址每次开启都会变化，适合临时外出。'),
              state.tunnelLoading === true ? h('p', { className: 'dshp_note' }, '正在创建临时隧道…') : null,
              tunnelUrl ? h('code', { className: 'dshp_addr' }, tunnelUrl) : null,
            )
          : null,
        state.tunnelError ? h('p', { className: 'dshp_error', role: 'alert' }, '隧道错误：' + state.tunnelError) : null,
        publicUrlConfigured
          ? h('div', { className: 'dshp_field' },
              h('span', { className: 'dshp_fieldLabel' }, '证书'),
              h('div', { className: 'dshp_fieldRow' },
                h('span', {
                  className: 'dshp_state',
                  'data-tone': certificateExpired ? 'bad' : certificate && !certificate.pending ? 'ok' : undefined,
                }, !certificate ? '未申请' : certificateExpired ? '已过期' : certificate.selfSigned === true ? 'frpc 自签证书' : certificate.pending === true ? '申请中…' : typeof certificate.expiresAt === 'number' ? '有效至 ' + formatTime(certificate.expiresAt) : '未申请'),
                h('button', {
                  type: 'button',
                  className: 'dshp_button',
                  'data-action': 'issue-certificate',
                  disabled: certificateBusy,
                  onClick: () => perform('certificate', 'public', CERTIFICATE_URL, {}, '证书签发失败', '正在申请证书，稍后刷新查看结果。'),
                }, certificateBusy ? '处理中…' : certificateExpired ? '续期' : '申请证书'),
              ),
            )
          : null,
        publicUrlConfigured && certificate && typeof certificate.error === 'string' && certificate.error
          ? h('p', { className: 'dshp_error', role: 'alert' }, '证书错误：' + certificate.error)
          : null,
        renderError('public'),
        renderNotice('public'),
      )

      const helpSection = h('section', { className: 'dshp_group', 'data-card': 'help' },
        h('h4', { className: 'dshp_groupTitle' }, '如何连接'),
        h('ul', { className: 'dshp_help' },
          h('li', null, h('b', null, '同一 Wi-Fi'), '：手机相机扫码打开，二维码 5 分钟内有效，扫一次后作废。'),
          h('li', null, h('b', null, '任意网络'), '：先配置固定域名或开启临时隧道，再扫码并输入 6 位连接密码。'),
          h('li', null, h('b', null, '只用浏览器'), '：不装 App，不依赖中转账号；设置、插件和文件仍在电脑上。'),
        ),
      )

      const diagnosticsSection = h('section', { className: 'dshp_group', 'data-card': 'diagnostics' },
        h('h4', { className: 'dshp_groupTitle' }, '排障信息'),
        h('dl', { className: 'dshp_diag' },
          h('dt', null, '版本'), h('dd', null, state.version ? String(state.version) : '未知'),
          h('dt', null, '桥接端口'), h('dd', null, bridgePort === null ? '未知' : String(bridgePort)),
          h('dt', null, '隧道'), h('dd', null, providerLabel),
          h('dt', null, '连接状态'), h('dd', null, browserConnected ? '浏览器在线' : '无浏览器连接'),
        ),
        pollError ? h('p', { className: 'dshp_error' }, '状态轮询失败：' + pollError) : null,
      )

      const deviceStatusLabel = { active: '当前活跃', idle: '最近无活动', disconnected: '已断开' }
      const deviceCard = h('section', { className: 'dshp_card dshp_devices', 'data-card': 'devices' },
        h('button', {
          type: 'button',
          className: 'dshp_summary',
          'data-action': 'devices',
          'aria-expanded': devicesOpen ? 'true' : 'false',
          'aria-controls': 'dshp-device-list',
          onClick: () => setDevicesOpen((open) => !open),
        },
          h('span', null, '连接设备'),
          h('span', { className: 'dshp_summaryHint' }, browserDevices.length ? activeDeviceCount + ' 个活跃 · 共 ' + browserDevices.length + ' 个配对会话' : '本次运行暂无配对记录'),
          h('span', { className: 'dshp_chevron' }, icon('chevron')),
        ),
        devicesOpen ? h('div', { className: 'dshp_deviceBody', id: 'dshp-device-list' },
          h('p', { className: 'dshp_note' }, '仅显示本次插件运行期间的浏览器配对会话；不是完整历史设备库，也不代表物理设备数量。不同浏览器或隐私窗口会分别计数。'),
          browserDevices.length ? h('ul', { className: 'dshp_deviceList' }, browserDevices.map((device, index) => h('li', { className: 'dshp_deviceRow', 'data-device-status': device.status },
            h('span', { className: 'dshp_deviceIcon', 'aria-hidden': 'true' }, '▯'),
            h('div', { className: 'dshp_deviceCopy' },
              h('div', { className: 'dshp_deviceName' },
                h('strong', null, '浏览器会话 ' + String(index + 1).padStart(2, '0')),
                h('span', { className: 'dshp_deviceStatus', 'data-status': device.status }, deviceStatusLabel[device.status] || '状态未知'),
              ),
              h('span', { className: 'dshp_deviceMeta' }, formatDeviceTime(device.lastSeenAt, state.now) + ' · 配对于 ' + formatTime(device.pairedAt)),
            ),
            h('code', { className: 'dshp_deviceId', title: '不可逆会话标识，不是 Cookie' }, '#' + device.id),
          ))) : h('p', { className: 'dshp_deviceEmpty' }, '手机扫码配对后，会在这里显示连接记录。'),
          h('p', { className: 'dshp_note' }, '活跃表示最近 30 秒有请求；无活动不表示配对已失效。'),
        ) : null,
      )

      const advancedCard = h('section', { className: 'dshp_card dshp_advanced' },
        h('h3', { className: 'dshp_advHeading' },
          h('button', {
            type: 'button',
            className: 'dshp_summary',
            'aria-expanded': advancedOpen ? 'true' : 'false',
            onClick: () => setAdvancedOpen((open) => !open),
          },
            h('span', null, '高级设置'),
            h('span', { className: 'dshp_summaryHint' }, '网络 · 证书 · 帮助 · 排障'),
            h('span', { className: 'dshp_chevron' }, icon('chevron')),
          ),
        ),
        h('div', { className: 'dshp_advBody', hidden: advancedOpen ? undefined : true },
          publicSection,
          helpSection,
          diagnosticsSection,
        ),
      )

      return h('div', { className: 'dshp_root' },
        h('header', { className: 'dshp_top' },
          h('div', { className: 'dshp_heading' },
            h('h2', { className: 'dshp_title' }, '连接手机'),
            h('p', { className: 'dshp_sub' }, '扫码后，在手机浏览器继续电脑上的会话'),
          ),
          h('div', { className: 'dshp_statusWrap' },
            h('span', { className: 'dshp_status', 'data-online': browserConnected && !pollError ? 'true' : 'false', role: 'status' },
              h('span', { className: 'dshp_dot' }),
              statusText,
            ),
            browserConnected
              ? h('button', {
                  type: 'button',
                  className: 'dshp_disconnect',
                  'data-action': 'disconnect',
                  title: '断开只关闭手机页面，不影响电脑上的会话',
                  disabled: isBusy('disconnect'),
                  onClick: () => perform('disconnect', 'connect', DISCONNECT_URL, {}, '断开失败', '已断开手机页面。'),
                }, isBusy('disconnect') ? '断开中…' : '断开')
              : null,
          ),
        ),
        pollError ? h('p', { className: 'dshp_error', role: 'alert' }, '状态读取失败：' + pollError) : null,
        connectCard,
        deviceCard,
        advancedCard,
      )
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
