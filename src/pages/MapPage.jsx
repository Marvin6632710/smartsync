import React, { useMemo, useState } from 'react'
import { ChevronRight, Clock3, List, LocateFixed, Search, Sparkles, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CategoryIcon from '../components/CategoryIcon'
import FiltersEmptyState from '../components/FiltersEmptyState'
import { useApp } from '../context/AppContext'

const categoryKey = (value) => (value || '').toLowerCase()

export default function MapPage() {
  const { filteredActivities } = useApp()
  const navigate = useNavigate()

  const [selectedId, setSelectedId] = useState(filteredActivities[0]?.id || null)

  const selectedActivity = useMemo(() => {
    // Falling back to the first match matters: the selected pin can be
    // filtered out from under us, and a stale selection would keep showing
    // a card for an activity no longer on the map.
    return (
      filteredActivities.find((activity) => activity.id === selectedId) || filteredActivities[0]
    )
  }, [filteredActivities, selectedId])

  return (
    <div className="smart-map-page">
      <div className="smart-map">
        <div className="map-background-grid" />

        <div className="map-pastel-area map-area-one" />
        <div className="map-pastel-area map-area-two" />
        <div className="map-pastel-area map-area-three" />
        <div className="map-pastel-area map-area-four" />

        <div className="map-river river-one" />
        <div className="map-river river-two" />

        <div className="map-road road-one" />
        <div className="map-road road-two" />
        <div className="map-road road-three" />
        <div className="map-road road-four" />

        <button
          className="map-round-button map-search-button"
          onClick={() => navigate('/search')}
          aria-label="Search activities"
        >
          <Search size={19} />
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
              <span className="preview-match">{selectedActivity.matchScore}% match</span>
              <strong>{selectedActivity.title}</strong>
              <small>{selectedActivity.distanceKm} km away</small>
            </div>

            <ChevronRight size={18} />
          </button>
        )}

        {filteredActivities.map((activity, index) => {
          const isSelected = selectedId === activity.id

          return (
            <button
              key={activity.id}
              className={`activity-map-marker ${isSelected ? 'selected' : ''}`}
              data-category={categoryKey(activity.category)}
              style={{
                left: `${activity.x}%`,
                top: `${activity.y}%`,
                animationDelay: `${index * 55}ms`,
              }}
              onClick={() => setSelectedId(activity.id)}
              aria-label={`Select ${activity.title}`}
            >
              <CategoryIcon category={activity.category} size={isSelected ? 19 : 16} />

              {isSelected && <span className="marker-match">{activity.matchScore}%</span>}
            </button>
          )
        })}

        <div className="current-user-location" style={{ left: '48%', top: '62%' }}>
          <div className="user-location-pulse" />
          <div className="user-location-dot" />
        </div>

        {/* Without this a filtered-out map is just empty terrain, which reads
            as broken rather than filtered. */}
        {filteredActivities.length === 0 && (
          <div className="map-empty">
            <FiltersEmptyState body="No activities to plot on the map right now." />
          </div>
        )}

        <button
          className="map-round-button map-ai-button"
          onClick={() => navigate('/recommendations')}
          aria-label="Open recommendations"
        >
          <Sparkles size={19} />
        </button>

        <button className="map-round-button map-location-button" aria-label="Center location">
          <LocateFixed size={19} />
        </button>

        <button className="map-list-button" onClick={() => navigate('/home')}>
          <List size={17} />
          <span>List view</span>
        </button>

        {selectedActivity && (
          <div className="map-bottom-card" data-category={categoryKey(selectedActivity.category)}>
            <div className="bottom-card-top">
              <div className="bottom-card-icon">
                <CategoryIcon category={selectedActivity.category} size={17} />
              </div>

              <div className="bottom-card-title">
                <span>{selectedActivity.category}</span>
                <strong>{selectedActivity.title}</strong>
              </div>

              <div className="bottom-match">{selectedActivity.matchScore}%</div>
            </div>

            <div className="bottom-card-info">
              <span>
                <Clock3 size={13} />
                {selectedActivity.date} · {selectedActivity.time}
              </span>

              <span>
                <Users size={13} />
                {selectedActivity.participants}/{selectedActivity.capacity}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
