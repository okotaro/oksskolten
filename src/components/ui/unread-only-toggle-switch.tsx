import { cn } from '@/lib/utils'

interface UnreadOnlyToggleSwitchProps {
  unreadOnly: boolean
  onChange: (unreadOnly: boolean) => void
  /** aria-label for the "show all" segment */
  showAllLabel: string
  /** aria-label for the "unread only" segment */
  unreadOnlyLabel: string
}

const segmentClass = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors'

/**
 * Presentation-only 2-option switch that always shows both "show all" and
 * "unread only" segments, highlighting whichever is currently active.
 *
 * Clicking the already-active segment is a no-op; onChange only fires when
 * the clicked segment differs from the current value.
 */
export function UnreadOnlyToggleSwitch({ unreadOnly, onChange, showAllLabel, unreadOnlyLabel }: UnreadOnlyToggleSwitchProps) {
  return (
    <div role="group" className="inline-flex items-center gap-0.5 rounded-full bg-bg-subtle p-0.5">
      <button
        type="button"
        aria-label={showAllLabel}
        aria-pressed={!unreadOnly}
        onClick={() => {
          if (unreadOnly) onChange(false)
        }}
        className={cn(segmentClass, !unreadOnly ? 'bg-accent text-accent-text' : 'text-muted hover:text-text')}
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={unreadOnlyLabel}
        aria-pressed={unreadOnly}
        onClick={() => {
          if (!unreadOnly) onChange(true)
        }}
        className={cn(segmentClass, unreadOnly ? 'bg-accent text-accent-text' : 'text-muted hover:text-text')}
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
        </svg>
      </button>
    </div>
  )
}
