#!/usr/bin/env node
/**
 * Answers the date-of-birth question for the six demo accounts, on the
 * LIVE project.
 *
 *   node scripts/set-demo-ages.mjs --dry-run     # show what it would write
 *   node scripts/set-demo-ages.mjs --confirm     # write it
 *
 * The minimum-age gate (ADR-034) asks every existing account once, on
 * next entry. Six accounts answered by hand, in a browser, the night
 * before an exhibition is six chances to mistype a date into a form that
 * then refuses the account — so it is done here instead, from the same
 * `age.js` the form and the rules agree about.
 *
 * Three of the six consent to showing their age and three do not. That
 * is the point rather than an accident: the consent toggle is a feature
 * to demonstrate, and a page where every profile looks the same shows
 * nothing. Narin hosts, so the number appears beside a host; Min Khant
 * Aung is in the same participants list with it off.
 *
 * It reads the shared demo password from `demo-credentials.local.txt`,
 * which is gitignored, and never prints it. Nothing in the output is a
 * credential.
 *
 * Safe to run more than once: it writes the same values every time.
 */
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getFirestore, serverTimestamp, writeBatch } from 'firebase/firestore'

import { ageOn, isValidDob, meetsMinimumAge, publicAge } from '../src/utils/age.js'

const CREDENTIALS = 'demo-credentials.local.txt'
const ENV = '.env.production'

/**
 * Dates of birth, chosen at random within a plausible range and then
 * pinned here so a re-run does not produce different people. Two
 * constraints beyond the minimum: every age is different, so six
 * accounts do not read as one generated cohort, and no birthday falls
 * within a month of the exhibition, so no number ticks over while
 * somebody is being shown the app.
 */
const ACCOUNTS = [
  {
    email: 'you@smartsync.demo',
    name: 'Min Khant Aung',
    dateOfBirth: '2001-10-25',
    showAge: false,
  },
  {
    email: 'marvin@smart.sync.demo',
    name: 'Zwe Khat Lin',
    dateOfBirth: '1998-04-23',
    showAge: true,
  },
  {
    email: 'lotus@smart.sync.demo',
    name: 'Chaw Yadanar Oo',
    dateOfBirth: '2000-04-28',
    showAge: true,
  },
  { email: 'narin@smartsync.demo', name: 'Narin Suksai', dateOfBirth: '2005-09-02', showAge: true },
  { email: 'june@smartsync.demo', name: 'June Park', dateOfBirth: '2003-12-29', showAge: false },
  { email: 'pim@smartsync.demo', name: 'Pim Charoen', dateOfBirth: '2006-01-28', showAge: false },
]

/** The shared demo password — read, never shown. */
function password() {
  let raw
  try {
    raw = readFileSync(CREDENTIALS, 'utf8')
  } catch {
    throw new Error(`${CREDENTIALS} not found — run this from the repository root.`)
  }
  const found = raw.match(/password[^:\n]*:\s*(\S+)/i)?.[1]
  if (!found) throw new Error(`Could not find a password in ${CREDENTIALS}.`)
  return found
}

function firebaseConfig() {
  const env = Object.fromEntries(
    readFileSync(ENV, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => [
        line.slice(0, line.indexOf('=')).trim(),
        line.slice(line.indexOf('=') + 1).trim(),
      ]),
  )
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
}

/** Exactly what `saveDateOfBirth` does, against the live project. */
async function answerFor(db, uid, { dateOfBirth, showAge }) {
  const batch = writeBatch(db)
  batch.set(
    doc(db, 'users', uid, 'private', 'profile'),
    { dateOfBirth, privacy: { showAge } },
    { merge: true },
  )
  batch.update(doc(db, 'users', uid), {
    age: publicAge({ dateOfBirth, showAge }),
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}

const main = async () => {
  const dryRun = process.argv.includes('--dry-run')
  if (!dryRun && !process.argv.includes('--confirm')) {
    console.error('\nThis writes to the LIVE project.')
    console.error('  --dry-run   show what it would write')
    console.error('  --confirm   write it\n')
    process.exit(2)
  }

  // Checked before anything is written, and against the app's own rules
  // rather than arithmetic done here: a date this refuses is a date the
  // security rules would refuse too, and finding that out halfway
  // through leaves half the accounts answered.
  for (const account of ACCOUNTS) {
    if (!isValidDob(account.dateOfBirth) || !meetsMinimumAge(account.dateOfBirth)) {
      console.error(`${account.name}: ${account.dateOfBirth} is not a date this app would accept.`)
      process.exit(1)
    }
  }

  console.log(`\n${dryRun ? 'Would write' : 'Writing'} to the live project:\n`)
  for (const account of ACCOUNTS) {
    const age = ageOn(account.dateOfBirth)
    const shown = account.showAge ? `shown publicly as ${age}` : 'age kept private'
    console.log(
      `  ${account.name.padEnd(17)} ${account.dateOfBirth}   ${String(age).padEnd(3)} ${shown}`,
    )
  }
  if (dryRun) {
    console.log('\nNothing written. Re-run with --confirm.\n')
    return
  }

  const app = initializeApp(firebaseConfig())
  const auth = getAuth(app)
  const db = getFirestore(app)
  const shared = password()

  console.log('')
  let done = 0
  for (const account of ACCOUNTS) {
    try {
      const { user } = await signInWithEmailAndPassword(auth, account.email, shared)
      await answerFor(db, user.uid, account)
      await signOut(auth)
      done += 1
      console.log(`  ok    ${account.name}`)
    } catch (error) {
      // The message, never the credential that produced it.
      console.log(`  FAIL  ${account.name} — ${error?.code || error?.message || 'unknown error'}`)
    }
  }
  console.log(`\n${done} of ${ACCOUNTS.length} accounts answered.\n`)
  process.exit(done === ACCOUNTS.length ? 0 : 1)
}

main().catch((error) => {
  console.error(`\n${error.message}\n`)
  process.exit(1)
})
