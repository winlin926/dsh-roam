import { describe, expect, it } from 'vitest'
import { escapeHtml, markdown, pretty } from '../lib/mobile/markdown.js'

describe('mobile markdown behavior', () => {
  it('renders supported block structure instead of treating all input as plain text', () => {
    const html = markdown('# Heading\n- first\n- second\n```ts\nconst ok = true\n```')

    expect(html).toContain('<h1>Heading</h1>')
    expect(html.match(/<li>/g)).toHaveLength(2)
    expect(html).toContain('<pre><code data-language="ts">const ok = true\n</code></pre>')
  })

  it('escapes markup before adding inline formatting, including inside code and links', () => {
    const html = markdown('<img src=x onerror=alert(1)> **<b>bold</b>**\n`<script>bad()</script>`')

    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('<strong>&lt;b&gt;bold&lt;/b&gt;</strong>')
    expect(html).toContain('<code>&lt;script&gt;bad()&lt;/script&gt;</code>')
  })

  it('only creates anchors for HTTP(S) destinations and preserves unsafe input as text', () => {
    const html = markdown('[safe](https://example.test/a?x=1&y=2) [bad](javascript:alert(1)) [local](/private)')

    expect(html).toContain('href="https://example.test/a?x=1&amp;y=2"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer"')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('href="/private"')
    expect(html).toContain('[bad](javascript:alert(1))')
  })

  it('does not turn a fence language into an HTML attribute injection', () => {
    const html = markdown('```js" onmouseover="alert(1)\n<const>\n```')

    expect(html).not.toContain('onmouseover="alert(1)"')
    expect(html).toContain('&lt;const&gt;')
  })

  it('keeps table content escaped and groups rows in a horizontally scrollable wrapper', () => {
    const html = markdown('Name | Value\n--- | ---\n<b>safe</b> | `code`')

    expect(html).toContain('<div class="table-wrap"><table>')
    expect(html).toContain('<th>Name</th><th>Value</th>')
    expect(html).toContain('<td>&lt;b&gt;safe&lt;/b&gt;</td><td><code>code</code></td>')
    expect(html).not.toContain('<b>safe</b>')
  })

  it('closes an unterminated code fence without leaking the following input as markup', () => {
    const html = markdown('```\n<img src=x>\nstill code')

    expect(html).toContain('&lt;img src=x&gt;\nstill code\n</code></pre>')
    expect(html).not.toContain('<img')
  })
})

describe('mobile formatting helpers', () => {
  it('escapes every HTML-significant character exactly once', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
    expect(escapeHtml(null)).toBe('')
  })

  it('pretty prints valid JSON and preserves invalid JSON as source text', () => {
    expect(pretty('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(pretty('{broken')).toBe('{broken')
    expect(pretty('')).toBe('')
  })
})
