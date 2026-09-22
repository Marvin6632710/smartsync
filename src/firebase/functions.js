import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import app, { usingEmulators } from './config'

// The callable Functions, in the region they are deployed to, made on
// first use rather than at import: a screen that never asks pays nothing,
// and a test that never asks needs no Firebase app behind the module.
let functions = null
function client() {
  if (functions) return functions
  functions = getFunctions(app, 'us-central1')
  // Under the emulator they answer from the functions emulator on its
  // usual port; the browser never talks to Gemini itself, and never sees
  // the key.
  if (usingEmulators) {
    connectFunctionsEmulator(
      functions,
      '127.0.0.1',
      Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT) || 5001,
    )
  }
  return functions
}

let recommend = null
/**
 * AI Picks: the signed-in person's preference signals and the activities
 * they may see, in; the model's ranking, or the reason there is none, out.
 * Signed with the account's own token by the SDK — the Function refuses
 * anything else.
 */
export function recommendActivitiesCall(data) {
  if (!recommend) {
    // The last and longest of the three budgets: the model call gives up
    // at 90 s, the Function at 110 s, and this at 115 s — so whatever
    // goes wrong, the page hears a reason rather than a dead socket.
    // Long because the free-tier model queues for up to a minute
    // (ADR-032); the page says it is asking the whole time.
    recommend = httpsCallable(client(), 'recommendActivities', { timeout: 115_000 })
  }
  return recommend(data)
}
