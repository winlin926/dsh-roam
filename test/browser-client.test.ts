import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The settings panel is a classic browser script: DSH loads lib/client.js with a
 * plain script tag, so one top-level import or export fails the whole page with
 * "Unexpected token 'export'". The build copies this file verbatim instead of
 * compiling it, and these two checks hold that contract.
 */
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

describe('browser client bundle', () => {
  it('is copied from source unchanged', () => {
    expect(read('../lib/client.js')).toBe(read('../src/client.js'))
  })

  it('stays a classic script without top-level module syntax', () => {
    expect(read('../lib/client.js')).not.toMatch(/^\s*(?:import|export)\b/m)
  })
})
