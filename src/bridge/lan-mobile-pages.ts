export function renderMobileReconnectPage(
  locale: 'en' | 'zh',
  connectionMode: 'lan' | 'tunnel' = 'lan',
  options: { expired?: boolean; resumeUnavailable?: boolean } = {}
): string {
  const zh = locale === 'zh'
  const expired = options.expired === true
  const resumeUnavailable = options.resumeUnavailable === true
  const text = {
    title: zh ? '重新连接 DSH' : 'Reconnect DSH',
    heading: zh ? '连接已断开' : 'Connection lost',
    action:
      connectionMode === 'tunnel' && !expired
        ? zh
          ? '输入连接密码'
          : 'Enter pairing password'
        : zh
          ? '重新连接'
          : 'Reconnect',
    guidance: resumeUnavailable
      ? zh
        ? '这部手机没有可恢复的连接。请回到电脑前，扫描「连接手机」里的新二维码。'
        : 'This phone has no saved connection. Go back to the computer and scan the new QR code.'
      : connectionMode === 'tunnel'
        ? expired
          ? zh
            ? '远程地址已失效，请在电脑上的「连接手机」扫描新二维码。'
            : 'This remote address is no longer valid. Scan the new QR code in Connect Phone on the computer.'
          : zh
            ? '隧道地址仍可用。输入电脑上显示的连接密码即可继续，不必重新扫码。'
            : 'This tunnel is still reachable. Enter the pairing password shown on the computer.'
        : zh
          ? '请确保手机和电脑连接到同一 Wi-Fi，然后点下面的按钮重新连接。'
          : 'Stay on the same Wi-Fi, then tap the button below to reconnect.'
  }
  const action = resumeUnavailable
    ? ''
    : `<a class="primary" href="/reconnect">${text.action}<svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff" media="(prefers-color-scheme:light)"><meta name="theme-color" content="#141416" media="(prefers-color-scheme:dark)"><title>${text.title}</title><style>:root{color-scheme:light;--bg:#fff;--ink:#18191c;--muted:#62666d}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#141416;--ink:#f5f5f6;--muted:#95979d}}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:100%;max-width:340px;text-align:center}.brand{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:22px;font-size:13px;font-weight:600}.brand img{width:35px;height:20px;object-fit:contain}.brand .dark-logo{display:none}@media(prefers-color-scheme:dark){.brand .light-logo{display:none}.brand .dark-logo{display:block}}h1{margin:0;font-size:28px;line-height:1.18;letter-spacing:-.03em}.guidance{margin:13px auto 0;max-width:310px;color:var(--muted);font-size:14px;line-height:1.65}.primary{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:50px;margin-top:26px;border-radius:15px;background:var(--ink);color:var(--bg);font-weight:650;text-decoration:none}</style></head><body><main class="card"><div class="brand"><img class="light-logo" src="/brand-logo/light" alt=""><img class="dark-logo" src="/brand-logo/dark" alt=""><span>DSH Mobile</span></div><h1>${text.heading}</h1><p class="guidance">${text.guidance}</p>${action}</main></body></html>`
}

export function renderPairingPinPage(locale: 'en' | 'zh', lanUrl?: string): string {
  const zh = locale === 'zh'
  const text = {
    title: zh ? '连接 DSH' : 'Pairing DSH',
    heading: zh ? '输入连接密码' : 'Enter pairing password',
    hint: zh ? '在电脑「连接手机」窗口查看 6 位密码。' : 'Find the 6-digit password in Connect Phone on the computer.',
    submit: zh ? '连接' : 'Connect',
    showPin: zh ? '在电脑上查看密码' : 'Show password on the computer',
    invalid: zh ? '连接密码不正确。' : 'That pairing password is incorrect.',
    expired: zh ? '密码已过期，请在电脑上扫描新二维码。' : 'This password expired. Scan the new QR code on the computer.',
    rateLimited: zh ? '尝试次数过多，请 {n} 分钟后再试。' : 'Too many attempts. Try again in {n} min.',
    unavailable: zh ? '暂时无法连接电脑端，请先启动 DSH。' : 'Cannot reach the computer. Start DSH and try again.',
    connecting: zh ? '正在连接…' : 'Connecting…',
    lanHint: zh ? '手机与电脑在同一 Wi-Fi？可改用局域网直连，无需密码。' : 'On the same Wi-Fi? Connect over the local network instead — no password needed.',
    lanAction: zh ? '使用局域网直连' : 'Use local Wi-Fi'
  }
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff" media="(prefers-color-scheme:light)"><meta name="theme-color" content="#141416" media="(prefers-color-scheme:dark)"><title>${text.title}</title><style>:root{color-scheme:light;--bg:#fff;--card:#fff;--panel:#f7f8fa;--ink:#18191c;--muted:#62666d;--line:#e5e7eb;--brand:#4d6bfe}@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#141416;--card:#1d1d20;--panel:#202023;--ink:#f5f5f6;--muted:#95979d;--line:#303034;--brand:#6f86ff}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}.card{width:100%;max-width:340px;text-align:center}.logo{width:54px;height:54px;display:grid;place-items:center;margin:0 auto 22px;border:1px solid var(--line);border-radius:16px;background:var(--card)}.logo img{width:39px;height:22px;object-fit:contain}.logo .dark-logo{display:none}@media(prefers-color-scheme:dark){.logo .light-logo{display:none}.logo .dark-logo{display:block}}h1{font-size:24px;line-height:1.25;font-weight:600;margin:0 0 8px}p{margin:0;color:var(--muted)}input{width:100%;height:52px;margin-top:22px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);text-align:center;font:28px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.28em}button{width:100%;height:44px;margin-top:12px;border:1px solid var(--ink);border-radius:12px;background:var(--ink);color:var(--bg);font:inherit;font-weight:600;cursor:pointer}button.quiet{border-color:var(--line);background:transparent;color:var(--ink)}a.quiet{display:flex;align-items:center;justify-content:center;width:100%;height:44px;margin-top:12px;border:1px solid var(--line);border-radius:12px;color:var(--ink);font-weight:600;text-decoration:none}.lan-hint{margin-top:16px;font-size:13px;line-height:1.55}.note{min-height:20px;margin-top:14px;padding:10px 12px;border-radius:10px;background:var(--panel);color:#c6353f;font-size:13px}button:disabled{opacity:.55;cursor:default}</style></head><body><div class="card"><div class="logo"><img class="light-logo" src="/brand-logo/light" alt="DSH"><img class="dark-logo" src="/brand-logo/dark" alt="DSH"></div><h1>${text.heading}</h1><p>${text.hint}</p><form onsubmit="return submitPin(event)"><label for="pin" style="display:block;margin-top:18px;color:var(--muted);font-size:12px;font-weight:600;text-align:left">${zh ? '6 位连接密码' : '6-digit password'}</label><input id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}" required><button id="submit" type="submit">${text.submit}</button></form>${lanUrl ? '<p class="lan-hint">' + text.lanHint + '</p><a class="quiet" href="' + escapeHtml(lanUrl) + '">' + text.lanAction + '</a>' : ''}<button class="quiet" type="button" onclick="requestPairingHelp()">${text.showPin}</button><div id="status" class="note" role="status" aria-live="polite"></div></div><script>const T=${JSON.stringify(text)};
async function submitPin(event){event.preventDefault();const pin=document.getElementById('pin').value.trim(),status=document.getElementById('status'),submit=document.getElementById('submit');submit.disabled=true;status.textContent=T.connecting;try{const r=await fetch('/pair/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});const j=await r.json();if(r.status===429){const minutes=Math.max(1,Math.ceil(Number(j.retryAfter||r.headers.get('retry-after')||60)/60));status.textContent=T.rateLimited.replace('{n}',String(minutes));return false}if(j.ok){location.replace('/');return false}status.textContent=j.rescan||j.error==='expired'?T.expired:T.invalid}catch{status.textContent=T.unavailable}finally{submit.disabled=false}return false}
async function requestPairingHelp(){try{await fetch('/pair/retry',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})}catch{}}</script></body></html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return replacements[character]!
  })
}
