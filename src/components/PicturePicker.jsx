import React, { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { preparePicture } from '../utils/pictures'

export default function PicturePicker({ kind, value, onChange, onBusyChange, disabled, children }) {
  const { t } = useTranslation()
  const id = useId()
  const latest = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(
    () => () => {
      latest.current += 1
    },
    [],
  )

  const select = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const attempt = ++latest.current
    setError('')
    setBusy(true)
    onBusyChange?.(true)
    try {
      const picture = await preparePicture(file, kind)
      if (attempt === latest.current) onChange(picture)
    } catch (err) {
      if (attempt === latest.current)
        setError(err.message?.startsWith('pictures.') ? err.message : 'pictures.readError')
    } finally {
      if (attempt === latest.current) {
        setBusy(false)
        onBusyChange?.(false)
      }
    }
  }

  return (
    <div className={`picture-picker picture-picker-${kind}`}>
      <label htmlFor={id}>{t(`pictures.${kind}`)}</label>
      <div className="picture-preview">
        {value ? <img src={value.dataUrl} alt={t('pictures.preview')} /> : children}
      </div>
      <p className="field-hint" id={`${id}-hint`}>
        {t('pictures.hint')}
      </p>
      <div className="picture-controls">
        <label className="secondary-button picture-choose">
          <ImagePlus size={17} aria-hidden="true" />
          <span>{busy ? t('pictures.preparing') : t('pictures.choose')}</span>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={select}
            disabled={disabled || busy}
            aria-label={t(`pictures.${kind}`)}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
            aria-invalid={Boolean(error)}
          />
        </label>
        {value && (
          <button
            type="button"
            className="text-button"
            disabled={disabled || busy}
            onClick={() => {
              onChange(null)
              setError('')
            }}
          >
            <X size={16} aria-hidden="true" /> {t('pictures.undo')}
          </button>
        )}
      </div>
      {busy && (
        <p className="field-hint" role="status">
          {t('pictures.preparing')}
        </p>
      )}
      {error && (
        <p className="form-error" id={`${id}-error`} role="alert">
          {t(error)}
        </p>
      )}
      {value && <p className="field-hint">{t('pictures.saveHint')}</p>}
    </div>
  )
}
