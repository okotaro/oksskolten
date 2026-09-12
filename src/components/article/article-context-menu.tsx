import { type ReactNode } from 'react'
import { ArrowUpToLine, ArrowDownToLine } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../ui/context-menu'

interface ArticleContextMenuProps {
  children: ReactNode
  onMarkReadAbove: () => void
  onMarkReadBelow: () => void
  /** Disable the "above" item to block a duplicate run while one is in flight. */
  aboveDisabled?: boolean
  /** Disable the "below" item. */
  belowDisabled?: boolean
}

/**
 * Wraps an article card with a right-click menu offering bulk mark-as-read
 * in both directions. Presentation only: it neither resolves the target
 * articles nor performs the update.
 */
export function ArticleContextMenu({
  children,
  onMarkReadAbove,
  onMarkReadBelow,
  aboveDisabled = false,
  belowDisabled = false,
}: ArticleContextMenuProps) {
  const { t } = useI18n()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={aboveDisabled} onSelect={onMarkReadAbove}>
          <ArrowUpToLine size={16} strokeWidth={1.5} />
          {t('articles.markReadAbove')}
        </ContextMenuItem>
        <ContextMenuItem disabled={belowDisabled} onSelect={onMarkReadBelow}>
          <ArrowDownToLine size={16} strokeWidth={1.5} />
          {t('articles.markReadBelow')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
