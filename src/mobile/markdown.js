export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^ )]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
}

function cells(line) {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split('|').map(cell => cell.trim())
}

export function markdown(text) {
  const lines = String(text ?? '').split('\n')
  let html = '', code = false, list = false, codeLanguage = ''
  const closeList = () => { if (list) { html += '</ul>'; list = false } }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const fence = line.trim().match(/^```\s*([\w+-]*)/)
    if (fence) {
      closeList()
      if (code) html += '</code></pre>'
      else {
        codeLanguage = fence[1]
        html += `<pre><code${codeLanguage ? ` data-language="${escapeHtml(codeLanguage)}"` : ''}>`
      }
      code = !code
      continue
    }
    if (code) { html += `${escapeHtml(line)}\n`; continue }
    const separator = (lines[index + 1] ?? '').trim().replace(/^\||\|$/g, '').split('|')
    if (line.includes('|') && separator.length && separator.every(cell => /^\s*:?-{3,}:?\s*$/.test(cell))) {
      closeList()
      const headers = cells(line)
      html += `<div class="table-wrap"><table><thead><tr>${headers.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>`
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        html += `<tr>${cells(lines[index]).map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`
        index++
      }
      index--
      html += '</tbody></table></div>'
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) { closeList(); html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; continue }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) { if (!list) { html += '<ul>'; list = true }; html += `<li>${inline(bullet[1])}</li>`; continue }
    closeList()
    if (line.trim()) html += `<p>${inline(line)}</p>`
  }
  closeList()
  if (code) html += '</code></pre>'
  return html
}

export function pretty(value) {
  if (!value) return ''
  try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return String(value) }
}
