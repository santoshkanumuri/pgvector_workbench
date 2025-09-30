'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { 
  Search, 
  Database, 
  RefreshCw, 
  LogOut, 
  Zap,
  FileText,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react'
import { useDatabaseStore } from '@/stores/database'
import { useAuthStore } from '@/stores/auth'
import { apiClient } from '@/lib/api'

interface Command {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  category: string
  keywords?: string[]
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [globalResults, setGlobalResults] = useState<any[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [searchedTables, setSearchedTables] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [resultLimit, setResultLimit] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [allResults, setAllResults] = useState<any[]>([])
  const { tables, setSelectedTable, selectedTable } = useDatabaseStore()
  const { logout } = useAuthStore()

  // Build commands list
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = []

    // Navigation commands
    if (selectedTable) {
      cmds.push({
        id: 'view-data',
        label: 'View Table Data',
        description: 'Switch to data view',
        icon: <Database className="h-4 w-4" />,
        action: () => {
          // Trigger tab change via custom event
          window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'data' }))
          onOpenChange(false)
        },
        category: 'Navigation',
        keywords: ['table', 'data', 'view']
      })

      cmds.push({
        id: 'view-search',
        label: 'Search & Query',
        description: 'Open search interface',
        icon: <Search className="h-4 w-4" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'search' }))
          onOpenChange(false)
        },
        category: 'Navigation',
        keywords: ['search', 'query', 'vector', 'find']
      })

      cmds.push({
        id: 'view-metadata',
        label: 'View Metadata',
        description: 'Show table metadata',
        icon: <BarChart3 className="h-4 w-4" />,
        action: () => {
          window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'metadata' }))
          onOpenChange(false)
        },
        category: 'Navigation',
        keywords: ['metadata', 'info', 'stats']
      })
    }

    // Table commands
    tables.slice(0, 10).forEach(table => {
      cmds.push({
        id: `table-${table.schema}-${table.name}`,
        label: table.name,
        description: `Open ${table.schema}.${table.name}`,
        icon: <Database className="h-4 w-4" />,
        action: () => {
          setSelectedTable(table)
          onOpenChange(false)
        },
        category: 'Tables',
        keywords: [table.name, table.schema, 'table', 'open']
      })
    })

    // Action commands
    cmds.push({
      id: 'refresh-tables',
      label: 'Refresh Tables',
      description: 'Reload table list',
      icon: <RefreshCw className="h-4 w-4" />,
      action: () => {
        window.dispatchEvent(new CustomEvent('refresh-tables'))
        onOpenChange(false)
      },
      category: 'Actions',
      keywords: ['refresh', 'reload', 'update']
    })

    cmds.push({
      id: 'logout',
      label: 'Logout',
      description: 'Sign out of the application',
      icon: <LogOut className="h-4 w-4" />,
      action: () => {
        logout()
        onOpenChange(false)
      },
      category: 'Actions',
      keywords: ['logout', 'signout', 'exit']
    })

    return cmds
  }, [tables, selectedTable, setSelectedTable, logout, onOpenChange])

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands

    const searchLower = search.toLowerCase()
    return commands.filter(cmd => {
      const labelMatch = cmd.label.toLowerCase().includes(searchLower)
      const descMatch = cmd.description?.toLowerCase().includes(searchLower)
      const keywordMatch = cmd.keywords?.some(k => k.toLowerCase().includes(searchLower))
      return labelMatch || descMatch || keywordMatch
    })
  }, [commands, search])

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {}
    filteredCommands.forEach(cmd => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      groups[cmd.category].push(cmd)
    })
    return groups
  }, [filteredCommands])

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, filteredCommands, selectedIndex])

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch('')
      setSelectedIndex(0)
      setGlobalResults([])
      setAllResults([])
      setTotalResults(0)
      setCurrentPage(1)
    }
  }, [open])

  // Update displayed results when page or limit changes
  useEffect(() => {
    const startIdx = (currentPage - 1) * resultLimit
    const endIdx = startIdx + resultLimit
    setGlobalResults(allResults.slice(startIdx, endIdx))
  }, [currentPage, resultLimit, allResults])

  // Calculate pagination info
  const totalPages = Math.ceil(totalResults / resultLimit)
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1

  // Debounced global search
  useEffect(() => {
    if (!search.trim() || search.length < 3) {
      setGlobalResults([])
      setAllResults([])
      setTotalResults(0)
      setCurrentPage(1)
      return
    }

    const performSearch = async () => {
      setIsSearching(true)
      setCurrentPage(1) // Reset to first page on new search
      try {
        // Fetch up to 200 results from backend
        const results = await apiClient.globalSearch(search, 200)
        setAllResults(results.results)
        setTotalResults(results.total_results)
        setSearchedTables(results.searched_tables)
        
        // Display first page
        const firstPage = results.results.slice(0, resultLimit)
        setGlobalResults(firstPage)
      } catch (error) {
        console.error('Global search error:', error)
        setGlobalResults([])
        setAllResults([])
        setTotalResults(0)
      } finally {
        setIsSearching(false)
      }
    }

    const timeoutId = setTimeout(() => {
      performSearch()
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [search, resultLimit])

  // Highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 font-semibold px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] p-0 gap-0">
        <div className="border-b border-neutral-200 p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search commands, tables, collections, UUIDs, or any text (3+ chars)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
              autoFocus
            />
          </div>
          
          {/* Results limit selector - only show when searching */}
          {(isSearching || totalResults > 0) && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600">Results per page:</span>
                <Select 
                  value={resultLimit.toString()} 
                  onValueChange={(value) => {
                    setResultLimit(parseInt(value))
                    setCurrentPage(1)
                  }}
                >
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {totalResults > 0 && (
                <div className="text-sm text-neutral-600">
                  Searched {searchedTables} tables • Found {totalResults} results
                </div>
              )}
            </div>
          )}
        </div>

        <div className="max-h-[calc(85vh-140px)] overflow-y-auto p-2 custom-scrollbar">
          {isSearching ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-neutral-500">Searching across all tables...</p>
            </div>
          ) : totalResults > 0 ? (
            <div className="space-y-3">
              <div className="px-2 py-2 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-900">
                    Page {currentPage} of {totalPages} • Showing {((currentPage - 1) * resultLimit) + 1}-{Math.min(currentPage * resultLimit, totalResults)} of {totalResults}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs bg-white">
                  Click to view
                </Badge>
              </div>
              
              {globalResults.map((result, index) => (
                <div
                  key={`${result.schema}-${result.table}-${result.row_id}-${index}`}
                  className="group border-2 border-neutral-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all overflow-hidden"
                >
                  <button
                    className="w-full text-left p-4 space-y-3"
                    onClick={() => {
                      const table = tables.find(t => t.schema === result.schema && t.name === result.table)
                      if (table) {
                        setSelectedTable(table)
                        
                        // Switch to search tab
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'search' }))
                          
                          // If there's a collection, trigger a search for it
                          if (result.collection_id) {
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('search-collection', { 
                                detail: { collectionId: result.collection_id } 
                              }))
                            }, 100)
                          }
                        }, 100)
                      }
                      onOpenChange(false)
                    }}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Database className="h-5 w-5 text-blue-600 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-base text-neutral-900 truncate">
                            {result.schema}.{result.table}
                          </div>
                          {result.collection_name && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <FileText className="h-3.5 w-3.5 text-green-600" />
                              <span className="text-sm text-green-700 font-medium">
                                {result.collection_name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <Badge variant="outline" className="text-xs font-mono bg-white">
                          ID: {result.row_id.substring(0, 12)}{result.row_id.length > 12 ? '...' : ''}
                        </Badge>
                        {result.identifiers?.uuid && (
                          <Badge variant="secondary" className="text-xs font-mono">
                            UUID: {String(result.identifiers.uuid).substring(0, 8)}...
                          </Badge>
                        )}
                        {result.identifiers?.custom_id && (
                          <Badge variant="secondary" className="text-xs">
                            {result.identifiers.custom_id}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Matched Columns */}
                    <div className="flex flex-wrap gap-1.5">
                      {result.matched_columns.map((col: string) => (
                        <Badge 
                          key={col} 
                          variant="secondary" 
                          className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-200"
                        >
                          📍 {col}
                        </Badge>
                      ))}
                    </div>

                    {/* Snippets with highlighted text */}
                    <div className="space-y-2">
                      {Object.entries(result.snippets).slice(0, 3).map(([col, snippet]: [string, any]) => (
                        <div 
                          key={col} 
                          className="bg-gradient-to-r from-neutral-50 to-slate-50 border border-neutral-200 rounded-md p-3 group-hover:border-blue-200 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-semibold text-blue-700 font-mono flex-shrink-0 mt-0.5">
                              {col}:
                            </span>
                            <div className="text-sm text-neutral-700 leading-relaxed flex-1 break-words font-mono">
                              {highlightText(String(snippet), search)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Collection ID if available */}
                    {result.collection_id && (
                      <div className="flex items-center gap-2 text-xs text-neutral-600 pt-2 border-t border-neutral-100">
                        <Zap className="h-3.5 w-3.5 text-yellow-600" />
                        <span className="font-mono">Collection ID: {result.collection_id}</span>
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : filteredCommands.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {search.length > 0 && search.length < 3 
                  ? 'Type at least 3 characters to search' 
                  : 'No commands found'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category}>
                  <div className="px-2 py-1 text-xs font-semibold text-neutral-500 uppercase">
                    {category}
                  </div>
                  {cmds.map((cmd, index) => {
                    const globalIndex = filteredCommands.indexOf(cmd)
                    const isSelected = globalIndex === selectedIndex
                    
                    return (
                      <button
                        key={cmd.id}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-50 text-blue-900'
                            : 'hover:bg-neutral-50'
                        }`}
                        onClick={cmd.action}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className="flex-shrink-0 text-neutral-600">
                          {cmd.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {cmd.label}
                          </div>
                          {cmd.description && (
                            <div className="text-xs text-neutral-500 truncate">
                              {cmd.description}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <Badge variant="secondary" className="text-xs">
                            Enter
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-200 px-4 py-2 bg-neutral-50">
          {totalResults > 0 ? (
            <div className="flex items-center justify-between">
              {/* Pagination controls */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(1)}
                  disabled={!hasPrevPage}
                  className="h-7 w-7 p-0"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={!hasPrevPage}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                
                <span className="text-sm text-neutral-600 px-3">
                  Page {currentPage} of {totalPages}
                </span>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={!hasNextPage}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={!hasNextPage}
                  className="h-7 w-7 p-0"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Keyboard hints */}
              <div className="flex items-center gap-4 text-xs text-neutral-500">
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs h-5 px-1.5">↑↓</Badge>
                  <span>Navigate</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs h-5 px-1.5">Enter</Badge>
                  <span>Select</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs h-5 px-1.5">Esc</Badge>
                  <span>Close</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 text-xs text-neutral-500">
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs h-5 px-1.5">↑↓</Badge>
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs h-5 px-1.5">Enter</Badge>
                <span>Select</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs h-5 px-1.5">Esc</Badge>
                <span>Close</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
