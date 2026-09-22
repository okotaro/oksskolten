import { useI18n } from '../../lib/i18n'
import { UnreadOnlyToggleSwitch } from '../ui/unread-only-toggle-switch'

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

  return (
    <UnreadOnlyToggleSwitch
      unreadOnly={unreadOnly}
      onChange={() => onToggle()}
      showAllLabel={t('category.unreadOnlyToggle.showAll')}
      unreadOnlyLabel={t('category.unreadOnlyToggle.showUnreadOnly')}
    />
  )
}
