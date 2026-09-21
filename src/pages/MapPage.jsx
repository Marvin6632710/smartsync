import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, List, LocateFixed, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GoogleMap, { GoogleMarker } from '../components/GoogleMap'
import ActivityPins, { FitToActivities, FlyTo } from '../components/ActivityMapPins'
import CategoryIcon from '../components/CategoryIcon'
import { MIN_ZOOM, THAILAND_CENTRE } from '../data/region'
import FiltersEmptyState from '../components/FiltersEmptyState'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { categoryLabel, distanceLabel } from '../i18n'
import { formatActivityDate, formatClock } from '../utils/time'
import { categoryKey } from '../utils/maps'

const BANGKOK = [13.7563, 100.5018]

/**
 * The activities on the map as a list, beside it.
 *
 * On a wide screen the map has room for a companion: the same activities as
 * rows, so what the pins stand for can be read without hovering each one,
 * and choosing a row lights its pin and moves the map to it. A phone shows
 * the map alone and the stylesheet keeps this off it; the pins, the preview
 * card and the buttons over the map are untouched.
 */
function MapSide({ activities, selectedId, onChoose, t }) {
  const rows = useRef(new Map())
  // A pin chosen on the map brings its row into view, so the two stay in
  // step whichever side you drive from.
  useEffect(() => {
    if (!selectedId) return
    rows.current.get(selectedId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <aside className="map-side" aria-label={t('map.listTitle')}>
      <div className="map-side-head">
        <span className="eyebrow">{t('map.listTitle')}</span>
        <h2>{t('map.listCount', { count: activities.length })}</h2>
        <p className="helper-text">{t('map.listHint')}</p>
      </div>
      <div className="map-side-list">
        {activities.map((activity) => {
          const selected = activity.id === selectedId
          return (
            <button
              key={activity.id}
              type="button"
              className="map-row"
              data-category={categoryKey(activity.category)}
              aria-current={selected ? 'true' : undefined}
              ref={(el) => {
                if (el) rows.current.set(activity.id, el)
                else rows.current.delete(activity.id)
              }}
              onClick={() => onChoose(activity)}
            >
              <span className="preview-icon" aria-hidden="true">
                <CategoryIcon category={activity.category} size={18} />
              </span>
              <span className="map-row-copy">
                <strong>{activity.title}</strong>
                <small>
                  {categoryLabel(activity.category)} · {formatActivityDate(activity.date)} ·{' '}
                  {formatClock(activity.time)}
                </small>
                <small>
                  {activity.distanceKm != null
                    ? t('distance.away', { distance: distanceLabel(activity.distanceKm) })
                    : activity.locationName}
                </small>
              </span>
              <span className="match-pill">
                {t('common.match', { value: activity.matchScore ?? '--' })}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

export default function MapPage() {
  const { t } = useTranslation()
  const { filteredActivities, loading, pushCelebration } = useApp()
  const { user } = useAuth()
  const { request, busy, error: locationError } = useDeviceLocation()
  // The map has no form to print an error under, so a refused or failed
  // location request is said in the toast — it used to say nothing, which
  // made the button look broken.
  React.useEffect(() => {
    if (!locationError) return
    pushCelebration({
      icon: 'alert',
      tone: 'warning',
      title: t('location.couldNotShow'),
      body: t(locationError),
    })
    // The toast is the only consumer; the hook's own state drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationError])
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(null)
  const [flyTarget, setFlyTarget] = useState(null)
  const [followLocation, setFollowLocation] = useState(false)
  // A choice made in the list, which moves the map; a tap on a pin does
  // not, because the map is already where you are looking.
  const [focus, setFocus] = useState(null)

  const located = useMemo(
    () => filteredActivities.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng)),
    [filteredActivities],
  )

  // Keyed on the coordinates, not the array. `filteredActivities` is rebuilt
  // every minute by the clock that decides what has started, and on every
  // snapshot, so `points` was a new array each time and the map re-fitted to
  // it — snapping the view back while somebody was panning around the city.
  // The view now moves only when the set of places on it actually changes.
  const pointsKey = useMemo(() => located.map((a) => `${a.lat},${a.lng}`).join('|'), [located])
  const points = useMemo(
    () => (pointsKey ? pointsKey.split('|').map((pair) => pair.split(',').map(Number)) : []),
    [pointsKey],
  )

  const mapCentre = useMemo(() => {
    if (user.location) return [user.location.lat, user.location.lng]
    if (located.length) return BANGKOK
    return THAILAND_CENTRE
  }, [user.location, located.length])

  const selectedActivity = useMemo(
    // The selected pin can be filtered out from under us, so fall back rather
    // than keep showing a card for something no longer on the map.
    () => located.find((activity) => activity.id === selectedId) || null,
    [located, selectedId],
  )

  const showMe = async () => {
    if (user.location) {
      setFlyTarget([user.location.lat, user.location.lng])
      return
    }
    const granted = await request()
    if (granted) setFollowLocation(true)
  }

  const chooseFromList = (activity) => {
    setFollowLocation(false)
    setSelectedId(activity.id)
    setFocus([activity.lat, activity.lng])
  }

  return (
    <div className="smart-map-page">
      <MapSide activities={located} selectedId={selectedId} onChoose={chooseFromList} t={t} />
      <div className="smart-map">
        <GoogleMap center={mapCentre} zoom={located.length || user.location ? 12 : MIN_ZOOM + 1}>
          <ActivityPins activities={located} selectedId={selectedId} onSelect={setSelectedId} />
          {user.location && (
            <GoogleMarker position={user.location} title={t('map.yourLocation')} anchorTop="-50%">
              <span className="map-me-pin">
                <span />
              </span>
            </GoogleMarker>
          )}
          <FitToActivities points={points} />
          <FlyTo target={flyTarget || (followLocation ? user.location : null)} />
          <FlyTo target={focus} zoom={14} atLeast />
          {!loading && located.length === 0 && (
            <div className="map-empty">
              <FiltersEmptyState body={t('filtersEmpty.mapBody')} />
            </div>
          )}
        </GoogleMap>

        <button
          className="map-round-button map-search-button"
          onClick={() => navigate('/search')}
          aria-label={t('search.label')}
        >
          <Search size={19} />
        </button>
        <button
          className="map-round-button map-location-button"
          onClick={showMe}
          disabled={busy}
          aria-label={t('map.showMyLocation')}
        >
          <LocateFixed size={19} />
        </button>
        <button
          className="map-round-button map-list-button"
          onClick={() => navigate('/recommendations')}
          aria-label={t('map.seeAsList')}
        >
          <List size={19} />
        </button>

        {selectedActivity && (
          <button
            className="map-activity-preview"
            data-category={categoryKey(selectedActivity.category)}
            onClick={() => navigate(`/activity/${selectedActivity.id}`)}
          >
            <div className="preview-icon">
              <CategoryIcon category={selectedActivity.category} size={18} />
            </div>
            <div className="preview-copy">
              <span className="preview-match">
                {t('common.match', { value: selectedActivity.matchScore })}
              </span>
              <strong>{selectedActivity.title}</strong>
              <small>
                {selectedActivity.distanceKm != null
                  ? t('distance.away', { distance: distanceLabel(selectedActivity.distanceKm) })
                  : selectedActivity.locationName}
              </small>
            </div>
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
