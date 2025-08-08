'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { TableMetadata as TableMetadataType } from '@/lib/types'
import { useDatabaseStore } from '@/stores/database'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Search, Loader2, Zap, Type } from 'lucide-react'

interface SearchInterfaceProps {
  schema: string
  table: string
  metadata: TableMetadataType | null | undefined
}

export function SearchInterface({ schema, table, metadata }: SearchInterfaceProps) {
  const [textQuery, setTextQuery] = useState('')
  const [vectorQuery, setVectorQuery] = useState('')
  const [selectedTextColumn, setSelectedTextColumn] = useState<string>('')
  const [selectedVectorColumn, setSelectedVectorColumn] = useState<string>('')
  const [metric, setMetric] = useState<'cosine' | 'l2' | 'ip'>('cosine')
  const [limit, setLimit] = useState(10)
  const [sortBy, setSortBy] = useState<string>('none')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  
  const { selectedCollectionId } = useDatabaseStore()

  const searchMutation = useMutation({
    mutationFn: (params: {
      query?: string
      vectorQuery?: number[]
      searchColumn?: string
      vectorColumn?: string
      limit: number
      metric: 'cosine' | 'l2' | 'ip'
      sortBy?: string
      sortOrder: 'asc' | 'desc'
      collectionId?: string
    }) => apiClient.searchTable(schema, table, params),
  })

  const textColumns = metadata?.columns.filter(col => 
    col.data_type === 'text' || 
    col.data_type === 'character varying' || 
    col.data_type === 'varchar'
  ) || []

  const vectorColumns = Object.keys(metadata?.vector_info || {})

  const handleSearch = () => {
    let vectorArray: number[] | undefined = undefined
    
    if (vectorQuery.trim()) {
      try {
        // Parse vector input - support both JSON array and comma-separated values
        const cleanInput = vectorQuery.trim()
        if (cleanInput.startsWith('[') && cleanInput.endsWith(']')) {
          vectorArray = JSON.parse(cleanInput)
        } else {
          vectorArray = cleanInput.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
        }
        
        if (vectorArray && vectorArray.length === 0) {
          vectorArray = undefined
        }
      } catch (e) {
        console.error('Failed to parse vector:', e)
        return
      }
    }

    searchMutation.mutate({
      query: textQuery || undefined,
      vectorQuery: vectorArray,
      searchColumn: selectedTextColumn || undefined,
      vectorColumn: selectedVectorColumn || undefined,
      limit,
      metric,
      sortBy: (sortBy && sortBy !== 'none') ? sortBy : undefined,
      sortOrder,
      collectionId: selectedCollectionId || undefined,
    })
  }

  const handleClear = () => {
    setTextQuery('')
    setVectorQuery('')
    setSelectedTextColumn('')
    setSelectedVectorColumn('')
    setSortBy('none')
    setSortOrder('asc')
    searchMutation.reset()
  }

  const formatCellValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 italic">null</span>
    }

    if (Array.isArray(value)) {
      return (
        <Badge variant="outline" className="text-xs">
          {value.length}D
        </Badge>
      )
    }

    if (typeof value === 'string') {
      if (value.length > 40) {
        return (
          <div className="min-w-0 max-w-full">
            <span 
              className="text-sm block truncate cursor-help" 
              title={value}
            >
              {value}
            </span>
          </div>
        )
      }
      return (
        <span className="text-sm break-words">
          {value}
        </span>
      )
    }

    if (typeof value === 'object') {
      const jsonString = JSON.stringify(value, null, 1)
      return (
        <div className="min-w-0 max-w-full">
          <pre 
            className="text-xs bg-neutral-100 p-1 rounded overflow-hidden whitespace-pre-wrap break-all"
            title={jsonString}
          >
            {jsonString.length > 80 ? `${jsonString.substring(0, 80)}...` : jsonString}
          </pre>
        </div>
      )
    }

    const stringValue = String(value)
    return (
      <span 
        className="text-sm break-words" 
        title={stringValue.length > 25 ? stringValue : undefined}
      >
        {stringValue.length > 25 ? `${stringValue.substring(0, 25)}...` : stringValue}
      </span>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Search Form - Fixed Header */}
      <div className="p-6 border-b border-neutral-200 bg-white flex-shrink-0">
        <div className="space-y-6">
          <div className="flex items-center space-x-2">
            <Search className="h-5 w-5 text-neutral-600" />
            <h3 className="text-lg font-medium text-neutral-900">Search & Query</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Text Search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center space-x-2">
                <Type className="h-4 w-4" />
                <span>Text Search</span>
              </CardTitle>
              <CardDescription>
                Search for text content in specified columns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="text-column">Search Column</Label>
                <Select value={selectedTextColumn} onValueChange={setSelectedTextColumn}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select column to search" />
                  </SelectTrigger>
                  <SelectContent>
                    {textColumns.map((column) => (
                      <SelectItem key={column.column_name} value={column.column_name}>
                        {column.column_name} ({column.data_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="text-query">Search Query</Label>
                <Input
                  id="text-query"
                  placeholder="Enter search text..."
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                  disabled={searchMutation.isPending}
                />
              </div>
            </CardContent>
          </Card>

          {/* Vector Search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center space-x-2">
                <Zap className="h-4 w-4" />
                <span>Vector Similarity</span>
              </CardTitle>
              <CardDescription>
                Find similar vectors using distance metrics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vector-column">Vector Column</Label>
                  <Select value={selectedVectorColumn} onValueChange={setSelectedVectorColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vector" />
                    </SelectTrigger>
                    <SelectContent>
                      {vectorColumns.map((column) => (
                        <SelectItem key={column} value={column}>
                          {column} ({metadata?.vector_info[column]?.dimension}D)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metric">Distance Metric</Label>
                  <Select value={metric} onValueChange={(value) => setMetric(value as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cosine">Cosine</SelectItem>
                      <SelectItem value="l2">L2 (Euclidean)</SelectItem>
                      <SelectItem value="ip">Inner Product</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vector-query">Vector Values</Label>
                <Input
                  id="vector-query"
                  placeholder="[0.1, 0.2, 0.3] or 0.1, 0.2, 0.3"
                  value={vectorQuery}
                  onChange={(e) => setVectorQuery(e.target.value)}
                  disabled={searchMutation.isPending}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* Search Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="limit">Limit</Label>
              <Select value={limit.toString()} onValueChange={(value) => setLimit(Number(value))}>
                <SelectTrigger className="w-20">
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
            
            <div className="flex items-center space-x-2">
              <Label htmlFor="sort-by">Sort By</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="No sorting" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No sorting</SelectItem>
                  {metadata?.columns.map((column) => (
                    <SelectItem key={column.column_name} value={column.column_name}>
                      {column.column_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sortBy && sortBy !== 'none' && (
              <div className="flex items-center space-x-2">
                <Label htmlFor="sort-order">Order</Label>
                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">↑ ASC</SelectItem>
                    <SelectItem value="desc">↓ DESC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={handleClear} disabled={searchMutation.isPending}>
              Clear
            </Button>
            <Button 
              onClick={handleSearch}
              disabled={searchMutation.isPending || (!textQuery && !vectorQuery)}
            >
              {searchMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Search
            </Button>
          </div>
        </div>
        </div>
      </div>

      {/* Results - Scrollable Area */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto bg-neutral-50">
          {searchMutation.data && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-neutral-900">Search Results</h4>
                <Badge variant="secondary">
                  {searchMutation.data.data.length} results
                </Badge>
              </div>

              {searchMutation.data.data.length > 0 ? (
                <div className="border rounded-lg bg-white flex flex-col h-[calc(100vh-300px)] min-h-[300px] max-h-[600px]">
                  {/* Fixed Header */}
                  <div className="flex-shrink-0 border-b bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(searchMutation.data.data[0] || {}).map((column) => (
                            <TableHead key={column} className="font-medium font-mono text-sm whitespace-nowrap min-w-[120px] max-w-[200px] px-3 py-2">
                              <div className="truncate" title={column}>
                                {column}
                              </div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                    </Table>
                  </div>
                  
                  {/* Scrollable Body */}
                  <div className="flex-1 overflow-auto">
                    <Table>
                      <TableBody>
                        {searchMutation.data.data.map((row, index) => (
                          <TableRow key={index} className="hover:bg-neutral-50">
                            {Object.entries(row).map(([column, value]) => (
                              <TableCell key={column} className="min-w-[120px] max-w-[200px] px-3 py-2 align-top">
                                <div className="overflow-hidden">
                                  {formatCellValue(value)}
                                </div>
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 border rounded-lg bg-white">
                  <Search className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
                  <p className="text-sm text-neutral-500">No results found</p>
                </div>
              )}
            </div>
          )}

          {searchMutation.error && (
            <div className="p-6">
              <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                <h4 className="font-medium text-red-900 mb-2">Search Error</h4>
                <p className="text-sm text-red-700">
                  {searchMutation.error.message}
                </p>
              </div>
            </div>
          )}

          {!searchMutation.data && !searchMutation.error && !searchMutation.isPending && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Search className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-neutral-900 mb-2">Ready to Search</h3>
                <p className="text-sm text-neutral-500 max-w-sm">
                  Enter a text query or vector values above to search through your data
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
