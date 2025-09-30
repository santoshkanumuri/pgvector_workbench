'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import { Kbd } from './kbd'
import { 
  Command, 
  Search, 
  PanelLeft, 
  Database, 
  BarChart3,
  Zap
} from 'lucide-react'

interface KeyboardShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const shortcuts = [
  {
    category: 'General',
    items: [
      { keys: ['Ctrl', 'K'], description: 'Open command palette', icon: Command },
      { keys: ['Ctrl', 'B'], description: 'Toggle sidebar', icon: PanelLeft },
      { keys: ['Esc'], description: 'Close dialogs', icon: null },
      { keys: ['?'], description: 'Show keyboard shortcuts', icon: null },
    ]
  },
  {
    category: 'Navigation',
    items: [
      { keys: ['Ctrl', '1'], description: 'Switch to Data tab', icon: Database },
      { keys: ['Ctrl', '2'], description: 'Switch to Search tab', icon: Search },
      { keys: ['Ctrl', '3'], description: 'Switch to Metadata tab', icon: BarChart3 },
    ]
  }
]

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="text-sm font-semibold text-neutral-700 mb-3 uppercase tracking-wide">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.items.map((shortcut, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {shortcut.icon && (
                        <div className="flex-shrink-0 text-neutral-500">
                          <shortcut.icon className="h-4 w-4" />
                        </div>
                      )}
                      <span className="text-sm text-neutral-700">
                        {shortcut.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex} className="flex items-center gap-1">
                          <Kbd>{key}</Kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-neutral-400">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <p className="text-xs text-neutral-500 text-center">
            Press <Kbd>?</Kbd> anytime to see this help dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
