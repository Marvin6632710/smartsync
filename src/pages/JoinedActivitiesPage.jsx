import React, { useMemo } from 'react'
import { CalendarCheck2, CalendarSearch, History, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

/**
 * Everything you are committed to, in one place.
 *
 * The page existed and answered half the question. Hosting and joining were
 * one undivided list called "Joined activities" — which is not wrong, since
 * a host is a participant of their own activity and so is genuinely in it,
 * but "what am I running?" and "what am I turning up to?" are different
 * questions with different work attached, and a single list answers neither
 * quickly. People were reading the chat list instead, because a thread per
 * activity was the closest thing the app had to this page.
 *
 * So: three groups, in the order they need attention. What you are hosting
 * first — that is the one with work in it — then what you are going to, then
 * what has been. A group with nothing in it is left out rather than shown
 * empty, except when all three are, which is the only case where an empty
 * page needs to say what to do about it.
 */
export default function JoinedActivitiesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { joinedActivities: joined } = useApp()
  const { user } = useAuth()

  // Already in the order commitments are kept: upcoming soonest first, then
  // what has been. An activity you joined that the host later cancelled is
  // still in it — this is your history, and recommendations drops those.
  const groups = useMemo(() => {
    const upcoming = joined.filter((a) => !a.isPast)
    return {
      hosting: upcoming.filter((a) => a.hostId === user.uid),
      going: upcoming.filter((a) => a.hostId !== user.uid),
      past: joined.filter((a) => a.isPast),
    }
  }, [joined, user.uid])

  const sections = [
    { key: 'hosting', icon: Star, items: groups.hosting },
    { key: 'going', icon: CalendarCheck2, items: groups.going },
    { key: 'past', icon: History, items: groups.past },
  ].filter((section) => section.items.length > 0)

  return (
    <div className="page-content plans-page">
      <header className="plans-head">
        <span className="eyebrow">{t('joined.eyebrow')}</span>
        <h2>{t('joined.title')}</h2>
      </header>

      {sections.length === 0 ? (
        <div className="empty-state">
          <CalendarSearch size={28} />
          <h3>{t('joined.none')}</h3>
          <p>{t('joined.noneBody')}</p>
          <button className="primary-button" onClick={() => navigate('/home')}>
            {t('profile.findActivities')}
          </button>
        </div>
      ) : (
        sections.map(({ key, icon: Icon, items }) => (
          <section className="section-block" key={key}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  <Icon size={13} aria-hidden="true" /> {t(`joined.${key}Why`)}
                </span>
                <h2>{t(`joined.${key}`)}</h2>
              </div>
              <span className="count-chip">{items.length}</span>
            </div>
            <div className="stack card-grid">
              {items.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} compact />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
