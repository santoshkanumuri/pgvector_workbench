'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Database, HardDrive, Layers, Zap, BarChart3 } from 'lucide-react'
import { TableMetadata as TableMetadataType, CollectionStats, CollectionInfo, TableSchemaColumn, TableStats, VectorIndexDetail, TableRelations } from '@/lib/types'
import { useDatabaseStore } from '@/stores/database'
import { useMemo } from 'react'

interface TableMetadataProps {
  metadata: TableMetadataType | null | undefined
  isLoading: boolean
  collectionStats?: CollectionStats | null
  selectedCollectionId?: string | null
  collectionInfo?: CollectionInfo | null
  extendedSchema?: TableSchemaColumn[]
  extendedStats?: TableStats
  vectorIndexes?: VectorIndexDetail[]
  relations?: TableRelations
}

export function TableMetadata({ metadata, isLoading, collectionStats, selectedCollectionId, collectionInfo, extendedSchema, extendedStats, vectorIndexes, relations }: TableMetadataProps) {
  const { selectedTable, selectedCollectionId: storeSelectedCollectionId, tables } = useDatabaseStore()
  const selectedCollectionName = useMemo(() => {
    if (!selectedTable || !selectedCollectionId) return null
    const tableEntry = tables.find(t => t.schema === selectedTable.schema && t.name === selectedTable.name)
    return tableEntry?.collections?.find(c => c.id === selectedCollectionId)?.name || null
  }, [tables, selectedTable, selectedCollectionId])
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        {selectedCollectionName && (
          <div className="flex items-center space-x-2 text-sm text-neutral-600">
            <span className="font-mono text-neutral-500">{selectedTable?.schema}.{selectedTable?.name}</span>
            <span className="text-neutral-400">›</span>
            <span className="font-semibold text-blue-700" title={selectedCollectionName}>{selectedCollectionName}</span>
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Collection</Badge>
          </div>
        )}
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
      <div className="p-4 space-y-4">
        {/* Collection Info Banner */}
        {selectedCollectionId && selectedCollectionName && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2 mb-2">
              <span className="font-mono text-neutral-500">{selectedTable?.schema}.{selectedTable?.name}</span>
              <span className="text-neutral-400">›</span>
              <span className="font-semibold text-blue-700" title={selectedCollectionName}>{selectedCollectionName}</span>
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Collection</Badge>
            </div>
            <p className="text-sm text-blue-700">
              Viewing metadata for the selected collection. Collection-specific statistics are shown below.
            </p>
          </div>
        )}
        
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {selectedCollectionId ? 'Documents' : 'Total Rows'}
              </CardTitle>
              <Database className="h-4 w-4 text-neutral-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {selectedCollectionId && collectionStats 
                  ? (tables.find(t => t.schema === selectedTable?.schema && t.name === selectedTable?.name)
                      ?.collections?.find(c => c.id === selectedCollectionId)?.document_count || 0).toLocaleString()
                  : metadata.row_count.toLocaleString()
                }
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {selectedCollectionId 
                  ? 'Documents in this collection' 
                  : (metadata.row_count_precise ? 'Exact count' : 'Estimated')
                }
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
            <div className="text-2xl font-bold">{Array.isArray(metadata.indexes) ? metadata.indexes.length : 0}</div>
            <p className="text-xs text-neutral-500 mt-1">
              {Array.isArray(metadata.indexes) ? metadata.indexes.filter(idx => idx.vector_index_type).length : 0} vector indexes
            </p>
          </CardContent>
        </Card>

        {/* Collection-specific stats */}
        {selectedCollectionId && collectionStats && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Words</CardTitle>
                <BarChart3 className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-700">{Math.round(collectionStats.avg_word_count)}</div>
                <p className="text-xs text-neutral-500 mt-1">
                  Average words per document
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Word Range</CardTitle>
                <BarChart3 className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className="text-blue-700">{collectionStats.min_word_count}</span>
                  <span className="text-neutral-400 mx-2">-</span>
                  <span className="text-blue-700">{collectionStats.max_word_count}</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Min and max words per document
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tokens</CardTitle>
                <BarChart3 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">{Math.round(collectionStats.avg_token_count)}</div>
                <p className="text-xs text-neutral-500 mt-1">
                  Average tokens per document
                </p>
                <div className="text-xs text-neutral-600 mt-2 bg-neutral-50 p-1 rounded">
                  <span className="font-medium">Note:</span> LLMs process text as tokens (≈4 chars or ¾ of a word)
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Collection Info Details */}
        {selectedCollectionId && collectionInfo && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Collection Details</CardTitle>
              <CardDescription>
                Vector settings and a sample of the embedding
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Vector dimensions</div>
                  <div className="font-mono text-sm">{collectionInfo.vector_dimensions}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Sample embedding</div>
                  <div className="font-mono text-xs break-all bg-neutral-50 p-2 rounded">
                    [{collectionInfo.sample_embedding.slice(0, 8).join(', ')}{collectionInfo.sample_embedding.length > 8 ? ', …' : ''}]
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Columns Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Columns</CardTitle>
            <CardDescription>
              All columns in this table with their data types
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
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
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vector Columns</CardTitle>
            <CardDescription>
              Detailed information about vector columns and dimensions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vectorColumns.length > 0 ? (
              <div className="space-y-3">
                {vectorColumns.map((columnName) => (
                  <div key={columnName} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium font-mono text-sm">
                        {columnName}
                      </span>
                      <div className="flex gap-2">
                        <Badge className="bg-green-100 text-green-800">
                          {metadata.vector_info[columnName].dimension} dimensions
                        </Badge>
                        {Array.isArray(vectorIndexes) && vectorIndexes.some(v => v.column === columnName) && (
                          <Badge className="bg-blue-100 text-blue-800">Indexed</Badge>
                        )}
                      </div>
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
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Indexes</CardTitle>
            <CardDescription>
              Database indexes including vector indexes (HNSW, IVFFlat)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Array.isArray(vectorIndexes) && vectorIndexes.length > 0 ? (
              <div className="space-y-2">
                {vectorIndexes.map((index) => (
                  <div key={index.indexname} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm font-mono">
                        {index.indexname}
                      </span>
                      <div className="flex space-x-2">
                        {index.method && (
                          <Badge className="bg-blue-100 text-blue-800 text-xs">{index.method.toUpperCase()}</Badge>
                        )}
                        {index.column && (
                          <Badge variant="secondary" className="text-xs">{index.column}</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          Index
                        </Badge>
                      </div>
                    </div>
                    <code className="text-xs bg-neutral-100 block p-2 rounded font-mono break-all">
                      {index.indexdef}
                    </code>
                    {index.params && Object.keys(index.params).length > 0 && (
                      <div className="mt-2 text-xs text-neutral-700">
                        Params: {Object.entries(index.params).map(([k, v]) => `${k}=${v}`).join(', ')}
                      </div>
                    )}
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

        {/* Extended Schema */}
        {Array.isArray(extendedSchema) && extendedSchema.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detailed Columns</CardTitle>
              <CardDescription>Defaults, identity, lengths, precision</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {extendedSchema.map((col) => (
                  <div key={col.column_name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{col.column_name}</span>
                      <Badge variant="outline" className="text-xs">{col.data_type}</Badge>
                    </div>
                    <div className="text-xs text-neutral-600 flex items-center gap-2">
                      {col.column_default && <span>default: <span className="font-mono">{col.column_default}</span></span>}
                      {col.is_identity === 'YES' && <Badge className="bg-amber-100 text-amber-800">identity</Badge>}
                      {(col.character_maximum_length || col.numeric_precision) && (
                        <span>
                          size: {col.character_maximum_length ?? `${col.numeric_precision}${col.numeric_scale ? `,${col.numeric_scale}` : ''}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table Stats */}
        {extendedStats && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Table Stats</CardTitle>
              <CardDescription>Access patterns and size breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-neutral-500 text-xs">Seq scans</div><div className="font-mono">{extendedStats.seq_scan ?? 0}</div></div>
                <div><div className="text-neutral-500 text-xs">Idx scans</div><div className="font-mono">{extendedStats.idx_scan ?? 0}</div></div>
                <div><div className="text-neutral-500 text-xs">Live tuples</div><div className="font-mono">{extendedStats.n_live_tup ?? 0}</div></div>
                <div><div className="text-neutral-500 text-xs">Dead tuples</div><div className="font-mono">{extendedStats.n_dead_tup ?? 0}</div></div>
                <div><div className="text-neutral-500 text-xs">Heap hits</div><div className="font-mono">{extendedStats.heap_blks_hit ?? 0}</div></div>
                <div><div className="text-neutral-500 text-xs">Heap reads</div><div className="font-mono">{extendedStats.heap_blks_read ?? 0}</div></div>
                <div><div className="text-neutral-500 text-xs">Idx hits</div><div className="font-mono">{extendedStats.idx_blks_hit ?? 0}</div></div>
                <div><div className="text-neutral-500 text-xs">Idx reads</div><div className="font-mono">{extendedStats.idx_blks_read ?? 0}</div></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Relations */}
        {relations && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Relations</CardTitle>
              <CardDescription>Foreign key references</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="font-medium text-sm mb-2">References</div>
                  <div className="space-y-1">
                    {relations.references.length > 0 ? relations.references.map((r, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-mono">{r.column_name}</span> → <span className="font-mono">{r.referenced_schema}.{r.referenced_table}.{r.referenced_column}</span>
                      </div>
                    )) : <div className="text-xs text-neutral-500">None</div>}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-sm mb-2">Referenced by</div>
                  <div className="space-y-1">
                    {relations.referenced_by.length > 0 ? relations.referenced_by.map((r, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-mono">{r.referencing_schema}.{r.referencing_table}.{r.referencing_column}</span> → <span className="font-mono">{r.referenced_column}</span>
                      </div>
                    )) : <div className="text-xs text-neutral-500">None</div>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      </div>
    </div>
  )
}
