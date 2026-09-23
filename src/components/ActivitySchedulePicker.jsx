import React, { useId, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { timeBandLabel } from '../i18n'
import { formatClock } from '../utils/time'

const pad = (value) => String(value).padStart(2, '0')

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  )
    return null
  return date
}

const firstOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1)

function plusDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function timeParts(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return { hour: 19, minute: 0 }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return { hour: 19, minute: 0 }
  return { hour, minute }
}

export default function ActivitySchedulePicker({
  date,
  time,
  minDate = '',
  onDateChange,
  onTimeChange,
}) {
  const { t } = useTranslation()
  const pickerId = useId()
  const [openPanel, setOpenPanel] = useState(null)
  const selectedDate = parseDate(date)
  const [visibleMonth, setVisibleMonth] = useState(() => firstOfMonth(selectedDate || new Date()))

  const dateLabel = selectedDate
    ? t('create.schedule.dateValue', {
        weekday: t(`time.weekdaysShort.${selectedDate.getDay()}`),
        day: selectedDate.getDate(),
        month: t(`time.monthsShort.${selectedDate.getMonth()}`),
        year: selectedDate.getFullYear(),
      })
    : t('create.schedule.chooseDate')
  const timeLabel = time ? formatClock(time) : t('create.schedule.chooseTime')
  const monthLabel = t('create.schedule.monthYear', {
    month: t(`time.monthsShort.${visibleMonth.getMonth()}`),
    year: visibleMonth.getFullYear(),
  })

  const calendarDays = useMemo(() => {
    const firstWeekday = visibleMonth.getDay()
    const daysInMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      0,
    ).getDate()
    const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
    return Array.from({ length: cells }, (_, index) => {
      const day = index - firstWeekday + 1
      return day > 0 && day <= daysInMonth
        ? new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)
        : null
    })
  }, [visibleMonth])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const quickDates = [today, plusDays(today, 1)]
  const { hour, minute } = timeParts(time)

  const chooseDate = (next) => {
    onDateChange(isoDate(next))
    setOpenPanel(null)
  }

  const changeTime = (minutes) => {
    const total = (hour * 60 + minute + minutes + 24 * 60) % (24 * 60)
    onTimeChange(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`)
  }

  const togglePanel = (panel) => {
    if (panel === 'date' && openPanel !== 'date' && selectedDate)
      setVisibleMonth(firstOfMonth(selectedDate))
    setOpenPanel((current) => (current === panel ? null : panel))
  }

  return (
    <fieldset
      className="schedule-picker"
      onKeyDown={(event) => event.key === 'Escape' && setOpenPanel(null)}
    >
      <legend>{t('create.schedule.title')}</legend>
      <p className="schedule-hint">{t('create.schedule.hint')}</p>

      <div className="schedule-summary">
        <button
          type="button"
          className={`schedule-trigger ${openPanel === 'date' ? 'active' : ''}`}
          onClick={() => togglePanel('date')}
          aria-expanded={openPanel === 'date'}
          aria-controls={`${pickerId}-date`}
          aria-label={t('create.schedule.changeDate', { value: dateLabel })}
        >
          <span className="schedule-trigger-icon" aria-hidden="true">
            <CalendarDays size={20} />
          </span>
          <span className="schedule-trigger-copy">
            <small>{t('create.date')}</small>
            <strong>{dateLabel}</strong>
          </span>
          <ChevronDown className="schedule-trigger-chevron" size={18} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`schedule-trigger ${openPanel === 'time' ? 'active' : ''}`}
          onClick={() => togglePanel('time')}
          aria-expanded={openPanel === 'time'}
          aria-controls={`${pickerId}-time`}
          aria-label={t('create.schedule.changeTime', { value: timeLabel })}
        >
          <span className="schedule-trigger-icon" aria-hidden="true">
            <Clock3 size={20} />
          </span>
          <span className="schedule-trigger-copy">
            <small>{t('create.time')}</small>
            <strong>{timeLabel}</strong>
          </span>
          <ChevronDown className="schedule-trigger-chevron" size={18} aria-hidden="true" />
        </button>
      </div>

      {openPanel === 'date' && (
        <div className="schedule-panel schedule-date-panel" id={`${pickerId}-date`}>
          <div className="schedule-date-shortcuts">
            {quickDates.map((quickDate, index) => {
              const value = isoDate(quickDate)
              if (minDate && value < minDate) return null
              return (
                <button
                  type="button"
                  className={value === date ? 'selected' : ''}
                  onClick={() => chooseDate(quickDate)}
                  key={value}
                >
                  {index === 0 ? t('time.today') : t('time.tomorrow')}
                  {value === date && <Check size={15} aria-hidden="true" />}
                </button>
              )
            })}
          </div>

          <div className="schedule-calendar-head">
            <button
              type="button"
              className="schedule-calendar-nav"
              onClick={() =>
                setVisibleMonth(
                  new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1),
                )
              }
              aria-label={t('create.schedule.previousMonth')}
            >
              <ChevronLeft size={20} />
            </button>
            <strong>{monthLabel}</strong>
            <button
              type="button"
              className="schedule-calendar-nav"
              onClick={() =>
                setVisibleMonth(
                  new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1),
                )
              }
              aria-label={t('create.schedule.nextMonth')}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div
            className="schedule-calendar"
            role="grid"
            aria-label={t('create.schedule.calendarLabel', { month: monthLabel })}
          >
            {Array.from({ length: 7 }, (_, index) => (
              <span className="schedule-weekday" role="columnheader" key={index}>
                {t(`time.weekdaysShort.${index}`)}
              </span>
            ))}
            {calendarDays.map((day, index) => {
              if (!day)
                return <span className="schedule-calendar-blank" aria-hidden="true" key={index} />
              const value = isoDate(day)
              const disabled = Boolean(minDate && value < minDate)
              const isToday = value === isoDate(today)
              return (
                <button
                  type="button"
                  role="gridcell"
                  className={`${value === date ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  disabled={disabled}
                  onClick={() => chooseDate(day)}
                  aria-label={t('create.schedule.dateValue', {
                    weekday: t(`time.weekdays.${day.getDay()}`),
                    day: day.getDate(),
                    month: t(`time.monthsShort.${day.getMonth()}`),
                    year: day.getFullYear(),
                  })}
                  aria-selected={value === date}
                  key={value}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {openPanel === 'time' && (
        <div className="schedule-panel schedule-time-panel" id={`${pickerId}-time`}>
          <div className="schedule-time-dial">
            <div className="schedule-time-unit">
              <button
                type="button"
                onClick={() => changeTime(60)}
                aria-label={t('create.schedule.nextHour')}
              >
                <ChevronUp size={22} />
              </button>
              <output>{pad(hour)}</output>
              <span>{t('create.schedule.hour')}</span>
              <button
                type="button"
                onClick={() => changeTime(-60)}
                aria-label={t('create.schedule.previousHour')}
              >
                <ChevronDown size={22} />
              </button>
            </div>

            <span className="schedule-time-colon" aria-hidden="true">
              :
            </span>

            <div className="schedule-time-unit">
              <button
                type="button"
                onClick={() => changeTime(5)}
                aria-label={t('create.schedule.nextMinute')}
              >
                <ChevronUp size={22} />
              </button>
              <output>{pad(minute)}</output>
              <span>{t('create.schedule.minute')}</span>
              <button
                type="button"
                onClick={() => changeTime(-5)}
                aria-label={t('create.schedule.previousMinute')}
              >
                <ChevronDown size={22} />
              </button>
            </div>
          </div>

          <div className="schedule-time-suggestions">
            <span>{t('create.schedule.suggestedTimes')}</span>
            <div>
              {[
                ['09:00', 'Morning'],
                ['14:00', 'Afternoon'],
                ['19:00', 'Evening'],
              ].map(([value, band]) => (
                <button
                  type="button"
                  className={time === value ? 'selected' : ''}
                  onClick={() => onTimeChange(value)}
                  aria-label={`${formatClock(value)} · ${timeBandLabel(band)}`}
                  key={value}
                >
                  <strong>{formatClock(value)}</strong>
                  <small>{timeBandLabel(band)}</small>
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="schedule-done" onClick={() => setOpenPanel(null)}>
            <Check size={17} />
            {t('create.schedule.done')}
          </button>
        </div>
      )}
    </fieldset>
  )
}
