import React, { useEffect, useState } from 'react'
import { Megaphone, TimerOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { runAnnouncementAction, watchAnnouncements } from '../../firebase/admin'
import { useApp } from '../../context/AppContext'
import AdminActionButton from '../AdminActionButton'
import { useNow } from '../hooks'
import { Badge, Empty, Section, When } from '../ui'

export default function AnnouncementsPage() {
  const { t } = useTranslation()
  const { pushCelebration } = useApp()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', hours: '24' })
  const [busy, setBusy] = useState(false)
  const now = useNow(60_000)

  useEffect(() => watchAnnouncements(setRows, () => {}), [])
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const publish = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.body.trim()) return
    setBusy(true)
    try {
      await runAnnouncementAction({
        action: 'publish',
        title: form.title,
        body: form.body,
        audience: form.audience,
        expiresAt: Date.now() + Number(form.hours) * 60 * 60_000,
      })
      setForm({ title: '', body: '', audience: 'all', hours: '24' })
      pushCelebration({
        icon: 'check',
        tone: 'success',
        title: t('adminPowers.done'),
        body: t('adminPowers.announcements.published'),
      })
    } catch (error) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: t('adminPowers.failed'),
        body: error?.message || t('common.pleaseTryAgain'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="con-page con-announcements">
      <Section title={t('adminPowers.announcements.compose')} id="con-announcement-compose">
        <form className="con-announcement-form" onSubmit={publish}>
          <label>
            {t('adminPowers.announcements.titleLabel')}
            <input
              maxLength={120}
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
            />
          </label>
          <label className="wide">
            {t('adminPowers.announcements.messageLabel')}
            <textarea
              maxLength={600}
              rows={4}
              value={form.body}
              onChange={(event) => set('body', event.target.value)}
            />
          </label>
          <label>
            {t('adminPowers.announcements.audienceLabel')}
            <select value={form.audience} onChange={(event) => set('audience', event.target.value)}>
              {['all', 'hosts', 'participants'].map((value) => (
                <option key={value} value={value}>
                  {t(`adminPowers.audience.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('adminPowers.announcements.expiresLabel')}
            <select value={form.hours} onChange={(event) => set('hours', event.target.value)}>
              <option value="6">{t('adminPowers.announcements.sixHours')}</option>
              <option value="24">{t('adminPowers.duration.day')}</option>
              <option value="72">{t('adminPowers.duration.threeDays')}</option>
              <option value="168">{t('adminPowers.duration.week')}</option>
            </select>
          </label>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || !form.title.trim() || !form.body.trim()}
          >
            <Megaphone size={15} />{' '}
            {busy ? t('common.working') : t('adminPowers.announcements.publish')}
          </button>
        </form>
      </Section>

      <Section title={t('adminPowers.announcements.recent')} id="con-announcement-recent">
        {rows.length === 0 ? (
          <Empty
            icon={Megaphone}
            title={t('adminPowers.announcements.empty')}
            body={t('adminPowers.announcements.emptyBody')}
          />
        ) : (
          <div className="con-announcement-list">
            {rows.map((row) => {
              const expires = row.expiresAt?.toMillis?.() ?? Number(row.expiresAt)
              const active = row.active === true && expires > now
              return (
                <article key={row.id} className="con-announcement-card">
                  <header>
                    <div>
                      <strong>{row.title}</strong>
                      <span>{t(`adminPowers.audience.${row.audience}`)}</span>
                    </div>
                    <Badge tone={active ? 'open' : 'neutral'}>
                      {t(
                        active
                          ? 'adminPowers.announcements.active'
                          : 'adminPowers.announcements.expired',
                      )}
                    </Badge>
                  </header>
                  <p>{row.body}</p>
                  <small>
                    {t('adminPowers.announcements.expires')} <When at={expires} exact />
                  </small>
                  {active && (
                    <AdminActionButton
                      action={(reason) =>
                        runAnnouncementAction({
                          action: 'expire',
                          announcementId: row.id,
                          reason,
                        })
                      }
                      title={t('adminPowers.announcements.expireTitle')}
                      body={t('adminPowers.announcements.expireBody')}
                    >
                      <TimerOff size={15} /> {t('adminPowers.announcements.expireNow')}
                    </AdminActionButton>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}
