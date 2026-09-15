import React, { useMemo, useState } from 'react'
import { MessageCircle, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import CategoryIcon from '../components/CategoryIcon'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { isChatClosed } from '../firebase/messages'
import { formatMessageTime } from '../utils/time'

// Chips are backed by facts the app actually holds. "Unread" was in the
// original design but nothing tracks per-thread read state, so it would have
// been a control that could never be honest.
const FILTERS = [
  { key: 'all', label: 'messages.all' },
  { key: 'hosting', label: 'messages.hosting' },
  { key: 'joined', label: 'messages.joined' },
]

export default function MessagesPage() {
  const { t } = useTranslation()
  const { activities, joinedIds, threadPreviews } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const threads = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (
      activities
        .filter((activity) => joinedIds.includes(activity.id))
        // A thread the rules have closed cannot be opened by anybody, so a row
        // for it is a dead end that reads "No messages yet" — untrue, since the
        // messages exist and simply cannot be read any more. It appeared once
        // the personal feed started carrying old activities.
        .filter((activity) => !isChatClosed(activity))
        .filter((activity) => {
          if (filter === 'hosting') return activity.hostId === user.uid
          if (filter === 'joined') return activity.hostId !== user.uid
          return true
        })
        .filter((activity) => {
          if (!term) return true
          const preview = threadPreviews[activity.id]
          return [activity.title, activity.category, preview?.text]
            .filter(Boolean)
            .some((field) => field.toLowerCase().includes(term))
        })
        .sort((a, b) => {
          // Threads with recent activity float up; silent ones keep their
          // chronological order underneath.
          const left = threadPreviews[a.id]?.createdAt || 0
          const right = threadPreviews[b.id]?.createdAt || 0
          return right - left
        })
    )
  }, [activities, joinedIds, threadPreviews, search, filter, user.uid])

  return (
    <div className="page-content">
      <section className="headline-block">
        <h2>{t('messages.title')}</h2>
      </section>

      <div className="search-box">
        <Search size={18} />
        <input
          placeholder={t('messages.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('messages.searchLabel')}
        />
      </div>
      <div className="chip-row category-row">
        {FILTERS.map((option) => (
          <button
            className={`filter-chip ${filter === option.key ? 'active' : ''}`}
            key={option.key}
            onClick={() => setFilter(option.key)}
            aria-pressed={filter === option.key}
          >
            {t(option.label)}
          </button>
        ))}
      </div>

      <div className="stack list-stack">
        {threads.map((activity) => {
          const last = threadPreviews[activity.id]
          return (
            <button
              className="message-thread nomad-thread"
              key={activity.id}
              data-category={(activity.category || '').toLowerCase()}
              onClick={() => navigate(`/activity/${activity.id}/chat`)}
            >
              <div className="avatar small cat-avatar">
                <CategoryIcon category={activity.category} size={16} />
              </div>
              <div>
                <strong>{activity.title}</strong>
                <p>{last ? `${last.senderName}: ${last.text}` : t('messages.noMessagesYet')}</p>
              </div>
              <span>{formatMessageTime(last?.createdAt)}</span>
            </button>
          )
        })}
        {threads.length === 0 && (
          <div className="empty-state">
            <MessageCircle size={30} />
            <h3>
              {search || filter !== 'all' ? t('messages.nothingMatches') : t('messages.noChats')}
            </h3>
            <p>{search || filter !== 'all' ? t('messages.tryFilter') : t('messages.joinFirst')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
