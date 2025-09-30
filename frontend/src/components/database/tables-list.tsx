'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Table, Search, Loader2, ChevronRight, ChevronDown, GitBranch, Link, Database, FileText, BarChart3, RefreshCw } from 'lucide-react'
import { useDatabaseStore } from '@/stores/database'
import { apiClient } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { DatabaseTable, Collection, CollectionStats } from '@/lib/types'

interface TableGroup {
  parent?: DatabaseTable;
  children: DatabaseTable[];
  collections: Collection[];
  isExpanded: boolean;
}

export function TablesList() {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [collectionNames, setCollectionNames] = useState<Record<string, Record<string, string>>>({})
  const [collectionStats, setCollectionStats] = useState<Record<string, Record<string, CollectionStats>>>({})
  const [sortBy, setSortBy] = useState<string>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const queryClient = useQueryClient()
  const { 
    tables, 
    selectedTable,
    selectedCollectionId,
    isLoadingTables, 
    setSelectedTable,
    setSelectedCollection,
    setTables,
    setLoadingTables
  } = useDatabaseStore()
  
  // Listen for refresh events from command palette
  useEffect(() => {
    const handleRefresh = async () => {
      await handleRefreshTables()
    }
    window.addEventListener('refresh-tables', handleRefresh as EventListener)
    return () => window.removeEventListener('refresh-tables', handleRefresh as EventListener)
  }, [])

  // Fetch collection names for tables that have name columns
  useEffect(() => {
    const fetchCollectionNames = async () => {
      const namePromises: Promise<void>[] = []
      
      tables.forEach(table => {
        table.relationships?.forEach(rel => {
          if (rel.name_column && rel.column) {
            const tableKey = `${table.schema}.${table.name}`
            
            const promise = apiClient.getCollectionNames(
              table.schema, 
              table.name, 
              rel.column, 
              rel.name_column
            ).then(response => {
              setCollectionNames(prev => ({
                ...prev,
                [tableKey]: {
                  ...prev[tableKey],
                  ...response.names
                }
              }))
            }).catch(error => {
              console.warn(`Failed to fetch collection names for ${tableKey}:`, error)
            })
            
            namePromises.push(promise)
          }
        })
      })

      await Promise.allSettled(namePromises)
    }

    if (tables.length > 0) {
      fetchCollectionNames()
    }
  }, [tables])

  // Fetch collection statistics for tables with collections
  useEffect(() => {
    const fetchCollectionStats = async () => {
      const statsPromises: Promise<void>[] = []
      
      tables.forEach(table => {
        if (table.collections && table.collections.length > 0) {
          const tableKey = `${table.schema}.${table.name}`
          const collectionIds = table.collections.map(c => c.id)
          
          const promise = apiClient.getCollectionStats(
            table.schema,
            table.name,
            collectionIds
          ).then(response => {
            setCollectionStats(prev => ({
              ...prev,
              [tableKey]: response.stats
            }))
          }).catch(error => {
            console.warn(`Failed to fetch collection stats for ${tableKey}:`, error)
          })
          
          statsPromises.push(promise)
        }
      })

      await Promise.allSettled(statsPromises)
    }

    if (tables.length > 0) {
      fetchCollectionStats()
    }
  }, [tables])

  const getCollectionDisplayName = (table: DatabaseTable, collectionId?: string) => {
    const tableKey = `${table.schema}.${table.name}`
    const names = collectionNames[tableKey]
    
    if (!names || !collectionId) return table.name
    
    const displayName = names[collectionId]
    return displayName ? `${table.name} (${displayName})` : table.name
  }

  // Group tables by relationships and extract collections
  const groupTables = (tables: DatabaseTable[]): TableGroup[] => {
    const groups: TableGroup[] = []
    const processedTables = new Set<string>()

    // Find parent-child relationships
    tables.forEach(table => {
      const tableKey = `${table.schema}.${table.name}`
      
      if (processedTables.has(tableKey)) return

      // Check if this table has relationships
      const children = tables.filter(otherTable => {
        if (otherTable === table) return false
        
        return otherTable.relationships?.some(rel => 
          rel.type === 'foreign_key' && 
          rel.references?.schema === table.schema &&
          rel.references?.table === table.name
        )
      })

      if (children.length > 0) {
        // This is a parent table
        groups.push({
          parent: table,
          children,
          collections: table.collections || [],
          isExpanded: expandedGroups.has(tableKey)
        })
        
        processedTables.add(tableKey)
        children.forEach(child => {
          processedTables.add(`${child.schema}.${child.name}`)
        })
      }
    })

    // Add remaining tables as standalone
    tables.forEach(table => {
      const tableKey = `${table.schema}.${table.name}`
      if (!processedTables.has(tableKey)) {
        groups.push({
          children: [table],
          collections: table.collections || [],
          isExpanded: true
        })
      }
    })

    return groups
  }

  // Filter groups based on search term
  const filteredGroups = groupTables(tables).filter(group => {
    // If no search term, show all groups
    if (!searchTerm.trim()) {
      return true
    }

    const searchInTable = (table: DatabaseTable) => {
      // Check table name, schema, and vector columns
      const tableMatches = table.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        table.schema.toLowerCase().includes(searchTerm.toLowerCase()) ||
        table.vector_columns.some(col => 
          col.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      
      // Check if any collections match
      const collectionMatches = table.collections && table.collections.some(collection => 
        collection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        collection.id.toLowerCase().includes(searchTerm.toLowerCase())
      )

      return tableMatches || collectionMatches
    }

    return (group.parent && searchInTable(group.parent)) ||
           group.children.some(searchInTable) ||
           // Search directly in group collections
           group.collections.some(collection => 
             collection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             collection.id.toLowerCase().includes(searchTerm.toLowerCase())
           )
  })

  const handleTableSelect = (table: DatabaseTable, collectionId?: string) => {
    setSelectedTable(table)
    setSelectedCollection(collectionId || null)
  }

  const toggleGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey)
    } else {
      newExpanded.add(groupKey)
    }
    setExpandedGroups(newExpanded)
  }
  
  const handleRefreshTables = async () => {
    setIsRefreshing(true)
    setLoadingTables(true)
    try {
      const tablesResp = await apiClient.getTables()
      setTables(tablesResp.tables)
      // Clear all cached queries to force refetch
      queryClient.invalidateQueries()
    } catch (error) {
      console.error('Failed to refresh tables:', error)
    } finally {
      setIsRefreshing(false)
      setLoadingTables(false)
    }
  }

  const renderCollection = (collection: Collection, table: DatabaseTable) => {
    const isSelected = selectedTable?.schema === table.schema && 
                      selectedTable?.name === table.name &&
                      selectedCollectionId === collection.id
    const collectionKey = `${table.schema}.${table.name}.${collection.id}`
    const tableKey = `${table.schema}.${table.name}`
    const stats = collectionStats[tableKey]?.[collection.id]
    
    return (
      <Button
        key={collectionKey}
        variant="ghost"
        className={`
          w-full justify-start py-1.5 px-2 h-auto mb-0.5 text-left ml-4 border-l-2 border-l-blue-300 dark:border-l-blue-700 rounded-md transition-all duration-200
          ${isSelected
            ? 'bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 shadow-sm'
            : 'hover:bg-slate-50 dark:hover:bg-neutral-800 hover:shadow-sm'
          }
        `}
        onClick={() => {
          setSelectedTable(table)
          setSelectedCollection(collection.id)
        }}
      >
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center">
            <FileText className="h-3 w-3 text-blue-500 flex-shrink-0 mr-1" />
            <span className="font-medium text-[11px] truncate">
              {collection.name}
            </span>
          </div>
          
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            <Badge variant="outline" className="text-[9px] h-3.5 px-1 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 leading-none">
              {collection.document_count.toLocaleString()} docs
            </Badge>
            <Badge variant="secondary" className="text-[9px] h-3.5 px-1 leading-none">
              {collection.type === 'langchain_collection' ? 'LC' : 'Custom'}
            </Badge>
          </div>
          
          {stats && (
            <div className="mt-0.5 p-1 bg-gradient-to-br from-slate-50 to-blue-50 dark:from-neutral-800 dark:to-blue-950 rounded border border-slate-200 dark:border-neutral-700">
              {/* Main stats - compact 2 column grid */}
              <div className="grid grid-cols-2 gap-0.5 mb-0.5">
                <div className="bg-white dark:bg-neutral-900 rounded px-1 py-0.5 border border-slate-100 dark:border-neutral-700">
                  <div className="text-[8px] text-slate-500 dark:text-neutral-400 uppercase">Avg</div>
                  <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 leading-tight">{Math.round(stats.avg_word_count)}w</div>
                </div>
                <div className="bg-white dark:bg-neutral-900 rounded px-1 py-0.5 border border-slate-100 dark:border-neutral-700">
                  <div className="text-[8px] text-slate-500 dark:text-neutral-400 uppercase">Tokens</div>
                  <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400 leading-tight">~{Math.round(stats.avg_token_count)}</div>
                </div>
              </div>
              
              {/* Min/Max range - ultra compact */}
              <div className="bg-white dark:bg-neutral-900 rounded px-1 py-0.5 border border-slate-100 dark:border-neutral-700">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-orange-600 font-medium">{stats.min_word_count}</span>
                  <div className="flex-1 mx-1 h-0.5 bg-gradient-to-r from-orange-200 to-emerald-200 rounded"></div>
                  <span className="text-emerald-600 font-medium">{stats.max_word_count}</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="text-[9px] text-neutral-400 font-mono truncate mt-0.5">
            {collection.id.substring(0, 8)}...
          </div>
        </div>
      </Button>
    )
  }

  const renderTable = (table: DatabaseTable, isChild = false, parentCollectionId?: string) => {
    const isSelected = selectedTable?.schema === table.schema && selectedTable?.name === table.name
    const displayName = getCollectionDisplayName(table, parentCollectionId)
    const hasCollections = table.collections && table.collections.length > 0
    
    // Filter collections based on search term
    let filteredCollections = searchTerm.trim() 
      ? table.collections?.filter(collection =>
          collection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          collection.id.toLowerCase().includes(searchTerm.toLowerCase())
        ) || []
      : table.collections || []

    // Sort collections based on selected criteria
    if (filteredCollections.length > 0) {
      filteredCollections = [...filteredCollections].sort((a, b) => {
        let valueA: any, valueB: any

        switch (sortBy) {
          case 'name':
            valueA = a.name.toLowerCase()
            valueB = b.name.toLowerCase()
            break
          case 'document_count':
            valueA = a.document_count
            valueB = b.document_count
            break
          default:
            valueA = a.name.toLowerCase()
            valueB = b.name.toLowerCase()
            break
        }

        // Handle comparison
        let comparison = 0
        if (valueA < valueB) {
          comparison = -1
        } else if (valueA > valueB) {
          comparison = 1
        }

        return sortOrder === 'desc' ? -comparison : comparison
      })
    }
    
    const hasFilteredCollections = filteredCollections.length > 0
    const totalDocs = hasFilteredCollections ? filteredCollections.reduce((sum, c) => sum + c.document_count, 0) : 0
    const tableKey = `${table.schema}.${table.name}`
    const hasStats = collectionStats[tableKey] && Object.keys(collectionStats[tableKey]).length > 0
    
    // Calculate average statistics across filtered collections
    let avgWordCount = 0
    let avgCharCount = 0
    if (hasStats && hasFilteredCollections) {
      const filteredStats = filteredCollections
        .map(collection => collectionStats[tableKey]?.[collection.id])
        .filter(stat => stat)
      
      if (filteredStats.length > 0) {
        avgWordCount = Math.round(filteredStats.reduce((sum, s) => sum + s.avg_word_count, 0) / filteredStats.length)
        avgCharCount = Math.round(filteredStats.reduce((sum, s) => sum + s.avg_characters, 0) / filteredStats.length)
      }
    }
    
    return (
      <div key={`${table.schema}.${table.name}`}>
        <Button
          variant="ghost"
          className={`
            w-full justify-start py-2 px-3 h-auto mb-1 text-left rounded-lg transition-all duration-200
            ${isChild ? 'ml-4 border-l-2 border-slate-200 dark:border-neutral-700' : ''}
            ${isSelected
              ? 'bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 shadow-sm'
              : 'hover:bg-slate-50 dark:hover:bg-neutral-800 hover:shadow-sm'
            }
          `}
          onClick={() => handleTableSelect(table)}
        >
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-1">
              {isChild && <GitBranch className="h-2.5 w-2.5 text-neutral-400 flex-shrink-0" />}
              {hasCollections && <Database className="h-2.5 w-2.5 text-blue-600 flex-shrink-0" />}
              <span className="font-medium text-xs truncate">
                {displayName}
              </span>
              {table.relationships && table.relationships.length > 0 && (
                <Link className="h-2.5 w-2.5 text-blue-500 flex-shrink-0" />
              )}
              <ChevronRight className="h-2.5 w-2.5 text-neutral-400 flex-shrink-0 ml-auto" />
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-mono">
                {table.schema}
              </span>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px] h-3.5 px-1">
                  {table.vector_columns.length} vec
                </Badge>
                {hasFilteredCollections && (
                  <Badge variant="secondary" className="text-[10px] h-3.5 px-1 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    {filteredCollections.length} col
                  </Badge>
                )}
              </div>
            </div>
            
            {hasFilteredCollections && (
              <div className="flex flex-col gap-y-0.5 text-[10px]">
                <div className="flex justify-between items-center">
                  <div className="text-neutral-600 whitespace-nowrap">
                    {totalDocs.toLocaleString()} docs
                  </div>
                  {hasStats && avgWordCount > 0 && (
                    <div className="text-neutral-500 whitespace-nowrap">
                      ~{avgWordCount} avg words
                    </div>
                  )}
                </div>
                {hasStats && (
                  <div className="overflow-hidden">
                    <div className="flex flex-wrap gap-0.5">
                      {filteredCollections.map(collection => {
                        const stat = collectionStats[tableKey]?.[collection.id]
                        return stat?.document_column && (
                          <span key={stat.id} className="font-mono bg-neutral-100 px-0.5 rounded text-[9px] text-neutral-600 inline-block max-w-full overflow-hidden text-ellipsis">
                            {stat.document_column}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="overflow-hidden mt-0.5">
              <div className="flex flex-wrap gap-0.5">
                {table.vector_columns.map((col) => (
                  <Badge key={col.name} variant="secondary" className="text-[9px] h-3.5 px-1 max-w-full overflow-hidden text-ellipsis">
                    {col.name}
                  </Badge>
                ))}
                {table.relationships && table.relationships.length > 0 && (
                  <Badge variant="outline" className="text-[9px] h-3.5 px-1 text-blue-600 whitespace-nowrap">
                    {table.relationships.length} refs
                    {table.relationships.some(rel => rel.name_column) && ' +'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Button>
        
        {/* Render filtered collections if they exist */}
        {hasFilteredCollections && filteredCollections.map((collection) => 
          renderCollection(collection, table)
        )}
      </div>
    )
  }

  if (isLoadingTables) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-slate-200 dark:border-neutral-800 bg-gradient-to-r from-white to-slate-50 dark:from-neutral-900 dark:to-neutral-950">
          <div className="flex items-center space-x-2 mb-3">
            <Skeleton className="w-2 h-6 rounded-full" />
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-8 rounded" />
          </div>
          <Skeleton className="h-8 w-full rounded" />
        </div>
        <div className="flex-1 p-4 space-y-3 bg-white dark:bg-neutral-900">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-8 w-2/3 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const totalTables = filteredGroups.reduce((acc, group) => {
    const tablesCount = group.children.length + (group.parent ? 1 : 0)
    const collectionsCount = group.collections.length
    return acc + tablesCount + collectionsCount
  }, 0)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-slate-200 dark:border-neutral-800 bg-gradient-to-r from-white to-slate-50 dark:from-neutral-900 dark:to-neutral-950 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-1.5">
            <div className="w-1.5 h-5 bg-gradient-to-b from-blue-500 to-purple-600 rounded-full"></div>
            <div className="flex items-center space-x-1.5">
              <Table className="h-3.5 w-3.5 text-slate-600 dark:text-neutral-400" />
              <h2 className="font-semibold text-xs text-slate-800 dark:text-neutral-200">Collections</h2>
              <Badge variant="secondary" className="text-[10px] px-1.5 h-4 bg-blue-50 text-blue-700 border-blue-200">
                {totalTables}
              </Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshTables}
            disabled={isRefreshing || isLoadingTables}
            className="h-6 w-6 p-0"
            title="Refresh tables"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        <div className="space-y-1.5">
          <div className="relative group">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-neutral-500 group-focus-within:text-blue-500 transition-colors" />
            <Input
              placeholder="Search tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 py-1 h-7 text-xs border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all"
            />
          </div>
          
          {/* Sorting Controls */}
          <div className="flex items-center space-x-1.5">
            <div className="flex items-center space-x-0.5 flex-1">
              <Label className="text-[10px] text-slate-600 whitespace-nowrap">Sort:</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-6 text-[10px] border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="document_count">Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}>
              <SelectTrigger className="h-6 text-[10px] border-slate-200 w-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">↑</SelectItem>
                <SelectItem value="desc">↓</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tables List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-neutral-950 custom-scrollbar">
        {filteredGroups.length === 0 ? (
          <div className="p-6 text-center">
            {searchTerm ? (
              <div className="space-y-2">
                <div className="w-12 h-12 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto">
                  <Search className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 dark:text-neutral-300 font-medium">No tables found</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Try adjusting your search term
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 bg-slate-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto">
                  <Table className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 dark:text-neutral-300 font-medium">No vector tables found</p>
                <p className="text-xs text-slate-500 dark:text-neutral-400">
                  Make sure your database has tables with vector columns
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredGroups.map((group, groupIndex) => (
              <div key={groupIndex} className="mb-0.5">
                {group.parent && (
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-0.5 h-4 w-4 mr-1 flex-shrink-0"
                      onClick={() => toggleGroup(`${group.parent!.schema}.${group.parent!.name}`)}
                    >
                      {group.isExpanded ? 
                        <ChevronDown className="h-2.5 w-2.5" /> : 
                        <ChevronRight className="h-2.5 w-2.5" />
                      }
                    </Button>
                    <div className="flex-1">
                      {renderTable(group.parent)}
                    </div>
                  </div>
                )}
                
                {(group.isExpanded || !group.parent) && group.children.map((table) => 
                  renderTable(table, !!group.parent)
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
