import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  claimReport,
  closeAccount,
  issueWarning,
  liftSuspension,
  releaseReport,
  removeActivity,
  reopenAccount,
  resolveReport,
  restoreActivity,
  suspendAccount,
} from '../firebase/moderation'
import { useModerationAction } from '../hooks/useModerationAction'
import i18n from '../i18n'

// The desk's words are looked up through the instance rather than the hook
// where they are built outside a render: the toasts below are worded from
// event handlers, which run in the language in force at that moment.
const t = (key, options) => i18n.t(key, options)

const warn = (title, body) => ({ icon: 'alert', tone: 'warning', title, body })
const ok = (title, body) => ({ icon: 'check', tone: 'success', title, body })

/** The ordinary refusal, in the words each screen used. */
const refused = (error, whenDenied) =>
  warn(
    t('moderation.toasts.couldNotDo'),
    error?.code === 'permission-denied' ? whenDenied : t('common.repeatingIsSafe'),
  )

/**
 * What a stand-down actually did, when it did not do all of it.
 *
 * `suspendAccount` and `closeAccount` report how many hosted activities came
 * down and how many could not be; the screen used to read only the first
 * number, so "2 stood down, and everyone who joined has been told" could be
 * shown while a third was still live.
 */
const standDownSummary = (stoodDown, failed) =>
  t('moderation.toasts.standDownSummary', {
    stoodDown,
    failed,
    noun: t('moderation.toasts.activity', { count: stoodDown }),
  })

/**
 * The desk: every action an admin can take, with the dialog that confirms
 * it and the toast that reports it.
 *
 * One hook for the whole console, holding the logic the old moderation
 * page grew over a year of finding out what goes wrong: the claim taken
 * before the action, the decision recorded with it, a refusal told apart
 * from a colleague getting there first, buttons that wait while an action
 * is in flight, a stand-down that only half worked announced as such. The
 * screens only choose which button to show; nothing here depends on how
 * the queue is drawn.
 *
 * Every action records who took it and why. The two that leave a record
 * somebody else will read — a warning, a closure — will not run without a
 * reason typed into the dialog; a suspension from the accounts list takes
 * one too, and one from the queue records the report's reason.
 */
export function useDesk(data) {
  useTranslation()
  const { user, app, nameFor, subjectOf, openReports, timesReported, reasonLabel } = data
  const { pushCelebration } = app
  const { perform } = useModerationAction()

  // The queue: a report under a confirm dialog, and the one an action is
  // running against — its buttons wait, or a second confirmation while the
  // first was still in flight would run the same action twice.
  const [acting, setActing] = useState(null)
  const [actingOn, setActingOn] = useState(null)
  // Claims taken deliberately, before any action.
  const [claiming, setClaiming] = useState(null)
  // Suspending or lifting somebody you noticed, rather than were told about.
  const [suspendTarget, setSuspendTarget] = useState(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [suspending, setSuspending] = useState(null)
  // The actions that put something on somebody's record and so have to be
  // justified before they can be taken: a warning, a closure, a reopening.
  const [recorded, setRecorded] = useState(null)
  const [recordedReason, setRecordedReason] = useState('')
  const [recording, setRecording] = useState(null)
  // Removed activities, and the reason an admin gives for putting one back.
  const [restoring, setRestoring] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removeReason, setRemoveReason] = useState('')
  const [removing, setRemoving] = useState(null)

  // The queue as last delivered, readable from inside a handler that was
  // started before the latest snapshot: whether a report is still open when
  // its resolution is refused is what tells "no permission" from "somebody
  // else already closed it".
  const reportsRef = useRef(openReports)
  useEffect(() => {
    reportsRef.current = openReports
  }, [openReports])

  /**
   * What a failure to work a report means, in words.
   *
   * A colleague's fresh claim is "being handled"; a closed report, a claim
   * that was lost, or a refusal on a report that has since left the queue
   * is "already handled" — their decision stands, and every action here is
   * idempotent so nothing was done twice. Anything else is the ordinary
   * refusal.
   */
  const reportFailure = (error, report) => {
    const code = error?.code
    if (code === 'claim-held') {
      return warn(t('moderation.toasts.beingHandled'), t('moderation.toasts.beingHandledBody'))
    }
    const gone = !reportsRef.current.some((row) => row.id === report.id)
    if (
      code === 'already-handled' ||
      code === 'claim-lost' ||
      (code === 'permission-denied' && gone)
    ) {
      // A decision that landed while its acknowledgement was lost comes
      // back as "already handled" on the retry — by this admin. Saying
      // a colleague got there first would send them looking for a decision
      // that is their own.
      if (error?.details?.reviewedBy === user.uid) {
        return warn(t('moderation.toasts.alreadyDone'), t('moderation.toasts.alreadyDoneBody'))
      }
      return warn(t('moderation.toasts.alreadyHandled'), t('moderation.toasts.alreadyHandledBody'))
    }
    return warn(
      t('moderation.toasts.couldNotComplete'),
      code === 'permission-denied' ? t('common.noPermission') : t('common.repeatingIsSafe'),
    )
  }

  /** Takes the claim on purpose, to review under it; renews one that is already yours. */
  const claim = async (report) => {
    setClaiming(report.id)
    try {
      await perform(() => claimReport(report.id, user.uid), {
        done: () => ok(t('console.toasts.claimed'), t('console.toasts.claimedBody')),
        fail: (error) => reportFailure(error, report),
      })
    } finally {
      setClaiming(null)
    }
  }

  /** Lets the claim go without deciding anything. */
  const release = async (report) => {
    setClaiming(report.id)
    try {
      await perform(() => releaseReport(report.id), {
        done: () => ok(t('console.toasts.released'), t('console.toasts.releasedBody')),
        fail: (error) => reportFailure(error, report),
      })
    } finally {
      setClaiming(null)
    }
  }

  /**
   * Works a report: claim it, then act and record in one step.
   *
   * The claim is taken first, and the action reads it in the same
   * transaction that writes its consequence *and* the decision, so an
   * action never lands on a report a colleague has closed or taken over
   * meanwhile — and there is no moment at which the account is suspended
   * and the report still open. A failure after the claim releases it so
   * the next person can finish what this attempt did not — every action is
   * idempotent, so their repeat changes nothing that already changed —
   * unless the claim was already somebody else's.
   */
  const workReport = async (report, kind) => {
    await claimReport(report.id, user.uid)
    try {
      let stoodDown = 0
      let failed = 0
      const reason = t('moderation.takedownReason', { reason: reasonLabel(report.reason) })
      if (kind === 'remove') {
        await removeActivity(report.targetId, {
          adminId: user.uid,
          reason,
          reportId: report.id,
          decision: { status: 'actioned', outcome: 'Activity removed' },
        })
      } else if (kind === 'suspend') {
        // The person answerable, never the thing reported. For a message
        // report `targetId` is a message id.
        const outcome = await suspendAccount(subjectOf(report), {
          adminId: user.uid,
          reportId: report.id,
          decision: { status: 'actioned', outcome: 'Account suspended' },
          reason,
        })
        stoodDown = outcome.stoodDown
        failed = outcome.failed
      } else {
        await resolveReport(report.id, {
          status: 'dismissed',
          outcome: 'No action needed',
          adminId: user.uid,
        })
      }
      return { stoodDown, failed }
    } catch (error) {
      if (error?.code !== 'claim-lost') releaseReport(report.id)
      throw error
    }
  }

  const act = async () => {
    const { report, kind } = acting
    setActing(null)
    // Who a report is about is known for every report filed since
    // `subjectId` existed; older activity reports resolve it from the
    // activity, which may no longer be loaded. Acting on nobody used to
    // reach the database as a role write against `undefined`.
    if (kind === 'suspend' && !subjectOf(report)) {
      pushCelebration(
        warn(t('moderation.toasts.whoIsThisAbout'), t('moderation.toasts.whoIsThisAboutBody')),
      )
      return
    }
    setActingOn(report.id)
    try {
      await perform(() => workReport(report, kind), {
        done: ({ stoodDown, failed }) =>
          failed > 0
            ? warn(t('moderation.toasts.partlyStoodDown'), standDownSummary(stoodDown, failed))
            : ok(
                kind === 'dismiss'
                  ? t('moderation.toasts.reportDismissed')
                  : t('moderation.toasts.actionTaken'),
                stoodDown > 0
                  ? t('moderation.toasts.recordedWithStandDown', {
                      count: stoodDown,
                      noun: t('moderation.toasts.activity', { count: stoodDown }),
                    })
                  : t('moderation.toasts.recorded'),
              ),
        fail: (error) => reportFailure(error, report),
      })
    } finally {
      setActingOn(null)
    }
  }

  // Suspending somebody you noticed, rather than somebody you were told
  // about — or lifting one. Same call the report queue makes, so a
  // suspension from here also stands down everything they are hosting and
  // tells the people who joined.
  const actOnPerson = async () => {
    const { uid, suspend } = suspendTarget
    const reason = suspendReason.trim()
    setSuspendTarget(null)
    setSuspending(uid)
    const denied = t('moderation.toasts.nobodyActsOnAdmin')
    try {
      let done = false
      if (suspend) {
        done = await perform(() => suspendAccount(uid, { adminId: user.uid, reason }), {
          done: ({ stoodDown, failed }) =>
            failed > 0
              ? warn(
                  t('moderation.toasts.partlyStoodDown'),
                  `${t('moderation.toasts.cannotAct', { name: nameFor(uid) })} ${standDownSummary(stoodDown, failed)}`,
                )
              : ok(
                  t('moderation.toasts.accountSuspended'),
                  stoodDown > 0
                    ? t('moderation.toasts.cannotActStoodDown', {
                        name: nameFor(uid),
                        count: stoodDown,
                        noun: t('moderation.toasts.activity', { count: stoodDown }),
                      })
                    : t('moderation.toasts.cannotAct', { name: nameFor(uid) }),
                ),
          fail: (error) => refused(error, denied),
        })
      } else {
        done = await perform(() => liftSuspension(uid, { adminId: user.uid, reason }), {
          done: () =>
            ok(
              t('moderation.toasts.suspensionLifted'),
              t('moderation.toasts.liftedBody', { name: nameFor(uid) }),
            ),
          fail: (error) => refused(error, denied),
        })
      }
      if (done) setSuspendReason('')
    } finally {
      setSuspending(null)
    }
  }

  // A warning and a closure both leave a permanent record, so both go through
  // one path that will not run without a reason typed into the dialog.
  const applyRecorded = async () => {
    const { uid, kind, reportId } = recorded
    const reason = recordedReason.trim()
    if (!reason) return
    setRecorded(null)
    setRecording(uid)
    const denied = t('moderation.toasts.nobodyActsOnAdmin')
    try {
      let done = false
      if (kind === 'warn') {
        // From the queue, the warning is written under the report's claim
        // and lets the claim go in the same transaction: the report stays
        // open for whoever decides what else to do about it. A warning that
        // failed for any other reason releases the claim here instead.
        const warnUnderClaim = async () => {
          if (!reportId) return issueWarning(uid, { adminId: user.uid, reason })
          await claimReport(reportId, user.uid)
          try {
            await issueWarning(uid, { adminId: user.uid, reason, reportId })
          } catch (error) {
            if (error?.code !== 'claim-lost') releaseReport(reportId)
            throw error
          }
        }
        done = await perform(warnUnderClaim, {
          done: () =>
            ok(
              t('moderation.toasts.warningIssued'),
              t('moderation.toasts.warningIssuedBody', { name: nameFor(uid) }),
            ),
          fail: (error) =>
            reportId
              ? reportFailure(error, { id: reportId })
              : refused(error, t('common.noPermission')),
        })
      } else if (kind === 'close') {
        done = await perform(() => closeAccount(uid, { adminId: user.uid, reason }), {
          done: ({ stoodDown, failed }) =>
            warn(
              failed > 0
                ? t('moderation.toasts.partlyClosed')
                : t('moderation.toasts.accountClosed'),
              failed > 0
                ? `${t('moderation.toasts.closedBody', { name: nameFor(uid) })} ${standDownSummary(stoodDown, failed)}`
                : stoodDown > 0
                  ? t('moderation.toasts.closedBodyStoodDown', {
                      name: nameFor(uid),
                      count: stoodDown,
                      noun: t('moderation.toasts.activity', { count: stoodDown }),
                    })
                  : t('moderation.toasts.closedBody', { name: nameFor(uid) }),
            ),
          fail: (error) => refused(error, denied),
        })
      } else {
        done = await perform(() => reopenAccount(uid, { adminId: user.uid, reason }), {
          done: () =>
            ok(
              t('moderation.toasts.accountReopened'),
              t('moderation.toasts.reopenedBody', { name: nameFor(uid) }),
            ),
          fail: (error) => refused(error, denied),
        })
      }
      if (done) setRecordedReason('')
    } finally {
      setRecording(null)
    }
  }

  /** Puts a removed activity back. */
  const restore = async (activity, reason) => {
    const note = String(reason || '').trim()
    if (!note) return false
    setRestoring(activity.id)
    try {
      return await perform(
        () => restoreActivity(activity.id, { adminId: user.uid, reason: note }),
        {
          done: () =>
            ok(
              t('moderation.toasts.putBack'),
              t('moderation.toasts.putBackBody', { title: activity.title }),
            ),
          fail: (error) => refused(error, t('common.noPermission')),
        },
      )
    } finally {
      setRestoring(null)
    }
  }

  /** Takes an activity down from its row, without a report. */
  const remove = async () => {
    const activity = removeTarget
    const reason = removeReason.trim()
    if (!reason) return
    setRemoveTarget(null)
    setRemoving(activity.id)
    try {
      const done = await perform(() => removeActivity(activity.id, { adminId: user.uid, reason }), {
        done: () =>
          ok(
            t('console.toasts.removed'),
            t('console.toasts.removedBody', { title: activity.title }),
          ),
        fail: (error) => refused(error, t('common.noPermission')),
      })
      if (done) setRemoveReason('')
    } finally {
      setRemoving(null)
    }
  }

  // The prefilled warning from a report: the substance of what was
  // reported, so the person is told that rather than a category name.
  const warnFromReport = (report) => {
    const repeats = timesReported(report)
    setRecordedReason(
      t('moderation.warnPrefill', {
        reason: reasonLabel(report.reason),
        repeats: repeats > 1 ? t('moderation.warnPrefillRepeats', { count: repeats }) : '',
      }),
    )
    setRecorded({ uid: subjectOf(report), kind: 'warn', reportId: report.id })
  }

  const askRecorded = (uid, kind) => {
    setRecordedReason('')
    setRecorded({ uid, kind })
  }

  const askSuspend = (uid, suspend) => {
    setSuspendReason('')
    setSuspendTarget({ uid, suspend })
  }

  const askRemove = (activity) => {
    setRemoveReason('')
    setRemoveTarget(activity)
  }

  return {
    // Dialog state, read by DeskDialogs.
    acting,
    setActing,
    suspendTarget,
    setSuspendTarget,
    suspendReason,
    setSuspendReason,
    recorded,
    setRecorded,
    recordedReason,
    setRecordedReason,
    removeTarget,
    setRemoveTarget,
    removeReason,
    setRemoveReason,
    // What is in flight.
    actingOn,
    claiming,
    suspending,
    recording,
    restoring,
    removing,
    // Openers.
    warnFromReport,
    askRecorded,
    askSuspend,
    askRemove,
    // Actions.
    claim,
    release,
    act,
    actOnPerson,
    applyRecorded,
    restore,
    remove,
  }
}
