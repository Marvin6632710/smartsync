/**
 * Trusted admin operations.
 *
 * The browser is deliberately not allowed to edit somebody else's profile,
 * picture or message. These operations therefore live beside chat moderation:
 * a callable proves the caller is an active admin, narrows the requested
 * change to one named action, preserves removed content in a server-only
 * vault, and writes an audit row in the same transaction.
 */
import { createHash, randomUUID } from 'node:crypto'

const ID = /^[A-Za-z0-9_-]{1,128}$/
const PROFILE_FIELDS = new Set(['picture', 'bio', 'username'])
const APPEAL_KINDS = new Set([
  'profile-picture',
  'profile-bio',
  'profile-username',
  'activity-picture',
  'message',
  'suspension',
  'closure',
  'activity',
])
const AUDIENCES = new Set(['all', 'hosts', 'participants'])
const APPEAL_REVIEW_LEASE_MS = 5 * 60 * 1000

const text = (value, max) =>
  String(value || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max)

const id = (value, name = 'id') => {
  const clean = String(value || '')
  if (!ID.test(clean))
    throw Object.assign(new Error(`${name} is not an id`), { code: 'invalid-argument' })
  return clean
}

const millis = (value) => (value?.toMillis?.() ?? Number(value)) || null

export function suspensionActive(role, now = Date.now()) {
  if (role?.suspended !== true) return false
  const until = millis(role.suspendedUntil)
  return !until || until > now
}

function denied(message) {
  throw Object.assign(new Error(message), { code: 'permission-denied' })
}

async function activeAdmin(db, uid, now = Date.now()) {
  const snap = await db.doc(`roles/${uid}`).get()
  const role = snap.data() || {}
  if (role.role !== 'admin' || role.banned === true || suspensionActive(role, now)) {
    denied('An active admin account is required.')
  }
  return role
}

async function ordinaryTarget(db, adminId, uid) {
  if (adminId === uid) denied('Admins cannot act on themselves.')
  const snap = await db.doc(`roles/${uid}`).get()
  if (snap.data()?.role === 'admin') denied('Admins cannot act on another admin.')
}

const audit = (tx, db, FieldValue, row) => {
  const ref = db.collection('moderationLog').doc()
  tx.set(ref, {
    ...row,
    reason: text(row.reason, 500),
    at: FieldValue.serverTimestamp(),
  })
  return ref.id
}

const notify = (tx, db, FieldValue, uid, { title, body, kind, params = {}, activityId }) => {
  const ref = db.collection(`users/${uid}/notifications`).doc()
  tx.set(ref, {
    type: 'moderation',
    title: text(title, 120),
    body: text(body, 300),
    kind,
    params: Object.fromEntries(
      Object.entries(params)
        .slice(0, 8)
        .map(([key, value]) => [key, text(value, 300)]),
    ),
    ...(activityId ? { activityId } : {}),
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  })
}

const moderationEntry = (data, field) => data?.contentModeration?.[field] || null

/** Remove or restore one public profile field. */
async function profileContent({ db, FieldValue, adminId, targetId, field, remove, reason }) {
  if (!PROFILE_FIELDS.has(field))
    throw Object.assign(new Error('Unknown profile field.'), { code: 'invalid-argument' })
  await ordinaryTarget(db, adminId, targetId)
  const userRef = db.doc(`users/${targetId}`)
  const pictureRef = db.doc(`profilePictures/${targetId}`)
  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) return { status: 'not-found' }
    const profile = userSnap.data() || {}
    const current = moderationEntry(profile, field)
    if (remove && current?.active === true) return { status: 'already-removed' }
    if (!remove && current?.active !== true) return { status: 'already-restored' }

    if (remove) {
      const actionId = db.collection('moderationVault').doc().id
      const vaultRef = db.doc(`moderationVault/${actionId}`)
      let stored
      if (field === 'picture') {
        const picture = await tx.get(pictureRef)
        if (!picture.exists || !profile.pictureVersion) return { status: 'nothing-to-remove' }
        stored = { picture: picture.data(), pictureVersion: profile.pictureVersion }
        tx.delete(pictureRef)
        tx.update(userRef, {
          pictureVersion: FieldValue.delete(),
          [`contentModeration.${field}`]: { active: true, actionId },
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else {
        const value = String(profile[field] || '')
        if (!value) return { status: 'nothing-to-remove' }
        stored = { value }
        tx.update(userRef, {
          [field]: field === 'username' ? '@removed' : '',
          [`contentModeration.${field}`]: { active: true, actionId },
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      tx.set(vaultRef, {
        kind: `profile-${field}`,
        subjectId: targetId,
        ...stored,
        createdAt: FieldValue.serverTimestamp(),
      })
      audit(tx, db, FieldValue, {
        kind: `profile-${field}-remove`,
        by: adminId,
        subjectId: targetId,
        reason,
      })
      notify(tx, db, FieldValue, targetId, {
        title: 'Profile content removed',
        body: `SmartSync removed part of your public profile: ${reason}`,
        kind: 'profileContentRemoved',
        params: { field, reason },
      })
      return { status: 'removed' }
    }

    const vault = await tx.get(db.doc(`moderationVault/${current.actionId}`))
    if (!vault.exists) return { status: 'original-unavailable' }
    const saved = vault.data() || {}
    if (field === 'picture') {
      if (!saved.picture || !saved.pictureVersion) return { status: 'original-unavailable' }
      tx.set(pictureRef, saved.picture)
      tx.update(userRef, {
        pictureVersion: saved.pictureVersion,
        [`contentModeration.${field}`]: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      tx.update(userRef, {
        [field]: saved.value || (field === 'username' ? '@user' : ''),
        [`contentModeration.${field}`]: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    audit(tx, db, FieldValue, {
      kind: `profile-${field}-restore`,
      by: adminId,
      subjectId: targetId,
      reason,
    })
    notify(tx, db, FieldValue, targetId, {
      title: 'Profile content restored',
      body: `SmartSync restored part of your public profile: ${reason}`,
      kind: 'profileContentRestored',
      params: { field, reason },
    })
    return { status: 'restored' }
  })
}

/** Remove or restore an activity's picture without removing the activity. */
async function activityPicture({ db, FieldValue, adminId, activityId, remove, reason }) {
  const activityRef = db.doc(`activities/${activityId}`)
  const pictureRef = db.doc(`activityPictures/${activityId}`)
  return db.runTransaction(async (tx) => {
    const activitySnap = await tx.get(activityRef)
    if (!activitySnap.exists) return { status: 'not-found' }
    const activity = activitySnap.data() || {}
    await ordinaryTarget(db, adminId, activity.hostId)
    const current = moderationEntry(activity, 'picture')
    if (remove && current?.active === true) return { status: 'already-removed' }
    if (!remove && current?.active !== true) return { status: 'already-restored' }
    if (remove) {
      const picture = await tx.get(pictureRef)
      if (!picture.exists || !activity.pictureVersion) return { status: 'nothing-to-remove' }
      const actionId = db.collection('moderationVault').doc().id
      tx.set(db.doc(`moderationVault/${actionId}`), {
        kind: 'activity-picture',
        subjectId: activity.hostId,
        activityId,
        picture: picture.data(),
        pictureVersion: activity.pictureVersion,
        createdAt: FieldValue.serverTimestamp(),
      })
      tx.delete(pictureRef)
      tx.update(activityRef, {
        pictureVersion: FieldValue.delete(),
        'contentModeration.picture': { active: true, actionId },
        updatedAt: FieldValue.serverTimestamp(),
      })
      audit(tx, db, FieldValue, {
        kind: 'activity-picture-remove',
        by: adminId,
        subjectId: activity.hostId,
        activityId,
        reason,
      })
      notify(tx, db, FieldValue, activity.hostId, {
        title: 'Activity picture removed',
        body: `SmartSync removed the picture from "${text(activity.title, 100)}": ${reason}`,
        kind: 'activityPictureRemoved',
        params: { title: activity.title, reason },
        activityId,
      })
      return { status: 'removed' }
    }
    const vault = await tx.get(db.doc(`moderationVault/${current.actionId}`))
    const saved = vault.data() || {}
    if (!vault.exists || !saved.picture || !saved.pictureVersion)
      return { status: 'original-unavailable' }
    tx.set(pictureRef, saved.picture)
    tx.update(activityRef, {
      pictureVersion: saved.pictureVersion,
      'contentModeration.picture': FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    audit(tx, db, FieldValue, {
      kind: 'activity-picture-restore',
      by: adminId,
      subjectId: activity.hostId,
      activityId,
      reason,
    })
    notify(tx, db, FieldValue, activity.hostId, {
      title: 'Activity picture restored',
      body: `SmartSync restored the picture for "${text(activity.title, 100)}": ${reason}`,
      kind: 'activityPictureRestored',
      params: { title: activity.title, reason },
      activityId,
    })
    return { status: 'restored' }
  })
}

/** Hide or restore a message that passed automatic moderation. */
async function messageContent({ db, FieldValue, adminId, activityId, messageId, remove, reason }) {
  const messageRef = db.doc(`activities/${activityId}/messages/${messageId}`)
  const pictureRef = db.doc(`chatPictures/${messageId}`)
  return db.runTransaction(async (tx) => {
    const messageSnap = await tx.get(messageRef)
    if (!messageSnap.exists) return { status: 'not-found' }
    const message = messageSnap.data() || {}
    await ordinaryTarget(db, adminId, message.senderId)
    const current = moderationEntry(message, 'message')
    if (remove && current?.active === true) return { status: 'already-removed' }
    if (!remove && current?.active !== true) return { status: 'already-restored' }
    if (remove) {
      const picture = message.hasImage === true ? await tx.get(pictureRef) : null
      const actionId = db.collection('moderationVault').doc().id
      tx.set(db.doc(`moderationVault/${actionId}`), {
        kind: 'message',
        subjectId: message.senderId,
        activityId,
        messageId,
        text: message.text || '',
        hasImage: message.hasImage === true,
        ...(picture?.exists ? { picture: picture.data() } : {}),
        createdAt: FieldValue.serverTimestamp(),
      })
      if (picture?.exists) tx.delete(pictureRef)
      tx.update(messageRef, {
        text: '',
        hasImage: false,
        'contentModeration.message': {
          active: true,
          actionId,
          by: adminId,
          reason: text(reason, 300),
        },
      })
      audit(tx, db, FieldValue, {
        kind: 'message-remove',
        by: adminId,
        subjectId: message.senderId,
        activityId,
        messageId,
        reason,
      })
      notify(tx, db, FieldValue, message.senderId, {
        title: 'Chat message removed',
        body: `SmartSync removed one of your chat messages: ${reason}`,
        kind: 'messageRemoved',
        params: { reason },
        activityId,
      })
      return { status: 'removed' }
    }
    const vault = await tx.get(db.doc(`moderationVault/${current.actionId}`))
    const saved = vault.data() || {}
    if (!vault.exists) return { status: 'original-unavailable' }
    tx.update(messageRef, {
      text: saved.text || '',
      hasImage: saved.hasImage === true,
      'contentModeration.message': FieldValue.delete(),
    })
    if (saved.hasImage === true && saved.picture) tx.set(pictureRef, saved.picture)
    audit(tx, db, FieldValue, {
      kind: 'message-restore',
      by: adminId,
      subjectId: message.senderId,
      activityId,
      messageId,
      reason,
    })
    notify(tx, db, FieldValue, message.senderId, {
      title: 'Chat message restored',
      body: `SmartSync restored one of your chat messages: ${reason}`,
      kind: 'messageRestored',
      params: { reason },
      activityId,
    })
    return { status: 'restored' }
  })
}

export async function performContentAction({ db, FieldValue, adminId, data }) {
  await activeAdmin(db, adminId)
  const action = String(data?.action || '')
  if (action === 'message-status') {
    const activityId = id(data.activityId, 'activityId')
    const messageId = id(data.messageId, 'messageId')
    const snap = await db.doc(`activities/${activityId}/messages/${messageId}`).get()
    if (!snap.exists) return { status: 'not-found' }
    await ordinaryTarget(db, adminId, snap.data()?.senderId)
    return {
      status: moderationEntry(snap.data(), 'message')?.active === true ? 'removed' : 'available',
    }
  }
  const reason = text(data?.reason, 500)
  if (!reason) throw Object.assign(new Error('A reason is required.'), { code: 'invalid-argument' })
  if (action === 'remove-profile' || action === 'restore-profile') {
    return profileContent({
      db,
      FieldValue,
      adminId,
      targetId: id(data.targetId, 'targetId'),
      field: String(data.field || ''),
      remove: action === 'remove-profile',
      reason,
    })
  }
  if (action === 'remove-activity-picture' || action === 'restore-activity-picture') {
    return activityPicture({
      db,
      FieldValue,
      adminId,
      activityId: id(data.activityId, 'activityId'),
      remove: action === 'remove-activity-picture',
      reason,
    })
  }
  if (action === 'remove-message' || action === 'restore-message') {
    return messageContent({
      db,
      FieldValue,
      adminId,
      activityId: id(data.activityId, 'activityId'),
      messageId: id(data.messageId, 'messageId'),
      remove: action === 'remove-message',
      reason,
    })
  }
  throw Object.assign(new Error('Unknown content action.'), { code: 'invalid-argument' })
}

/** Security actions never expose the target's email to the calling browser. */
export async function performSecurityAction({
  db,
  FieldValue,
  auth,
  credential,
  projectId,
  adminId,
  data,
  fetchImpl = fetch,
  authEmulatorHost,
}) {
  await activeAdmin(db, adminId)
  const targetId = id(data?.targetId, 'targetId')
  await ordinaryTarget(db, adminId, targetId)
  const action = String(data?.action || '')
  const reason = text(data?.reason, 500)
  if (!reason) throw Object.assign(new Error('A reason is required.'), { code: 'invalid-argument' })
  const account = await auth.getUser(targetId)
  if (action === 'revoke-sessions') {
    await auth.revokeRefreshTokens(targetId)
  } else if (action === 'send-password-reset') {
    if (!account.email) return { status: 'no-email' }
    const emulator = text(authEmulatorHost, 200)
    const token = emulator ? null : await credential.getAccessToken()
    const endpoint = emulator
      ? `http://${emulator}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=emulator-key`
      : 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode'
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token.access_token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email: account.email,
        targetProjectId: projectId,
      }),
    })
    if (!response.ok)
      throw Object.assign(new Error('Password reset email could not be sent.'), {
        code: 'unavailable',
      })
  } else {
    throw Object.assign(new Error('Unknown security action.'), { code: 'invalid-argument' })
  }
  const batch = db.batch()
  audit(batch, db, FieldValue, {
    kind: action,
    by: adminId,
    subjectId: targetId,
    reason,
  })
  notify(batch, db, FieldValue, targetId, {
    title: action === 'revoke-sessions' ? 'Signed out for security' : 'Password reset requested',
    body:
      action === 'revoke-sessions'
        ? `SmartSync signed your other sessions out: ${reason}`
        : `SmartSync sent a password-reset email after an admin security review: ${reason}`,
    kind: action === 'revoke-sessions' ? 'sessionsRevoked' : 'passwordResetSent',
    params: { reason },
  })
  await batch.commit()
  return { status: action === 'revoke-sessions' ? 'revoked' : 'sent' }
}

async function appealState(db, uid, kind, targetId, activityId) {
  if (kind.startsWith('profile-')) {
    const field = kind.slice('profile-'.length)
    const snap = await db.doc(`users/${uid}`).get()
    const entry = moderationEntry(snap.data(), field)
    return entry?.active
      ? { token: entry.actionId || 'active', subjectId: uid, targetId: uid }
      : null
  }
  if (kind === 'activity-picture' || kind === 'activity') {
    const snap = await db.doc(`activities/${targetId}`).get()
    const row = snap.data() || {}
    if (!snap.exists || row.hostId !== uid) denied('This is not your activity.')
    if (kind === 'activity-picture') {
      const entry = moderationEntry(row, 'picture')
      return entry?.active ? { token: entry.actionId || 'active', subjectId: uid, targetId } : null
    }
    return row.status === 'removed'
      ? {
          token: String(millis(row.updatedAt) || row.moderation?.reason || 'removed'),
          subjectId: uid,
          targetId,
        }
      : null
  }
  if (kind === 'message') {
    const snap = await db.doc(`activities/${activityId}/messages/${targetId}`).get()
    const row = snap.data() || {}
    if (!snap.exists || row.senderId !== uid) denied('This is not your message.')
    const entry = moderationEntry(row, 'message')
    return entry?.active
      ? { token: entry.actionId || 'active', subjectId: uid, targetId, activityId }
      : null
  }
  const role = (await db.doc(`roles/${uid}`).get()).data() || {}
  if (kind === 'suspension' && suspensionActive(role)) {
    return {
      token: String(millis(role.suspendedAt) || millis(role.suspendedUntil) || 'active'),
      subjectId: uid,
      targetId: uid,
    }
  }
  if (kind === 'closure' && role.banned === true) {
    return { token: String(millis(role.bannedAt) || 'closed'), subjectId: uid, targetId: uid }
  }
  return null
}

export async function submitAppeal({ db, FieldValue, uid, data }) {
  const kind = String(data?.kind || '')
  if (!APPEAL_KINDS.has(kind))
    throw Object.assign(new Error('Unknown appeal type.'), { code: 'invalid-argument' })
  const targetId = id(data?.targetId || uid, 'targetId')
  const activityId = data?.activityId ? id(data.activityId, 'activityId') : null
  const detail = text(data?.detail, 1000)
  if (detail.length < 10)
    throw Object.assign(new Error('Please explain the appeal.'), { code: 'invalid-argument' })
  const state = await appealState(db, uid, kind, targetId, activityId)
  if (!state) return { status: 'not-appealable' }
  const appealId = createHash('sha256')
    .update([uid, kind, targetId, activityId || '', state.token].join('|'))
    .digest('hex')
    .slice(0, 40)
  const ref = db.doc(`moderationAppeals/${appealId}`)
  const existing = await ref.get()
  if (existing.exists) return { status: existing.data()?.status || 'open', id: appealId }
  await ref.set({
    subjectId: uid,
    kind,
    targetId,
    ...(activityId ? { activityId } : {}),
    actionToken: state.token,
    detail,
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  })
  return { status: 'open', id: appealId }
}

async function reverseAppeal({ db, FieldValue, adminId, appeal, reason }) {
  const { kind, targetId, activityId, subjectId } = appeal
  if (kind.startsWith('profile-')) {
    return profileContent({
      db,
      FieldValue,
      adminId,
      targetId: subjectId,
      field: kind.slice('profile-'.length),
      remove: false,
      reason,
    })
  }
  if (kind === 'activity-picture') {
    return activityPicture({ db, FieldValue, adminId, activityId: targetId, remove: false, reason })
  }
  if (kind === 'message') {
    return messageContent({
      db,
      FieldValue,
      adminId,
      activityId,
      messageId: targetId,
      remove: false,
      reason,
    })
  }
  if (kind === 'suspension') {
    await db.doc(`roles/${subjectId}`).set(
      {
        role: 'user',
        suspended: false,
        suspendedUntil: FieldValue.delete(),
        suspendedAt: FieldValue.delete(),
      },
      { merge: true },
    )
    return { status: 'restored' }
  }
  if (kind === 'closure') {
    await db
      .doc(`roles/${subjectId}`)
      .set({ role: 'user', banned: false, bannedAt: FieldValue.delete() }, { merge: true })
    return { status: 'restored' }
  }
  if (kind === 'activity') {
    const ref = db.doc(`activities/${targetId}`)
    const snap = await ref.get()
    if (snap.exists && snap.data()?.status === 'removed') {
      await ref.update({
        status: 'active',
        moderation: { by: adminId, reason: text(reason, 300) },
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    return { status: 'restored' }
  }
  return { status: 'not-appealable' }
}

async function claimAppeal({ db, FieldValue, ref, adminId }) {
  const reviewToken = randomUUID()
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { status: 'not-found' }
    const appeal = snap.data() || {}
    if (appeal.status === 'reviewing') {
      const claimedAt = millis(appeal.reviewingAt)
      if (!claimedAt || claimedAt > Date.now() - APPEAL_REVIEW_LEASE_MS) {
        return { status: 'reviewing' }
      }
    } else if (appeal.status !== 'open') {
      return { status: appeal.status }
    }
    tx.update(ref, {
      status: 'reviewing',
      reviewingBy: adminId,
      reviewingAt: FieldValue.serverTimestamp(),
      reviewToken,
    })
    return { status: 'claimed', appeal, reviewToken }
  })
}

async function releaseAppealClaim({ db, FieldValue, ref, reviewToken }) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const row = snap.data() || {}
    if (!snap.exists || row.status !== 'reviewing' || row.reviewToken !== reviewToken) return
    tx.update(ref, {
      status: 'open',
      reviewingBy: FieldValue.delete(),
      reviewingAt: FieldValue.delete(),
      reviewToken: FieldValue.delete(),
    })
  })
}

export async function resolveAppeal({ db, FieldValue, adminId, data }) {
  await activeAdmin(db, adminId)
  const appealId = id(data?.appealId, 'appealId')
  const decision = String(data?.decision || '')
  const reason = text(data?.reason, 500)
  if (!['uphold', 'reverse'].includes(decision) || !reason) {
    throw Object.assign(new Error('A decision and reason are required.'), {
      code: 'invalid-argument',
    })
  }
  const ref = db.doc(`moderationAppeals/${appealId}`)
  const snap = await ref.get()
  if (!snap.exists) return { status: 'not-found' }
  const appeal = snap.data() || {}
  if (!['open', 'reviewing'].includes(appeal.status)) return { status: appeal.status }
  if (appeal.subjectId === adminId) denied('Admins cannot decide their own appeal.')
  await ordinaryTarget(db, adminId, appeal.subjectId)
  const claim = await claimAppeal({ db, FieldValue, ref, adminId })
  if (claim.status !== 'claimed') return { status: claim.status }
  const claimedAppeal = claim.appeal
  try {
    const current = await appealState(
      db,
      claimedAppeal.subjectId,
      claimedAppeal.kind,
      claimedAppeal.targetId,
      claimedAppeal.activityId,
    )
    // A resolved action can be followed by a new action on the same field.
    // The first appeal must never reverse the later decision, so its action
    // token travels with it and is compared again at decision time.
    const stale = !current || current.token !== claimedAppeal.actionToken
    if (decision === 'reverse' && !stale) {
      const result = await reverseAppeal({
        db,
        FieldValue,
        adminId,
        appeal: claimedAppeal,
        reason,
      })
      if (!['restored', 'already-restored'].includes(result.status)) {
        await releaseAppealClaim({ db, FieldValue, ref, reviewToken: claim.reviewToken })
        return result
      }
    }
    const finalStatus = stale || decision === 'reverse' ? 'reversed' : 'upheld'
    const outcome = stale ? 'The original moderation action is no longer active.' : reason
    const completed = await db.runTransaction(async (tx) => {
      const latest = await tx.get(ref)
      const row = latest.data() || {}
      if (!latest.exists || row.status !== 'reviewing' || row.reviewToken !== claim.reviewToken) {
        return false
      }
      tx.update(ref, {
        status: finalStatus,
        reviewedBy: adminId,
        reviewedAt: FieldValue.serverTimestamp(),
        outcome,
        reviewingBy: FieldValue.delete(),
        reviewingAt: FieldValue.delete(),
        reviewToken: FieldValue.delete(),
      })
      audit(tx, db, FieldValue, {
        kind: finalStatus === 'reversed' ? 'appeal-reverse' : 'appeal-uphold',
        by: adminId,
        subjectId: claimedAppeal.subjectId,
        activityId: claimedAppeal.kind.startsWith('activity')
          ? claimedAppeal.targetId
          : claimedAppeal.activityId,
        reason: stale ? 'The original moderation action was already reversed or replaced.' : reason,
      })
      notify(tx, db, FieldValue, claimedAppeal.subjectId, {
        title: finalStatus === 'reversed' ? 'Your appeal was accepted' : 'Your appeal was reviewed',
        body: outcome,
        kind: finalStatus === 'reversed' ? 'appealReversed' : 'appealUpheld',
        params: { reason: outcome },
        activityId:
          claimedAppeal.activityId ||
          (claimedAppeal.kind.startsWith('activity') ? claimedAppeal.targetId : null),
      })
      return true
    })
    return { status: completed ? finalStatus : 'reviewing' }
  } catch (error) {
    await releaseAppealClaim({ db, FieldValue, ref, reviewToken: claim.reviewToken })
    throw error
  }
}

export async function performAnnouncementAction({ db, FieldValue, adminId, data }) {
  await activeAdmin(db, adminId)
  const action = String(data?.action || '')
  if (action === 'expire') {
    const announcementId = id(data?.announcementId, 'announcementId')
    const reason = text(data?.reason, 500)
    if (!reason)
      throw Object.assign(new Error('A reason is required.'), { code: 'invalid-argument' })
    const announcementRef = db.doc(`announcements/${announcementId}`)
    const existing = await announcementRef.get()
    if (!existing.exists) return { status: 'not-found' }
    if (existing.data()?.active !== true) return { status: 'expired' }
    const batch = db.batch()
    batch.set(
      announcementRef,
      { active: false, expiredBy: adminId, expiredAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    audit(batch, db, FieldValue, {
      kind: 'announcement-expire',
      by: adminId,
      announcementId,
      reason,
    })
    await batch.commit()
    return { status: 'expired' }
  }
  if (action !== 'publish')
    throw Object.assign(new Error('Unknown announcement action.'), { code: 'invalid-argument' })
  const title = text(data?.title, 120)
  const body = text(data?.body, 600)
  const audience = String(data?.audience || 'all')
  const expiresAt = Number(data?.expiresAt)
  if (
    !title ||
    !body ||
    !AUDIENCES.has(audience) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw Object.assign(new Error('A title, message, audience and future expiry are required.'), {
      code: 'invalid-argument',
    })
  }
  const ref = db.collection('announcements').doc()
  const batch = db.batch()
  batch.set(ref, {
    title,
    body,
    audience,
    active: true,
    createdBy: adminId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(expiresAt),
  })
  audit(batch, db, FieldValue, {
    kind: 'announcement-publish',
    by: adminId,
    announcementId: ref.id,
    reason: `Published to ${audience}`,
  })
  await batch.commit()
  return { status: 'published', id: ref.id }
}

/** Clean stale role flags; rules already stop treating an expired row as suspended. */
export async function cleanupExpiredSuspensions({ db, FieldValue, now = Date.now() }) {
  const snap = await db.collection('roles').where('suspended', '==', true).get()
  let expired = 0
  const batches = []
  let batch = db.batch()
  let writes = 0
  for (const doc of snap.docs) {
    const row = doc.data() || {}
    const until = millis(row.suspendedUntil)
    if (!until || until > now) continue
    batch.set(
      doc.ref,
      { suspended: false, suspendedUntil: FieldValue.delete(), suspendedAt: FieldValue.delete() },
      { merge: true },
    )
    const logRef = db.collection('moderationLog').doc()
    batch.set(logRef, {
      kind: 'lift',
      by: 'system',
      subjectId: doc.id,
      reason: 'Timed suspension expired automatically',
      at: FieldValue.serverTimestamp(),
    })
    notify(batch, db, FieldValue, doc.id, {
      title: 'Your account is active again',
      body: 'The timed suspension on your account has ended.',
      kind: 'activeAgain',
    })
    writes += 3
    expired += 1
    if (writes >= 480) {
      batches.push(batch.commit())
      batch = db.batch()
      writes = 0
    }
  }
  if (writes) batches.push(batch.commit())
  await Promise.all(batches)
  return expired
}
