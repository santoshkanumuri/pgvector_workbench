'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDatabaseStore } from '@/stores/database'
import { apiClient } from '@/lib/api'
import { TableMetadata } from './table-metadata'
import { TableData } from './table-data'
import { SearchInterface } from './search-interface'
import { VectorVisualization } from './vector-visualization'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Database, Search, BarChart3, TrendingUp } from 'lucide-react'
import { CollectionStats, CollectionInfo, TableSchemaColumn, TableStats, VectorIndexDetail, TableRelations } from '@/lib/types'

export function TableView() {
  const { selectedTable, selectedCollectionId, tables } = useDatabaseStore()
  const selectedCollectionName = useMemo(() => {
    if (!selectedTable || !selectedCollectionId) return null
    const tableEntry = tables.find(t => t.schema === selectedTable.schema && t.name === selectedTable.name)
    return tableEntry?.collections?.find(c => c.id === selectedCollectionId)?.name || null
  }, [tables, selectedTable, selectedCollectionId])
  const [activeTab, setActiveTab] = useState('data')

  // Listen for tab switch events from command palette
  useEffect(() => {
    const handleTabSwitch = (event: CustomEvent<string>) => {
      setActiveTab(event.detail)
    }
    window.addEventListener('switch-tab', handleTabSwitch as EventListener)
    return () => window.removeEventListener('switch-tab', handleTabSwitch as EventListener)
  }, [])

  // Fetch table metadata
  const { data: metadata, isLoading: isLoadingMetadata } = useQuery({
    queryKey: ['table-metadata', selectedTable?.schema, selectedTable?.name],
    queryFn: () => 
      selectedTable 
        ? apiClient.getTableMetadata(selectedTable.schema, selectedTable.name)
        : null,
    enabled: !!selectedTable,
  })

  // Fetch collection stats if a collection is selected
  const { data: collectionStats } = useQuery({
    queryKey: ['collection-stats', selectedTable?.schema, selectedTable?.name, selectedCollectionId],
    queryFn: async () => {
      if (!selectedTable || !selectedCollectionId) return null;
      const response = await apiClient.getCollectionStats(
        selectedTable.schema,
        selectedTable.name,
        [selectedCollectionId]
      );
      return response.stats[selectedCollectionId] || null;
    },
    enabled: !!selectedTable && !!selectedCollectionId,
  })

  // Fetch collection info (dimensions, sample) when a collection is selected
  const { data: collectionInfo } = useQuery({
    queryKey: ['collection-info', selectedTable?.schema, selectedTable?.name, selectedCollectionId],
    queryFn: async () => {
      if (!selectedTable || !selectedCollectionId) return null;
      return apiClient.getCollectionInfo(selectedTable.schema, selectedTable.name, selectedCollectionId);
    },
    enabled: !!selectedTable && !!selectedCollectionId,
  })

  // Fetch extended metadata
  const { data: tableSchema } = useQuery({
    queryKey: ['table-schema', selectedTable?.schema, selectedTable?.name],
    queryFn: async () => {
      if (!selectedTable) return null;
      const res = await apiClient.getTableSchema(selectedTable.schema, selectedTable.name);
      return res.columns;
    },
    enabled: !!selectedTable,
  })

  const { data: tableStats } = useQuery({
    queryKey: ['table-stats', selectedTable?.schema, selectedTable?.name],
    queryFn: async () => {
      if (!selectedTable) return null;
      return apiClient.getTableStats(selectedTable.schema, selectedTable.name);
    },
    enabled: !!selectedTable,
  })

  const { data: vectorIndexes } = useQuery({
    queryKey: ['vector-indexes', selectedTable?.schema, selectedTable?.name],
    queryFn: async () => {
      if (!selectedTable) return null;
      const res = await apiClient.getVectorIndexes(selectedTable.schema, selectedTable.name);
      return res.indexes;
    },
    enabled: !!selectedTable,
  })

  const { data: tableRelations } = useQuery({
    queryKey: ['table-relations', selectedTable?.schema, selectedTable?.name],
    queryFn: async () => {
      if (!selectedTable) return null;
      return apiClient.getTableRelations(selectedTable.schema, selectedTable.name);
    },
    enabled: !!selectedTable,
  })



  if (!selectedTable) {
    return null
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Table Header - Fixed */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-1.5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-green-600">
              <Database className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center flex-wrap gap-1.5">
                <span>{selectedTable.name}</span>
                {selectedCollectionName && (
                  <span className="text-neutral-400 dark:text-neutral-500">›</span>
                )}
                {selectedCollectionName && (
                  <span className="text-blue-700 dark:text-blue-400 font-medium text-xs" title={selectedCollectionName}>
                    {selectedCollectionName.length > 25 ? selectedCollectionName.substring(0, 25) + '...' : selectedCollectionName}
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                {selectedTable.schema}{selectedCollectionName ? ` • ${selectedCollectionId?.substring(0, 8)}...` : ''}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300 flex-wrap">
            {selectedCollectionId && collectionStats && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-300 whitespace-nowrap leading-tight">
                  {Math.round(collectionStats.avg_word_count)}w
                </span>
                <span className="text-[10px] bg-neutral-50 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-600 dark:text-neutral-300 whitespace-nowrap leading-tight">
                  {collectionStats.min_word_count}-{collectionStats.max_word_count}
                </span>
                <span className="text-[10px] bg-green-50 dark:bg-green-950 px-1.5 py-0.5 rounded text-green-700 dark:text-green-300 whitespace-nowrap leading-tight">
                  ~{Math.round(collectionStats.avg_token_count)}t
                </span>
              </div>
            )}
            {metadata && (
              <div className="text-right flex items-center gap-1.5">
                <span className="text-[10px] font-medium bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 px-1.5 py-0.5 rounded">
                  {metadata.row_count.toLocaleString()} rows
                </span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                  {metadata.size_pretty}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Tabs - Flexible */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 flex-shrink-0">
          <TabsList className="w-full h-7 flex gap-1">
            <TabsTrigger value="data" className="flex items-center space-x-1.5 text-xs px-3 py-1">
              <Database className="h-3.5 w-3.5" />
              <span>Data</span>
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center space-x-1.5 text-xs px-3 py-1">
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
            </TabsTrigger>
            <TabsTrigger value="metadata" className="flex items-center space-x-1.5 text-xs px-3 py-1">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Metadata</span>
            </TabsTrigger>
            <TabsTrigger value="visualization" className="flex items-center space-x-1.5 text-xs px-3 py-1 data-[state=active]:bg-purple-50 dark:data-[state=active]:bg-purple-950 data-[state=active]:text-purple-700 dark:data-[state=active]:text-purple-300">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Visualization</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="data" className="h-full m-0 p-0 overflow-hidden">
            <TableData 
              schema={selectedTable.schema} 
              table={selectedTable.name}
              metadata={metadata}
            />
          </TabsContent>
          
          <TabsContent value="search" className="h-full m-0 p-0 overflow-hidden">
            <SearchInterface 
              schema={selectedTable.schema} 
              table={selectedTable.name}
              metadata={metadata}
            />
          </TabsContent>
          
          <TabsContent value="metadata" className="h-full m-0 p-0 overflow-hidden">
            <TableMetadata 
              metadata={metadata}
              isLoading={isLoadingMetadata}
              collectionStats={selectedCollectionId ? collectionStats : undefined}
              selectedCollectionId={selectedCollectionId}
              collectionInfo={selectedCollectionId ? collectionInfo as CollectionInfo | null : undefined}
              extendedSchema={tableSchema as TableSchemaColumn[] | undefined}
              extendedStats={tableStats as TableStats | undefined}
              vectorIndexes={vectorIndexes as VectorIndexDetail[] | undefined}
              relations={tableRelations as TableRelations | undefined}
            />
          </TabsContent>
          
          <TabsContent value="visualization" className="h-full m-0 p-0 overflow-hidden">
            <VectorVisualization 
              schema={selectedTable.schema} 
              table={selectedTable.name}
              metadata={metadata}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
