import { cn } from '@/lib/utils'

interface KbdProps {
  children: React.ReactNode
  className?: string
}

/**
 * A keyboard key badge component for showing keyboard shortcuts
 */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded border border-neutral-300 bg-gradient-to-b from-white to-neutral-100 px-2 py-0.5 text-xs font-mono font-medium text-neutral-700 shadow-sm',
        className
      )}
    >
      {children}
    </kbd>
  )
}
