import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

function browserCandidates() {
  const configured = process.env.DSH_MOBILE_CHROME_PATH
  if (configured) return [configured]
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, process.platform === 'win32' ? 'chrome.exe' : 'google-chrome')),
  ]
}

export async function loadBrowserRuntime() {
  let chromium
  try {
    ;({ chromium } = await import('playwright-core'))
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !String(error.message).includes('playwright-core')) throw error
    const reason = 'Browser acceptance SKIP: optional devDependency playwright-core is not installed. Add it, then run `node --test test/browser/mobile.acceptance.mjs`; regular `pnpm test` does not need a browser.'
    if (process.env.DSH_MOBILE_BROWSER_REQUIRED === '1') throw new Error(reason)
    return { skip: reason }
  }

  const executablePath = browserCandidates().find(candidate => existsSync(candidate))
  if (!executablePath) {
    const reason = 'Browser acceptance SKIP: no local Chrome/Edge executable found. Set DSH_MOBILE_CHROME_PATH to an existing browser; no browser will be downloaded automatically.'
    if (process.env.DSH_MOBILE_BROWSER_REQUIRED === '1') throw new Error(reason)
    return { skip: reason }
  }
  return { chromium, executablePath }
}
