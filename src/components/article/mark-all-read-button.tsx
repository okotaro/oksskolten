import { CheckCheck } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { useMarkAllRead } from '../../hooks/use-mark-all-read'
import type { MarkAllReadTarget } from '../../../shared/types'

export interface MarkAllReadButtonProps {
  target: MarkAllReadTarget
  onMarkedLocally: (ids: number[]) => void
  onUnmarkedLocally: (ids: number[]) => void
}

/**
 * Header button that marks every unread article in the given feed or
 * category as read. Purely presentational: all execution, notification and
 * undo logic lives in useMarkAllRead. This component only renders the
 * per-target label and reflects `isPending` as the disabled state to guard
 * against duplicate clicks while a request is in flight.
 */
export function MarkAllReadButton({ target, onMarkedLocally, onUnmarkedLocally }: MarkAllReadButtonProps) {
  const { t } = useI18n()
  const { markAllRead, isPending } = useMarkAllRead({ target, onMarkedLocally, onUnmarkedLocally })

  const label = target.type === 'feed' ? t('feeds.markAllRead') : t('category.markAllRead')

  return (
    <button
      type="button"
      onClick={() => {
        void markAllRead()
      }}
      disabled={isPending}
      className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-bg-subtle px-2 text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-50"
    >
      <CheckCheck size={16} strokeWidth={1.5} />
      {label}
    </button>
  )
}
