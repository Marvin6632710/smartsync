/**
 * Copies the app's locale files and the notification kind table into the
 * functions package, so a push is worded from the same strings as the
 * screen. Run before the emulator and before a deploy (firebase.json's
 * predeploy does the latter); the copies are not committed.
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, '..', '..', 'src', 'i18n')
const target = join(here, '..', 'locales')

mkdirSync(target, { recursive: true })
for (const file of readdirSync(join(source, 'locales'))) {
  if (file.endsWith('.json')) copyFileSync(join(source, 'locales', file), join(target, file))
}
copyFileSync(join(source, 'notificationKinds.json'), join(target, 'notificationKinds.json'))
console.log(`locales synced to ${target}`)
