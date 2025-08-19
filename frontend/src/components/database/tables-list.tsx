'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Table, Search, Loader2, ChevronRight, ChevronDown, GitBranch, Link, Database, FileText, BarChart3 } from 'lucide-react'
import { useDatabaseStore } from '@/stores/database'
import { apiClient } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
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
  const { 
    tables, 
    selectedTable,
    selectedCollectionId,
    isLoadingTables, 
    setSelectedTable,
    setSelectedCollection
  } = useDatabaseStore()

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
    const searchInTable = (table: DatabaseTable) =>
      table.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      table.schema.toLowerCase().includes(searchTerm.toLowerCase()) ||
      table.vector_columns.some(col => 
        col.name.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      // Search in collections
      (table.collections && table.collections.some(collection => 
        collection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        collection.id.toLowerCase().includes(searchTerm.toLowerCase())
      ))

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
          w-full justify-start py-1 px-1.5 h-auto mb-0.5 text-left ml-4 border-l border-l-blue-200
          ${isSelected
            ? 'bg-blue-50 border-blue-200 text-blue-900'
            : 'hover:bg-neutral-50'
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
            <span className="font-medium text-xs truncate">
              {collection.name}
            </span>
          </div>
          
          <div className="flex flex-wrap gap-1 mt-0.5">
            <Badge variant="outline" className="text-[10px] h-3.5 px-1 bg-blue-50">
              {collection.document_count.toLocaleString()} docs
            </Badge>
            <Badge variant="secondary" className="text-[10px] h-3.5 px-1">
              {collection.type === 'langchain_collection' ? 'LC' : 'Custom'}
            </Badge>
          </div>
          
          {stats && (
            <div className="flex flex-col gap-y-0.5 text-[10px] mt-0.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center text-neutral-600">
                  <BarChart3 className="h-2.5 w-2.5 mr-0.5" />
                  <span className="whitespace-nowrap">Avg: {Math.round(stats.avg_word_count)}</span>
                </div>
                <div className="text-neutral-600 whitespace-nowrap">
                  ~{Math.round(stats.avg_characters)} chars
                </div>
              </div>
              <div className="flex justify-between items-center">
                <div className="text-neutral-600 whitespace-nowrap">
                  Min: {stats.min_word_count}
                </div>
                <div className="text-neutral-600 whitespace-nowrap">
                  Max: {stats.max_word_count}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <div className="text-neutral-600 whitespace-nowrap text-blue-600">
                  ~{Math.round(stats.avg_token_count)} tokens
                </div>
                <div className="text-neutral-500 whitespace-nowrap text-xs">
                  per document
                </div>
              </div>
              
              {stats.document_column && (
                <div className="mt-0.5 overflow-hidden">
                  <span className="font-mono bg-neutral-100 px-1 rounded text-[10px] text-neutral-600 inline-block max-w-full overflow-hidden text-ellipsis">
                    {stats.document_column}
                  </span>
                </div>
              )}
              
              {(stats.latest_document_date || stats.oldest_document_date) && (
                <div className="text-[10px] text-neutral-500 overflow-hidden text-ellipsis whitespace-nowrap">
                  {stats.oldest_document_date && stats.latest_document_date && 
                    new Date(stats.oldest_document_date).toLocaleDateString() !== new Date(stats.latest_document_date).toLocaleDateString()
                    ? `${new Date(stats.oldest_document_date).toLocaleDateString()} - ${new Date(stats.latest_document_date).toLocaleDateString()}`
                    : new Date(stats.latest_document_date || stats.oldest_document_date!).toLocaleDateString()
                  }
                </div>
              )}
            </div>
          )}
          
          <div className="text-[10px] text-neutral-400 font-mono truncate mt-0.5">
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
    const totalDocs = hasCollections ? table.collections!.reduce((sum, c) => sum + c.document_count, 0) : 0
    const tableKey = `${table.schema}.${table.name}`
    const hasStats = collectionStats[tableKey] && Object.keys(collectionStats[tableKey]).length > 0
    
    // Calculate average statistics across all collections
    let avgWordCount = 0
    let avgCharCount = 0
    if (hasStats && hasCollections) {
      const stats = Object.values(collectionStats[tableKey])
      if (stats.length > 0) {
        avgWordCount = Math.round(stats.reduce((sum, s) => sum + s.avg_word_count, 0) / stats.length)
        avgCharCount = Math.round(stats.reduce((sum, s) => sum + s.avg_characters, 0) / stats.length)
      }
    }
    
    return (
      <div key={`${table.schema}.${table.name}`}>
        <Button
          variant="ghost"
          className={`
            w-full justify-start py-1 px-1.5 h-auto mb-0.5 text-left
            ${isChild ? 'ml-3 border-l border-neutral-200' : ''}
            ${isSelected
              ? 'bg-blue-50 border-blue-200 text-blue-900'
              : 'hover:bg-neutral-50'
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
                {hasCollections && (
                  <Badge variant="secondary" className="text-[10px] h-3.5 px-1 bg-blue-100 text-blue-700">
                    {table.collections!.length} col
                  </Badge>
                )}
              </div>
            </div>
            
            {hasCollections && (
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
                      {Object.values(collectionStats[tableKey]).map(stat => 
                        stat.document_column && (
                          <span key={stat.id} className="font-mono bg-neutral-100 px-0.5 rounded text-[9px] text-neutral-600 inline-block max-w-full overflow-hidden text-ellipsis">
                            {stat.document_column}
                          </span>
                        )
                      )}
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
        
        {/* Render collections if they exist */}
        {hasCollections && table.collections!.map((collection) => 
          renderCollection(collection, table)
        )}
      </div>
    )
  }

  if (isLoadingTables) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-neutral-200">
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-4 w-2/3" />
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
      <div className="p-2 border-b border-neutral-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-1.5">
            <Table className="h-3.5 w-3.5 text-neutral-600" />
            <h2 className="font-medium text-sm text-neutral-900">Collections</h2>
            <Badge variant="secondary" className="text-xs px-1.5 h-4">
              {totalTables}
            </Badge>
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
          <Input
            placeholder="Search tables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 py-1 h-7 text-xs"
          />
        </div>
      </div>

      {/* Tables List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {filteredGroups.length === 0 ? (
          <div className="p-3 text-center">
            {searchTerm ? (
              <div>
                <p className="text-xs text-neutral-500">No tables found</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  Try adjusting your search term
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-neutral-500">No vector tables found</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  Make sure your database has tables with vector columns
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
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
