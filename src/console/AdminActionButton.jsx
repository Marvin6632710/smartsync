import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import ConfirmDialog from '../components/ConfirmDialog'
import { useApp } from '../context/AppContext'

/** A reasoned, confirmed server-side admin action with consistent feedback. */
export default function AdminActionButton({
  action,
  body,
  children,
  className = 'secondary-button',
  disabled = false,
  onDone,
  title,
  tone = 'default',
}) {
  const { t } = useTranslation()
  const { pushCelebration } = useApp()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!reason.trim()) return
    setBusy(true)
    try {
      const result = await action(reason.trim())
      setOpen(false)
      setReason('')
      pushCelebration({
        icon: 'check',
        tone: 'success',
        title: t('adminPowers.done'),
        body: t(`adminPowers.status.${result?.status}`, {
          defaultValue: t('adminPowers.saved'),
        }),
      })
      onDone?.(result)
    } catch (error) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: t('adminPowers.failed'),
        body: error?.message || t('common.pleaseTryAgain'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        onClick={() => setOpen(true)}
      >
        {busy ? t('common.working') : children}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        body={body}
        promptLabel={t('adminPowers.reason')}
        promptPlaceholder={t('adminPowers.reasonPlaceholder')}
        promptValue={reason}
        onPromptChange={setReason}
        confirmLabel={t('common.confirm')}
        tone={tone}
        onConfirm={run}
        onCancel={() => {
          if (!busy) setOpen(false)
        }}
      />
    </>
  )
}
