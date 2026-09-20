import React from 'react'
import { useTranslation } from 'react-i18next'

import ConfirmDialog from '../components/ConfirmDialog'
import { useConsole } from './ConsoleContext'

/**
 * The confirmations behind every desk action, rendered once for the whole
 * console. The screens open them through the desk (`setActing`,
 * `askSuspend`, …); the wording is the old moderation page's, unchanged,
 * so a decision reads the same wherever it is taken from.
 */
export default function DeskDialogs() {
  const { t } = useTranslation()
  const { desk, nameFor, subjectOf } = useConsole()
  const {
    acting,
    setActing,
    act,
    suspendTarget,
    setSuspendTarget,
    suspendReason,
    setSuspendReason,
    actOnPerson,
    recorded,
    setRecorded,
    recordedReason,
    setRecordedReason,
    applyRecorded,
    removeTarget,
    setRemoveTarget,
    removeReason,
    setRemoveReason,
    remove,
  } = desk

  return (
    <>
      <ConfirmDialog
        open={Boolean(acting)}
        title={
          acting?.kind === 'remove'
            ? t('moderation.dialogs.removeTitle')
            : acting?.kind === 'suspend'
              ? t('moderation.dialogs.suspendTitle')
              : t('moderation.dialogs.dismissTitle')
        }
        body={
          acting?.kind === 'remove'
            ? t('moderation.dialogs.removeBody')
            : acting?.kind === 'suspend'
              ? t('moderation.dialogs.suspendBody', { name: nameFor(subjectOf(acting.report)) })
              : t('moderation.dialogs.dismissBody')
        }
        confirmLabel={
          acting?.kind === 'remove'
            ? t('moderation.dialogs.remove')
            : acting?.kind === 'suspend'
              ? t('moderation.dialogs.suspend')
              : t('moderation.dialogs.dismiss')
        }
        cancelLabel={t('common.cancel')}
        tone={acting?.kind === 'dismiss' ? 'default' : 'danger'}
        onConfirm={act}
        onCancel={() => setActing(null)}
      />

      <ConfirmDialog
        open={Boolean(suspendTarget)}
        title={
          suspendTarget?.suspend
            ? t('moderation.dialogs.suspendTitle')
            : t('moderation.dialogs.liftTitle')
        }
        body={
          suspendTarget?.suspend
            ? t('moderation.dialogs.suspendBody', { name: nameFor(suspendTarget.uid) })
            : t('moderation.dialogs.liftBody', { name: nameFor(suspendTarget?.uid) })
        }
        promptLabel={
          suspendTarget?.suspend
            ? t('console.dialogs.suspendPrompt')
            : t('console.dialogs.liftPrompt')
        }
        promptPlaceholder={
          suspendTarget?.suspend
            ? t('console.dialogs.suspendPlaceholder')
            : t('console.dialogs.liftPlaceholder')
        }
        promptRequired={Boolean(suspendTarget?.suspend)}
        promptValue={suspendReason}
        onPromptChange={setSuspendReason}
        confirmLabel={
          suspendTarget?.suspend ? t('moderation.dialogs.suspend') : t('moderation.dialogs.lift')
        }
        cancelLabel={t('common.cancel')}
        tone={suspendTarget?.suspend ? 'danger' : 'default'}
        onConfirm={actOnPerson}
        onCancel={() => setSuspendTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(recorded)}
        title={
          recorded?.kind === 'warn'
            ? t('moderation.dialogs.warnTitle')
            : recorded?.kind === 'close'
              ? t('moderation.dialogs.closeTitle')
              : t('moderation.dialogs.reopenTitle')
        }
        body={
          recorded?.kind === 'warn'
            ? t('moderation.dialogs.warnBody', { name: nameFor(recorded.uid) })
            : recorded?.kind === 'close'
              ? t('moderation.dialogs.closeBody', { name: nameFor(recorded?.uid) })
              : t('moderation.dialogs.reopenBody', { name: nameFor(recorded?.uid) })
        }
        promptLabel={
          recorded?.kind === 'warn'
            ? t('moderation.dialogs.warnPrompt')
            : recorded?.kind === 'close'
              ? t('moderation.dialogs.closePrompt')
              : t('moderation.dialogs.reopenPrompt')
        }
        promptPlaceholder={
          recorded?.kind === 'warn'
            ? t('moderation.dialogs.warnPlaceholder')
            : recorded?.kind === 'close'
              ? t('moderation.dialogs.closePlaceholder')
              : t('moderation.dialogs.reopenPlaceholder')
        }
        promptValue={recordedReason}
        onPromptChange={setRecordedReason}
        confirmLabel={
          recorded?.kind === 'warn'
            ? t('moderation.dialogs.sendWarning')
            : recorded?.kind === 'close'
              ? t('moderation.dialogs.closeAccount')
              : t('moderation.dialogs.reopen')
        }
        cancelLabel={t('common.cancel')}
        tone={recorded?.kind === 'reopen' ? 'default' : 'danger'}
        onConfirm={applyRecorded}
        onCancel={() => setRecorded(null)}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={t('moderation.dialogs.removeTitle')}
        body={t('moderation.dialogs.removeBody')}
        promptLabel={t('activity.admin.whyTakeDown')}
        promptPlaceholder={t('activity.admin.takeDownPlaceholder')}
        promptValue={removeReason}
        onPromptChange={setRemoveReason}
        confirmLabel={t('moderation.dialogs.remove')}
        cancelLabel={t('common.cancel')}
        tone="danger"
        onConfirm={remove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  )
}
