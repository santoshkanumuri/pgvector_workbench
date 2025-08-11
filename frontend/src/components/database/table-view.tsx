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

  if (!selectedTable) {
    return null
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Table Header - Fixed */}
      <div className="border-b border-neutral-200 bg-white px-6 py-4 flex-shrink-0">
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
          
          {metadata && (
            <div className="flex items-center space-x-4 text-sm text-neutral-600">
              <div className="text-right">
                <div className="font-medium">
                  {metadata.row_count.toLocaleString()} rows
                </div>
                <div className="text-xs text-neutral-500">
                  {metadata.size_pretty}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content Tabs - Flexible */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-neutral-200 bg-white px-6 flex-shrink-0">
          <TabsList className="grid w-full max-w-md grid-cols-3 h-9">
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
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
