window.__ModuleLoader__.load({
  id: 'dsh-roam',
  factory(require) {
    const { createElement: h, useEffect, useState } = require('react')

    const STYLE_ID = 'dsh-roam/settings.css'
    const CSS = [
      '.dshp_root{--dshp-ink:#1f2430;--dshp-muted:#62666d;--dshp-line:#dfe3ea;--dshp-card:#fff;--dshp-surface:#f6f7f9;--dshp-accent:#3556d8;--dshp-accent-soft:#eef2ff;--dshp-danger:#c6353f;--dshp-danger-soft:#fff1f2;--dshp-success:#15803d;--dshp-warn:#a15c07;display:flex;flex-direction:column;gap:12px;width:100%;max-width:880px;min-width:0;color:var(--dsw-alias-label-primary,var(--dshp-ink));font-size:13px;line-height:20px}',
      '.dshp_top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}.dshp_heading{display:flex;flex-direction:column;gap:2px;min-width:0}.dshp_title{margin:0;font-size:16px;line-height:24px;font-weight:650;letter-spacing:-.01em}.dshp_sub{margin:0;color:var(--dshp-muted);font-size:12px;line-height:18px}',
      '.dshp_status{display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:2px 10px;border:1px solid var(--dshp-line);border-radius:999px;background:var(--dshp-card);color:var(--dshp-muted);font-size:11px;line-height:17px;white-space:nowrap}.dshp_status[data-online=true]{border-color:color-mix(in srgb,#16a34a 40%,var(--dshp-line));background:color-mix(in srgb,#16a34a 8%,var(--dshp-card));color:var(--dshp-success)}.dshp_dot{width:7px;height:7px;flex:none;border-radius:50%;background:#9aa4b2}.dshp_status[data-online=true] .dshp_dot{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.16)}',
      '.dshp_card{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;min-width:0;padding:16px;border:1px solid var(--dshp-line);border-radius:16px;background:var(--dshp-card)}.dshp_connect{border-color:color-mix(in srgb,var(--dshp-accent) 26%,var(--dshp-line))}',
      '.dshp_cardHead{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}.dshp_cardTitle{margin:0;font-size:14px;line-height:20px;font-weight:650}.dshp_tag{padding:1px 8px;border-radius:999px;background:var(--dshp-accent-soft);color:var(--dshp-accent);font-size:11px;line-height:17px;font-weight:650;white-space:nowrap}.dshp_tag[data-muted=true]{background:var(--dshp-surface);color:var(--dshp-muted)}',
      '.dshp_modes{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border-radius:12px;background:var(--dshp-surface)}.dshp_mode{min-height:38px;border:0;border-radius:9px;background:transparent;color:var(--dshp-muted);font:inherit;font-weight:650;cursor:pointer}.dshp_mode[aria-selected=true]{background:var(--dshp-card);color:var(--dshp-ink);box-shadow:0 1px 2px rgba(16,24,40,.1)}.dshp_mode:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:1px}',
      '.dshp_connectBody{display:grid;grid-template-columns:184px minmax(0,1fr);gap:18px;align-items:start}.dshp_qr{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:184px;height:184px;padding:10px;border:1px solid var(--dshp-line);border-radius:14px;background:#fff}.dshp_qr svg{display:block;width:100%;height:100%}.dshp_qrEmpty{flex-direction:column;gap:6px;padding:14px;border-style:dashed;background:var(--dshp-surface);color:var(--dshp-muted);font-size:12px;line-height:18px;text-align:center}',
      '.dshp_fields{display:flex;flex-direction:column;gap:10px;min-width:0}.dshp_lead{margin:0;font-size:15px;line-height:22px;font-weight:650}.dshp_note{margin:0;color:var(--dshp-muted);font-size:12px;line-height:18px;overflow-wrap:anywhere}.dshp_row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}.dshp_label{flex:0 0 auto;min-width:52px;color:var(--dshp-muted);font-size:11px;line-height:16px;font-weight:650}',
      '.dshp_addr{box-sizing:border-box;flex:1 1 180px;min-width:0;margin:0;padding:5px 9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:8px;background:var(--dshp-surface);font:12px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.dshp_pin{margin:0;flex:1;min-width:112px;font:22px/30px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:650;letter-spacing:.12em;white-space:nowrap}',
      '.dshp_button{box-sizing:border-box;min-height:34px;padding:0 12px;border:1px solid var(--dshp-line);border-radius:9px;background:var(--dshp-card);color:var(--dshp-ink);font:inherit;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer}.dshp_button:hover:not(:disabled){border-color:var(--dshp-accent);background:var(--dshp-accent-soft)}.dshp_button:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:1px}.dshp_button:disabled{opacity:.45;cursor:not-allowed}.dshp_primary{border-color:var(--dshp-accent);background:var(--dshp-accent);color:#fff}.dshp_primary:hover:not(:disabled){background:var(--dshp-accent);filter:brightness(.96)}.dshp_danger{border-color:color-mix(in srgb,var(--dshp-danger) 45%,var(--dshp-line));color:var(--dshp-danger)}',
      '.dshp_actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.dshp_error{margin:0;color:var(--dshp-danger);font-size:12px;line-height:18px;overflow-wrap:anywhere}.dshp_notice{margin:0;color:var(--dshp-success);font-size:12px;line-height:18px;overflow-wrap:anywhere}.dshp_warn{margin:0;padding:8px 10px;border-left:3px solid var(--dshp-warn);border-radius:8px;background:#fffbeb;color:#7c4a03;font-size:12px;line-height:18px}',
      '.dshp_banner{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:11px;background:color-mix(in srgb,#16a34a 8%,var(--dshp-card));border:1px solid color-mix(in srgb,#16a34a 28%,var(--dshp-line))}.dshp_bannerText{display:flex;flex-direction:column;gap:1px;min-width:0}.dshp_bannerText strong{color:var(--dshp-success);font-size:13px;line-height:19px}.dshp_bannerText span{color:var(--dshp-muted);font-size:11px;line-height:17px}',
      '.dshp_details{border-top:1px solid var(--dshp-line);padding-top:2px}.dshp_details>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;color:var(--dshp-muted);font-size:12px;font-weight:650;cursor:pointer;list-style:none}.dshp_details>summary::-webkit-details-marker{display:none}.dshp_details>summary::after{content:"▾";font-size:10px;transition:transform .15s ease}.dshp_details[open]>summary::after{transform:rotate(180deg)}.dshp_detailsBody{display:flex;flex-direction:column;gap:10px;padding:6px 0 2px}',
      '.dshp_field{display:flex;flex-direction:column;gap:5px;min-width:0}.dshp_field>span{color:var(--dshp-muted);font-size:11px;line-height:16px;font-weight:650}.dshp_input{box-sizing:border-box;width:100%;min-height:36px;padding:0 10px;border:1px solid var(--dshp-line);border-radius:9px;background:var(--dshp-card);color:var(--dshp-ink);font:12px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.dshp_input:focus{outline:none;border-color:var(--dshp-accent);box-shadow:0 0 0 3px var(--dshp-accent-soft)}',
      '.dshp_grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.7fr);gap:12px;align-items:start}.dshp_help{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;color:var(--dshp-muted);font-size:12px;line-height:18px}.dshp_help li{display:flex;gap:7px}.dshp_help b{color:var(--dshp-ink);font-weight:650}.dshp_diag{display:grid;grid-template-columns:96px minmax(0,1fr);gap:4px 10px;align-items:center}.dshp_diag dt{color:var(--dshp-muted);font-size:11px;line-height:16px}.dshp_diag dd{margin:0;font:11px/16px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}',
      '.dshp_loading{display:flex;flex-direction:column;gap:10px;padding:16px;border:1px solid var(--dshp-line);border-radius:16px;background:var(--dshp-card)}.dshp_skeleton{width:44%;height:10px;border-radius:5px;background:var(--dshp-line);opacity:.55}',
      '@media (max-width:700px){.dshp_grid{grid-template-columns:minmax(0,1fr)}}',
      '@media (max-width:520px){.dshp_root{gap:10px}.dshp_card{padding:13px;border-radius:14px}.dshp_connectBody{grid-template-columns:minmax(0,1fr);gap:12px;justify-items:center}.dshp_qr{width:156px;height:156px;padding:8px}.dshp_fields{width:100%}.dshp_row{align-items:stretch}.dshp_label{width:100%;min-width:0}.dshp_addr{flex-basis:100%}.dshp_button,.dshp_input{min-height:44px}.dshp_mode{min-height:44px}.dshp_pin{font-size:20px}.dshp_banner{align-items:flex-start;flex-direction:column}.dshp_top{flex-wrap:wrap}.dshp_status{order:2}}',
      '@media (prefers-reduced-motion:reduce){.dshp_details>summary::after{transition:none}}',
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
      }, copiedKey === key ? '已复制' : label || '复制')

      if (!state.ready) {
        return h('div', { className: 'dshp_root' },
          h('header', { className: 'dshp_top' },
            h('div', { className: 'dshp_heading' },
              h('h2', { className: 'dshp_title' }, '连接手机'),
              h('p', { className: 'dshp_sub' }, '用手机浏览器继续电脑上的会话'),
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
          ? '手机已连接'
          : activePairingUrl
            ? '等待扫码'
            : '未就绪'
      const providerLabel = state.tunnelProvider === 'cloudflare' ? 'Cloudflare' : state.tunnelProvider === 'pinggy' ? 'Pinggy' : '未开启'
      const modeButton = (id, label) => h('button', {
        type: 'button',
        className: 'dshp_mode',
        'data-mode': id,
        'aria-pressed': view === id ? 'true' : 'false',
        onClick: () => setView(id),
      }, label)

      const helpCard = h('details', { className: 'dshp_card', 'data-card': 'help' },
        h('summary', null, '如何连接'),
        h('ul', { className: 'dshp_help' },
          h('li', null, h('b', null, '同一 Wi-Fi'), '：手机相机扫码打开；二维码 5 分钟内有效，扫一次后作废。配置固定域名后，扫码也需要连接密码。'),
          h('li', null, h('b', null, '任意网络'), '：先开启临时隧道或配置固定域名，再用手机扫码并输入 6 位连接密码。'),
          h('li', null, h('b', null, '只连浏览器'), '：不安装 App，不依赖中转账号；设置、插件和文件仍留在电脑上。'),
        ),
      )

      const connectedBanner = browserConnected
        ? h('div', { className: 'dshp_banner', 'data-role': 'connected' },
            h('div', { className: 'dshp_bannerText' },
              h('strong', null, '手机已连接'),
              h('span', null, '断开只关闭手机页面，不影响电脑上的会话。'),
            ),
            h('button', {
              type: 'button',
              className: 'dshp_button dshp_danger',
              'data-action': 'disconnect',
              disabled: isBusy('disconnect'),
              onClick: () => perform('disconnect', 'connect', DISCONNECT_URL, {}, '断开失败', '已断开手机页面。'),
            }, isBusy('disconnect') ? '正在断开…' : '断开手机'),
          )
        : null

      const qrFrame = activeQrSvg
        ? h('div', { className: 'dshp_qr', dangerouslySetInnerHTML: { __html: activeQrSvg } })
        : h('div', { className: 'dshp_qr dshp_qrEmpty' },
            h('strong', null, view === 'lan' ? '暂无局域网地址' : '任意网络未开启'),
            h('span', null, view === 'lan' ? '请确认电脑已连接 Wi-Fi 或网线。' : '在下方配置固定域名或临时隧道。'),
          )

      const pinRow = publicAvailable
        ? h('div', { className: 'dshp_row' },
            h('span', { className: 'dshp_label' }, '连接密码'),
            h('code', { className: 'dshp_pin', 'data-role': 'pin' }, pin || '------'),
            copyButton('pin', 'connect', pin, '复制密码'),
            h('button', {
              type: 'button',
              className: 'dshp_button',
              'data-action': 'edit-pin',
              onClick: () => setPinEditing((open) => !open),
            }, pinFixed ? (pinEditing ? '收起' : '修改') : '设为固定'),
          )
        : null

      const pinNote = publicAvailable
        ? h('p', { className: 'dshp_note' },
            pinFixed
              ? publicUrlConfigured
                ? '配置固定域名后，同一 Wi-Fi 与任意网络配对都需要这个密码。'
                : '仅手动打开公网地址时需要；同一 Wi-Fi 扫码不需要密码。'
              : state.pinExpiresAt
                ? '临时密码，' + formatRemaining(state.pinExpiresAt, state.now) + '；设为固定后长期有效。'
                : '扫码进入不需要密码；手动打开公网地址时需要。')
        : null

      const pinEditor = pinEditing && publicAvailable
        ? h('div', { className: 'dshp_field' },
            h('span', null, '固定连接密码'),
            h('div', { className: 'dshp_actions' },
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

      const connectBody = h('div', { className: 'dshp_connectBody' },
        qrFrame,
        h('div', { className: 'dshp_fields' },
          h('p', { className: 'dshp_lead' }, view === 'lan' ? '用手机相机扫码' : publicAvailable ? '任意网络扫码进入' : '先开启任意网络'),
          h('p', { className: 'dshp_note' }, view === 'lan'
            ? publicUrlConfigured
              ? '配置固定域名后，所有配对都需要连接密码。'
              : '同一 Wi-Fi 直连，不需要连接密码。'
            : publicAvailable
              ? '手机不在同一 Wi-Fi 时使用；扫码后输入下方连接密码。'
              : '临时隧道地址每次开启都会变化；长期使用建议配置固定域名。'),
          activePairingUrl
            ? h('div', { className: 'dshp_row' },
                h('span', { className: 'dshp_label' }, view === 'lan' ? '局域网' : '公网'),
                h('code', { className: 'dshp_addr', title: activePairingUrl }, shortAddress(activePairingUrl)),
                copyButton('link', 'connect', activePairingUrl, '复制链接'),
              )
            : null,
          activePairingUrl
            ? h('div', { className: 'dshp_row' },
                h('span', { className: 'dshp_label' }, '二维码'),
                h('span', { className: 'dshp_note' }, state.expiresAt ? formatRemaining(state.expiresAt, state.now) : '5 分钟内有效'),
                h('button', {
                  type: 'button',
                  className: 'dshp_button',
                  'data-action': 'rotate',
                  disabled: isBusy('rotate'),
                  onClick: () => perform('rotate', 'connect', ROTATE_URL, {}, '重新生成二维码失败', '二维码已重新生成。'),
                }, isBusy('rotate') ? '正在生成…' : '换一张'),
              )
            : null,
          pinRow,
          pinNote,
          pinEditor,
          connectedBanner,
          renderError('connect'),
          renderNotice('connect'),
        ),
      )

      const statusCard = h('section', { className: 'dshp_card dshp_connect', 'data-card': 'connect' },
        h('div', { className: 'dshp_cardHead' },
          h('h3', { className: 'dshp_cardTitle' }, '手机浏览器'),
          h('span', { className: 'dshp_tag', 'data-muted': browserConnected ? 'false' : 'true' }, browserConnected ? '已连接' : '等待连接'),
        ),
        pollError ? h('p', { className: 'dshp_error', role: 'alert' }, '状态读取失败：' + pollError) : null,
        h('div', { className: 'dshp_modes', role: 'group', 'aria-label': '连接方式' },
          modeButton('lan', '同一 Wi-Fi'),
          modeButton('anywhere', '任意网络'),
        ),
        connectBody,
      )

      const publicCard = h('section', { className: 'dshp_card', 'data-card': 'public' },
        h('div', { className: 'dshp_cardHead' },
          h('h3', { className: 'dshp_cardTitle' }, '任意网络设置'),
          h('span', { className: 'dshp_tag', 'data-muted': publicAvailable ? 'false' : 'true' },
            publicUrlConfigured ? '固定域名' : state.tunnelActive === true ? '临时隧道' : '未开启'),
        ),
        portMismatch ? h('p', { className: 'dshp_warn' }, '固定域名隧道按 ' + expectedPort + ' 端口转发，当前桥接端口' + (bridgePort === null ? '未知。' : '为 ' + bridgePort + '。')) : null,
        h('div', { className: 'dshp_field' },
          h('span', null, '固定域名'),
          h('div', { className: 'dshp_actions' },
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
        h('div', { className: 'dshp_actions' },
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
          h('span', { className: 'dshp_note' },
            state.lastPublicUrlCheck
              ? state.lastPublicUrlCheck.reachable === true ? '上次检测：可访问' : '上次检测：无法访问'
              : publicUrlConfigured ? '尚未检测' : '保存域名后可检测'),
        ),
        !publicUrlConfigured
          ? h('div', { className: 'dshp_actions' },
              state.tunnelActive !== true
                ? h('button', {
                    type: 'button',
                    className: 'dshp_button dshp_primary',
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
                    className: 'dshp_button',
                    'data-action': 'tunnel-fallback',
                    disabled: isBusy('fallback') || browserConnected,
                    onClick: () => perform('fallback', 'public', TUNNEL_FALLBACK_URL, {}, '切换线路失败', '已切换到备用线路。'),
                  }, isBusy('fallback') ? '正在切换…' : '扫码打不开？换线路')
                : null,
            )
          : null,
        state.tunnelLoading === true ? h('p', { className: 'dshp_note' }, '正在创建临时隧道…') : null,
        tunnelUrl ? h('p', { className: 'dshp_note' }, '临时隧道：' + tunnelUrl) : null,
        state.tunnelError ? h('p', { className: 'dshp_error', role: 'alert' }, '隧道错误：' + state.tunnelError) : null,
        publicUrlConfigured
          ? h('div', { className: 'dshp_row' },
              h('span', { className: 'dshp_label' }, '证书'),
              h('span', { className: 'dshp_note' },
                !certificate ? '未申请' : certificateExpired ? '已过期' : certificate.selfSigned === true ? 'frpc 自签证书' : typeof certificate.expiresAt === 'number' ? '有效至 ' + formatTime(certificate.expiresAt) : '未申请'),
              h('button', {
                type: 'button',
                className: 'dshp_button',
                'data-action': 'issue-certificate',
                disabled: certificateBusy,
                onClick: () => perform('certificate', 'public', CERTIFICATE_URL, {}, '证书签发失败', '正在申请证书，稍后刷新查看结果。'),
              }, certificateBusy ? '处理中…' : certificateExpired ? '续期' : '申请证书'),
            )
          : null,
        publicUrlConfigured && certificate && typeof certificate.error === 'string' && certificate.error
          ? h('p', { className: 'dshp_error', role: 'alert' }, '证书错误：' + certificate.error)
          : null,
        renderError('public'),
        renderNotice('public'),
      )

      const diagnostics = h('details', { className: 'dshp_card', 'data-card': 'diagnostics' },
        h('summary', null, '排障信息'),
        h('dl', { className: 'dshp_diag' },
          h('dt', null, '版本'), h('dd', null, state.version ? String(state.version) : '未知'),
          h('dt', null, '桥接端口'), h('dd', null, bridgePort === null ? '未知' : String(bridgePort)),
          h('dt', null, '隧道'), h('dd', null, providerLabel),
          h('dt', null, '连接状态'), h('dd', null, browserConnected ? '浏览器在线' : '无浏览器连接'),
        ),
        pollError ? h('p', { className: 'dshp_error' }, '状态轮询失败：' + pollError) : null,
      )

      return h('div', { className: 'dshp_root' },
        h('header', { className: 'dshp_top' },
          h('div', { className: 'dshp_heading' },
            h('h2', { className: 'dshp_title' }, '连接手机'),
            h('p', { className: 'dshp_sub' }, '扫码后，在手机浏览器继续电脑上的会话'),
          ),
          h('span', { className: 'dshp_status', 'data-online': browserConnected ? 'true' : 'false', role: 'status' },
            h('span', { className: 'dshp_dot' }),
            statusText,
          ),
        ),
        statusCard,
        h('div', { className: 'dshp_grid' }, publicCard, helpCard),
        diagnostics,
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
