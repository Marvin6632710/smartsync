#!/usr/bin/env node
/**
 * Chat moderation, checked against the live site.
 *
 * Everything else in this repository is tested against the emulator and
 * a stand-in. This is the one script that talks to the deployed
 * Functions, the deployed rules and the real Moderation API, signed in
 * as a real account — which is the only way to know that what was
 * verified locally is also true of what people actually use.
 *
 *   node scripts/live-chat-check.mjs <activityId>
 *   node scripts/live-chat-check.mjs --list      # activities you have joined
 *
 * It reads the account and password from `demo-credentials.local.txt`,
 * which is ignored by git, and never prints either. Nothing in the
 * output contains a credential.
 *
 * TWO THINGS TO KNOW BEFORE RUNNING IT
 *
 * 1. The messages that are *meant* to pass will really be posted, in a
 *    real thread, visible to everyone else in that activity. The rules
 *    make a thread append-only, so they cannot be deleted afterwards —
 *    they expire with the thread, thirty days after the activity. The
 *    wording is deliberately dull and self-explaining for that reason.
 *    Pick an activity where that is fine.
 * 2. The messages that are meant to be refused are never posted. That
 *    is the thing being tested.
 */
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, query, where } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

const CREDENTIALS = 'demo-credentials.local.txt'
const ENV = '.env.production'

/** The account to sign in as, and its password — read, never shown. */
function credentials() {
  let raw
  try {
    raw = readFileSync(CREDENTIALS, 'utf8')
  } catch {
    throw new Error(`${CREDENTIALS} not found — run this from the repository root.`)
  }
  const password = raw.match(/password[^:\n]*:\s*(\S+)/i)?.[1]
  const email = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]
  if (!password || !email) {
    throw new Error(`Could not find an email and a password in ${CREDENTIALS}.`)
  }
  return { email, password }
}

function firebaseConfig() {
  const env = Object.fromEntries(
    readFileSync(ENV, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
  )
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
}

const newId = () =>
  [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * `want` is what SmartSync must do, not what the message is. The five
 * that must pass are the hard half: swearing, blunt criticism of an
 * idea, competitive teasing and somebody saying they are struggling all
 * score as harassment to some degree, and refusing any of them would
 * make the chat unusable. See README §11 for the measured scores.
 */
const CASES = [
  ['pass', 'ordinary', 'Checking the new message filter, ignore this one'],
  ['pass', 'swearing', 'the bloody bus was late again, what a shit morning'],
  ['pass', 'criticism of an idea', 'honestly your idea is rubbish and you did not think it through'],
  ['pass', 'competitive teasing', 'you are so bad at this game it is actually impressive'],
  ['pass', 'somebody struggling', 'I have been feeling really low lately, might sit this one out'],
  ['block', 'personal attack', 'nobody likes you, you are pathetic and everyone here knows it'],
  ['block', 'pile-on', 'she is a fat ugly cow, look at her, what a joke'],
]

const main = async () => {
  const activityId = process.argv[2]
  const listing = activityId === '--list'
  if (!activityId) {
    console.error('Usage: node scripts/live-chat-check.mjs <activityId>')
    console.error('       node scripts/live-chat-check.mjs --list')
    process.exit(2)
  }

  const { email, password } = credentials()
  const app = initializeApp(firebaseConfig())
  const auth = getAuth(app)
  const db = getFirestore(app)
  const functions = getFunctions(app, 'us-central1')

  const { user } = await signInWithEmailAndPassword(auth, email, password)
  console.log(`Signed in as ${email} on ${firebaseConfig().projectId}\n`)

  if (listing) {
    const mine = await getDocs(
      query(collection(db, 'activities'), where('participantUids', 'array-contains', user.uid)),
    )
    if (mine.empty) console.log('You have not joined any activity yet.')
    for (const activity of mine.docs) {
      const data = activity.data()
      console.log(`  ${activity.id}  ${data.title}  (${data.participantUids?.length ?? 0} people)`)
    }
    await signOut(auth)
    return
  }

  const activity = await getDoc(doc(db, 'activities', activityId))
  if (!activity.exists()) throw new Error(`No activity ${activityId}.`)
  console.log(`Thread: ${activity.data().title}`)
  console.log('Messages that should pass WILL be posted and cannot be deleted.\n')

  const send = httpsCallable(functions, 'sendChatMessageCall', { timeout: 70_000 })
  let correct = 0
  console.log('    want   case                   result                    in the thread?')
  console.log('    ' + '-'.repeat(74))
  for (const [want, label, text] of CASES) {
    const clientMsgId = newId()
    let outcome
    try {
      outcome = (await send({ activityId, clientMsgId, text })).data
    } catch (error) {
      console.log(`  ? ${want.padEnd(6)} ${label.padEnd(22)} THREW ${error.code || error.message}`)
      continue
    }
    const landed = (await getDoc(doc(db, 'activities', activityId, 'messages', clientMsgId))).exists()
    const sent = outcome.status === 'sent'
    const ok = (want === 'pass') === sent && sent === landed
    if (ok) correct += 1
    const said = sent ? 'sent' : `${outcome.status}${outcome.reason ? ` · ${outcome.reason}` : ''}`
    console.log(
      `  ${ok ? '✓' : '✗'} ${want.padEnd(6)} ${label.padEnd(22)} ${said.padEnd(25)} ${landed ? 'yes' : 'no'}`,
    )
  }

  // The claim the whole design rests on: not that the app checks
  // messages, but that the database refuses one that has not been
  // checked. If this write succeeds, everything above is decoration.
  console.log('\n    the bypass — writing to the thread directly, moderation skipped')
  let bypass
  try {
    await addDoc(collection(db, 'activities', activityId, 'messages'), {
      senderId: user.uid,
      senderName: 'direct write',
      text: 'this never went through the moderator',
      createdAt: Date.now(),
    })
    bypass = false
    console.log('  ✗ ALLOWED — the rules are not deployed. Nothing above can be trusted.')
  } catch (error) {
    bypass = error.code === 'permission-denied'
    console.log(`  ${bypass ? '✓' : '?'} refused — ${error.code}`)
  }

  const total = CASES.length + 1
  console.log(`\n${correct + (bypass ? 1 : 0)}/${total} as intended.`)
  await signOut(auth)
}

main().then(
  () => process.exit(0),
  (error) => {
    // Never let a stack trace carry the contents of the credentials file.
    console.error(`Failed: ${error.message}`)
    process.exit(1)
  },
)
