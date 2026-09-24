import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

import { auth, db } from './config'
import { client } from './functions'

const callable = (name, timeout = 30_000) => httpsCallable(client(), name, { timeout })

let contentAction
let securityAction
let submitAppealCall
let resolveAppealCall
let announcementAction

export async function runAdminContentAction(data) {
  contentAction ||= callable('adminContentAction')
  return (await contentAction(data)).data
}

export async function runAdminSecurityAction(data) {
  securityAction ||= callable('adminSecurityAction')
  return (await securityAction(data)).data
}

export async function submitModerationAppeal(data) {
  submitAppealCall ||= callable('submitModerationAppeal')
  return (await submitAppealCall(data)).data
}

export async function decideModerationAppeal(data) {
  resolveAppealCall ||= callable('resolveModerationAppeal')
  return (await resolveAppealCall(data)).data
}

export async function runAnnouncementAction(data) {
  announcementAction ||= callable('adminAnnouncementAction')
  return (await announcementAction(data)).data
}

const atMillis = (value) => (value?.toMillis?.() ?? Number(value)) || 0
const rows = (snap) =>
  snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => atMillis(b.createdAt) - atMillis(a.createdAt))

export function watchModerationAppeals(callback, onError, { mine = false } = {}) {
  const base = collection(db, 'moderationAppeals')
  const q = mine
    ? query(base, where('subjectId', '==', auth.currentUser?.uid || '__none__'), limit(100))
    : query(base, orderBy('createdAt', 'desc'), limit(100))
  return onSnapshot(q, (snap) => callback(rows(snap)), onError)
}

export function watchAnnouncements(callback, onError) {
  return onSnapshot(
    query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(30)),
    (snap) => callback(rows(snap)),
    onError,
  )
}
