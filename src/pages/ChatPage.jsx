import React, { useEffect, useRef, useState } from 'react'
import { Archive, Flag, Lock, Send } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { personName } from '../i18n'

import { storedContext } from '../i18n/reportContext'
import BootScreen from '../components/BootScreen'
import ReportDialog from '../components/ReportDialog'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { CHAT_RETENTION_DAYS, isChatClosed } from '../firebase/messages'
import { useThread } from '../hooks/useThread'
import { unsentErrorText } from '../i18n/unsent'
import { formatMessageTime } from '../utils/time'

export default function ChatPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    activities,
    joinedIds,
    sendMessage,
    blockedIds,
    loading: feedLoading,
    syncing,
    unsent,
    discardUnsent,
  } = useApp()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [reporting, setReporting] = useState(null)
  const bottomRef = useRef(null)
  // Rows whose retry is already on its way. Two taps on Retry in the same
  // tick would both read the row as still there and send it twice.
  const resendingRef = useRef(new Set())

  const activity = activities.find((item) => item.id === id)
  const joined = joinedIds.includes(id)
  const closed = isChatClosed(activity)
  // The security rules reject reads from non-participants, so the listener is
  // only opened once membership is established — otherwise every non-member
  // visit would log a permission error.
  // Not opened on a closed thread: the rules refuse the read, so the only
  // thing a listener would achieve is a permission error in the console.
  // Nor while the join that put you on the roster is still in flight — the
  // rule reads the roster on the server, which has not seen it yet. The
  // flag clears when the write is accepted, and the listener opens then.
  const { messages, loading, error, retry } = useThread(
    id,
    joined && !closed && !activity?.rosterPending,
  )

  // Messages of this thread the server has refused — now, or after they
  // were queued offline and sent later. Kept by the context (see `unsent`
  // there) and offered here to retry or discard; never written back over
  // whatever has been typed since.
  const failedHere = unsent.filter(
    (row) => row.kind === 'message' && row.key === id && row.status === 'failed',
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, failedHere.length])

  // Before the first snapshot there is no activity to find yet; that is not
  // the same as one that no longer exists, and it used to read as one.
  if (!activity && (feedLoading || syncing)) return <BootScreen />

  if (!activity)
    return (
      <div className="page-content">
        <div className="empty-state">
          <h3>{t('chat.unavailable')}</h3>
          <p>{t('chat.noLongerExists')}</p>
        </div>
      </div>
    )

  if (!joined)
    return (
      <div className="page-content">
        <div className="empty-state">
          <Lock size={28} />
          <h3>{t('chat.joinFirst')}</h3>
          <p>{t('chat.joinFirstBody')}</p>
          <button className="primary-button" onClick={() => navigate(`/activity/${id}`)}>
            {t('chat.openActivity')}
          </button>
        </div>
      </div>
    )

  if (closed)
    return (
      <div className="page-content">
        <div className="empty-state">
          <Archive size={28} />
          <h3>{t('chat.closedTitle')}</h3>
          <p>{t('chat.closedBody', { count: CHAT_RETENTION_DAYS })}</p>
          <button className="primary-button" onClick={() => navigate(`/activity/${id}`)}>
            {t('chat.openActivity')}
          </button>
        </div>
      </div>
    )

  const submit = (event) => {
    event.preventDefault()
    const pending = text.trim()
    if (!pending) return
    // Cleared immediately rather than after the write resolves, so the input
    // stays responsive on a slow connection. The message still appears at
    // once — Firestore renders local writes optimistically. A refusal — the
    // thread closed on the server, a roster changed underneath us — rolls
    // that bubble back, and the text used to go with it; it is kept in
    // `failedHere` now, with the reason and a retry.
    setText('')
    sendMessage(id, pending)
  }

  const resend = (row) => {
    if (resendingRef.current.has(row.id)) return
    resendingRef.current.add(row.id)
    discardUnsent(row.id)
    // A refusal now puts it straight back into the list, with the reason.
    sendMessage(id, row.payload.text).finally(() => resendingRef.current.delete(row.id))
  }

  return (
    <div className="page-content chat-page">
      <div className="chat-header">
        <div>
          <span className="eyebrow">{t('chat.eyebrow')}</span>
          <h2>{activity.title}</h2>
        </div>
        <button className="text-button" onClick={() => navigate(`/activity/${id}/participants`)}>
          {t('chat.participants')}
        </button>
      </div>

      <div className="message-list">
        {loading && (
          <div className="empty-state small">
            <p>{t('chat.loading')}</p>
          </div>
        )}
        {/* A thread that could not be read is not an empty thread. Saying
            "no messages yet" over a refusal invited people to type into a
            conversation they could not reach. */}
        {!loading && error && (
          <div className="empty-state small" role="alert">
            <p>
              {error.code === 'permission-denied' ? t('chat.cannotRead') : t('chat.loadFailed')}
            </p>
            <button className="text-button" onClick={retry}>
              {t('common.tryAgain')}
            </button>
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div className="empty-state small">
            <p>{t('chat.empty')}</p>
          </div>
        )}
        {messages
          // A blocked person's messages are hidden rather than replaced with a
          // placeholder: "message hidden" still tells you they are talking
          // about you, which is most of what blocking was meant to stop.
          .filter((message) => !blockedIds.has(message.senderId))
          .map((message) => {
            const mine = message.senderId === user.uid
            return (
              <div className={`message-bubble ${mine ? 'mine' : ''}`} key={message.id}>
                <strong>{personName(message.senderName)}</strong>
                <p>{message.text}</p>
                <span>{formatMessageTime(message.createdAt)}</span>
                {!mine && (
                  <button
                    className="bubble-report"
                    onClick={() =>
                      setReporting({
                        type: 'message',
                        id: message.id,
                        // Whoever sent it, and where it lives — the rules read
                        // the message itself to confirm the sender, so a
                        // report cannot name somebody who did not write it.
                        subjectId: message.senderId,
                        activityId: id,
                        name: message.senderName,
                        avatar: message.senderAvatar,
                        label: 'chat.reportLabel',
                        // Sent with the report, because the thread closes after
                        // thirty days and a reviewer may arrive after it has.
                        context: storedContext('message', {
                          text: message.text,
                          name: message.senderName,
                          title: activity.title,
                        }),
                      })
                    }
                    aria-label={t('chat.reportMessageFrom', {
                      name: personName(message.senderName),
                    })}
                  >
                    <Flag size={13} />
                  </button>
                )}
              </div>
            )
          })}
        {failedHere.map((row) => (
          <div className="message-bubble mine unsent" key={row.id} role="alert">
            <strong>{t('chat.notSent')}</strong>
            <p>{row.payload.text}</p>
            <span>{unsentErrorText(row.error, row.kind) || t('chat.couldNotSend')}</span>
            <div className="unsent-actions">
              <button className="text-button" onClick={() => resend(row)}>
                {t('common.retry')}
              </button>
              <button className="text-button" onClick={() => discardUnsent(row.id)}>
                {t('common.discard')}
              </button>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* A suspended account keeps its place in the thread and can read every
          word of it. Offering a composer that the rules will refuse would
          only take somebody's message and throw it away. */}
      {user.suspended ? (
        <p className="chat-closed-note">{t('chat.suspendedNote')}</p>
      ) : (
        <form className="chat-form" onSubmit={submit}>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.inputLabel')}
            maxLength={2000}
          />
          <button
            className="primary-button icon-only"
            aria-label={t('chat.send')}
            disabled={!text.trim()}
          >
            <Send size={18} />
          </button>
        </form>
      )}

      <ReportDialog
        open={Boolean(reporting)}
        subject={reporting}
        onClose={() => setReporting(null)}
      />
    </div>
  )
}
