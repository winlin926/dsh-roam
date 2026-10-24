import { copyFileSync, mkdirSync } from 'node:fs'

const mobileAssets = [
  'index.html', 'styles.css', 'boot.js', 'app.js', 'api.js', 'copy.js',
  'composer.js', 'drawer.js', 'markdown.js', 'messages.js', 'navigation.js',
  'overlays.js', 'state.js', 'stream.js', 'transcript.js', 'viewport.js'
]

copyFileSync('src/client.js', 'lib/client.js')
mkdirSync('lib/mobile', { recursive: true })
for (const file of mobileAssets) copyFileSync(`src/mobile/${file}`, `lib/mobile/${file}`)
