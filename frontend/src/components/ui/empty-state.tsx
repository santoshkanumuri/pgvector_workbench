'use client'

import { LucideIcon } from 'lucide-react'
import { Button } from './button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

/**
 * A beautiful empty state component with icon, title, description, and optional action
 */
export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className = ''
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in ${className}`}>
      <div className="mb-4 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 p-6">
        <Icon className="h-12 w-12 text-blue-600" />
      </div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-2">
        {title}
      </h3>
      <p className="text-sm text-neutral-500 max-w-md mb-6">
        {description}
      </p>
      {action && (
        <Button 
          onClick={action.onClick}
          className="transition-all duration-200 hover:shadow-md"
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
