'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Database, HardDrive, Layers, Zap, BarChart3, HelpCircle } from 'lucide-react'
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
      <div className="p-6 space-y-6 h-full overflow-auto bg-gradient-to-br from-white to-slate-50 dark:from-neutral-950 dark:to-neutral-900 custom-scrollbar">
        {selectedCollectionName && (
          <div className="flex items-center space-x-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="font-mono text-neutral-500 dark:text-neutral-400">{selectedTable?.schema}.{selectedTable?.name}</span>
            <span className="text-neutral-400">›</span>
            <span className="font-semibold text-blue-700 dark:text-blue-300" title={selectedCollectionName}>{selectedCollectionName}</span>
            <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">Collection</Badge>
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
    <TooltipProvider delayDuration={200}>
      <div className="h-full overflow-auto bg-gradient-to-br from-white to-slate-50 dark:from-neutral-950 dark:to-neutral-900 custom-scrollbar">
        <div className="p-3 space-y-3">
          {/* Collection Info Banner */}
          {selectedCollectionId && selectedCollectionName && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-2 mb-3">
              <div className="flex items-center space-x-1.5 mb-1">
                <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">{selectedTable?.schema}.{selectedTable?.name}</span>
                <span className="text-neutral-400">›</span>
                <span className="font-semibold text-xs text-blue-700 dark:text-blue-300" title={selectedCollectionName}>{selectedCollectionName}</span>
                <Badge variant="outline" className="text-[9px] bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 h-4 px-1">Collection</Badge>
              </div>
              <p className="text-[10px] text-blue-700 dark:text-blue-300">
                Viewing metadata for the selected collection
              </p>
            </div>
          )}
          
          {/* Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Tooltip>
            <TooltipTrigger asChild>
              <Card className="hover-lift transition-smooth-slow border-2 cursor-help">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-2 px-3">
                  <CardTitle className="text-xs font-medium">
                    {selectedCollectionId ? 'Docs' : 'Rows'}
                  </CardTitle>
                  <Database className="h-3.5 w-3.5 text-neutral-600" />
                </CardHeader>
                <CardContent className="pt-1 pb-2 px-3">
                  <div className="text-lg font-bold">
                    {selectedCollectionId && collectionStats 
                      ? (tables.find(t => t.schema === selectedTable?.schema && t.name === selectedTable?.name)
                          ?.collections?.find(c => c.id === selectedCollectionId)?.document_count || 0).toLocaleString()
                      : metadata.row_count.toLocaleString()
                    }
                  </div>
                  <p className="text-[9px] text-neutral-500 mt-0.5">
                    {selectedCollectionId 
                      ? 'in collection' 
                      : (metadata.row_count_precise ? 'exact' : 'est.')
                    }
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="font-semibold mb-1">
                {selectedCollectionId ? 'Document Count' : 'Row Count'}
              </p>
              <p className="text-xs">
                {selectedCollectionId 
                  ? 'Total number of documents (embeddings with their text) stored in this specific collection.'
                  : 'Total number of rows in the table. This count may be an estimate for large tables to improve query performance.'
                }
              </p>
            </TooltipContent>
            </Tooltip>

            <Tooltip>
          <TooltipTrigger asChild>
            <Card className="hover-lift transition-smooth-slow border-2 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-2 px-3">
                <CardTitle className="text-xs font-medium">Size</CardTitle>
                <HardDrive className="h-3.5 w-3.5 text-neutral-600" />
              </CardHeader>
              <CardContent className="pt-1 pb-2 px-3">
                <div className="text-lg font-bold">{metadata.size_pretty}</div>
                <p className="text-[9px] text-neutral-500 mt-0.5 font-mono">
                  {(metadata.size_bytes / 1024 / 1024).toFixed(1)}MB
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-semibold mb-1">Table Size</p>
            <p className="text-xs">
              Total disk space used by this table, including data, indexes, and TOAST (The Oversized-Attribute Storage Technique) for large values. This helps you monitor storage usage.
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="hover-lift transition-smooth-slow border-2 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-2 px-3">
                <CardTitle className="text-xs font-medium">Vectors</CardTitle>
                <Layers className="h-3.5 w-3.5 text-neutral-600" />
              </CardHeader>
              <CardContent className="pt-1 pb-2 px-3">
                <div className="text-lg font-bold">{vectorColumns.length}</div>
                <p className="text-[9px] text-neutral-500 mt-0.5">
                  {metadata.columns.length} total
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-semibold mb-1">Vector Columns</p>
            <p className="text-xs">
              Columns storing high-dimensional embeddings (arrays of numbers) that represent semantic meaning. Used for AI-powered similarity search and RAG applications.
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="hover-lift transition-smooth-slow border-2 cursor-help">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-2 px-3">
                <CardTitle className="text-xs font-medium">Indexes</CardTitle>
                <Zap className="h-3.5 w-3.5 text-neutral-600" />
              </CardHeader>
              <CardContent className="pt-1 pb-2 px-3">
                <div className="text-lg font-bold">{Array.isArray(metadata.indexes) ? metadata.indexes.length : 0}</div>
                <p className="text-[9px] text-neutral-500 mt-0.5">
                  {Array.isArray(metadata.indexes) ? metadata.indexes.filter(idx => idx.vector_index_type).length : 0} vector
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-semibold mb-1">Database Indexes</p>
            <p className="text-xs">
              Indexes accelerate queries. Vector indexes (IVFFlat, HNSW) enable fast nearest-neighbor searches across millions of embeddings, essential for real-time AI applications.
            </p>
            </TooltipContent>
            </Tooltip>

            {/* Collection-specific stats */}
            {selectedCollectionId && collectionStats && (
              <>
                <Tooltip>
              <TooltipTrigger asChild>
                <Card className="hover-lift transition-smooth-slow border-2 border-blue-300 dark:border-blue-700 cursor-help">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-2 px-3">
                    <CardTitle className="text-xs font-medium">Avg Words</CardTitle>
                    <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                  </CardHeader>
                  <CardContent className="pt-1 pb-2 px-3">
                    <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{Math.round(collectionStats.avg_word_count)}</div>
                    <p className="text-[9px] text-neutral-500 mt-0.5">
                      per document
                    </p>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-semibold mb-1">Average Word Count</p>
                <p className="text-xs">
                  The mean number of words across all documents in this collection. Useful for understanding document length and estimating token usage for LLM API calls.
                </p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="hover-lift transition-smooth-slow border-2 border-blue-300 dark:border-blue-700 cursor-help">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-2 px-3">
                    <CardTitle className="text-xs font-medium">Range</CardTitle>
                    <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                  </CardHeader>
                  <CardContent className="pt-1 pb-2 px-3">
                    <div className="text-base font-bold">
                      <span className="text-blue-700 dark:text-blue-400">{collectionStats.min_word_count}</span>
                      <span className="text-neutral-400 mx-1">-</span>
                      <span className="text-blue-700 dark:text-blue-400">{collectionStats.max_word_count}</span>
                    </div>
                    <p className="text-[9px] text-neutral-500 mt-0.5">
                      min-max words
                    </p>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-semibold mb-1">Word Count Range</p>
                <p className="text-xs">
                  Minimum and maximum words in any document. A large range indicates varied content lengths, from short snippets to long articles.
                </p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="hover-lift transition-smooth-slow border-2 border-green-300 dark:border-green-700 cursor-help">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-2 px-3">
                    <CardTitle className="text-xs font-medium">Tokens</CardTitle>
                    <BarChart3 className="h-3.5 w-3.5 text-green-600" />
                  </CardHeader>
                  <CardContent className="pt-1 pb-2 px-3">
                    <div className="text-lg font-bold text-green-700 dark:text-green-400">{Math.round(collectionStats.avg_token_count)}</div>
                    <p className="text-[9px] text-neutral-500 mt-0.5">
                      per doc avg
                    </p>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-semibold mb-1">Average Token Count</p>
                <p className="text-xs">
                  LLMs process text as tokens (~4 chars or ¾ of a word). This metric helps you estimate API costs and context window usage. Most models have token limits (e.g., 4k, 8k, 128k).
                </p>
              </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>

          {/* Collection Info Details */}
          {selectedCollectionId && collectionInfo && (
            <Card className="hover-lift transition-smooth-slow border-2 border-blue-300 dark:border-blue-700">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-sm">Collection Details</CardTitle>
              <CardDescription className="text-xs">
                Vector settings & sample embedding
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2 pb-3 px-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-neutral-500 mb-0.5">Dimensions</div>
                  <div className="font-mono text-xs">{collectionInfo.vector_dimensions}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 mb-0.5">Sample</div>
                  <div className="font-mono text-[10px] break-all bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 p-1 rounded">
                    [{collectionInfo.sample_embedding.slice(0, 8).join(', ')}{collectionInfo.sample_embedding.length > 8 ? ', …' : ''}]
                  </div>
                </div>
              </div>
            </CardContent>
            </Card>
          )}

          <Separator className="my-3" />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Columns Info */}
            <Card className="hover-lift transition-smooth-slow">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm">Columns</CardTitle>
            <CardDescription className="text-xs">
              All columns with data types
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 pb-3 px-3">
            <div className="space-y-1.5">
              {metadata.columns.map((column, index) => (
                <div key={column.column_name} className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-medium text-xs font-mono">
                      {column.column_name}
                    </span>
                    {column.udt_name === 'vector' && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1">
                        {metadata.vector_info[column.column_name]?.dimension}D
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      {column.data_type}
                    </Badge>
                    {column.is_nullable === 'YES' && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 text-neutral-500">
                        null
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </CardContent>
            </Card>

            {/* Vector Information */}
            <Card className="hover-lift transition-smooth-slow">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm">Vector Columns</CardTitle>
            <CardDescription className="text-xs">
              Detailed vector column info
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
                        <Badge className="bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300">
                          {metadata.vector_info[columnName].dimension} dimensions
                        </Badge>
                        {Array.isArray(vectorIndexes) && vectorIndexes.some(v => v.column === columnName) && (
                          <Badge className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">Indexed</Badge>
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
            <Card className="lg:col-span-2 hover-lift transition-smooth-slow">
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
                  <div key={index.indexname} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-900">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm font-mono text-neutral-900 dark:text-neutral-100">
                        {index.indexname}
                      </span>
                      <div className="flex space-x-2">
                        {index.method && (
                          <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700 text-xs">{index.method.toUpperCase()}</Badge>
                        )}
                        {index.column && (
                          <Badge className="bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 border border-violet-300 dark:border-violet-700 text-xs">{index.column}</Badge>
                        )}
                        <Badge variant="outline" className="text-xs border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300">
                          Index
                        </Badge>
                      </div>
                    </div>
                    <code className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 block p-2 rounded font-mono break-all border border-neutral-200 dark:border-neutral-700">
                      {index.indexdef}
                    </code>
                    {index.params && Object.keys(index.params).length > 0 && (
                      <div className="mt-2 text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800 p-2 rounded border border-neutral-200 dark:border-neutral-700">
                        <span className="font-semibold">Params:</span> {Object.entries(index.params).map(([k, v]) => `${k}=${v}`).join(', ')}
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
              <Card className="lg:col-span-2 hover-lift transition-smooth-slow">
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
                      {col.is_identity === 'YES' && <Badge className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">identity</Badge>}
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
              <Card className="lg:col-span-2 hover-lift transition-smooth-slow">
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
              <Card className="lg:col-span-2 hover-lift transition-smooth-slow">
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
    </TooltipProvider>
  )
}
