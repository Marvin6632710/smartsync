import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * In-app replacement for window.confirm.
 *
 * The native dialog is drawn by the browser at the top of the screen in OS
 * chrome, which breaks the phone illusion and can't be styled. It also
 * blocks the main thread, so nothing behind it can animate.
 *
 * Behaviour expected of a modal, since window.confirm gave these for free:
 * Escape cancels, the backdrop cancels, focus moves into the dialog on open
 * and returns to the trigger on close, and focus is trapped while open.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel,
  // Optional: make the action require a reason before it can be taken.
  // Passed in rather than held here so the caller owns the text and can send
  // it on — and set on exactly the actions that leave a record somebody else
  // will read, which is why the confirm button stays disabled until it is
  // filled in. An action nobody had to justify is an action nobody can
  // review.
  promptLabel,
  promptValue = '',
  promptPlaceholder,
  onPromptChange,
  // A prompt is required unless a caller says otherwise: lifting a
  // suspension takes a note for the record but must not be blocked on one.
  promptRequired = true,
}) {
  const { t } = useTranslation()
  const confirmRef = useRef(null)
  const promptRef = useRef(null)
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)
  // The latest cancel handler, read only from the key handler below. Every
  // caller passes an inline arrow, so `onCancel` is a new function on each
  // parent render — and the parent re-renders on every keystroke into the
  // prompt field. Keyed on that, the effect below re-ran per character: its
  // cleanup handed focus back to the button behind the dialog, and the fresh
  // run moved it to Confirm. One character was all anybody could type.
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCancelRef.current = onCancel
  })

  // Runs once per opening, never per render. Focus moves in when the dialog
  // opens and back out when it closes; nothing in between touches it.
  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    // Into the prompt when there is one: Confirm is disabled until a reason
    // is typed, and a disabled button cannot take focus, so aiming at it left
    // focus on the page behind the dialog.
    ;(promptRef.current || confirmRef.current)?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancelRef.current?.()
        return
      }

      if (event.key !== 'Tab') return

      // Keep Tab inside the dialog — otherwise focus walks into the page
      // behind it, which is still rendered.
      const focusables = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input, textarea',
      )
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-dialog-title">{title}</h3>
        <p id="confirm-dialog-body">{body}</p>

        {promptLabel && (
          <label className="report-detail">
            {promptLabel}
            <input
              ref={promptRef}
              maxLength={500}
              placeholder={promptPlaceholder}
              value={promptValue}
              onChange={(event) => onPromptChange?.(event.target.value)}
            />
          </label>
        )}

        <div className="button-row">
          <button className="secondary-button" onClick={onCancel}>
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            className={tone === 'danger' ? 'danger-button' : 'primary-button'}
            onClick={onConfirm}
            ref={confirmRef}
            disabled={Boolean(promptLabel) && promptRequired && !promptValue.trim()}
          >
            {confirmLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
