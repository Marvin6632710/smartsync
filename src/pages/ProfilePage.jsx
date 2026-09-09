import React from 'react'
import { Edit3, Settings, Share2, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ActivityCard from '../components/ActivityCard'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

export default function ProfilePage() {
  const { joinedIds, activities, recommendations, pushCelebration } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  // From `activities`, not `recommendations`: a cancelled activity you joined
  // still belongs in your list, and recommendations excludes those.
  const joined = activities.filter((a) => joinedIds.includes(a.id))
  const best = recommendations[0]

  const shareProfile = async () => {
    const shareText = `${user.name} (${user.username}) is on SmartSync. ${user.bio}`.trim()
    try {
      if (navigator.share) {
        await navigator.share({ title: 'SmartSync profile', text: shareText })
        return
      }
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(shareText)
      pushCelebration({
        icon: 'link',
        tone: 'success',
        title: 'Profile copied',
        body: 'Profile summary copied to clipboard.',
      })
    } catch (err) {
      if (err?.name === 'AbortError') return // user closed the native share sheet
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: "Couldn't share",
        body: 'Sharing is not available in this browser.',
      })
    }
  }

  return (
    <div className="page-content">
      <section className="profile-showcase">
        <div className="profile-actions-top">
          <button className="icon-button slim" onClick={() => navigate('/settings')}>
            <Settings size={18} />
          </button>
          <div className="mini-actions">
            <button className="icon-button slim" onClick={shareProfile} aria-label="Share profile">
              <Share2 size={18} />
            </button>
            <button
              className="icon-button slim"
              onClick={() => navigate('/privacy')}
              aria-label="Privacy controls"
            >
              <ShieldCheck size={18} />
            </button>
          </div>
        </div>
        <div className="profile-center">
          {/* `name` and `avatar` are already the display-safe values — the
              public profile itself is rewritten when anonymous mode is on,
              rather than the real name being hidden at render time. */}
          <div className="avatar xl">{user.avatar}</div>
          <h2>{user.name}</h2>
          <p>{user.bio}</p>
          <div className="profile-handle">{user.username}</div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Overview</span>
            <h2>Your activity life</h2>
          </div>
          <button className="text-button" onClick={() => navigate('/profile/edit')}>
            <Edit3 size={16} /> Edit
          </button>
        </div>
        <div className="profile-stats-grid compact-stats">
          <div className="stat-card">
            <span>Joined</span>
            <strong>{joined.length}</strong>
            <small>activities</small>
          </div>
          <div className="stat-card">
            <span>Top match</span>
            <strong>{best?.matchScore || '--'}%</strong>
            <small>{best?.category || 'Activity'}</small>
          </div>
        </div>
        <div className="chip-row">
          {(user.interests || []).map((i) => (
            <span className="tiny-chip" key={i}>
              {i}
            </span>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Joined</span>
            <h2>Recent activities</h2>
          </div>
          <button className="text-button" onClick={() => navigate('/joined')}>
            See all
          </button>
        </div>
        <div className="stack">
          {joined.slice(0, 2).map((a) => (
            <ActivityCard key={a.id} activity={a} compact />
          ))}
        </div>
      </section>
    </div>
  )
}
