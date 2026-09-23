import { cn } from '@/lib/utils'

interface UnreadOnlyToggleSwitchProps {
  unreadOnly: boolean
  onChange: (unreadOnly: boolean) => void
  /** aria-label for the "show all" segment */
  showAllLabel: string
  /** aria-label for the "unread only" segment */
  unreadOnlyLabel: string
  /** short visible text for the "show all" segment */
  showAllText: string
  /** short visible text for the "unread only" segment */
  unreadOnlyText: string
}

const segmentClass = 'flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-medium transition-colors'

/**
 * Presentation-only 2-option switch that always shows both "show all" and
 * "unread only" segments, highlighting whichever is currently active.
 *
 * Clicking the already-active segment is a no-op; onChange only fires when
 * the clicked segment differs from the current value.
 */
export function UnreadOnlyToggleSwitch({
  unreadOnly,
  onChange,
  showAllLabel,
  unreadOnlyLabel,
  showAllText,
  unreadOnlyText,
}: UnreadOnlyToggleSwitchProps) {
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
        {showAllText}
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
        {unreadOnlyText}
      </button>
    </div>
  )
}
