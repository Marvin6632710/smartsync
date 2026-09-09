import React from 'react'
import { MessageCircle, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function MessagesPage() {
  const { activities, joinedIds, messages } = useApp()
  const navigate = useNavigate()
  const joined = activities.filter((a) => joinedIds.includes(a.id))

  return (
    <div className="page-content">
      <section className="headline-block">
        <h2>Messages</h2>
      </section>

      <div className="search-box">
        <Search size={18} />
        <input placeholder="Search" readOnly />
      </div>
      <div className="chip-row category-row">
        <span className="filter-chip active">All</span>
        <span className="filter-chip">Unread</span>
        <span className="filter-chip">Activities</span>
        <span className="filter-chip">Groups</span>
      </div>

      <div className="stack list-stack">
        {joined.map((a) => {
          const list = messages[a.id] || []
          const last = list[list.length - 1]
          return (
            <button
              className="message-thread nomad-thread"
              key={a.id}
              onClick={() => navigate(`/activity/${a.id}/chat`)}
            >
              <div className="avatar small">{(a.category || '?').slice(0, 1)}</div>
              <div>
                <strong>{a.title}</strong>
                <p>{last ? `${last.sender}: ${last.text}` : 'No messages yet'}</p>
              </div>
              <span>{last?.time || ''}</span>
            </button>
          )
        })}
        {joined.length === 0 && (
          <div className="empty-state">
            <MessageCircle size={30} />
            <h3>No chats yet</h3>
            <p>Join an activity first.</p>
          </div>
        )}
      </div>
    </div>
  )
}
