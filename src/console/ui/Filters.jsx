import React, { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * The strip of controls above a list: a search field, a few selects, and
 * a way to clear them all. Persistent — the caller keeps the values, so
 * they survive opening and closing the details panel.
 */
export function FilterBar({ children, onClear, dirty = false }) {
  const { t } = useTranslation()
  return (
    <div className="con-filters" role="group" aria-label={t('console.filters.label')}>
      {children}
      {onClear && (
        <button type="button" className="con-filter-clear" onClick={onClear} disabled={!dirty}>
          <X size={14} aria-hidden="true" /> {t('console.filters.clear')}
        </button>
      )}
    </div>
  )
}

/**
 * The search box. `/` from anywhere on the page jumps into it — the one
 * shortcut every operations tool shares — and Escape clears it.
 */
export function SearchField({ value, onChange, label, placeholder, hotkey = true }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!hotkey) return undefined
    const onKey = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (typing) return
      event.preventDefault()
      ref.current?.focus()
      ref.current?.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hotkey])
  return (
    <label className="con-search">
      <Search size={15} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        maxLength={80}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            onChange('')
          }
        }}
      />
    </label>
  )
}

/** One select, labelled inline: the label reads as part of the control. */
export function SelectFilter({ label, value, onChange, options }) {
  return (
    <label className="con-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Does a row match a typed term, over the words given? */
export function matches(term, ...words) {
  const needle = String(term || '')
    .trim()
    .toLowerCase()
  if (!needle) return true
  return words.some((word) =>
    String(word || '')
      .toLowerCase()
      .includes(needle),
  )
}
