import { AvatarContent } from '../components/SavedPicture'
import React from 'react'
import { CalendarSearch, Edit3, Settings, Share2, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { categoryLabel, personName } from '../i18n'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { activities, joinedActivities: joined, pushCelebration } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  // `joined` is ordered upcoming-first, so "recent" below means the next
  // things you are going to, then what you went to last.
  // What you are running, not only what you are going to: the activities
  // you host that have not happened yet.
  const hosting = activities.filter(
    (a) => a.hostId === user.uid && a.status === 'active' && !a.isPast,
  ).length

  const shareProfile = async () => {
    const shareText = t('profile.shareText', {
      name: user.name,
      username: user.username,
      bio: user.bio || '',
    }).trim()
    try {
      if (navigator.share) {
        await navigator.share({ title: t('profile.shareTitle'), text: shareText })
        return
      }
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(shareText)
      pushCelebration({
        icon: 'link',
        tone: 'success',
        title: t('profile.copiedTitle'),
        body: t('profile.copiedBody'),
      })
    } catch (err) {
      if (err?.name === 'AbortError') return // user closed the native share sheet
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: t('profile.shareFailedTitle'),
        body: t('profile.shareFailedBody'),
      })
    }
  }

  return (
    <div className="page-content profile-page">
      {/* The card and the overview travel together: on a phone the wrapper
          is invisible (`display: contents`) and they stack like everything
          else; on a laptop it is the one tall panel down the left, with
          what you have joined on the right. */}
      <div className="profile-column">
        <section className="profile-showcase">
          <div className="profile-actions-top">
            <button
              className="icon-button slim"
              onClick={() => navigate('/settings')}
              aria-label={t('profile.settings')}
            >
              <Settings size={18} />
            </button>
            <div className="mini-actions">
              <button
                className="icon-button slim"
                onClick={shareProfile}
                aria-label={t('profile.share')}
              >
                <Share2 size={18} />
              </button>
              <button
                className="icon-button slim"
                onClick={() => navigate('/privacy')}
                aria-label={t('profile.privacy')}
              >
                <ShieldCheck size={18} />
              </button>
            </div>
          </div>
          <div className="profile-center">
            {/* `name` and `avatar` are already the display-safe values — the
                public profile itself is rewritten when anonymous mode is on,
                rather than the real name being hidden at render time. */}
            <div className="avatar xl">
              <AvatarContent person={user} />
            </div>
            <h2>{personName(user.name)}</h2>
            <div className="profile-handle">{user.username}</div>
            <p>{user.bio}</p>
          </div>
          {/* Who you are includes what you are into: the interests sit on
              the card, with the name and the bio, not among the figures. */}
          {(user.interests || []).length > 0 && (
            <div className="chip-row profile-interests">
              {user.interests.map((i) => (
                <span className="tiny-chip" key={i}>
                  {categoryLabel(i)}
                </span>
              ))}
            </div>
          )}
          {/* The one thing most people come here to do, where they can see
              it: on the card, under everything it changes. */}
          <button className="profile-edit" onClick={() => navigate('/profile/edit')}>
            <Edit3 size={16} /> {t('profile.editProfile')}
          </button>
        </section>

        <section className="section-block profile-life">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t('profile.overview')}</span>
              <h2>{t('profile.activityLife')}</h2>
            </div>
          </div>
          <div className="profile-stats-grid compact-stats">
            <div className="stat-card">
              <span>{t('profile.joined')}</span>
              <strong>{joined.length}</strong>
              <small>{t('profile.activities')}</small>
            </div>
            <div className="stat-card">
              <span>{t('profile.hosting')}</span>
              <strong>{hosting}</strong>
              <small>{t('profile.activities')}</small>
            </div>
          </div>
        </section>
      </div>

      <section className="section-block profile-recent">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t('profile.joined')}</span>
            <h2>{t('profile.recent')}</h2>
          </div>
          {joined.length > 0 && (
            <button className="text-button" onClick={() => navigate('/joined')}>
              {t('common.seeAll')}
            </button>
          )}
        </div>
        {/* Six are rendered; a phone shows the first two (the stylesheet
            hides the rest) and a laptop, with a column to fill, all six. */}
        <div className="stack card-grid">
          {joined.slice(0, 6).map((a) => (
            <ActivityCard key={a.id} activity={a} compact />
          ))}
          {joined.length === 0 && (
            <div className="empty-state">
              <CalendarSearch size={28} />
              <h3>{t('joined.none')}</h3>
              <p>{t('joined.noneBody')}</p>
              <button className="primary-button" onClick={() => navigate('/home')}>
                {t('profile.findActivities')}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
