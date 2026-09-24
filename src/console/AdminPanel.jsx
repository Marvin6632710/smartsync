import React from 'react'
import {
  CalendarRange,
  Flag,
  Gauge,
  Megaphone,
  MessageSquareWarning,
  Scale,
  ScrollText,
  Users,
} from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuth } from '../context/AuthContext'
import AccessDenied from './AccessDenied'
import { ConsoleProvider } from './ConsoleContext'
import ConsoleLayout from './ConsoleLayout'
import AccountsPage from './pages/AccountsPage'
import ActivitiesPage from './pages/ActivitiesPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import AppealsPage from './pages/AppealsPage'
import ChatBlocksPage from './pages/ChatBlocksPage'
import HistoryPage from './pages/HistoryPage'
import Overview from './pages/Overview'
import ReportsPage from './pages/ReportsPage'

const BASE = '/admin'

export const ADMIN_NAV = [
  { key: 'overview', to: BASE, end: true, label: 'console.nav.overview', icon: Gauge },
  {
    key: 'reports',
    to: `${BASE}/reports`,
    label: 'console.nav.reports',
    icon: Flag,
    count: 'open',
  },
  {
    key: 'blocks',
    to: `${BASE}/chat`,
    label: 'console.nav.blocks',
    icon: MessageSquareWarning,
    count: 'appeals',
  },
  { key: 'accounts', to: `${BASE}/accounts`, label: 'console.nav.accounts', icon: Users },
  {
    key: 'activities',
    to: `${BASE}/activities`,
    label: 'console.nav.activities',
    icon: CalendarRange,
  },
  { key: 'appeals', to: `${BASE}/appeals`, label: 'console.nav.appeals', icon: Scale },
  {
    key: 'announcements',
    to: `${BASE}/announcements`,
    label: 'console.nav.announcements',
    icon: Megaphone,
  },
  { key: 'history', to: `${BASE}/history`, label: 'console.nav.history', icon: ScrollText },
]

/**
 * The admin console: five sections, mounted at /admin, outside the
 * consumer shell so it is its own room. The overview in figures; the
 * report queue, worked under a claim; the chat messages moderation
 * refused and the appeals against them; every account with its record and
 * the actions on it — warn, suspend and lift, close and reopen; every
 * activity, with a takedown or a restore a click away; and the history of
 * everything that was done, in order.
 *
 * The guard is here, once, for every page beneath: a plain user who types
 * the address is shown the door, and so is an admin on hold, because
 * `isAdmin` is false for a suspended admin exactly as the rules treat
 * them. The rules refuse every read and write behind it anyway; the guard
 * is so nobody sees a button they cannot press.
 */
export default function AdminPanel() {
  const { t } = useTranslation()
  const { user } = useAuth()
  if (!user.isAdmin) {
    return (
      <AccessDenied reason={user.role === 'admin' && user.suspended ? 'suspended' : 'admins'} />
    )
  }
  return (
    <ConsoleProvider>
      <Routes>
        <Route element={<ConsoleLayout nav={ADMIN_NAV} title={t('console.admin.title')} />}>
          <Route index element={<Overview base={BASE} />} />
          <Route path="reports" element={<ReportsPage base={BASE} />} />
          <Route path="reports/:id" element={<ReportsPage base={BASE} />} />
          <Route path="chat" element={<ChatBlocksPage base={`${BASE}/chat`} />} />
          <Route path="chat/:id" element={<ChatBlocksPage base={`${BASE}/chat`} />} />
          <Route path="accounts" element={<AccountsPage base={BASE} />} />
          <Route path="accounts/:uid" element={<AccountsPage base={BASE} />} />
          <Route path="activities" element={<ActivitiesPage base={BASE} />} />
          <Route path="activities/:id" element={<ActivitiesPage base={BASE} />} />
          <Route path="appeals" element={<AppealsPage base={BASE} />} />
          <Route path="appeals/:id" element={<AppealsPage base={BASE} />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="history" element={<HistoryPage base={BASE} />} />
          <Route path="*" element={<Navigate to={BASE} replace />} />
        </Route>
      </Routes>
    </ConsoleProvider>
  )
}
