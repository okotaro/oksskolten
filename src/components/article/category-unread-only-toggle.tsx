import { useI18n } from '../../lib/i18n'

interface CategoryUnreadOnlyToggleProps {
  unreadOnly: boolean
  onToggle: () => void
}

/**
 * Presentation-only control that shows the current unread-only display state
 * for a category (folder) article list and notifies the caller on click.
 *
 * This component holds no state and performs no persistence: the caller owns
 * both the current `unreadOnly` value and what happens when it is toggled.
 */
export function CategoryUnreadOnlyToggle({ unreadOnly, onToggle }: CategoryUnreadOnlyToggleProps) {
  const { t } = useI18n()

  const label = unreadOnly ? t('category.unreadOnlyToggle.showAll') : t('category.unreadOnlyToggle.showUnreadOnly')

  return (
    <button onClick={() => onToggle()} className="text-accent text-sm hover:underline">
      {label}
    </button>
  )
}
