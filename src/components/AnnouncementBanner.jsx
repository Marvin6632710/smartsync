import React, { useEffect, useMemo, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { watchAnnouncements } from '../firebase/admin'
import { useNow } from '../console/hooks'

export default function AnnouncementBanner() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { allActivities = [] } = useApp()
  const [rows, setRows] = useState([])
  const now = useNow(60_000)

  useEffect(() => {
    try {
      return watchAnnouncements(setRows, () => setRows([]))
    } catch {
      // Lightweight component tests replace Firestore with a partial mock.
      // A banner is optional there; the rest of the shell must still render.
      return undefined
    }
  }, [])
  const announcement = useMemo(() => {
    const hosts = allActivities.some((row) => row.hostId === user.uid)
    const participates = allActivities.some((row) => row.participantUids?.includes(user.uid))
    return rows.find((row) => {
      const expires = row.expiresAt?.toMillis?.() ?? Number(row.expiresAt)
      if (row.active !== true || !expires || expires <= now) return false
      return (
        row.audience === 'all' ||
        (row.audience === 'hosts' && hosts) ||
        (row.audience === 'participants' && participates)
      )
    })
  }, [allActivities, now, rows, user.uid])

  if (!announcement) return null
  return (
    <div className="announcement-banner" role="status">
      <Megaphone size={16} aria-hidden="true" />
      <span>
        <strong>{announcement.title}</strong>
        <span>{announcement.body}</span>
      </span>
      <small>{t(`adminPowers.audience.${announcement.audience}`)}</small>
    </div>
  )
}
