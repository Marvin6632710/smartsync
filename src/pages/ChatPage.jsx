import React, { useEffect, useRef, useState } from 'react'
import { Archive, Flag, ImagePlus, Lock, Send, ShieldAlert, X } from 'lucide-react'
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
import { usePicture } from '../hooks/usePicture'
import { preparePicture } from '../utils/pictures'
import { formatMessageTime } from '../utils/time'

/** A picture that came with an approved message, fetched on demand. */
function MessagePicture({ viewer, messageId, alt }) {
  const dataUrl = usePicture(viewer, 'chat', messageId, messageId)
  if (!dataUrl) return <span className="message-picture pending" aria-hidden="true" />
  return <img className="message-picture" src={dataUrl} alt={alt} />
}

export default function ChatPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    activities,
    joinedIds,
    sendMessage,
    chatPending,
    retryChatMessage,
    discardChatMessage,
    reviewChatMessage,
    blockedIds,
    loading: feedLoading,
    syncing,
  } = useApp()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [attachError, setAttachError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [reporting, setReporting] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const activity = activities.find((item) => item.id === id)
  const joined = joinedIds.includes(id)
  const closed = isChatClosed(activity)
  // The security rules reject reads from non-participants, so the listener is
  // only opened once membership is established — otherwise every non-member
  // visit would log a permission error.
  const { messages, loading, error, retry } = useThread(
    id,
    joined && !closed && !activity?.rosterPending,
  )

  // This thread's messages that have not reached it: being checked, refused,
  // or never sent. Mine alone — nobody else's screen has ever had them.
  const mine = chatPending.filter((row) => row.activityId === id)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, mine.length])

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

  const choosePicture = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAttachError('')
    setPreparing(true)
    try {
      // Decoded and re-encoded here, which also strips the original file's
      // metadata — where it was taken, on what. Moderation sees the picture,
      // not somebody's camera roll coordinates.
      const picture = await preparePicture(file, 'chat')
      setAttachment(picture.dataUrl)
    } catch (err) {
      setAttachError(err.message?.startsWith('pictures.') ? err.message : 'pictures.readError')
    } finally {
      setPreparing(false)
    }
  }

  const submit = (event) => {
    event.preventDefault()
    const pending = text.trim()
    if (!pending && !attachment) return
    // The composer clears, but nothing is on anybody's screen yet: what
    // happens now is a row that says it is being checked. A refusal puts
    // the words back in reach rather than throwing them away.
    sendMessage(id, pending, attachment)
    setText('')
    setAttachment(null)
    setAttachError('')
  }

  /** Blocked: the text goes back to the composer so it can be rewritten. */
  const editAgain = (row) => {
    setText(row.text || '')
    if (row.image) setAttachment(row.image)
    discardChatMessage(row.id)
    inputRef.current?.focus()
  }

  const pendingNote = (row) => {
    if (row.status === 'checking') return t('chat.checking')
    if (row.status === 'blocked') {
      return row.severe
        ? t('chat.blocked.severe')
        : t(`chat.blocked.${row.reason}`, {
            defaultValue: t('chat.blocked.default'),
          })
    }
    if (row.reason === 'rate-limited') {
      return t('chat.failed.rateLimited', {
        count: Math.max(1, Math.ceil((row.retryAfterSeconds || 0) / 60)),
      })
    }
    return t(`chat.failed.${row.reason}`, { defaultValue: t('chat.failed.unavailable') })
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
        {!loading && !error && messages.length === 0 && mine.length === 0 && (
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
            const own = message.senderId === user.uid
            return (
              <div className={`message-bubble ${own ? 'mine' : ''}`} key={message.id}>
                <strong>{personName(message.senderName)}</strong>
                {message.hasImage && (
                  <MessagePicture
                    viewer={user.uid}
                    messageId={message.id}
                    alt={t('chat.pictureFrom', { name: personName(message.senderName) })}
                  />
                )}
                {message.text && <p>{message.text}</p>}
                <span>{formatMessageTime(message.createdAt)}</span>
                {!own && (
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

        {/* MINE, AND NOT SENT
            Checking, refused, or never delivered. The words are still here
            and still only here: a message that did not pass was never on
            anybody else's screen, in their inbox, or in their unread count. */}
        {mine.map((row) => (
          <div
            className={`message-bubble mine pending-bubble ${row.status}`}
            key={row.id}
            role={row.status === 'checking' ? 'status' : 'alert'}
            aria-live="polite"
          >
            <strong>
              {row.status === 'blocked' && <ShieldAlert size={13} aria-hidden="true" />}
              {row.status === 'checking' ? t('chat.checkingTitle') : t('chat.notSent')}
            </strong>
            {row.image && <img className="message-picture" src={row.image} alt="" />}
            {row.text && <p>{row.text}</p>}
            <span>{pendingNote(row)}</span>
            {row.status !== 'checking' && (
              <div className="unsent-actions">
                {row.status === 'blocked' ? (
                  <>
                    <button className="text-button" onClick={() => editAgain(row)}>
                      {t('chat.editMessage')}
                    </button>
                    <button className="text-button" onClick={() => discardChatMessage(row.id)}>
                      {t('common.discard')}
                    </button>
                    {!row.severe && (
                      <button
                        className="text-button"
                        onClick={() => reviewChatMessage(row.id)}
                        disabled={row.appeal === 'sending' || row.appeal === 'sent'}
                      >
                        {row.appeal === 'sent' ? t('chat.reviewAsked') : t('chat.askReview')}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="text-button" onClick={() => retryChatMessage(row.id)}>
                      {t('common.retry')}
                    </button>
                    <button className="text-button" onClick={() => discardChatMessage(row.id)}>
                      {t('common.discard')}
                    </button>
                  </>
                )}
              </div>
            )}
            {row.appeal === 'failed' && (
              <span className="unsent-note">{t('chat.reviewFailed')}</span>
            )}
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
          {attachment && (
            <div className="chat-attachment">
              <img src={attachment} alt={t('chat.attachmentPreview')} />
              <button
                type="button"
                className="chat-attachment-remove"
                onClick={() => setAttachment(null)}
                aria-label={t('chat.removePicture')}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {attachError && (
            <p className="chat-attach-error" role="alert">
              {t(attachError)}
            </p>
          )}
          <div className="chat-form-row">
            {/* The label is the button; the input inside it carries the
                name, so the control is announced once rather than twice. */}
            <label className="chat-attach">
              <ImagePlus size={18} aria-hidden="true" />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                onChange={choosePicture}
                disabled={preparing}
                aria-label={t('chat.addPicture')}
              />
            </label>
            <input
              ref={inputRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={attachment ? t('chat.captionPlaceholder') : t('chat.placeholder')}
              aria-label={t('chat.inputLabel')}
              maxLength={2000}
            />
            <button
              className="primary-button icon-only"
              aria-label={t('chat.send')}
              disabled={(!text.trim() && !attachment) || preparing}
            >
              <Send size={18} />
            </button>
          </div>
          <p className="chat-moderation-note">{t('chat.moderationNote')}</p>
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
