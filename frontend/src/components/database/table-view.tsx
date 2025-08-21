'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDatabaseStore } from '@/stores/database'
import { apiClient } from '@/lib/api'
import { TableMetadata } from './table-metadata'
import { TableData } from './table-data'
import { SearchInterface } from './search-interface'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Database, Search, BarChart3 } from 'lucide-react'
import { CollectionStats, CollectionInfo, TableSchemaColumn, TableStats, VectorIndexDetail, TableRelations } from '@/lib/types'

export function TableView() {
  const { selectedTable, selectedCollectionId, tables } = useDatabaseStore()
  const selectedCollectionName = useMemo(() => {
    if (!selectedTable || !selectedCollectionId) return null
    const tableEntry = tables.find(t => t.schema === selectedTable.schema && t.name === selectedTable.name)
    return tableEntry?.collections?.find(c => c.id === selectedCollectionId)?.name || null
  }, [tables, selectedTable, selectedCollectionId])
  const [activeTab, setActiveTab] = useState('data')

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
      <div className="border-b border-neutral-200 bg-white px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600">
              <Database className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 flex items-center flex-wrap gap-2">
                <span>{selectedTable.name}</span>
                {selectedCollectionName && (
                  <span className="text-neutral-400">›</span>
                )}
                {selectedCollectionName && (
                  <span className="text-blue-700 font-medium" title={selectedCollectionName}>
                    {selectedCollectionName}
                  </span>
                )}
              </h2>
              <p className="text-sm text-neutral-500 font-mono">
                {selectedTable.schema}{selectedCollectionName ? ` • ${selectedCollectionId}` : ''}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4 text-sm text-neutral-600 flex-wrap">
            {selectedCollectionId && collectionStats && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs bg-blue-50 px-2 py-0.5 rounded text-blue-700 whitespace-nowrap">
                    Avg: {Math.round(collectionStats.avg_word_count)} words
                  </span>
                  <span className="text-xs bg-neutral-50 px-2 py-0.5 rounded text-neutral-600 whitespace-nowrap">
                    Min: {collectionStats.min_word_count}
                  </span>
                  <span className="text-xs bg-neutral-50 px-2 py-0.5 rounded text-neutral-600 whitespace-nowrap">
                    Max: {collectionStats.max_word_count}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs bg-green-50 px-2 py-0.5 rounded text-green-700 whitespace-nowrap">
                    ~{Math.round(collectionStats.avg_token_count)} tokens per doc
                  </span>
                </div>
                {collectionStats.document_column && (
                  <div className="text-xs text-neutral-500 font-mono max-w-[200px] truncate">
                    Column: {collectionStats.document_column}
                  </div>
                )}
              </div>
            )}
            {metadata && (
              <div className="text-right">
                <div className="font-medium">
                  {metadata.row_count.toLocaleString()} rows
                </div>
                <div className="text-xs text-neutral-500">
                  {metadata.size_pretty}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Tabs - Flexible */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-neutral-200 bg-white px-4 flex-shrink-0">
          <TabsList className="w-full h-9 flex gap-2">
            <TabsTrigger value="data" className="flex items-center space-x-2">
              <Database className="h-4 w-4" />
              <span>Data</span>
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center space-x-2">
              <Search className="h-4 w-4" />
              <span>Search</span>
            </TabsTrigger>
            <TabsTrigger value="metadata" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Metadata</span>
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
        </div>
      </Tabs>
    </div>
  )
}
