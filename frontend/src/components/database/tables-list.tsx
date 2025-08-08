'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Table, Search, Loader2, ChevronRight, ChevronDown, GitBranch, Link, Database, FileText } from 'lucide-react'
import { useDatabaseStore } from '@/stores/database'
import { apiClient } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { DatabaseTable, Collection } from '@/lib/types'

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
      )

    return (group.parent && searchInTable(group.parent)) ||
           group.children.some(searchInTable)
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
    
    return (
      <Button
        key={collectionKey}
        variant="ghost"
        className={`
          w-full justify-start p-3 h-auto mb-1 text-left ml-8 border-l-2 border-l-blue-200
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <FileText className="h-3 w-3 text-blue-500 flex-shrink-0" />
            <span className="font-medium text-sm truncate">
              {collection.name}
            </span>
            <Badge variant="outline" className="text-xs h-4 bg-blue-50">
              {collection.document_count} docs
            </Badge>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-neutral-500 font-mono">
              ID: {collection.id}
            </span>
            <Badge variant="secondary" className="text-xs h-4">
              {collection.type}
            </Badge>
          </div>
        </div>
      </Button>
    )
  }

  const renderTable = (table: DatabaseTable, isChild = false, parentCollectionId?: string) => {
    const isSelected = selectedTable?.schema === table.schema && selectedTable?.name === table.name
    const displayName = getCollectionDisplayName(table, parentCollectionId)
    const hasCollections = table.collections && table.collections.length > 0
    
    return (
      <div key={`${table.schema}.${table.name}`}>
        <Button
          variant="ghost"
          className={`
            w-full justify-start p-3 h-auto mb-1 text-left
            ${isChild ? 'ml-6 border-l-2 border-neutral-200' : ''}
            ${isSelected
              ? 'bg-blue-50 border-blue-200 text-blue-900'
              : 'hover:bg-neutral-50'
            }
          `}
          onClick={() => handleTableSelect(table)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              {isChild && <GitBranch className="h-3 w-3 text-neutral-400 flex-shrink-0" />}
              {hasCollections && <Database className="h-3 w-3 text-blue-600 flex-shrink-0" />}
              <span className="font-medium text-sm truncate">
                {displayName}
              </span>
              {table.relationships && table.relationships.length > 0 && (
                <Link className="h-3 w-3 text-blue-500 flex-shrink-0" />
              )}
              <ChevronRight className="h-3 w-3 text-neutral-400 flex-shrink-0" />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-neutral-500 font-mono">
                {table.schema}
              </span>
              <div className="flex items-center space-x-1">
                <Badge variant="outline" className="text-xs h-5">
                  {table.vector_columns.length} vectors
                </Badge>
                {hasCollections && (
                  <Badge variant="secondary" className="text-xs h-5 bg-blue-100 text-blue-700">
                    {table.collections!.length} collections
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {table.vector_columns.map((col) => (
                <Badge key={col.name} variant="secondary" className="text-xs h-5">
                  {col.name}
                </Badge>
              ))}
              {table.relationships && table.relationships.length > 0 && (
                <Badge variant="outline" className="text-xs h-5 text-blue-600">
                  {table.relationships.length} refs
                  {table.relationships.some(rel => rel.name_column) && ' + names'}
                </Badge>
              )}
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
      <div className="p-4 border-b border-neutral-200">
        <div className="flex items-center space-x-2 mb-3">
          <Table className="h-5 w-5 text-neutral-600" />
          <h2 className="font-medium text-neutral-900">Collections</h2>
          <Badge variant="secondary" className="text-xs">
            {totalTables}
          </Badge>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search tables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </div>

      {/* Tables List */}
      <div className="flex-1 overflow-auto">
        {filteredGroups.length === 0 ? (
          <div className="p-4 text-center">
            {searchTerm ? (
              <div>
                <p className="text-sm text-neutral-500">No tables found</p>
                <p className="text-xs text-neutral-400 mt-1">
                  Try adjusting your search term
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-neutral-500">No vector tables found</p>
                <p className="text-xs text-neutral-400 mt-1">
                  Make sure your database has tables with vector columns
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2">
            {filteredGroups.map((group, groupIndex) => (
              <div key={groupIndex} className="mb-2">
                {group.parent && (
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-6 w-6 mr-2"
                      onClick={() => toggleGroup(`${group.parent!.schema}.${group.parent!.name}`)}
                    >
                      {group.isExpanded ? 
                        <ChevronDown className="h-3 w-3" /> : 
                        <ChevronRight className="h-3 w-3" />
                      }
                    </Button>
                    {renderTable(group.parent)}
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
