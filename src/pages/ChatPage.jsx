import React, { useEffect, useRef, useState } from 'react'
import { Archive, Lock, Send } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { CHAT_RETENTION_DAYS, isChatClosed } from '../firebase/messages'
import { useThread } from '../hooks/useThread'
import { formatMessageTime } from '../utils/time'

export default function ChatPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activities, joinedIds, sendMessage } = useApp()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  const activity = activities.find((item) => item.id === id)
  const joined = joinedIds.includes(id)
  const closed = isChatClosed(activity)
  // The security rules reject reads from non-participants, so the listener is
  // only opened once membership is established — otherwise every non-member
  // visit would log a permission error.
  // Not opened on a closed thread: the rules refuse the read, so the only
  // thing a listener would achieve is a permission error in the console.
  const { messages, loading } = useThread(id, joined && !closed)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  if (!activity)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Chat unavailable</h3>
          <p>This activity no longer exists.</p>
        </div>
      </div>
    )

  if (!joined)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <Lock size={28} />
          <h3>Join first to unlock chat</h3>
          <p>Activity chat is only readable by people who joined.</p>
          <button className="primary-button" onClick={() => navigate(`/activity/${id}`)}>
            Open activity
          </button>
        </div>
      </div>
    )

  if (closed)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <Archive size={28} />
          <h3>This chat has closed</h3>
          <p>
            Activity chats stay open for {CHAT_RETENTION_DAYS} days after the activity, then close
            for everyone who was there.
          </p>
          <button className="primary-button" onClick={() => navigate(`/activity/${id}`)}>
            Open activity
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
    // once — Firestore renders local writes optimistically.
    setText('')
    sendMessage(id, pending)
  }

  return (
    <div className="page-content chat-page">
      <BackButton />
      <div className="chat-header">
        <div>
          <span className="eyebrow">Activity chat</span>
          <h2>{activity.title}</h2>
        </div>
        <button className="text-button" onClick={() => navigate(`/activity/${id}/participants`)}>
          Participants
        </button>
      </div>

      <div className="message-list">
        {loading && (
          <div className="empty-state small">
            <p>Loading messages…</p>
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="empty-state small">
            <p>No messages yet. Start the conversation.</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            className={`message-bubble ${message.senderId === user.uid ? 'mine' : ''}`}
            key={message.id}
          >
            <strong>{message.senderName}</strong>
            <p>{message.text}</p>
            <span>{formatMessageTime(message.createdAt)}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Message the group"
          aria-label="Chat message"
          maxLength={2000}
        />
        <button
          className="primary-button icon-only"
          aria-label="Send message"
          disabled={!text.trim()}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}
