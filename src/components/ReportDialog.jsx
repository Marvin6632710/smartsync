import React, { useEffect, useRef, useState } from 'react'
import { Flag, ShieldOff } from 'lucide-react'

import { REPORT_REASONS } from '../firebase/moderation'
import { useApp } from '../context/AppContext'

/**
 * Reporting a person, an activity or a message.
 *
 * Three things this deliberately does:
 *
 * Blocking is offered in the same breath as reporting, ticked by default when
 * the subject is a person. Somebody who has just been harassed should not have
 * to find a second screen to stop it happening again, and separating the two
 * is how apps end up with reports filed by people who are still being
 * contacted.
 *
 * The thing being reported is captured and sent with the report. A report that
 * says only "user X, harassment" gives a reviewer nothing to act on, and by
 * the time anyone reads it the chat may have closed.
 *
 * It never claims more than it can do. The closing message says the report was
 * sent and will be reviewed — not that action has been taken, which nobody
 * here is in a position to promise.
 */
export default function ReportDialog({ open, subject, onClose }) {
  const { submitReport, blockPerson, isBlocked, unsent, discardUnsent } = useApp()
  // A report about this subject that was queued offline and refused later
  // is filled back in rather than lost; it is dropped once one is sent.
  const earlier = open
    ? unsent.find(
        (row) => row.kind === 'report' && row.key === subject?.id && row.status === 'failed',
      )
    : null
  const [reason, setReason] = useState(earlier?.payload?.reason || '')
  const [detail, setDetail] = useState(earlier?.payload?.detail || '')
  const [alsoBlock, setAlsoBlock] = useState(true)
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef(null)
  const firstRef = useRef(null)
  const previouslyFocused = useRef(null)
  // Same reason as ConfirmDialog: `onClose` is an inline arrow in every
  // caller, and the parent re-renders whenever a snapshot lands or the clock
  // ticks. Keying the focus effect on it moved focus to the first reason chip
  // in the middle of somebody typing what happened.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  const isPerson = subject?.type === 'user'
  const alreadyBlocked = isPerson && isBlocked(subject.id)

  // The form is cleared during render rather than in an effect: resetting in
  // an effect renders the previous report's answers once before wiping them,
  // which on a dialog that opens over the top of what you were doing means a
  // flash of somebody else's reason.
  const session = open ? (subject?.id ?? null) : null
  const [openedFor, setOpenedFor] = useState(session)
  if (openedFor !== session) {
    setOpenedFor(session)
    setReason(earlier?.payload?.reason || '')
    setDetail(earlier?.payload?.detail || '')
    setAlsoBlock(true)
  }

  useEffect(() => {
    if (!open) return undefined
    previouslyFocused.current = document.activeElement
    firstRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input, textarea',
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  if (!open || !subject) return null

  const send = async () => {
    if (!reason) return
    setBusy(true)
    const sent = await submitReport({
      targetType: subject.type,
      targetId: subject.id,
      // Who is answerable, as opposed to what was reported. For a person the
      // two are the same; for an activity it is the host, and for a message
      // its sender. This is the field a moderator's Suspend button acts on,
      // and the rules verify it against the activity or the message itself —
      // so a report cannot quote one person and blame another.
      subjectId: subject.subjectId || subject.id,
      activityId: subject.activityId,
      reason,
      detail,
      context: subject.context,
    })
    if (sent && earlier) discardUnsent(earlier.id)
    if (sent && isPerson && alsoBlock && !alreadyBlocked) {
      await blockPerson({ uid: subject.id, name: subject.name, avatar: subject.avatar })
    }
    setBusy(false)
    if (sent) onClose?.()
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="report-title">
          <Flag size={17} /> Report {subject.label}
        </h3>
        <p className="report-subject">{subject.name}</p>
        {earlier && (
          <p className="form-error" role="status">
            Your earlier report could not be sent — {earlier.error?.message || 'it was refused.'} It
            is filled in below.
          </p>
        )}

        <fieldset className="report-reasons">
          <legend>What is wrong?</legend>
          {REPORT_REASONS.map((option, index) => (
            <button
              key={option.key}
              type="button"
              ref={index === 0 ? firstRef : null}
              className={`interest-chip ${reason === option.key ? 'selected' : ''}`}
              onClick={() => setReason(option.key)}
              aria-pressed={reason === option.key}
            >
              {option.label}
            </button>
          ))}
        </fieldset>

        <label className="report-detail">
          Anything else we should know? <span className="optional">Optional</span>
          <textarea
            rows="3"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            maxLength={1000}
            placeholder="What happened, and when"
          />
        </label>

        {isPerson && !alreadyBlocked && (
          <button
            type="button"
            className="setting-row compact-row"
            onClick={() => setAlsoBlock((current) => !current)}
            role="switch"
            aria-checked={alsoBlock}
          >
            <ShieldOff size={17} />
            <span>
              <strong>Block them as well</strong>
              <small>You stop seeing their activities, and they cannot join yours</small>
            </span>
            <span className={`switch ${alsoBlock ? 'on' : ''}`} aria-hidden="true" />
          </button>
        )}

        <div className="button-row">
          <button className="secondary-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="danger-button" onClick={send} disabled={!reason || busy}>
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </div>
        <p className="report-note">
          Reports are reviewed by the SmartSync team. If you are in immediate danger, contact local
          emergency services rather than waiting for us.
        </p>
      </div>
    </div>
  )
}
