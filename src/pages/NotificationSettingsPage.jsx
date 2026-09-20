import React, { useEffect, useState } from 'react'
import {
  Bell,
  BellOff,
  BellRing,
  CalendarX2,
  Eye,
  Laptop,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
  permissionState,
  pushSupport,
  registerPushDevice,
  registeredHere,
  removePushDevice,
  requestPermission,
  thisDeviceHash,
  unregisterPushDevice,
  watchPushDevices,
} from '../firebase/push'
import { savePushPreferences, setNotificationsEnabled } from '../firebase/users'
import { useSaveProfile } from '../hooks/useSaveProfile'
import { formatRelativeTime } from '../utils/time'
import { reportError } from '../utils/reportError'

/** The push categories a person can switch, in the order they are shown. */
const CATEGORIES = [
  { key: 'chat', icon: MessageCircle, label: 'catChat', hint: 'catChatHint', fallback: true },
  {
    key: 'activity',
    icon: CalendarX2,
    label: 'catActivity',
    hint: 'catActivityHint',
    fallback: true,
  },
  { key: 'follows', icon: Users, label: 'catFollows', hint: 'catFollowsHint', fallback: true },
  { key: 'joins', icon: UserPlus, label: 'catJoins', hint: 'catJoinsHint', fallback: false },
]

/**
 * Notifications, in three parts: the inbox switch the rules honour, this
 * browser's own permission and registration, and what each registered
 * device is sent. The devices are listed so a person can see — and end —
 * a registration made on a computer they no longer have.
 */
export default function NotificationSettingsPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { pushCelebration } = useApp()
  const { save, saving } = useSaveProfile()
  const [devices, setDevices] = useState([])
  const [busy, setBusy] = useState(false)
  // Re-read after every action: the browser's permission and this device's
  // registration are not React state, and both change under the buttons.
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

  const uid = user.uid
  const support = pushSupport()
  const permission = permissionState()
  const here = registeredHere(uid)
  const hereHash = thisDeviceHash(uid)
  const prefs = user.pushPrefs || {}
  void tick

  useEffect(
    () => watchPushDevices(uid, setDevices, (error) => reportError('push.devices', error, { uid })),
    [uid],
  )

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const turnOn = async () => {
    setBusy(true)
    try {
      const result = permission === 'granted' ? 'granted' : await requestPermission()
      if (result !== 'granted') {
        if (result === 'denied') {
          pushCelebration({
            icon: 'bell-off',
            tone: 'warning',
            title: t('pushSettings.deniedTitle'),
            body: t('pushSettings.deniedBody'),
          })
        }
        return
      }
      await registerPushDevice(uid, { language: i18n.language })
      pushCelebration({
        icon: 'bell',
        tone: 'success',
        title: t('pushSettings.enabledTitle'),
        body: t('pushSettings.enabledBody'),
      })
    } catch (error) {
      reportError('push.enable', error, { uid })
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: t('pushSettings.failedTitle'),
        body: t('common.pleaseTryAgain'),
      })
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      await unregisterPushDevice(uid, { reason: 'user' })
      pushCelebration({
        icon: 'bell-off',
        title: t('pushSettings.disabledTitle'),
        body: t('pushSettings.disabledBody'),
      })
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const removeDevice = async (hash) => {
    setBusy(true)
    try {
      await removePushDevice(uid, hash)
    } catch (error) {
      reportError('push.removeDevice', error, { uid })
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: t('errors.somethingWrong'),
        body: t('common.pleaseTryAgain'),
      })
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const status =
    support === 'unsupported'
      ? t('pushSettings.statusUnsupported')
      : support === 'ios'
        ? t('pushSettings.statusIos')
        : support === 'unconfigured'
          ? t('pushSettings.statusUnsupported')
          : permission === 'denied'
            ? t('pushSettings.statusBlocked')
            : here
              ? t('pushSettings.statusOn')
              : t('pushSettings.statusOff')
  const canTurnOn = support === 'ok' && permission !== 'denied' && !here
  const canTurnOff = here

  const setCategory = (key, enabled) =>
    save(() => savePushPreferences(uid, { push: { [key]: enabled } }))
  const setPreview = (enabled) => save(() => savePushPreferences(uid, { chatPreview: enabled }))

  return (
    <div className="page-content">
      <h2>{t('pushSettings.title')}</h2>

      <div className="settings-card">
        <button
          className="setting-row"
          onClick={() => save(() => setNotificationsEnabled(uid, !user.privacy.notifications))}
          role="switch"
          aria-checked={user.privacy.notifications}
          disabled={saving}
        >
          <Bell size={18} />
          <span>
            <strong>{t('pushSettings.masterTitle')}</strong>
            <small>{t('pushSettings.masterHint')}</small>
          </span>
          <span className={`switch ${user.privacy.notifications ? 'on' : ''}`} aria-hidden="true" />
        </button>
      </div>

      <div className="settings-card">
        <div className="setting-row push-status-row">
          {here ? <BellRing size={18} /> : <BellOff size={18} />}
          <span>
            <strong>{t('pushSettings.browserTitle')}</strong>
            <small>{t('pushSettings.browserHint')}</small>
            <small className="push-status" data-state={here ? 'on' : permission}>
              {status}
            </small>
          </span>
          {canTurnOn && (
            <button className="primary-button small" onClick={turnOn} disabled={busy}>
              {t('pushSettings.turnOn')}
            </button>
          )}
          {canTurnOff && (
            <button className="secondary-button small" onClick={turnOff} disabled={busy}>
              {t('pushSettings.turnOff')}
            </button>
          )}
        </div>
      </div>

      <h3 className="settings-heading">{t('pushSettings.categories')}</h3>
      <div className="settings-card">
        {CATEGORIES.map(({ key, icon: Icon, label, hint, fallback }) => {
          const on = typeof prefs.push?.[key] === 'boolean' ? prefs.push[key] : fallback
          return (
            <button
              key={key}
              className="setting-row"
              role="switch"
              aria-checked={on}
              disabled={saving}
              onClick={() => setCategory(key, !on)}
            >
              <Icon size={18} />
              <span>
                <strong>{t(`pushSettings.${label}`)}</strong>
                <small>{t(`pushSettings.${hint}`)}</small>
              </span>
              <span className={`switch ${on ? 'on' : ''}`} aria-hidden="true" />
            </button>
          )
        })}
        <button
          className="setting-row"
          role="switch"
          aria-checked={prefs.chatPreview === true}
          disabled={saving}
          onClick={() => setPreview(!(prefs.chatPreview === true))}
        >
          <Eye size={18} />
          <span>
            <strong>{t('pushSettings.chatPreview')}</strong>
            <small>{t('pushSettings.chatPreviewHint')}</small>
          </span>
          <span className={`switch ${prefs.chatPreview === true ? 'on' : ''}`} aria-hidden="true" />
        </button>
        <div className="setting-row setting-note">
          <ShieldCheck size={18} />
          <span>
            <small>{t('pushSettings.alwaysOn')}</small>
          </span>
          <span />
        </div>
      </div>

      <h3 className="settings-heading">{t('pushSettings.devices')}</h3>
      <div className="settings-card">
        {devices.length === 0 && (
          <div className="setting-row setting-note">
            <Laptop size={18} />
            <span>
              <small>{t('pushSettings.noDevices')}</small>
            </span>
            <span />
          </div>
        )}
        {devices.map((device) => {
          const DeviceIcon = device.platform === 'mobile' ? Smartphone : Laptop
          const mine = device.id === hereHash
          return (
            <div className="setting-row device-row" key={device.id}>
              <DeviceIcon size={18} />
              <span>
                <strong>
                  {device.label}
                  {mine && <em className="device-here">{t('pushSettings.thisDevice')}</em>}
                </strong>
                <small>
                  {device.lastSeenAt
                    ? t('pushSettings.lastSeen', {
                        when: formatRelativeTime(device.lastSeenAt, now),
                      })
                    : ''}
                </small>
              </span>
              <button
                className="icon-button subtle"
                onClick={() => removeDevice(device.id)}
                disabled={busy}
                aria-label={t('pushSettings.remove')}
                title={t('pushSettings.remove')}
              >
                <Trash2 size={17} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
