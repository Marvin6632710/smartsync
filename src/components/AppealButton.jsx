import React, { useState } from 'react'
import { Scale } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApp } from '../context/AppContext'
import { submitModerationAppeal } from '../firebase/admin'
import ConfirmDialog from './ConfirmDialog'

export default function AppealButton({
  activityId,
  className = 'secondary-button',
  kind,
  onDone,
  targetId,
}) {
  const { t } = useTranslation()
  const { pushCelebration } = useApp()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (detail.trim().length < 10) return
    setBusy(true)
    try {
      const result = await submitModerationAppeal({ kind, targetId, activityId, detail })
      if (result.status === 'not-appealable') throw new Error(t('appeals.noLongerAvailable'))
      setOpen(false)
      setDetail('')
      pushCelebration({
        icon: 'check',
        tone: 'success',
        title: t('appeals.sent'),
        body: t('appeals.sentBody'),
      })
      onDone?.(result)
    } catch (error) {
      pushCelebration({
        icon: 'alert',
        tone: 'warning',
        title: t('appeals.failed'),
        body: error?.message || t('common.pleaseTryAgain'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => setOpen(true)}>
        <Scale size={15} /> {busy ? t('common.working') : t('appeals.appeal')}
      </button>
      <ConfirmDialog
        open={open}
        title={t('appeals.dialogTitle')}
        body={t('appeals.dialogBody')}
        promptLabel={t('appeals.explanation')}
        promptPlaceholder={t('appeals.placeholder')}
        promptValue={detail}
        onPromptChange={setDetail}
        confirmLabel={t('appeals.send')}
        onConfirm={submit}
        onCancel={() => !busy && setOpen(false)}
      />
    </>
  )
}
