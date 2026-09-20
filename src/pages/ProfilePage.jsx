import { AvatarContent } from '../components/SavedPicture'
import React from 'react'
import { Edit3, Settings, Share2, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { categoryLabel, personName } from '../i18n'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { joinedActivities: joined, recommendations, pushCelebration } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  // Ordered upcoming-first, so "recent" below means the next two things you
  // are going to, then what you went to last.
  const best = recommendations[0]

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
          <p>{user.bio}</p>
          <div className="profile-handle">{user.username}</div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t('profile.overview')}</span>
            <h2>{t('profile.activityLife')}</h2>
          </div>
          <button className="text-button" onClick={() => navigate('/profile/edit')}>
            <Edit3 size={16} /> {t('common.edit')}
          </button>
        </div>
        <div className="profile-stats-grid compact-stats">
          <div className="stat-card">
            <span>{t('profile.joined')}</span>
            <strong>{joined.length}</strong>
            <small>{t('profile.activities')}</small>
          </div>
          <div className="stat-card">
            <span>{t('profile.topMatch')}</span>
            <strong>{t('common.percent', { value: best?.matchScore || '--' })}</strong>
            <small>{best?.category ? categoryLabel(best.category) : t('profile.activity')}</small>
          </div>
        </div>
        <div className="chip-row">
          {(user.interests || []).map((i) => (
            <span className="tiny-chip" key={i}>
              {categoryLabel(i)}
            </span>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t('profile.joined')}</span>
            <h2>{t('profile.recent')}</h2>
          </div>
          <button className="text-button" onClick={() => navigate('/joined')}>
            {t('common.seeAll')}
          </button>
        </div>
        <div className="stack card-grid">
          {joined.slice(0, 2).map((a) => (
            <ActivityCard key={a.id} activity={a} compact />
          ))}
        </div>
      </section>
    </div>
  )
}
