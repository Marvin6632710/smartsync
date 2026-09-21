import { loadEnv } from 'vite'

const config = loadEnv('production', process.cwd(), 'VITE_GOOGLE_MAPS_')
const missing = ['VITE_GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_MAP_ID'].filter(
  (name) => !config[name]?.trim(),
)
if (missing.length) {
  console.error(
    `Google Maps is not ready for deployment. Set ${missing.join(' and ')} in .env.production.`,
  )
  process.exitCode = 1
} else if (config.VITE_GOOGLE_MAPS_MAP_ID.trim() === 'DEMO_MAP_ID') {
  console.error(
    'Create your own Google Maps JavaScript map ID before deploying; DEMO_MAP_ID is for testing.',
  )
  process.exitCode = 1
} else {
  console.log('Google Maps production configuration is present.')
}
