import React, { useState } from 'react'
import { Send, Timer } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../components/BackButton'
import { useApp } from '../context/AppContext'

export default function ChatPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activities, joinedIds, messages, sendMessage } = useApp()
  const [text, setText] = useState('')
  const a = activities.find((x) => x.id === id)
  if (!a)
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <h3>Chat unavailable</h3>
        </div>
      </div>
    )
  if (!joinedIds.includes(id))
    return (
      <div className="page-content">
        <BackButton />
        <div className="empty-state">
          <Timer size={28} />
          <h3>Join first to unlock chat</h3>
          <p>Temporary chat is activity-based and only available to joined participants.</p>
          <button className="primary-button" onClick={() => navigate(`/activity/${id}`)}>
            Open activity
          </button>
        </div>
      </div>
    )
  const list = messages[id] || []
  const submit = (e) => {
    e.preventDefault()
    sendMessage(id, text)
    setText('')
  }
  return (
    <div className="page-content chat-page">
      <BackButton />
      <div className="chat-header">
        <div>
          <span className="eyebrow">Temporary activity chat</span>
          <h2>{a.title}</h2>
        </div>
        <button className="text-button" onClick={() => navigate(`/activity/${id}/participants`)}>
          Participants
        </button>
      </div>
      <div className="expiry-note">
        <Timer size={16} />
        Prototype rule: chat belongs to the activity and would expire after activity completion.
      </div>
      <div className="message-list">
        {list.length === 0 && (
          <div className="empty-state small">
            <p>No messages yet. Start the activity conversation.</p>
          </div>
        )}
        {list.map((m) => (
          <div className={`message-bubble ${m.senderId === 'me' ? 'mine' : ''}`} key={m.id}>
            <strong>{m.sender}</strong>
            <p>{m.text}</p>
            <span>{m.time}</span>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the group"
          aria-label="Chat message"
        />
        <button className="primary-button icon-only" aria-label="Send message">
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}
