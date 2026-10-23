window.__ModuleLoader__.load({
  id: 'dsh-roam',
  factory(require) {
    const { createElement: h, useEffect, useState } = require('react')

    const STYLE_ID = 'dsh-roam/settings.css'
    const CSS = [
      '.dshp_root{--dshp-accent:#4f7cff;--dshp-accent-soft:rgba(79,124,255,.10);--dshp-danger:#e5484d;--dshp-success:#15803d;--dshp-warn:#b45309;display:flex;flex-direction:column;gap:12px;width:100%;max-width:960px;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
      '@supports (color: color-mix(in srgb, red, blue)){.dshp_root{--dshp-accent-soft:color-mix(in srgb, #4f7cff 12%, transparent);--dshp-success:color-mix(in srgb, var(--dsw-alias-label-primary) 30%, #16a34a)}}',
      '.dshp_top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;min-height:32px}',
      '.dshp_titleRow{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dshp_title{margin:0;font-size:15px;line-height:22px;font-weight:650;letter-spacing:-.01em}',
      '.dshp_card{box-sizing:border-box;display:flex;flex-direction:column;gap:10px;min-width:0;padding:14px 16px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:14px;background:var(--dsw-alias-settings-card-fill)}',
      '.dshp_connect{padding:14px 16px;gap:12px;border-color:color-mix(in srgb, var(--dshp-accent) 26%, var(--dsw-alias-settings-card-stroke))}',
      '.dshp_cardHead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}',
      '.dshp_cardTitle{margin:0;font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dshp_tag{padding:1px 8px;border-radius:999px;background:var(--dshp-accent-soft);color:var(--dshp-accent);font-size:11px;line-height:17px;font-weight:600;white-space:nowrap}',
      '.dshp_tagMuted{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);color:var(--dsw-alias-label-secondary)}',
      '.dshp_pill{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:999px;background:var(--dsw-alias-settings-card-fill);font-size:11px;line-height:17px;white-space:nowrap}',
      '.dshp_pillConnected{color:var(--dshp-success);border-color:color-mix(in srgb, #16a34a 40%, var(--dsw-alias-settings-card-stroke));background:color-mix(in srgb, #16a34a 8%, var(--dsw-alias-settings-card-fill))}',
      '.dshp_dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary);flex:0 0 auto}',
      '.dshp_pillConnected .dshp_dot{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.16)}',
      '.dshp_help{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px;cursor:pointer;white-space:nowrap}',
      '.dshp_help:hover,.dshp_help:focus-visible{border-color:var(--dshp-accent);color:var(--dshp-accent);outline:none}',
      '.dshp_helpBubble{position:fixed;z-index:2147483000;box-sizing:border-box;max-width:360px;padding:10px 12px;border:1px solid color-mix(in srgb, #4f7cff 25%, var(--dsw-alias-settings-card-stroke, #d6deee));border-radius:10px;background:color-mix(in srgb, #4f7cff 8%, var(--dsw-alias-settings-card-fill, #ffffff));color:var(--dsw-alias-label-primary, #1f2430);font-size:12.5px;line-height:19px;white-space:pre-line;text-align:left;box-shadow:0 12px 30px rgba(79,124,255,.18),0 2px 6px rgba(15,23,42,.08);pointer-events:none}',
      '.dshp_tabs{display:flex;gap:2px;padding:2px;border-radius:9px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);align-self:flex-start}',
      '.dshp_tab{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 11px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:600;cursor:pointer}',
      '.dshp_tab:hover{color:var(--dsw-alias-label-primary)}',
      '.dshp_tab:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:1px}',
      '.dshp_tabActive{background:var(--dsw-alias-settings-card-fill);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(16,24,40,.08)}',
      '.dshp_tabCount{min-width:16px;padding:0 4px;border-radius:999px;background:var(--dshp-accent-soft);color:var(--dshp-accent);font-size:10px;line-height:14px;text-align:center}',
      '.dshp_connectBody{display:grid;grid-template-columns:176px minmax(0,1fr);gap:16px;align-items:start}',
      '.dshp_qr{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:176px;height:176px;padding:8px;overflow:hidden;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:12px;background:#fff}',
      '.dshp_qr svg{display:block;width:100%;height:100%}',
      '.dshp_qrLocked{flex-direction:column;gap:6px;border-style:dashed;background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;text-align:center}',
      '.dshp_fields{display:flex;flex-direction:column;gap:8px;min-width:0}',
      '.dshp_row{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dshp_label{flex:0 0 auto;min-width:52px;font-size:11px;line-height:16px;font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dshp_addr{box-sizing:border-box;flex:1;min-width:0;margin:0;padding:4px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:7px;background:color-mix(in srgb, var(--dshp-accent) 6%, var(--dsw-alias-settings-card-fill));font:12px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dshp_addrFull{display:inline}.dshp_addrShort{display:none}',
      '.dshp_pin{margin:0;flex:1;min-width:0;font:20px/28px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;letter-spacing:.12em;white-space:nowrap}',
      '.dshp_note{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;min-width:0}',
      '.dshp_error{margin:0;font-size:11px;line-height:16px;color:var(--dshp-danger);overflow-wrap:anywhere;min-width:0}',
      '.dshp_notice{margin:0;font-size:11px;line-height:16px;font-weight:600;color:var(--dshp-success);overflow-wrap:anywhere;min-width:0}',
      '.dshp_warn{margin:0;padding:7px 9px;border-left:3px solid var(--dshp-danger);border-radius:6px;background:rgba(229,72,77,.08);font-size:11px;line-height:16px;overflow-wrap:anywhere;min-width:0}',
      '.dshp_button{box-sizing:border-box;height:30px;min-height:30px;padding:0 11px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:8px;background:var(--dsw-alias-settings-card-fill);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer;transition:border-color .15s ease,background .15s ease,color .15s ease}',
      '.dshp_button:hover:not(:disabled){border-color:var(--dshp-accent);background:var(--dshp-accent-soft)}',
      '.dshp_button:focus-visible{outline:2px solid var(--dshp-accent);outline-offset:1px}',
      '.dshp_button:disabled{opacity:.45;cursor:not-allowed}',
      '.dshp_primary{border-color:var(--dshp-accent);background:var(--dshp-accent);color:#fff;font-weight:600}',
      '.dshp_primary:hover:not(:disabled){background:var(--dshp-accent);filter:brightness(.95)}',
      '.dshp_button.dshp_success{color:var(--dshp-success);border-color:color-mix(in srgb, #16a34a 45%, var(--dsw-alias-settings-card-stroke))}',
      '.dshp_linkButton{height:24px;min-height:24px;padding:0;border:0;background:transparent;color:var(--dshp-accent);font-size:11px;line-height:16px;font-weight:600;cursor:pointer}',
      '.dshp_linkButton:hover{text-decoration:underline}',
      '.dshp_linkButton:disabled{color:var(--dsw-alias-label-secondary);text-decoration:none;cursor:not-allowed}',
      '.dshp_danger{color:var(--dshp-danger);border-color:color-mix(in srgb, #e5484d 45%, var(--dsw-alias-settings-card-stroke))}',
      '.dshp_successText{color:var(--dshp-success)}',
      '.dshp_dangerText{color:var(--dshp-danger)}',
      '.dshp_warnText{color:var(--dshp-warn)}',
      '.dshp_actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
      '.dshp_grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(250px,.9fr);gap:12px;align-items:start}',
      '.dshp_field{display:flex;flex-direction:column;gap:5px;min-width:0}',
      '.dshp_formRow{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
      '.dshp_input{box-sizing:border-box;flex:1 1 200px;min-width:0;height:30px;padding:0 9px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:8px;background:var(--dsw-alias-settings-card-fill);color:var(--dsw-alias-label-primary);font:12px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dshp_input:focus-visible{outline:none;border-color:var(--dshp-accent);box-shadow:0 0 0 3px var(--dshp-accent-soft)}',
      '.dshp_input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dshp_list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;min-width:0}',
      '.dshp_deviceItem{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:9px;min-width:0}',
      '.dshp_deviceMain{display:flex;flex:1;flex-direction:column;gap:1px;min-width:0}',
      '.dshp_deviceName{display:flex;align-items:center;gap:6px;min-width:0;font-size:12px;line-height:18px;font-weight:600}',
      '.dshp_deviceName span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshp_deviceDot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#9aa4b2}',
      '.dshp_deviceDotOnline{background:#22c55e}',
      '.dshp_deviceMeta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dshp_diag{box-sizing:border-box;padding:0;border:0;border-top:1px solid var(--dsw-alias-settings-card-stroke);border-radius:0;background:transparent}',
      '.dshp_diagSummary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px;padding:2px 2px 0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);cursor:pointer;list-style:none}',
      '.dshp_diagSummary::-webkit-details-marker{display:none}',
      '.dshp_diagSummary::after{content:"▾";font-size:10px;transition:transform .15s ease}',
      '.dshp_diag[open] .dshp_diagSummary::after{transform:rotate(180deg)}',
      '.dshp_diagText{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshp_diagBody{display:grid;grid-template-columns:104px minmax(0,1fr);gap:4px 10px;padding:8px 2px 10px;align-items:center}',
      '.dshp_diagLabel{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dshp_diagValue{margin:0;overflow-wrap:anywhere;font:11px/16px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.dshp_link{font-size:11px;line-height:16px;color:var(--dshp-accent);text-decoration:none}',
      '.dshp_link:hover{text-decoration:underline}',
      '.dshp_skeleton{min-height:72px;justify-content:center}',
      '.dshp_skeletonLine{width:44%;height:10px;border-radius:5px;background:var(--dsw-alias-settings-card-stroke);opacity:.55}',
      '@media (max-width:760px){.dshp_grid{grid-template-columns:minmax(0,1fr)}}',
      '@media (max-width:520px){.dshp_root{gap:10px}.dshp_card{padding:12px 14px}.dshp_connectBody{grid-template-columns:136px minmax(0,1fr);gap:12px}.dshp_qr{width:136px;height:136px;padding:6px}.dshp_row{flex-wrap:wrap}.dshp_rowAddr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;align-items:center}.dshp_rowAddr>.dshp_label{grid-column:1;grid-row:1;min-width:0}.dshp_rowAddr>.dshp_addr{grid-column:1/-1;grid-row:2}.dshp_addrFull{display:none}.dshp_addrShort{display:inline}.dshp_rowAddr>.dshp_button{grid-column:2;grid-row:1;justify-self:end}.dshp_rowPin{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:4px 6px;align-items:center}.dshp_rowPin>.dshp_label{grid-column:1;grid-row:1;min-width:0}.dshp_rowPin>.dshp_pin{grid-column:1/-1;grid-row:2;font-size:18px}.dshp_rowPin>.dshp_button{grid-row:1;padding:0 8px;font-size:11px}.dshp_rowPin>.dshp_button:nth-of-type(1){grid-column:2}.dshp_rowPin>.dshp_button:nth-of-type(2){grid-column:3}.dshp_diagBody{grid-template-columns:minmax(0,1fr)}}',
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
    /** The panel is single-instance: request sequencing keeps an older poll from overwriting a newer state. */
    let latestStateRequest = 0

    const HELP_TEXT = [
      '局域网直连：同一 Wi-Fi，不经过公网，无需密码。',
      '公网入口：任意网络，需要固定域名或临时隧道，并输入连接密码。',
      '连接密码：浏览器和 AI-HUB 共用。6 位数字长期有效，留空恢复 5 分钟随机密码；修改后已连接的浏览器需要重新输入，已配对的 AI-HUB 设备不受影响。',
      'AI-HUB：局域网扫码即可配对；公网填同一域名，协议选 https，配对码填连接密码。App 配对需要固定密码。',
      'App 在线：绿点表示 AI-HUB 事件流正在连接。断开手机网页只断开浏览器，移除设备才吊销 App 凭据。',
    ].join('\n')

    function snapshotFingerprint(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return ''
      const { now, ...rest } = snapshot
      return JSON.stringify({ ...rest, minute: typeof now === 'number' ? Math.floor(now / 60000) : null })
    }

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
      const width = Math.max(200, Math.min(360, window.innerWidth - 24))
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
      browserConnected: null,
      onlineDeviceCount: null,
      pinExpiresAt: null,
      expiresAt: null,
      publicUrl: null,
      publicUrlConfigured: false,
      mode: 'lan',
      bridgePort: null,
      expectedPort: 43128,
      portMatchesTunnel: true,
      lastPublicUrlCheck: null,
      devices: [],
      certificate: null,
      aihubQrSvg: null,
      aihubLanUrls: [],
      aihubPairingExpiresAt: null,
      aihubAvailable: null,
      aihubError: null,
      version: null,
      now: null,
    }
    const PROVIDER_LABELS = { cloudflare: 'Cloudflare', pinggy: 'Pinggy' }

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

    function formatRemaining(value, now) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      const remaining = Math.max(0, Math.ceil((value - (typeof now === 'number' ? now : Date.now())) / 60000))
      return remaining > 0 ? '约 ' + remaining + ' 分钟后失效' : '已失效，正在刷新'
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
      const [pollError, setPollError] = useState('')
      const [tab, setTab] = useState('browser')
      const [pinEditing, setPinEditing] = useState(false)
      const [confirmDeviceId, setConfirmDeviceId] = useState('')

      useEffect(() => {
        let alive = true
        const load = async () => {
          const request = ++latestStateRequest
          try {
            const response = await fetch(STATE_URL, { cache: 'no-store', credentials: 'same-origin' })
            if (!alive || request !== latestStateRequest) return
            if (response.ok === false) {
              setPollError('HTTP ' + (response.status || '?'))
              return
            }
            const payload = await response.json()
            if (!alive || request !== latestStateRequest) return
            setPollError('')
            // Replace the whole snapshot: rendering only what the server sent keeps new fields from being dropped.
            setState((current) => (snapshotFingerprint(current) === snapshotFingerprint(payload) ? current : { ...IDLE, ...payload }))
          } catch (cause) {
            if (!alive || request !== latestStateRequest) return
            setPollError(cause instanceof Error ? cause.message : String(cause))
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
        latestStateRequest += 1
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
        setTimeout(() => {
          setCopiedKey((current) => (current === key ? '' : current))
        }, 2000)
      }

      const renderError = (card) => {
        const message = errors[card]
        return message ? h('p', { className: 'dshp_error', role: 'alert' }, message) : null
      }

      const renderNotice = (card) => {
        const message = notices[card]
        return message ? h('p', { className: 'dshp_notice', role: 'status', 'aria-live': 'polite' }, message) : null
      }

      const copyButton = (key, card, value, label) =>
        h(
          'button',
          {
            type: 'button',
            className: 'dshp_button' + (copiedKey === key ? ' dshp_success' : ''),
            'data-copy': key,
            disabled: !value,
            onClick: () => copyValue(key, card, value),
          },
          copiedKey === key ? '已复制' : label || '复制',
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
              { className: 'dshp_cardHead' },
              h('h2', { className: 'dshp_title' }, '连接手机'),
              h('span', { className: 'dshp_pill' }, h('span', { className: 'dshp_dot' }), '启动中'),
            ),
            h('div', { className: 'dshp_skeletonLine' }),
            h('p', { className: 'dshp_note' }, '还在启动：正在等待手机桥接服务就绪…'),
          ),
        )
      }

      try {
        const lanUrls = Array.isArray(state.lanUrls) ? state.lanUrls.filter((url) => typeof url === 'string' && url.length > 0) : []
        const aihubLanUrls = Array.isArray(state.aihubLanUrls)
          ? state.aihubLanUrls.filter((url) => typeof url === 'string' && url.length > 0)
          : []
        const publicUrl = typeof state.publicUrl === 'string' && state.publicUrl.length > 0 ? state.publicUrl : ''
        const publicUrlConfigured = state.publicUrlConfigured === true || publicUrl.length > 0
        const publicUrlHost = (() => {
          try {
            return publicUrl ? new URL(publicUrl).hostname.toLowerCase() : ''
          } catch {
            return ''
          }
        })()
        const tunnelUrl = typeof state.tunnelUrl === 'string' && state.tunnelUrl.length > 0 ? state.tunnelUrl : ''
        const pairingUrl = typeof state.pairingUrl === 'string' && state.pairingUrl.length > 0 ? state.pairingUrl : ''
        const publicAvailable = publicUrlConfigured || tunnelUrl.length > 0
        const qrSvg = typeof state.qrSvg === 'string' ? state.qrSvg : ''
        const aihubQrSvg = typeof state.aihubQrSvg === 'string' && state.aihubQrSvg.length > 0 ? state.aihubQrSvg : ''
        const aihubPairingExpiresAt =
          typeof state.aihubPairingExpiresAt === 'number' && Number.isFinite(state.aihubPairingExpiresAt)
            ? state.aihubPairingExpiresAt
            : null
        const aihubAvailable = state.aihubAvailable !== false
        const accessUrl = publicUrl || tunnelUrl || pairingUrl || lanUrls[0] || ''
        const accessLabel = publicUrlConfigured ? '固定公网地址' : tunnelUrl ? '临时隧道地址' : '局域网地址'
        const pin = state.pairingPin ? String(state.pairingPin) : ''
        const pinFixed = state.pinConsent === true
        const lastCheck = state.lastPublicUrlCheck && typeof state.lastPublicUrlCheck === 'object' ? state.lastPublicUrlCheck : null
        const certificate = state.certificate && typeof state.certificate === 'object' ? state.certificate : null
        const panelClock = typeof state.now === 'number' && Number.isFinite(state.now) ? state.now : Date.now()
        const certificateExpired =
          certificate && typeof certificate.expiresAt === 'number' ? certificate.expiresAt <= panelClock : false
        const bridgePort = Number.isInteger(state.bridgePort) ? state.bridgePort : null
        const expectedPort = Number.isInteger(state.expectedPort) ? state.expectedPort : 43128
        const portMismatch = state.portMatchesTunnel === false || (bridgePort !== null && bridgePort !== expectedPort)
        const providerLabel = state.tunnelProvider ? PROVIDER_LABELS[state.tunnelProvider] ?? String(state.tunnelProvider) : '未开启'
        const shortAddress = (value) => {
          try {
            return new URL(value).host || value
          } catch {
            return value
          }
        }
        const draftValue = draftUrl === null ? publicUrl : draftUrl
        const draftDirty = draftUrl !== null && draftUrl.trim() !== publicUrl
        const deviceList = Array.isArray(state.devices) ? state.devices : []
        const deviceOnlineCount = deviceList.filter((device) => device.online === true).length
        const onlineDeviceCount = Number.isInteger(state.onlineDeviceCount)
          ? Math.min(Math.max(state.onlineDeviceCount, deviceOnlineCount), deviceList.length)
          : deviceOnlineCount
        const browserConnected =
          typeof state.browserConnected === 'boolean' ? state.browserConnected : state.connected === true
        const hasPhoneConnection = browserConnected || onlineDeviceCount > 0
        const fasterLanUrl = publicAvailable ? lanUrls[0] ?? '' : ''
        const otherLanUrls = lanUrls.slice(fasterLanUrl ? 1 : 1)
        const pinDraftValue = draftPin === null ? (pinFixed && pin ? pin : '') : draftPin
        const pinDraftInvalid = pinDraftValue !== '' && !/^[0-9]{6}$/.test(pinDraftValue)
        const pinEditorOpen = pinEditing
        const saveDisabled = isBusy('save')
        const testDisabled = isBusy('test')
        const rotateDisabled = isBusy('rotate')
        const disconnectDisabled = isBusy('disconnect')
        const tunnelBusy = isBusy('tunnel') || state.tunnelLoading === true
        const tunnelLocked = browserConnected
        const tunnelLockReason = '先断开手机网页，再切换连接方式。'
        const tunnelDisabled = tunnelBusy || tunnelLocked
        const fallbackDisabled = isBusy('fallback') || tunnelLocked
        const certificateBusy = isBusy('certificate') || (certificate && certificate.pending === true)
        const certificateRenewable = Boolean(
          certificate && typeof certificate.expiresAt === 'number' && certificate.selfSigned !== true,
        )
        const statusText = browserConnected && onlineDeviceCount > 0
          ? '浏览器已连接 · App 在线 ' + onlineDeviceCount
          : browserConnected
            ? '浏览器已连接'
            : onlineDeviceCount > 0
              ? 'App 在线 ' + onlineDeviceCount
              : '等待连接'

        const helpButton = h(
          'button',
          {
            type: 'button',
            className: 'dshp_help',
            'data-action': 'help',
            'aria-label': '连接说明',
            onMouseEnter: (event) => showHelpBubble(event, HELP_TEXT),
            onMouseLeave: hideHelpBubble,
            onFocus: (event) => showHelpBubble(event, HELP_TEXT),
            onBlur: hideHelpBubble,
            onClick: (event) => showHelpBubble(event, HELP_TEXT),
          },
          '连接说明 ?',
        )

        const top = h(
          'div',
          { className: 'dshp_top', 'data-card': 'header' },
          h(
            'div',
            { className: 'dshp_titleRow' },
            h('h2', { className: 'dshp_title' }, '连接手机'),
            h(
              'span',
              { className: 'dshp_pill' + (hasPhoneConnection ? ' dshp_pillConnected' : '') },
              h('span', { className: 'dshp_dot' }),
              statusText,
            ),
          ),
          helpButton,
        )

        const tabButton = (id, label, count) =>
          h(
            'button',
            {
              type: 'button',
              className: 'dshp_tab' + (tab === id ? ' dshp_tabActive' : ''),
              'data-tab': id,
              role: 'tab',
              'aria-selected': tab === id ? 'true' : 'false',
              onClick: () => setTab(id),
            },
            label,
            typeof count === 'number' && count > 0 ? h('span', { className: 'dshp_tabCount' }, String(count)) : null,
          )

        const pinRow = h(
          'div',
          { className: 'dshp_row dshp_rowPin' },
          h('span', { className: 'dshp_label' }, '连接密码'),
          h('code', { className: 'dshp_pin', 'data-role': 'pin' }, pin || '------'),
          copyButton('pin', 'connect', pin),
          h(
            'button',
            {
              type: 'button',
              className: 'dshp_button',
              'data-action': 'edit-pin',
              onClick: () => setPinEditing((open) => !open),
            },
            pinFixed ? (pinEditing ? '收起' : '修改') : '设为固定',
          ),
        )

        const pinNote = !pinFixed && state.pinExpiresAt
          ? h('p', { className: 'dshp_note' }, '临时密码，' + formatRemaining(state.pinExpiresAt, state.now))
          : h(
              'p',
              { className: 'dshp_note' },
              pinFixed ? '浏览器和 AI-HUB 共用这个密码。' : '未设固定密码：浏览器用 5 分钟随机密码，AI-HUB 配对需要固定密码。',
            )

        const pinEditor = h(
          'div',
          { className: 'dshp_field' },
          h(
            'div',
            { className: 'dshp_formRow' },
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
              'aria-describedby': pinDraftInvalid ? 'dshp-pin-error' : undefined,
              onChange: (event) =>
                setDraftPin(String((event && event.target && event.target.value) || '').replace(/[^0-9]/g, '')),
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dshp_button',
                'data-action': 'save-pin',
                disabled: isBusy('pin') || pinDraftInvalid,
                onClick: async () => {
                  const saved = await perform(
                    'pin',
                    'connect',
                    PIN_URL,
                    { pin: pinDraftValue.trim() },
                    '保存连接密码失败',
                    (payload) => (payload.pinConsent === true ? '连接密码已保存，立即生效。' : '已恢复 5 分钟随机密码。'),
                  )
                  if (saved) {
                    setDraftPin(null)
                    setPinEditing(false)
                  }
                },
              },
              isBusy('pin') ? '正在保存…' : '保存密码',
            ),
          ),
          pinDraftInvalid
            ? h('p', { className: 'dshp_error', id: 'dshp-pin-error', role: 'alert' }, '连接密码必须是 6 位数字。')
            : null,
        )

        const qrFrame = (svg, locked, unavailable) =>
          unavailable
            ? h(
                'div',
                { className: 'dshp_qr dshp_qrLocked' },
                h('strong', null, 'AI-HUB 不可用'),
                h('span', null, state.aihubError ? String(state.aihubError) : '移动 API 未就绪'),
              )
            : locked
              ? h(
                  'div',
                  { className: 'dshp_qr dshp_qrLocked' },
                  h('strong', null, '需要固定密码'),
                  h('span', null, '先在下方设置 6 位数字'),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshp_button',
                      'data-action': 'edit-pin',
                      onClick: () => setPinEditing(true),
                    },
                    '设置密码',
                  ),
                )
              : svg
                ? h('div', { className: 'dshp_qr', dangerouslySetInnerHTML: { __html: svg } })
                : h('div', { className: 'dshp_qr dshp_qrLocked' }, h('span', null, '二维码生成中'))

        const browserBody = h(
          'div',
          { className: 'dshp_connectBody', 'data-tab-panel': 'browser' },
          qrFrame(qrSvg, false),
          h(
            'div',
            { className: 'dshp_fields' },
            h(
              'div',
              { className: 'dshp_row dshp_rowAddr' },
              h('span', { className: 'dshp_label' }, accessLabel),
              h(
                'code',
                { className: 'dshp_addr', 'data-role': 'access-url', title: accessUrl },
                h('span', { className: 'dshp_addrFull' }, accessUrl || '暂无可用地址'),
                h('span', { className: 'dshp_addrShort' }, shortAddress(accessUrl) || '暂无可用地址'),
              ),
              copyButton('address', 'connect', accessUrl),
            ),
            h(
              'div',
              { className: 'dshp_row' },
              h('span', { className: 'dshp_label' }, '二维码'),
              h('span', { className: 'dshp_note' }, state.expiresAt ? formatRemaining(state.expiresAt, state.now) : '仅本机可见'),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshp_linkButton',
                  'data-action': 'rotate',
                  disabled: rotateDisabled,
                  onClick: () => perform('rotate', 'connect', ROTATE_URL, {}, '重新生成二维码失败', '二维码已重新生成。'),
                },
                rotateDisabled ? '正在重新生成…' : '重新生成',
              ),
            ),
            publicAvailable ? pinRow : null,
            publicAvailable ? pinNote : null,
            fasterLanUrl
              ? h(
                  'div',
                  { className: 'dshp_row dshp_rowAddr' },
                  h('span', { className: 'dshp_label' }, '同一 Wi-Fi 更快'),
                  h(
                    'code',
                    { className: 'dshp_addr', title: fasterLanUrl },
                    h('span', { className: 'dshp_addrFull' }, fasterLanUrl),
                    h('span', { className: 'dshp_addrShort' }, shortAddress(fasterLanUrl)),
                  ),
                  copyButton('lan', 'connect', fasterLanUrl),
                )
              : null,
            otherLanUrls.length > 0
              ? h(
                  'details',
                  { className: 'dshp_diag' },
                  h('summary', { className: 'dshp_diagSummary' }, h('span', { className: 'dshp_diagText' }, '其他局域网地址 ' + otherLanUrls.length)),
                  h(
                    'ul',
                    { className: 'dshp_list' },
                    ...otherLanUrls.map((url) =>
                      h(
                        'li',
                        { className: 'dshp_row', key: url },
                        h('code', { className: 'dshp_addr', title: url }, url),
                        copyButton('lan:' + url, 'connect', url),
                      ),
                    ),
                  ),
                )
              : null,
            pinEditorOpen ? pinEditor : null,
            browserConnected
              ? h(
                  'div',
                  { className: 'dshp_actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshp_button',
                      'data-action': 'disconnect-qr',
                      disabled: disconnectDisabled,
                      onClick: () => perform('disconnect', 'connect', DISCONNECT_URL, {}, '断开失败', '已断开手机网页。'),
                    },
                    disconnectDisabled ? '正在断开…' : '断开手机网页',
                  ),
                  onlineDeviceCount > 0
                    ? h('span', { className: 'dshp_note' }, 'App 仍在后台连接，永久断开请移除设备。')
                    : null,
                )
              : null,
            renderError('connect'),
            renderNotice('connect'),
          ),
        )

        const aihubPublicUrl = publicUrl || tunnelUrl
        const aihubBody = h(
          'div',
          { className: 'dshp_connectBody', 'data-tab-panel': 'aihub' },
          qrFrame(aihubQrSvg, !pinFixed, !aihubAvailable),
          h(
            'div',
            { className: 'dshp_fields' },
            pinRow,
            pinEditorOpen ? pinEditor : null,
            aihubPublicUrl
              ? h(
                  'div',
                  { className: 'dshp_row dshp_rowAddr' },
                  h('span', { className: 'dshp_label' }, '公网地址'),
                  h(
                    'code',
                    { className: 'dshp_addr', title: aihubPublicUrl },
                    h('span', { className: 'dshp_addrFull' }, aihubPublicUrl),
                    h('span', { className: 'dshp_addrShort' }, shortAddress(aihubPublicUrl)),
                  ),
                  copyButton('aihub-public', 'connect', aihubPublicUrl),
                )
              : h('p', { className: 'dshp_note' }, '公网地址未就绪：先在「公网入口」配置固定域名或开启临时隧道，AI-HUB 也能在外网配对。'),
            aihubLanUrls.length > 0
              ? h(
                  'div',
                  { className: 'dshp_row dshp_rowAddr' },
                  h('span', { className: 'dshp_label' }, '局域网地址'),
                  h(
                    'code',
                    { className: 'dshp_addr', title: aihubLanUrls[0] },
                    h('span', { className: 'dshp_addrFull' }, aihubLanUrls[0]),
                    h('span', { className: 'dshp_addrShort' }, shortAddress(aihubLanUrls[0])),
                  ),
                  copyButton('aihub-lan', 'connect', aihubLanUrls[0]),
                )
              : h('p', { className: 'dshp_note' }, '没有可用的局域网地址，请确认电脑已连上 Wi-Fi 或网线。'),
            pinFixed
              ? h('p', { className: 'dshp_note' }, '扫码使用一次性配对码；手动填地址时，配对码仍用上方 6 位连接密码。')
              : h('p', { className: 'dshp_note' }, 'AI-HUB 配对只接受固定密码。点「设为固定」保存 6 位数字后，这里的二维码和地址就能用。'),
            pinFixed && aihubPairingExpiresAt
              ? h('p', { className: 'dshp_note' }, '二维码配对码' + formatRemaining(aihubPairingExpiresAt, state.now) + '；过期后自动刷新。')
              : null,
            pinFixed
              ? h('p', { className: 'dshp_note' }, '二维码不包含固定密码；截图过期后无法再配对。')
              : null,
            renderError('connect'),
            renderNotice('connect'),
          ),
        )

        const connectCard = h(
          'section',
          { className: 'dshp_card dshp_connect', 'data-card': 'connect' },
          h(
            'div',
            { className: 'dshp_tabs', role: 'tablist' },
            tabButton('browser', '浏览器扫码', browserConnected ? 1 : 0),
            tabButton('aihub', 'AI-HUB App', onlineDeviceCount),
          ),
          tab === 'aihub' ? aihubBody : browserBody,
        )

        const certificateText = !certificate
          ? '未申请'
          : certificateExpired
            ? '已过期'
            : certificate.selfSigned === true
              ? '只有 frpc 自签证书'
              : typeof certificate.expiresAt === 'number'
                ? '有效至 ' + formatTime(certificate.expiresAt)
                : '未申请'
        const certificateTone = !certificate
          ? ''
          : certificateExpired
            ? ' dshp_dangerText'
            : certificate.selfSigned === true
              ? ' dshp_warnText'
              : ' dshp_successText'
        const checkTone = lastCheck ? (lastCheck.reachable === true ? ' dshp_successText' : ' dshp_dangerText') : ''
        const checkText = lastCheck
          ? lastCheck.reachable === true
            ? lastCheck.status === 401 || lastCheck.status === 403
              ? '已连通（等待配对）'
              : '可访问'
            : '无法访问'
          : '未检测'

        const publicCard = h(
          'section',
          { className: 'dshp_card', 'data-card': 'public' },
          h(
            'div',
            { className: 'dshp_cardHead' },
            h('h3', { className: 'dshp_cardTitle' }, '公网入口'),
            h(
              'span',
              { className: 'dshp_tag' + (publicUrlConfigured || state.tunnelActive === true ? '' : ' dshp_tagMuted') },
              publicUrlConfigured ? '固定域名' : state.tunnelActive === true ? '临时隧道' : '未配置',
            ),
          ),
          portMismatch
            ? h(
                'p',
                { className: 'dshp_warn' },
                '固定域名隧道按 ' + expectedPort + ' 端口转发，当前桥接端口' + (bridgePort === null ? '未知。' : '为 ' + bridgePort + '。'),
              )
            : null,
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
                disabled: testDisabled || !publicUrlConfigured || draftDirty || isBusy('save'),
                title: !publicUrlConfigured
                  ? '先保存固定公网域名，才能检测连通性。'
                  : draftDirty
                    ? '先保存域名，再检测连通性。'
                    : undefined,
                onClick: () =>
                  perform('test', 'public', PUBLIC_URL_TEST_URL, {}, '检测失败', (payload) => {
                    const check = payload.lastPublicUrlCheck
                    if (!check || check.reachable !== true) return ''
                    return '域名检测通过' + (Number.isInteger(check.status) ? '（HTTP ' + check.status + '）' : '') + '。'
                  }),
              },
              testDisabled ? '检测中…' : '检测',
            ),
          ),
          h(
            'div',
            { className: 'dshp_row' },
            h('span', { className: 'dshp_label' }, '连通性'),
            h(
              'span',
              { className: 'dshp_note' + checkTone, role: 'status', 'aria-live': 'polite' },
              checkText + (lastCheck && Number.isInteger(lastCheck.status) ? ' · HTTP ' + lastCheck.status : ''),
            ),
            lastCheck ? h('span', { className: 'dshp_note' }, formatTime(lastCheck.at)) : null,
          ),
          publicUrlConfigured
            ? h(
                'div',
                { className: 'dshp_row' },
                h('span', { className: 'dshp_label' }, '证书'),
                h('span', { className: 'dshp_note' + certificateTone }, certificateText),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshp_linkButton',
                    'data-action': 'issue-certificate',
                    disabled: certificateBusy,
                    'aria-busy': certificateBusy ? 'true' : undefined,
                    onClick: () =>
                      perform('certificate', 'public', CERTIFICATE_URL, {}, '证书签发失败', '正在申请证书，稍后在这里看结果。'),
                  },
                  certificateBusy
                    ? certificateRenewable
                      ? '正在续期…'
                      : '正在申请…'
                    : certificateRenewable
                      ? '续期'
                      : '申请证书',
                ),
              )
            : null,
          certificate &&
          publicUrlConfigured &&
          (!certificate.domain || certificate.domain === publicUrlHost) &&
          typeof certificate.error === 'string' &&
          certificate.error
            ? h('p', { className: 'dshp_error', role: 'alert' }, '证书错误：' + certificate.error)
            : null,
          lastCheck && typeof lastCheck.error === 'string' && lastCheck.error
            ? h('p', { className: 'dshp_error', role: 'alert' }, '失败原因：' + lastCheck.error)
            : null,
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
                        title: tunnelLocked ? tunnelLockReason : undefined,
                        onClick: () =>
                          perform('tunnel', 'public', TUNNEL_URL, { enabled: true }, '开启临时隧道失败', '临时隧道已开启。'),
                      },
                      tunnelBusy ? '正在开启…' : '开启临时隧道',
                    )
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshp_button',
                        'data-action': 'tunnel-disable',
                        disabled: tunnelDisabled,
                        title: tunnelLocked ? tunnelLockReason : undefined,
                        onClick: () =>
                          perform('tunnel', 'public', TUNNEL_URL, { enabled: false }, '关闭临时隧道失败', '临时隧道已关闭。'),
                      },
                      tunnelBusy ? '正在关闭…' : '关闭临时隧道',
                    ),
                state.tunnelProvider === 'cloudflare' && !hasPhoneConnection
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshp_button',
                        'data-action': 'tunnel-fallback',
                        disabled: fallbackDisabled,
                        onClick: () => perform('fallback', 'public', TUNNEL_FALLBACK_URL, {}, '切换线路失败', '已切换到备用线路。'),
                      },
                      fallbackDisabled ? '正在切换…' : '扫码打不开？切备用线路',
                    )
                  : null,
              ),
          publicUrlConfigured ? null : state.tunnelLoading === true
            ? h('p', { className: 'dshp_note' }, '正在创建临时隧道…')
            : tunnelUrl
              ? h('p', { className: 'dshp_note' }, '临时隧道地址：' + tunnelUrl)
              : null,
          publicUrlConfigured ? null : state.tunnelError
            ? h('p', { className: 'dshp_error', role: 'alert' }, '隧道建立失败：' + state.tunnelError)
            : null,
          renderError('public'),
          renderNotice('public'),
        )

        const deviceTitle = (device) => {
          const name = typeof device.name === 'string' ? device.name.trim() : ''
          const platform = typeof device.platform === 'string' ? device.platform.trim() : ''
          if (name && platform) return name + '（' + platform + '）'
          if (name) return name
          if (platform) return '未命名手机（' + platform + '）'
          return '未命名手机 ' + String(device.deviceId || '').slice(0, 8)
        }
        const deviceTag = deviceList.length === 0
          ? '共 0 台'
          : onlineDeviceCount > 0
            ? 'App 在线 ' + onlineDeviceCount + ' / 共 ' + deviceList.length + ' 台'
            : '共 ' + deviceList.length + ' 台，App 均离线'
        const deviceMeta = (device) => {
          const seen = '最后在线 ' + formatTime(device.lastSeenAt)
          return device.lastIp
            ? device.lastIp + ' · ' + (device.region || '归属地未知') + ' · ' + seen
            : '未记录公网 IP（局域网直连或经隧道转发） · ' + seen
        }
        const devicesCard = h(
          'section',
          { className: 'dshp_card', 'data-card': 'devices' },
          h(
            'div',
            { className: 'dshp_cardHead' },
            h('h3', { className: 'dshp_cardTitle' }, 'AI-HUB 设备'),
            h('span', { className: 'dshp_tag' + (deviceList.length === 0 ? ' dshp_tagMuted' : '') }, deviceTag),
          ),
          deviceList.length === 0
            ? h('p', { className: 'dshp_note' }, '还没有手机配对过，扫码后自动出现。')
            : h(
                'ul',
                { className: 'dshp_list' },
                ...deviceList.map((device) => {
                  const confirming = confirmDeviceId === device.deviceId
                  const removing = isBusy('remove:' + device.deviceId)
                  return h(
                    'li',
                    { className: 'dshp_deviceItem', key: device.deviceId },
                    h(
                      'div',
                      { className: 'dshp_deviceMain' },
                      h(
                        'span',
                        { className: 'dshp_deviceName' },
                        h('span', { className: 'dshp_deviceDot' + (device.online === true ? ' dshp_deviceDotOnline' : '') }),
                        h('span', { title: deviceTitle(device) }, deviceTitle(device)),
                      ),
                      h('span', { className: 'dshp_deviceMeta', title: deviceMeta(device) }, deviceMeta(device)),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dshp_button' + (confirming ? ' dshp_danger' : ''),
                        'data-action': 'remove-device',
                        disabled: removing,
                        title: confirming ? '再点一次吊销这台设备的凭据' : '移除后这台手机需要重新配对',
                        onClick: () => {
                          if (confirming) {
                            setConfirmDeviceId('')
                            void perform(
                              'remove:' + device.deviceId,
                              'devices',
                              DEVICE_REMOVE_URL,
                              { deviceId: device.deviceId },
                              '移除失败',
                              '设备已移除。',
                            )
                            return
                          }
                          setConfirmDeviceId(device.deviceId)
                          setTimeout(() => {
                            setConfirmDeviceId((current) => (current === device.deviceId ? '' : current))
                          }, 4000)
                        },
                      },
                      removing ? '移除中…' : confirming ? '确认移除' : '移除',
                    ),
                  )
                }),
              ),
          renderError('devices'),
          renderNotice('devices'),
        )

        const diagnosticsCard = h(
          'details',
          { className: 'dshp_diag', 'data-card': 'diagnostics', open: portMismatch || state.tunnelError ? true : undefined },
          h(
            'summary',
            { className: 'dshp_diagSummary' },
            h(
              'span',
              { className: 'dshp_diagText' },
              h('span', { className: 'dshp_dot' + (portMismatch || state.tunnelError ? ' dshp_deviceDotOnline' : '') }),
              '端口 ' + (bridgePort === null ? '未知' : String(bridgePort)) + ' · ' + providerLabel + ' · ' + (state.version ? 'v' + state.version : '面板版本未知'),
            ),
            h('span', null, '诊断'),
          ),
          h(
            'div',
            { className: 'dshp_diagBody' },
            h('span', { className: 'dshp_diagLabel' }, '桥接端口'),
            h('code', { className: 'dshp_diagValue' + (portMismatch ? ' dshp_dangerText' : '') }, bridgePort === null ? '未知' : String(bridgePort)),
            h('span', { className: 'dshp_diagLabel' }, '期望端口'),
            h('code', { className: 'dshp_diagValue' }, String(expectedPort)),
            h('span', { className: 'dshp_diagLabel' }, '临时隧道'),
            h('span', { className: 'dshp_diagValue' }, providerLabel),
            h('span', { className: 'dshp_diagLabel' }, '隧道错误'),
            h('code', { className: 'dshp_diagValue' + (state.tunnelError ? ' dshp_dangerText' : '') }, state.tunnelError ? String(state.tunnelError) : '无'),
            h('span', { className: 'dshp_diagLabel' }, '面板数据'),
            h('code', { className: 'dshp_diagValue' }, formatClock(state.now) || '未知'),
            h('span', { className: 'dshp_diagLabel' }, '面板版本'),
            h('code', { className: 'dshp_diagValue' }, state.version ? '面板 v' + state.version : '面板版本未知，页面可能是旧缓存'),
            h('span', { className: 'dshp_diagLabel' }, '桌面配对页'),
            typeof state.desktopUrl === 'string' && state.desktopUrl.length > 0
              ? h('a', { className: 'dshp_link', href: state.desktopUrl, target: '_blank', rel: 'noreferrer' }, '在本机打开')
              : h('span', { className: 'dshp_diagValue' }, '不可用'),
          ),
        )

        return h(
          'div',
          { className: 'dshp_root' },
          top,
          pollError ? h('p', { className: 'dshp_warn', role: 'alert' }, '无法读取面板状态：' + pollError + '，正在重试…') : null,
          connectCard,
          h('div', { className: 'dshp_grid' }, publicCard, devicesCard),
          diagnosticsCard,
        )
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
