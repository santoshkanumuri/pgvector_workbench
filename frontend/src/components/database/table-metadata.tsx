'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Database, HardDrive, Layers, Zap } from 'lucide-react'
import { TableMetadata as TableMetadataType } from '@/lib/types'

interface TableMetadataProps {
  metadata: TableMetadataType | null | undefined
  isLoading: boolean
}

export function TableMetadata({ metadata, isLoading }: TableMetadataProps) {
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!metadata) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Database className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">No Metadata</h3>
          <p className="text-sm text-neutral-500">Unable to load table metadata</p>
        </div>
      </div>
    )
  }

  const vectorColumns = Object.keys(metadata.vector_info)

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="p-6 space-y-6">
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Rows</CardTitle>
              <Database className="h-4 w-4 text-neutral-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metadata.row_count.toLocaleString()}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {metadata.row_count_precise ? 'Exact count' : 'Estimated'}
              </p>
            </CardContent>
          </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Table Size</CardTitle>
            <HardDrive className="h-4 w-4 text-neutral-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metadata.size_pretty}</div>
            <p className="text-xs text-neutral-500 mt-1 font-mono">
              {metadata.size_bytes.toLocaleString()} bytes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vector Columns</CardTitle>
            <Layers className="h-4 w-4 text-neutral-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vectorColumns.length}</div>
            <p className="text-xs text-neutral-500 mt-1">
              {metadata.columns.length} total columns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Indexes</CardTitle>
            <Zap className="h-4 w-4 text-neutral-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metadata.indexes.length}</div>
            <p className="text-xs text-neutral-500 mt-1">
              {metadata.indexes.filter(idx => idx.vector_index_type).length} vector indexes
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columns Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Columns</CardTitle>
            <CardDescription>
              All columns in this table with their data types
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metadata.columns.map((column, index) => (
                <div key={column.column_name} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm font-mono">
                      {column.column_name}
                    </span>
                    {column.udt_name === 'vector' && (
                      <Badge variant="secondary" className="text-xs">
                        {metadata.vector_info[column.column_name]?.dimension}D vector
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">
                      {column.data_type}
                    </Badge>
                    {column.is_nullable === 'YES' && (
                      <Badge variant="outline" className="text-xs text-neutral-500">
                        nullable
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Vector Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vector Columns</CardTitle>
            <CardDescription>
              Detailed information about vector columns and dimensions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vectorColumns.length > 0 ? (
              <div className="space-y-4">
                {vectorColumns.map((columnName) => (
                  <div key={columnName} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium font-mono text-sm">
                        {columnName}
                      </span>
                      <Badge className="bg-green-100 text-green-800">
                        {metadata.vector_info[columnName].dimension} dimensions
                      </Badge>
                    </div>
                    <Separator />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Layers className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
                <p className="text-sm text-neutral-500">No vector columns found</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Indexes */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Indexes</CardTitle>
            <CardDescription>
              Database indexes including vector indexes (HNSW, IVFFlat)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metadata.indexes.length > 0 ? (
              <div className="space-y-3">
                {metadata.indexes.map((index, idx) => (
                  <div key={index.indexname} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm font-mono">
                        {index.indexname}
                      </span>
                      <div className="flex space-x-2">
                        {index.vector_index_type && (
                          <Badge className="bg-blue-100 text-blue-800 text-xs">
                            {index.vector_index_type.toUpperCase()}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          Index
                        </Badge>
                      </div>
                    </div>
                    <code className="text-xs bg-neutral-100 block p-2 rounded font-mono break-all">
                      {index.indexdef}
                    </code>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Zap className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
                <p className="text-sm text-neutral-500">No indexes found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}
