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
 * Clicking either segment toggles the value, regardless of which segment is
 * currently active.
 */
export function UnreadOnlyToggleSwitch({
  unreadOnly,
  onChange,
  showAllLabel,
  unreadOnlyLabel,
  showAllText,
  unreadOnlyText,
}: UnreadOnlyToggleSwitchProps) {
  const toggle = () => onChange(!unreadOnly)

  return (
    <div role="group" className="inline-flex items-center gap-0.5 rounded-full bg-bg-subtle p-0.5">
      <button
        type="button"
        aria-label={showAllLabel}
        aria-pressed={!unreadOnly}
        onClick={toggle}
        className={cn(segmentClass, !unreadOnly ? 'bg-accent text-accent-text' : 'text-muted hover:text-text')}
      >
        {showAllText}
      </button>
      <button
        type="button"
        aria-label={unreadOnlyLabel}
        aria-pressed={unreadOnly}
        onClick={toggle}
        className={cn(segmentClass, unreadOnly ? 'bg-accent text-accent-text' : 'text-muted hover:text-text')}
      >
        {unreadOnlyText}
      </button>
    </div>
  )
}
