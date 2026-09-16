import { useI18n } from '../../lib/i18n'

interface FeedUnreadOnlyToggleProps {
  unreadOnly: boolean
  onToggle: () => void
}

/**
 * Presentation-only control that shows the current unread-only display state
 * for a single feed's article list and notifies the caller on click.
 *
 * This component holds no state and performs no persistence: the caller owns
 * both the current `unreadOnly` value and what happens when it is toggled.
 */
export function FeedUnreadOnlyToggle({ unreadOnly, onToggle }: FeedUnreadOnlyToggleProps) {
  const { t } = useI18n()

  const label = unreadOnly ? t('feed.unreadOnlyToggle.showAll') : t('feed.unreadOnlyToggle.showUnreadOnly')

  return (
    <button onClick={() => onToggle()} className="text-accent text-sm hover:underline">
      {label}
    </button>
  )
}
