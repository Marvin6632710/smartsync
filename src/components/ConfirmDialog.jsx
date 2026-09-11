import React, { useEffect, useRef } from 'react'

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
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
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
}) {
  const confirmRef = useRef(null)
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    confirmRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel?.()
        return
      }

      if (event.key !== 'Tab') return

      // Keep Tab inside the dialog — otherwise focus walks into the page
      // behind it, which is still rendered.
      const focusables = dialogRef.current?.querySelectorAll('button')
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
  }, [open, onCancel])

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
              maxLength={500}
              placeholder={promptPlaceholder}
              value={promptValue}
              onChange={(event) => onPromptChange?.(event.target.value)}
            />
          </label>
        )}

        <div className="button-row">
          <button className="secondary-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={tone === 'danger' ? 'danger-button' : 'primary-button'}
            onClick={onConfirm}
            ref={confirmRef}
            disabled={Boolean(promptLabel) && !promptValue.trim()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
