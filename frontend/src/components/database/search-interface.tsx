'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { Search, Loader2, Zap, Type, Copy, ChevronDown, ChevronUp, Settings, Minimize2, Maximize2 } from 'lucide-react'

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
  const [expandedVectors, setExpandedVectors] = useState<Set<string>>(new Set())
  const [isSearchFormExpanded, setIsSearchFormExpanded] = useState(true)
  const [collectionInfo, setCollectionInfo] = useState<{dimensions: number, name: string} | null>(null)
  
  const { selectedCollectionId, tables, selectedTable } = useDatabaseStore()

  // Derive the explicitly selected collection's own name (nested) if available
  const selectedCollectionFriendlyName = useMemo(() => {
    if (!selectedCollectionId || !selectedTable) return null
    const tableEntry = tables.find(t => t.schema === selectedTable.schema && t.name === selectedTable.name)
    const col = tableEntry?.collections?.find(c => c.id === selectedCollectionId)
    return col?.name || null
  }, [tables, selectedCollectionId, selectedTable])

  const searchMutation = useMutation({
    mutationFn: (params: {
      query?: string
      vector_query?: number[]
      search_column?: string
      vector_column?: string
      limit: number
      metric: 'cosine' | 'l2' | 'ip'
      sortBy?: string
      sortOrder: 'asc' | 'desc'
      collectionId?: string
    }) => apiClient.searchTable(schema, table, params),
  })

  const collectionInfoMutation = useMutation({
    mutationFn: (collectionId: string) => 
      fetch(`http://localhost:8011/api/tables/${schema}/${table}/collection-info/${collectionId}`)
        .then(res => res.json()),
    onSuccess: (data) => {
      setCollectionInfo({
        dimensions: data.vector_dimensions,
        name: data.collection_name
      })
    }
  })

  // Fetch collection info when collection changes
  useEffect(() => {
    if (selectedCollectionId && selectedVectorColumn) {
      collectionInfoMutation.mutate(selectedCollectionId)
    } else {
      setCollectionInfo(null)
    }
  }, [selectedCollectionId, selectedVectorColumn])

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
        
        // Validate dimensions if we have collection info
        if (vectorArray && collectionInfo && vectorArray.length !== collectionInfo.dimensions) {
          alert(`Vector dimension mismatch! Expected ${collectionInfo.dimensions} dimensions for "${collectionInfo.name}", but got ${vectorArray.length}.`)
          return
        }
      } catch (e) {
        console.error('Failed to parse vector:', e)
        alert('Invalid vector format. Use [1,2,3] or 1,2,3 format.')
        return
      }
    }

    searchMutation.mutate({
      query: textQuery || undefined,
      vector_query: vectorArray,
      search_column: selectedTextColumn || undefined,
      vector_column: selectedVectorColumn || undefined,
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  const formatCellValue = (value: any, index?: number) => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 italic">null</span>
    }

    if (Array.isArray(value)) {
      const vectorKey = `search-${index}-${JSON.stringify(value).substring(0, 50)}`
      const isExpanded = expandedVectors.has(vectorKey)
      const vectorArrayString = JSON.stringify(value)
      
      return (
        <div className="space-y-2 min-w-0 max-w-full">
          {/* Header with dimension and controls */}
          <div className="flex items-center space-x-2 min-w-0">
            <Badge variant="outline" className="text-xs flex-shrink-0 bg-blue-50 text-blue-700 border-blue-200">
              {value.length}D vector
            </Badge>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 flex-shrink-0"
                onClick={() => copyToClipboard(vectorArrayString)}
                title="Copy full array"
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 flex-shrink-0"
                onClick={() => {
                  const newExpanded = new Set(expandedVectors)
                  if (isExpanded) {
                    newExpanded.delete(vectorKey)
                  } else {
                    newExpanded.add(vectorKey)
                  }
                  setExpandedVectors(newExpanded)
                }}
                title={isExpanded ? "Collapse" : "Expand preview"}
              >
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </div>
          </div>
          
          {/* Expandable preview */}
          {isExpanded && (
            <div className="bg-neutral-50 border rounded p-2 text-xs font-mono max-w-full overflow-hidden">
              <div className="text-neutral-600 mb-1">First 10 values:</div>
              <div className="break-all">
                [{value.slice(0, 10).map((v: number) => v.toFixed(4)).join(', ')}
                {value.length > 10 && ', ...'}]
              </div>
              <div className="text-neutral-500 mt-1 text-xs">
                Click copy button above for full array
              </div>
            </div>
          )}
        </div>
      )
    }

    if (typeof value === 'string') {
      if (value.length > 40) {
        return (
          <div className="min-w-0 max-w-full">
            <span className="text-sm block cursor-help" title={value}>{value}</span>
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
      {/* Collapsible Search Form Header */}
      <div className={`border-b border-neutral-200 bg-white flex-shrink-0 transition-all duration-300 ${
        isSearchFormExpanded ? 'pb-6' : 'pb-0'
      }`}>
        {/* Always Visible Header with Toggle */}
        <div className="px-6 py-4 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Settings className="h-5 w-5 text-neutral-600" />
              <h3 className="text-lg font-medium text-neutral-900">Search & Query</h3>
              <Badge variant="outline" className="text-xs">
                {textQuery && 'Text'} {textQuery && vectorQuery && '+'} {vectorQuery && 'Vector'}
                {!textQuery && !vectorQuery && 'Ready'}
                {selectedCollectionId && (
                  <span className="ml-1">• {selectedCollectionFriendlyName || collectionInfo?.name}</span>
                )}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSearchFormExpanded(!isSearchFormExpanded)}
              className="flex items-center space-x-2"
            >
              {isSearchFormExpanded ? (
                <>
                  <Minimize2 className="h-4 w-4" />
                  <span className="text-sm">Collapse</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" />
                  <span className="text-sm">Expand</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Collapsible Search Form Content */}
        <div className={`transition-all duration-300 overflow-hidden ${
          isSearchFormExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="px-6 pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="vector-query">Vector Values</Label>
                  {collectionInfo && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                      {collectionInfo.dimensions}D required
                    </Badge>
                  )}
                </div>
                <Input
                  id="vector-query"
                  placeholder={
                    collectionInfo && (selectedCollectionFriendlyName || collectionInfo.name)
                      ? `Enter ${collectionInfo.dimensions} comma-separated values for "${selectedCollectionFriendlyName || collectionInfo.name}"`
                      : "[0.1, 0.2, 0.3] or 0.1, 0.2, 0.3"
                  }
                  value={vectorQuery}
                  onChange={(e) => setVectorQuery(e.target.value)}
                  disabled={searchMutation.isPending}
                />
                {collectionInfo && !selectedCollectionId && (
                  <p className="text-xs text-amber-600">
                    ⚠️ Please select a collection from the sidebar to perform vector search
                  </p>
                )}
                {!collectionInfo && selectedCollectionId && (
                  <p className="text-xs text-neutral-500">
                    Loading collection info...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-6" />

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
      </div>

      {/* Results - Properly Sized Scrollable Area */}
      <div className="flex-1 min-h-0 overflow-hidden bg-neutral-50">
        {searchMutation.data && (
          <div className="h-full flex flex-col p-6">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <h4 className="font-medium text-neutral-900">Search Results</h4>
                {selectedCollectionId && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    from "{selectedCollectionFriendlyName || collectionInfo?.name}"
                  </Badge>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary">
                  {searchMutation.data.data.length} results
                  {searchMutation.data.query_info.vector_query_provided && (
                    <span className="ml-2 text-xs">• with similarity scores</span>
                  )}
                </Badge>
                {searchMutation.data.query_info.total_available_in_collection && (
                  <Badge variant="outline" className="text-xs">
                    of {searchMutation.data.query_info.total_available_in_collection} total
                    {selectedCollectionId ? ' in collection' : ' in table'}
                  </Badge>
                )}
              </div>
            </div>

              {searchMutation.data.data.length > 0 ? (
                <div className="flex-1 min-h-0 border rounded-lg bg-white overflow-auto shadow-sm">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white border-b z-10">
                      <TableRow className="hover:bg-transparent">
                        {Object.keys(searchMutation.data.data[0] || {}).map((column) => (
                          <TableHead key={column} className="font-medium font-mono text-sm whitespace-nowrap min-w-[120px] max-w-[250px] px-4 py-3">
                            <div className="truncate flex items-center space-x-1" title={column}>
                              <span>{column}</span>
                              {column === 'similarity_score' && (
                                <Badge variant="outline" className="ml-1 text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  {searchMutation.data.query_info.metric || 'distance'}
                                </Badge>
                              )}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchMutation.data.data.map((row, index) => (
                        <TableRow key={index} className="hover:bg-neutral-50">
                          {Object.entries(row).map(([column, value]) => (
                            <TableCell key={column} className="min-w-[120px] max-w-[250px] px-4 py-3 align-top">
                              <div className="overflow-hidden">
                                {column === 'similarity_score' ? (
                                  <div className="flex items-center space-x-2">
                                    <Badge 
                                      variant="secondary" 
                                      className={`font-mono text-xs ${
                                        typeof value === 'number' && value > 0.8 
                                          ? 'bg-green-50 text-green-700 border-green-200' 
                                          : typeof value === 'number' && value > 0.5 
                                          ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                          : 'bg-red-50 text-red-700 border-red-200'
                                      }`}
                                    >
                                      {typeof value === 'number' ? value.toFixed(4) : String(value)}
                                    </Badge>
                                    <span className="text-xs text-neutral-500">
                                      {typeof value === 'number' && value > 0.8 ? 'Very Similar' : 
                                       typeof value === 'number' && value > 0.5 ? 'Moderately Similar' : 'Less Similar'}
                                    </span>
                                  </div>
                                ) : (
                                  formatCellValue(value, index)
                                )}
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center border rounded-lg bg-white">
                  <div className="text-center py-8">
                    <Search className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
                    <p className="text-sm text-neutral-500">No results found</p>
                  </div>
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
            <div className="flex-1 flex items-center justify-center">
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
  )
}
