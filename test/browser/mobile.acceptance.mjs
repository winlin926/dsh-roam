import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { loadBrowserRuntime } from './runtime.mjs'

const runtime = await loadBrowserRuntime()
const UI_ARTIFACT_DIRECTORY = process.env.DSH_MOBILE_UI_ARTIFACTS ?? join(tmpdir(), 'dsh-roam-mobile-ui')
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='

describe('mobile Chrome acceptance', { skip: runtime.skip ?? false, concurrency: false }, () => {
  let harness
  let browser
  let context
  let page
  let pageErrors
  let currentTestName = 'failure'
  const artifactDirectory = fileURLToPath(new URL('./artifacts/', import.meta.url))

  before(async () => {
    const { startMobileBrowserHarness } = await import('../helpers/mobile-browser-harness.mjs')
    harness = await startMobileBrowserHarness()
    await mkdir(UI_ARTIFACT_DIRECTORY, { recursive: true })
    browser = await runtime.chromium.launch({ executablePath: runtime.executablePath, headless: true })
    context = await browser.newContext({
      viewport: { width: 360, height: 740 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      locale: 'zh-CN',
    })
    context.setDefaultTimeout(7000)
    await context.addInitScript(() => Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] }))
    const separator = harness.cookie.indexOf('=')
    await context.addCookies([{
      url: harness.origin,
      name: harness.cookie.slice(0, separator),
      value: harness.cookie.slice(separator + 1),
      httpOnly: true,
      sameSite: 'Strict',
    }])
  })

  after(async () => {
    await context?.close()
    await browser?.close()
    await harness?.stop()
  })

  beforeEach(async () => {
    harness.state.reset()
    await context.clearCookies()
    const separator = harness.cookie.indexOf('=')
    await context.addCookies([{
      url: harness.origin,
      name: harness.cookie.slice(0, separator),
      value: harness.cookie.slice(separator + 1),
      httpOnly: true,
      sameSite: 'Strict',
    }])
    pageErrors = []
    page = await context.newPage()
    await page.addInitScript(() => localStorage.removeItem('dsh-roam-drafts-v1'))
    page.on('pageerror', error => pageErrors.push(error.message))
    try {
      const status = await page.request.get(`${harness.origin}/api/status`)
      assert.equal(status.status(), 200, 'the authenticated bridge status check must remain live')
      assert.equal((await status.json()).connected, true)
      await page.goto(harness.origin, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => document.querySelector('#homeWorkspace')?.textContent.includes('Test workspace'), undefined, { timeout: 10_000 })
      assert.equal(await page.locator('#homeView').isVisible(), true, 'the app must boot to the new-task home')
      await page.waitForFunction(() => document.querySelector('#homeConnection')?.dataset.state === 'connected')
      assert.deepEqual(harness.state.fixtureErrors, [], 'fake Host schema and request fixtures must be valid')
    } catch (error) {
      console.error('Mobile browser boot diagnostics:', {
        pageErrors,
        homeError: await page.locator('#homeError').textContent().catch(() => '<unavailable>'),
        title: await page.title().catch(() => '<unavailable>'),
      })
      await captureFailure(page, artifactDirectory, 'boot')
      await page.close()
      page = undefined
      throw error
    }
  }, { timeout: 30_000 })

  afterEach(async () => {
    try {
      assert.deepEqual(pageErrors, [], 'no uncaught browser exception or rejected ESM initialization')
      assert.deepEqual(harness.state.fixtureErrors, [], 'no fake Host schema or fixture request errors')
    } finally {
      await page?.close()
      page = undefined
    }
  })

  function captureFailureOnThrow(test) {
    return async context => {
      currentTestName = context.name
      try {
        await test(context)
      } catch (error) {
        console.error('Mobile browser diagnostics:', { failure: error?.message, pageErrors })
        if (page) {
          try { await captureFailure(page, artifactDirectory, currentTestName) }
          catch (captureError) { console.error('Browser screenshot unavailable:', captureError) }
        }
        throw error
      }
    }
  }

  it('boots to a clean home and keeps the main workflow reachable at 360px', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    assert.equal(await page.locator('#chatView').isVisible(), false)
    assert.equal(await page.locator('#navigationDrawer').isVisible(), false)
    assert.equal(await page.locator('#homePrompt').inputValue(), '')
    assert.equal(await page.locator('#homeView').textContent().then(text => text.includes('Question from the phone fixture')), false)
    assert.equal(await page.evaluate(() => history.state?.view), 'home')
    await assertNoHorizontalOverflow(page)
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('.brand-lockup .brand-logo')]
      return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0)
    })
    await page.locator('#homePrompt').fill('A draft that must not disappear')
    assert.equal(await page.locator('#homeSend').isEnabled(), true)
  }))

  it('opens the conversation drawer, restores focus, and navigates to a real session', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await page.locator('#homeDrawerButton').click()
    await page.locator('#navigationDrawer').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#appShell').evaluate(element => element.inert), true)
    await page.locator('[data-open-session="s1"]').waitFor({ state: 'visible' })
    assert.match(await page.locator('[data-open-session="s1"]').textContent(), /Existing conversation/)
    await assertNoHorizontalOverflow(page)

    await page.locator('#drawerClose').click()
    await page.locator('#navigationDrawer').waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'homeDrawerButton')

    await page.locator('#homeDrawerButton').click()
    await page.locator('[data-open-session="s1"]').click()
    await page.locator('#chatView').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#chatTitle').textContent(), 'Existing conversation')
    assert.equal(await page.locator('#chatMore').isVisible(), true)
    assert.equal(await page.locator('#bottomDock').isVisible(), true)
    assert.equal(await page.evaluate(() => history.state?.sessionId), 's1')
    await page.locator('[data-message-id="assistant:1:1"]').waitFor({ state: 'visible' })
    assert.match(await page.locator('#messageList').textContent(), /Answer before streaming/)

    await page.locator('#chatDrawerButton').click()
    await page.locator('#newTaskButton').click()
    await page.locator('#homeView').waitFor({ state: 'visible' })
    assert.equal(await page.evaluate(() => history.state?.view), 'home')
  }))

  it('creates one session and submits one prompt through the real bridge RPC', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await page.locator('#homePrompt').fill('Create this task from Chrome')
    await page.locator('#homeSend').click()
    await page.locator('#chatView').waitFor({ state: 'visible' })
    await waitFor(() => harness.state.prompts.length === 1, 'the browser prompt RPC')

    assert.equal(harness.state.created, 1)
    assert.equal(harness.state.prompts.length, 1)
    assert.equal(harness.state.prompts[0].sessionId, 'created-1')
    assert.deepEqual(harness.state.prompts[0].content, [{ type: 'text', text: 'Create this task from Chrome' }])
    await page.waitForTimeout(100)
    assert.equal(harness.state.prompts.length, 1, 'a single tap cannot issue duplicate prompts')

    await page.locator('#chatDrawerButton').click()
    await page.locator('[data-open-session="created-1"]').waitFor({ state: 'visible' })
    await page.locator('#newTaskButton').click()
    await page.locator('#homeView').waitFor({ state: 'visible' })
  }))

  it('retains stable message nodes while SSE chunks update their text', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await openExistingChat(page)
    await page.evaluate(() => {
      window.acceptanceMessageNodes = Object.fromEntries(
        [...document.querySelectorAll('[data-message-id]')].map(node => [node.dataset.messageId, node]),
      )
    })
    await harness.pushSessionEvent('s1', {
      type: 'assistant/chunk', data: { turn: 8, step: 2, chunk: { type: 'text-delta', index: 0, text: 'first chunk' } },
    })
    const incoming = page.locator('[data-message-id="assistant:8:2"]')
    await incoming.waitFor({ state: 'visible' })
    await page.evaluate(() => {
      window.acceptanceStreamNode = document.querySelector('[data-message-id="assistant:8:2"]')
      window.acceptanceStreamNode.dataset.acceptanceMarker = 'retain-this-node'
    })
    await harness.pushSessionEvent('s1', {
      type: 'assistant/chunk', data: { turn: 8, step: 2, chunk: { type: 'text-delta', index: 0, text: ' plus second chunk' } },
    })
    await page.waitForFunction(() => document.querySelector('[data-message-id="assistant:8:2"]')?.textContent.includes('first chunk plus second chunk'))

    const identity = await page.evaluate(() => ({
      previousNodesRetained: Object.entries(window.acceptanceMessageNodes).every(([id, node]) => document.querySelector(`[data-message-id="${id}"]`) === node),
      streamNodeRetained: document.querySelector('[data-message-id="assistant:8:2"]') === window.acceptanceStreamNode,
      marker: document.querySelector('[data-message-id="assistant:8:2"]')?.dataset.acceptanceMarker,
      count: document.querySelectorAll('[data-message-id]').length,
    }))
    assert.equal(identity.previousNodesRetained, true)
    assert.equal(identity.streamNodeRetained, true)
    assert.equal(identity.marker, 'retain-this-node')
    assert.equal(identity.count, 3)
  }))

  it('uses one dismissible overlay with inert background and trigger focus restoration', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await page.locator('#homeWorkspace').click()
    await page.locator('#overlayRoot [role="dialog"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#overlayRoot [role="dialog"]').count(), 1)
    assert.equal(await page.locator('#appShell').evaluate(element => element.inert), true)
    await page.keyboard.press('Escape')
    await page.locator('#overlayRoot [role="dialog"]').waitFor({ state: 'hidden' })
    assert.equal(await page.locator('#appShell').evaluate(element => element.inert), false)
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'homeWorkspace')

    await page.locator('#homeDrawerButton').click()
    await page.keyboard.press('Escape')
    await page.locator('#navigationDrawer').waitFor({ state: 'hidden' })
    assert.equal(await page.locator('#appShell').evaluate(element => element.inert), false)
  }))

  it('keeps the bottom composer and focused draft usable in a contracted mobile viewport', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await openExistingChat(page)
    await page.locator('#chatPrompt').fill('Keep this draft above the bottom dock')
    await page.setViewportSize({ width: 360, height: 430 })
    await page.locator('#chatPrompt').focus()
    await page.waitForFunction(() => {
      const dock = document.querySelector('#bottomDock').getBoundingClientRect()
      return dock.top >= 0 && dock.bottom <= window.innerHeight + 1
    })
    const geometry = await page.evaluate(() => {
      const dock = document.querySelector('#bottomDock').getBoundingClientRect()
      const prompt = document.querySelector('#chatPrompt').getBoundingClientRect()
      return { dockTop: dock.top, dockBottom: dock.bottom, promptBottom: prompt.bottom, viewport: innerHeight, draft: document.querySelector('#chatPrompt').value }
    })
    assert.equal(geometry.draft, 'Keep this draft above the bottom dock')
    assert.ok(geometry.promptBottom <= geometry.dockBottom)
    assert.ok(geometry.dockTop >= 0)
    assert.ok(geometry.dockBottom <= geometry.viewport + 1)
    await assertNoHorizontalOverflow(page)
  }))

  for (const { method, label } of [
    { method: 'agentPresets/select', label: 'agent preset selection' },
    { method: 'session/selectModel', label: 'model selection' },
  ]) {
    it(`keeps the home draft and sends no prompt when initial ${label} fails`, { timeout: 30_000 }, captureFailureOnThrow(async () => {
      const draft = '保留这条首次任务草稿'
      harness.failNext(method, { code: 'settings-rejected', message: `Injected ${method} failure` })
      await page.locator('#homePrompt').fill(draft)
      await page.locator('#homeSend').click()
      await page.waitForFunction(() => document.querySelector('#homeError')?.textContent.includes('会话设置未应用'))

      assert.equal(await page.locator('#homePrompt').inputValue(), draft)
      assert.equal(await page.locator('#homeView').isVisible(), true)
      assert.equal(await page.locator('#homeSend').isEnabled(), true)
      assert.equal(harness.state.prompts.length, 0)
      assert.equal(harness.state.rpcCalls.filter(call => call.method === 'session/prompt').length, 0)
      assert.equal(harness.state.rpcCalls.filter(call => call.method === method).length, 1)
      assert.equal(await storedDraft(page, 'home'), draft)
    }))
  }

  it('rolls back the optimistic message, running state, and draft after prompt failure', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await openExistingChat(page)
    const draft = '发送失败后必须完整保留'
    harness.failNext('session/prompt', { code: 'prompt-rejected', message: 'Injected prompt failure' })
    await page.locator('#chatPrompt').fill(draft)
    await page.locator('#chatSend').click()
    await page.waitForFunction(() => document.querySelector('#chatError')?.textContent.includes('Injected prompt failure'))

    assert.equal(await page.locator('#chatPrompt').inputValue(), draft)
    assert.equal(await page.locator('.message.optimistic').count(), 0)
    assert.equal(await page.locator('.turn-status').count(), 0)
    assert.equal(await page.locator('#stopButton').isVisible(), false)
    assert.equal(await page.locator('#chatSend').isEnabled(), true)
    assert.equal(harness.state.prompts.length, 0)
    assert.equal(harness.state.rpcCalls.filter(call => call.method === 'session/prompt').length, 1)
    assert.equal(await storedDraft(page, 's1'), draft)
    assert.equal(await page.locator('#messageList').textContent().then(text => text.includes(draft)), false)
  }))

  it('selects workspace, model, effort, and mode without eager home settings RPC', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await page.locator('#homeWorkspace').click()
    await page.locator('#overlayRoot [data-picker-value="w2"]').click()
    await page.locator('#overlayRoot [role="dialog"]').waitFor({ state: 'hidden' })
    assert.match(await page.locator('#homeWorkspace').textContent(), /Second workspace/)

    await page.locator('[data-settings="home"]').click()
    await settingsField(page, '模型').click()
    await page.locator('#overlayRoot [data-picker-value="fixture\u001fmodel-b"]').click()
    await page.locator('#overlayRoot [data-overlay="settings"]').waitFor({ state: 'visible' })
    assert.match(await settingsField(page, '模型').textContent(), /Model Beta/)
    await settingsField(page, '思考强度').click()
    await page.locator('#overlayRoot [data-picker-value="high"]').click()
    await page.locator('#overlayRoot [data-overlay="settings"]').waitFor({ state: 'visible' })
    assert.match(await settingsField(page, '思考强度').textContent(), /High/)
    await settingsField(page, '会话模式').click()
    await page.locator('#overlayRoot [data-picker-value="code"]').click()
    await page.locator('#overlayRoot [data-overlay="settings"]').waitFor({ state: 'visible' })
    assert.match(await settingsField(page, '会话模式').textContent(), /PTC 模式/)
    await page.locator('#overlayRoot .sheet-actions .primary-action').click()
    await page.locator('#overlayRoot [role="dialog"]').waitFor({ state: 'hidden' })

    assert.equal(harness.state.rpcCalls.filter(call => call.method === 'session/selectModel').length, 0)
    assert.equal(harness.state.rpcCalls.filter(call => call.method === 'agentPresets/select').length, 0)
    assert.equal(await page.locator('#homeError').textContent(), '')
    await page.locator('#homeDrawerButton').click()
    await page.locator('#workspaceButton').click()
    assert.equal(await page.locator('#overlayRoot [data-picker-value="w2"]').getAttribute('aria-selected'), 'true')
  }))

  it('saves blank-session model and mode selections with the exact Host RPC schema', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await page.locator('#homeDrawerButton').click()
    await page.locator('[data-open-session="s1"]').waitFor({ state: 'visible' })
    const blank = harness.addSession({ id: 'blank', title: 'Blank session', updatedAt: 2 })
    await page.locator('#refreshButton').click()
    await page.locator(`[data-open-session="${blank.id}"]`).click()
    await page.locator('#chatTitle').filter({ hasText: 'Blank session' }).waitFor({ state: 'visible' })

    await page.locator('[data-settings="chat"]').click()
    await page.locator('#overlayRoot [data-overlay="settings"]').waitFor({ state: 'visible' })
    await settingsField(page, '模型').click()
    await page.locator('#overlayRoot [data-picker-value="fixture\u001fmodel-b"]').click()
    await page.locator('#overlayRoot [data-overlay="settings"]').waitFor({ state: 'visible' })
    await settingsField(page, '思考强度').click()
    await page.locator('#overlayRoot [data-picker-value="high"]').click()
    await page.locator('#overlayRoot [data-overlay="settings"]').waitFor({ state: 'visible' })
    await settingsField(page, '会话模式').click()
    await page.locator('#overlayRoot [data-picker-value="code"]').click()
    await page.locator('#overlayRoot [data-overlay="settings"]').waitFor({ state: 'visible' })
    await page.locator('#overlayRoot .sheet-actions .primary-action').click()
    await page.locator('#overlayRoot [role="dialog"]').waitFor({ state: 'hidden' })

    const selectedModel = harness.state.rpcCalls.find(call => call.method === 'session/selectModel')
    const selectedPreset = harness.state.rpcCalls.find(call => call.method === 'agentPresets/select')
    assert.deepEqual(selectedModel?.args, { request: { sessionId: blank.id, provider: 'fixture', model: 'model-b', reasoningEffort: 'high' } })
    assert.deepEqual(selectedPreset?.args, { agentId: blank.id, agentPreset: 'code' })
    assert.equal(harness.state.rpcCalls.filter(call => call.method === 'session/selectModel').length, 1)
    assert.equal(harness.state.rpcCalls.filter(call => call.method === 'agentPresets/select').length, 1)
  }))

  it('shows approval from $events and allows once through $events/result', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await openExistingChat(page)
    await harness.pushPendingApproval('s1', {
      toolName: 'shell', callId: 'call-mobile-1', reason: '命令需要访问工作区外路径', displayReason: '允许执行本次构建',
    })
    const dialog = page.locator('#overlayRoot [data-overlay="approval"]')
    await dialog.waitFor({ state: 'visible' })
    assert.match(await dialog.locator('#interactionDock').textContent(), /允许执行本次构建/)
    await page.locator('[data-interaction="allow"]').click()
    await waitFor(() => harness.state.eventResults.length === 1, 'the approval $events/result')
    assert.deepEqual(harness.state.eventResults[0], {
      clientId: 'fake-events', eventId: 'approval-1', outcome: { kind: 'result', value: 'allowed-once' },
    })
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('#chatComposer').isVisible(), true)
    await page.locator('#toast').filter({ hasText: '已允许一次' }).waitFor({ state: 'visible' })
  }))

  it('selects a pending question option and answers through the real waterfall', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await openExistingChat(page)
    await harness.pushPendingQuestion('s1', {
      questions: [{
        id: 'environment', header: '运行环境', question: '这次任务使用哪个环境？', detail: '回答会通过真 bridge 返回电脑端。',
        options: [{ label: '本地测试', description: '使用隔离夹具' }, { label: '生产环境' }],
      }],
    })
    const dialog = page.locator('#overlayRoot [data-overlay="question"]')
    await dialog.waitFor({ state: 'visible' })
    await page.locator('[data-question-option="0"]').click()
    assert.equal(await page.locator('[data-question-option="0"]').getAttribute('aria-pressed'), 'true')
    await page.locator('[data-interaction="answer"]').click()
    await waitFor(() => harness.state.eventResults.length === 1, 'the question $events/result')
    assert.deepEqual(harness.state.eventResults[0], {
      clientId: 'fake-events', eventId: 'question-1',
      outcome: { kind: 'result', value: { answers: [{ id: 'environment', selected: ['本地测试'] }] } },
    })
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('#chatComposer').isVisible(), true)
  }))

  it('projects queued messages and forwards edit and remove RPC', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await openExistingChat(page)
    await harness.pushQueueProjection('s1', [
      { id: 'queue-edit', content: [{ type: 'text', text: '原始排队消息' }], source: { kind: 'user', rpcId: 'queued-1' } },
      { id: 'queue-remove', content: [{ type: 'text', text: '需要移除的消息' }], source: { kind: 'user', rpcId: 'queued-2' } },
    ])
    await page.waitForFunction(() => document.querySelectorAll('#queueDock [data-queue-id]').length === 6)
    assert.match(await page.locator('#queueDock').textContent(), /原始排队消息/)
    assert.match(await page.locator('#queueDock').textContent(), /需要移除的消息/)
    assert.equal(await page.locator('[data-queue-action="steer"][data-queue-id="queue-edit"]').isEnabled(), true)

    await page.locator('[data-queue-action="edit"][data-queue-id="queue-edit"]').click()
    await page.locator('[data-queue-edit]').fill('已经编辑的排队消息')
    await page.locator('[data-queue-action="save-edit"]').click()
    await page.waitForFunction(() => document.querySelector('#queueDock')?.textContent.includes('已经编辑的排队消息'))
    await page.locator('[data-queue-action="remove"][data-queue-id="queue-remove"]').click()
    await page.waitForFunction(() => !document.querySelector('#queueDock')?.textContent.includes('需要移除的消息'))
    await waitFor(() => harness.state.queueActions.length === 2, 'edit and remove queue RPC')

    assert.deepEqual(harness.state.queueActions.map(({ itemId, action }) => ({ itemId, action })), [
      { itemId: 'queue-edit', action: { kind: 'edit', content: [{ type: 'text', text: '已经编辑的排队消息' }] } },
      { itemId: 'queue-remove', action: { kind: 'remove' } },
    ])
    assert.ok(harness.state.queueActions.every(call => call.sessionId === 's1'))
  }))

  it('forwards steer for a queue item received while the session is running', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await openExistingChat(page)
    await harness.pushQueueProjection('s1', [
      { id: 'queue-steer', content: [{ type: 'text', text: '立即打断执行这条消息' }], source: { kind: 'user', rpcId: 'queued-steer' } },
    ])
    const steer = page.locator('[data-queue-action="steer"][data-queue-id="queue-steer"]')
    await steer.waitFor({ state: 'visible' })
    assert.equal(await steer.isEnabled(), true)
    assert.equal(await page.locator('#stopButton').isVisible(), true)
    await steer.click()
    await waitFor(() => harness.state.queueActions.length === 1, 'the steer queue RPC')
    assert.deepEqual(harness.state.queueActions, [{ sessionId: 's1', itemId: 'queue-steer', action: { kind: 'steer' } }])
    await page.locator('#queueDock').waitFor({ state: 'hidden' })
  }))

  it('sends a selected image in prompt content and retains it after failure', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    const draft = '请检查这张图片'
    await page.locator('#homePrompt').fill(draft)
    await page.locator('#albumInput').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from(ONE_PIXEL_PNG, 'base64') })
    await page.locator('[data-attachment-tray="home"] .attachment-item[data-state="ready"]').waitFor({ state: 'visible' })
    harness.failNext('session/prompt', { code: 'image-prompt-rejected', message: 'Injected image prompt failure' })
    await page.locator('#homeSend').click()
    await page.locator('#chatView').waitFor({ state: 'visible' })
    await page.waitForFunction(() => document.querySelector('#chatError')?.textContent.includes('Injected image prompt failure'))

    const attempt = harness.state.rpcCalls.find(call => call.method === 'session/prompt')
    assert.equal(harness.state.prompts.length, 0)
    assert.deepEqual(attempt?.args.request.content, [
      { type: 'text', text: draft },
      { type: 'image', mediaType: 'image/png', data: ONE_PIXEL_PNG, name: 'pixel.png' },
    ])
    assert.equal(await page.locator('#chatPrompt').inputValue(), draft)
    assert.equal(await page.locator('.message.optimistic').count(), 0)
    assert.equal(await page.locator('.turn-status').count(), 0)
    const retained = page.locator('#chatAttachmentTray .attachment-item[data-state="ready"]')
    await retained.waitFor({ state: 'visible' })
    assert.match(await retained.locator('img').getAttribute('src'), new RegExp(`^data:image/png;base64,${ONE_PIXEL_PNG}`))
    assert.equal(await retained.locator('img').getAttribute('alt'), 'pixel.png')
    assert.equal(await storedDraft(page, attempt?.args.request.sessionId), draft)
  }))

  it('uploads a selected file and retains its draft after prompt failure', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await openExistingChat(page)
    const draft = '请读取这个附件'
    const data = Buffer.from('mobile file upload acceptance').toString('base64')
    await page.locator('#chatPrompt').fill(draft)
    await page.locator('#fileInput').setInputFiles({ name: 'acceptance.txt', mimeType: 'text/plain', buffer: Buffer.from(data, 'base64') })
    await page.locator('#chatAttachmentTray .attachment-item[data-state="ready"]').waitFor({ state: 'visible' })
    harness.failNext('session/prompt', { code: 'file-prompt-rejected', message: 'Injected file prompt failure' })
    await page.locator('#chatSend').click()
    await page.waitForFunction(() => document.querySelector('#chatError')?.textContent.includes('Injected file prompt failure'))

    assert.deepEqual(harness.state.uploads, [{ sessionId: 's1', data, name: 'acceptance.txt' }])
    const attempt = harness.state.rpcCalls.find(call => call.method === 'session/prompt')
    assert.deepEqual(attempt?.args.request.content, [{ type: 'text', text: draft }, { type: 'file', receiptId: 'receipt-1' }])
    assert.equal(harness.state.prompts.length, 0)
    assert.equal(await page.locator('#chatPrompt').inputValue(), draft)
    assert.match(await page.locator('#chatAttachmentTray .attachment-item[data-state="ready"]').textContent(), /acceptance\.txt/)
    assert.equal(await page.locator('.message.optimistic').count(), 0)
    assert.equal(await page.locator('.turn-status').count(), 0)
    assert.equal(await storedDraft(page, 's1'), draft)
  }))

  it('loads earlier pages with beforeSeq and preserves the prepend scroll anchor', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    const recordsFor = (...seqs) => seqs.map(seq => ({ seq, event: { type: 'user/message', data: { message: {
      source: { kind: 'user', rpcId: `history-${seq}` },
      content: [{ type: 'text', text: `历史消息 ${seq} ${'滚动锚点内容。'.repeat(32)}` }],
    } } } }))
    harness.addSession({ id: 'history', title: 'History conversation', updatedAt: 2 })
    harness.setHistoryPages('history', [
      { records: recordsFor(8, 9, 10), hasMore: true },
      { beforeSeq: 8, records: recordsFor(5, 6, 7), hasMore: true },
      { beforeSeq: 5, records: recordsFor(2, 3, 4), hasMore: false },
    ])
    await page.locator('#homeDrawerButton').click()
    await page.locator('#refreshButton').click()
    await page.locator('[data-open-session="history"]').click()
    await page.locator('[data-message-id="user:8"]').waitFor({ state: 'visible' })
    await page.locator('[data-load-earlier]').waitFor({ state: 'visible' })
    await page.locator('[data-load-earlier]').scrollIntoViewIfNeeded()
    const before = await page.locator('#messageScroll').evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight, client: element.clientHeight }))
    assert.ok(before.height > before.client, 'history fixture must produce a real scroll range')

    await page.locator('[data-load-earlier]').click()
    await page.locator('[data-message-id="user:5"]').waitFor({ state: 'visible' })
    await page.locator('[data-load-earlier]').waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('[data-load-earlier]')?.disabled)
    const first = await page.locator('#messageScroll').evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight, client: element.clientHeight }))
    assert.ok(Math.abs(first.top - (before.top + first.height - before.height)) <= 2, `first prepend must preserve its anchor: ${JSON.stringify({ before, first })}`)
    assert.ok(harness.state.rpcCalls.some(call => call.method === 'session/page' && call.args.request.beforeSeq === 8))

    await page.locator('[data-load-earlier]').scrollIntoViewIfNeeded()
    const secondBefore = await page.locator('#messageScroll').evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight }))
    await page.locator('[data-load-earlier]').click()
    await page.locator('[data-message-id="user:2"]').waitFor({ state: 'visible' })
    const second = await page.locator('#messageScroll').evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight }))
    assert.ok(Math.abs(second.top - (secondBefore.top + second.height - secondBefore.height)) <= 2, `second prepend must preserve its anchor: ${JSON.stringify({ secondBefore, second })}`)
    await page.locator('[data-load-earlier]').waitFor({ state: 'hidden' })
    const ids = await page.locator('[data-message-id]').evaluateAll(elements => elements.map(element => element.dataset.messageId))
    assert.deepEqual(ids, [2, 3, 4, 5, 6, 7, 8, 9, 10].map(seq => `user:${seq}`))
    const pages = harness.state.rpcCalls.filter(call => call.method === 'session/page').map(call => call.args.request)
    assert.deepEqual(pages.filter(request => request.beforeSeq !== undefined).map(request => request.beforeSeq), [8, 5])
    assert.ok(pages.every(request => request.address.kind === 'session' && request.address.sessionId === 'history' && request.throughSeq === 10))
  }))

  it('ignores a slow earlier page after leaving and reentering another session', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    const recordsFor = (prefix, ...seqs) => seqs.map(seq => ({ seq, event: { type: 'user/message', data: { message: {
      source: { kind: 'user', rpcId: `${prefix}-${seq}` }, content: [{ type: 'text', text: `${prefix} 消息 ${seq}` }],
    } } } }))
    harness.addSession({ id: 'history-slow', title: 'Slow history', updatedAt: 3 })
    harness.setHistoryPages('history-slow', [
      { records: recordsFor('慢历史', 8, 9, 10), hasMore: true },
      { beforeSeq: 8, records: recordsFor('旧慢响应', 5, 6, 7), hasMore: true },
      { beforeSeq: 5, records: recordsFor('更早慢响应', 2, 3, 4), hasMore: false },
    ])
    await page.locator('#homeDrawerButton').click()
    await page.locator('#refreshButton').click()
    await page.locator('[data-open-session="history-slow"]').click()
    await page.locator('[data-message-id="user:8"]').waitFor({ state: 'visible' })

    const stale = harness.holdNext('session/page', args => args.request?.beforeSeq === 8)
    await page.locator('[data-load-earlier]').click()
    await page.locator('[data-load-earlier][aria-busy="true"]').waitFor({ state: 'visible' })
    await page.locator('#chatDrawerButton').click()
    await page.locator('[data-open-session="s1"]').click()
    await page.locator('[data-message-id="assistant:1:1"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-load-earlier]').count(), 0)
    assert.equal(await page.locator('#messageList').textContent().then(text => text.includes('旧慢响应')), false)

    await page.locator('#chatDrawerButton').click()
    await page.locator('[data-open-session="history-slow"]').click()
    await page.locator('[data-message-id="user:8"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-load-earlier]').isEnabled(), true)
    const current = harness.holdNext('session/page', args => args.request?.beforeSeq === 8)
    await page.locator('[data-load-earlier]').click()
    await page.locator('[data-load-earlier][aria-busy="true"]').waitFor({ state: 'visible' })

    stale.release()
    await waitFor(() => harness.state.completedHolds.some(hold => hold.id === stale.id), 'the stale earlier response to finish')
    await page.waitForTimeout(100)
    assert.equal(await page.locator('[data-load-earlier]').getAttribute('aria-busy'), 'true', 'a stale response must not unlock the current earlier request')
    assert.equal(await page.locator('[data-message-id="user:5"]').count(), 0)
    assert.equal(await page.locator('#chatTitle').textContent(), 'Slow history')

    current.release()
    await waitFor(() => harness.state.completedHolds.some(hold => hold.id === current.id), 'the current earlier response to finish')
    await page.locator('[data-message-id="user:5"]').waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('[data-load-earlier]')?.disabled)
    assert.equal(await page.locator('[data-message-id="user:5"]').count(), 1)
    assert.equal(harness.state.completedHolds.filter(hold => hold.method === 'session/page' && hold.args.request?.beforeSeq === 8).length, 2)
    assert.equal(await page.locator('#chatError').textContent(), '')
  }))

  it('shows a 44px home button and preserves browser history around home and chat', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await page.locator('#homePrompt').fill('返回首页后保留这条草稿')
    await openExistingChat(page)
    const homeButton = page.locator('#chatHomeButton')
    await homeButton.waitFor({ state: 'visible' })
    const bounds = await homeButton.boundingBox()
    assert.ok(bounds.width >= 44 && bounds.height >= 44, `home button touch target must be at least 44px: ${JSON.stringify(bounds)}`)
    assert.equal(await homeButton.getAttribute('aria-label'), '新建任务')
    assert.equal(await page.evaluate(() => history.state?.view), 'chat')

    await homeButton.click()
    await page.locator('#homeView').waitFor({ state: 'visible' })
    assert.equal(await page.evaluate(() => history.state?.view), 'home')
    assert.equal(await page.locator('#homePrompt').inputValue(), '返回首页后保留这条草稿')
    assert.equal(await page.locator('#chatHomeButton').isVisible(), false)

    await page.goBack()
    await page.locator('#chatView').waitFor({ state: 'visible' })
    await page.locator('[data-message-id="assistant:1:1"]').waitFor({ state: 'visible' })
    assert.equal(await page.evaluate(() => history.state?.sessionId), 's1')
    await page.goForward()
    await page.locator('#homeView').waitFor({ state: 'visible' })
    assert.equal(await page.evaluate(() => history.state?.view), 'home')
    assert.equal(await page.locator('#homePrompt').inputValue(), '返回首页后保留这条草稿')
    await assertNoHorizontalOverflow(page)
  }))

  it('captures settled Chinese home, drawer, chat, and settings at 390x844', { timeout: 45_000 }, captureFailureOnThrow(async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => document.querySelector('#homePrompt')?.placeholder.includes('智能体'))
    await page.locator('#homePrompt').fill('为手机浏览器验收准备一张中文首页截图')
    await settleAndCapture(page, 'home')
    await assertNoHorizontalOverflow(page)

    await page.locator('#homeDrawerButton').click()
    await page.locator('#navigationDrawer').waitFor({ state: 'visible' })
    await settleAndCapture(page, 'drawer')
    await page.locator('#drawerClose').click()
    await page.locator('#navigationDrawer').waitFor({ state: 'hidden' })

    await openExistingChat(page)
    await settleAndCapture(page, 'chat')
    await page.locator('[data-settings="chat"]').click()
    await page.locator('#overlayRoot [data-overlay="settings"]').waitFor({ state: 'visible' })
    await settleAndCapture(page, 'model-panel')
    assert.equal(await page.locator('#overlayRoot [role="dialog"]').count(), 1)
    await assertNoHorizontalOverflow(page)
  }))

  it('transitions session actions to rename without resurrecting the old sheet on Android back', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await page.locator('#homeDrawerButton').click()
    await page.locator('[data-session-menu="s1"]').click()
    await page.locator('#overlayRoot [data-overlay="session-actions"]').waitFor({ state: 'visible' })
    await page.locator('[data-sheet-action="rename"]').click()
    await page.locator('#overlayRoot [data-overlay="rename"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#overlayRoot [data-overlay="session-actions"]').count(), 0)
    assert.equal(await page.locator('#overlayRoot [role="dialog"]').count(), 1)

    await page.goBack()
    await page.locator('#overlayRoot [data-overlay="rename"]').waitFor({ state: 'hidden' })
    assert.equal(await page.locator('#overlayRoot [data-overlay="session-actions"]').count(), 0)
    assert.equal(await page.locator('#navigationDrawer').isVisible(), true)

    await page.locator('[data-session-menu="s1"]').click()
    await page.locator('[data-sheet-action="rename"]').click()
    const input = page.locator('#overlayRoot [data-overlay="rename"] .sheet-input')
    await input.waitFor({ state: 'visible' })
    assert.equal(await input.inputValue(), 'Existing conversation')
    await input.fill('手机端重命名后的会话')
    await page.locator('#overlayRoot [data-overlay="rename"] .sheet-actions .primary-action').click()
    await page.locator('#overlayRoot [data-overlay="rename"]').waitFor({ state: 'hidden' })
    const rename = harness.state.rpcCalls.find(call => call.method === 'session/rename')
    assert.deepEqual(rename?.args, { request: { sessionId: 's1', title: '手机端重命名后的会话' } })
    assert.equal(harness.state.rpcCalls.filter(call => call.method === 'session/rename').length, 1)
    assert.equal(await page.locator('[data-open-session="s1"]').getAttribute('data-session-title'), '手机端重命名后的会话')
    assert.equal(await page.locator('#overlayRoot [data-overlay="session-actions"]').count(), 0)
  }))

  it('transitions session actions to archive and does not resurrect the old sheet on Android back', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    await page.locator('#homeDrawerButton').click()
    await page.locator('[data-session-menu="s1"]').click()
    await page.locator('#overlayRoot [data-overlay="session-actions"]').waitFor({ state: 'visible' })
    await page.locator('[data-sheet-action="archive"]').click()
    await page.locator('#overlayRoot [data-overlay="archive"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#overlayRoot [data-overlay="session-actions"]').count(), 0)
    assert.equal(await page.locator('#overlayRoot [role="dialog"]').count(), 1)

    await page.goBack()
    await page.locator('#overlayRoot [data-overlay="archive"]').waitFor({ state: 'hidden' })
    assert.equal(await page.locator('#overlayRoot [data-overlay="session-actions"]').count(), 0)
    assert.equal(await page.locator('#navigationDrawer').isVisible(), true)

    await page.locator('[data-session-menu="s1"]').click()
    await page.locator('[data-sheet-action="archive"]').click()
    await page.locator('#overlayRoot [data-overlay="archive"] .danger-action').click()
    await page.locator('#overlayRoot [data-overlay="archive"]').waitFor({ state: 'hidden' })
    const archive = harness.state.rpcCalls.find(call => call.method === 'workspace/archiveSession')
    assert.deepEqual(archive?.args, { request: { sessionId: 's1' } })
    assert.equal(harness.state.rpcCalls.filter(call => call.method === 'workspace/archiveSession').length, 1)
    assert.deepEqual(harness.state.archivedSessionIds, ['s1'])
    await page.locator('#archiveButton').click()
    await page.locator('[data-open-session="s1"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#overlayRoot [data-overlay="session-actions"]').count(), 0)
  }))

  it('has no horizontal overflow at 320px and 430px', { timeout: 30_000 }, captureFailureOnThrow(async () => {
    for (const width of [320, 430]) {
      await page.setViewportSize({ width, height: 844 })
      await page.locator('#homePrompt').fill(`宽度 ${width}：中文输入与模型设置都不能造成横向溢出。`)
      await assertNoHorizontalOverflow(page)
      await page.locator('#homeDrawerButton').click()
      await page.locator('#navigationDrawer').waitFor({ state: 'visible' })
      await assertNoHorizontalOverflow(page)
      await page.locator('#drawerClose').click()
      await page.locator('#navigationDrawer').waitFor({ state: 'hidden' })
      await openExistingChat(page)
      await assertNoHorizontalOverflow(page)
      await page.locator('#chatDrawerButton').click()
      await page.locator('#newTaskButton').click()
      await page.locator('#homeView').waitFor({ state: 'visible' })
    }
  }))
})

function settingsField(page, label) {
  return page.locator('#overlayRoot .picker-option').filter({ has: page.locator('.picker-option-copy > strong', { hasText: new RegExp(`^${label}$`) }) })
}

async function storedDraft(page, scope) {
  return page.evaluate(key => JSON.parse(localStorage.getItem('dsh-roam-drafts-v1') ?? '{}')[key]?.text ?? '', scope)
}

async function settleAndCapture(page, name) {
  await page.waitForTimeout(300)
  const path = `${UI_ARTIFACT_DIRECTORY}/dsh-roam-ui-${name}.png`
  await page.screenshot({ path, fullPage: true })
  console.log(`Mobile UI screenshot: ${path}`)
}

async function openExistingChat(page, sessionId = 's1', messageSelector = '[data-message-id="assistant:1:1"]') {
  await page.locator('#homeDrawerButton').click()
  await page.locator(`[data-open-session="${sessionId}"]`).click()
  await page.locator(messageSelector).waitFor({ state: 'visible' })
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }))
  assert.ok(dimensions.content <= dimensions.viewport + 1, `360px horizontal overflow: ${JSON.stringify(dimensions)}`)
}

async function captureFailure(page, directory, name) {
  await mkdir(directory, { recursive: true })
  const safeName = name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'failure'
  await page.screenshot({ path: `${directory}/${safeName}.png`, fullPage: true })
  console.error(`Browser failure screenshot: ${directory}/${safeName}.png`)
}

async function waitFor(predicate, description, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for ${description}`)
}
