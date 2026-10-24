import { startMobileApp } from './app.js'

try {
  await startMobileApp()
} catch (error) {
  const target = document.getElementById('homeError')
  if (target) target.textContent = error instanceof Error ? error.message : String(error)
  console.error(error)
}
