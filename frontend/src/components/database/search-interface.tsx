'use client'

import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Search, Loader2, Zap, Type, Copy, ChevronDown, ChevronUp, ChevronRight, Settings, Minimize2, Maximize2, Eye, Check, History, Save, Trash2, Play, Download, Filter, SlidersHorizontal, X, Clock, TrendingUp, BarChart3 } from 'lucide-react'

interface SearchInterfaceProps {
  schema: string
  table: string
  metadata: TableMetadataType | null | undefined
}

interface SavedQuery {
  id: string
  name: string
  textQuery: string
  vectorQuery: string
  textColumn: string
  vectorColumn: string
  metric: 'cosine' | 'l2' | 'ip'
  limit: number
  timestamp: number
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
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false)
  const [selectedVector, setSelectedVector] = useState<number[] | null>(null)
  const [copiedStates, setCopiedStates] = useState<Set<string>>(new Set())
  const [collectionInfo, setCollectionInfo] = useState<{dimensions: number, name: string} | null>(null)
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [showSavedQueries, setShowSavedQueries] = useState(false)
  const [queryName, setQueryName] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  
  const { selectedCollectionId, tables, selectedTable, setSelectedCollection } = useDatabaseStore()

  // FALLBACK: Query actual table data to get column names when metadata is empty
  const { data: sampleData, isLoading: isSampleLoading } = useQuery({
    queryKey: ['table-sample-for-search', schema, table],
    queryFn: async () => {
      console.log('🔄 Fetching sample data for column detection...')
      const result = await apiClient.getTableData(schema, table, 1, 1)
      console.log('📦 Sample data fetched:', result)
      return result
    },
    enabled: !!schema && !!table,
    staleTime: 60000, // Cache for 1 minute
  })

  useEffect(() => {
    if (sampleData?.data && sampleData.data.length > 0) {
      console.log('✅ Sample data available for column detection')
      console.log('📋 Sample row keys:', Object.keys(sampleData.data[0]))
      console.log('📋 Sample row:', sampleData.data[0])
    }
  }, [sampleData])

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
      fetch(`http://10.140.118.145:8011/api/tables/${schema}/${table}/collection-info/${collectionId}`)
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

  // Listen for search-collection events from global search
  useEffect(() => {
    const handleSearchCollection = (event: CustomEvent) => {
      const { collectionId } = event.detail
      if (collectionId) {
        setSelectedCollection(collectionId)
      }
    }

    window.addEventListener('search-collection' as any, handleSearchCollection)
    return () => window.removeEventListener('search-collection' as any, handleSearchCollection)
  }, [setSelectedCollection])

  // Text/document column detection - with fallback to sample data (LangChain: "document", "page_content")
  const textColumns = useMemo(() => {
    console.log('🔍 TEXT COLUMN DETECTION STARTED')
    console.log('  - Metadata columns:', metadata?.columns?.length || 0)
    console.log('  - Sample data rows:', sampleData?.data?.length || 0)
    
    // Try metadata first
    if (metadata?.columns && metadata.columns.length > 0) {
      console.log('📋 Using metadata columns')
      
      const filtered = metadata.columns.filter(col => {
        const colName = col.column_name.toLowerCase()
        const dataType = (col.data_type || '').toLowerCase()
        const udtName = (col.udt_name || '').toLowerCase()
        
        const isTextType = 
          dataType.includes('text') || 
          dataType.includes('char') || 
          dataType.includes('varchar') ||
          dataType.includes('string') ||
          udtName.includes('text') ||
          udtName.includes('char') ||
          udtName.includes('varchar')
        
        const isDocumentColumn = 
          colName === 'document' ||
          colName === 'page_content' ||
          colName.includes('document') ||
          colName.includes('content') ||
          colName.includes('text') ||
          colName.includes('body')
        
        return isTextType || isDocumentColumn
      })
      
      console.log('✅ Text columns from metadata:', filtered.map(c => c.column_name))
      return filtered
    }
    
    // FALLBACK: Use sample data to get column names (for LangChain tables)
    if (sampleData?.data && sampleData.data.length > 0) {
      console.log('🔄 FALLBACK: Using sample data for text columns')
      const sampleRow = sampleData.data[0]
      const allColumnNames = Object.keys(sampleRow)
      console.log('📋 All columns from sample:', allColumnNames)
      
      const columns = allColumnNames
        .filter(colName => {
          const lower = colName.toLowerCase()
          const value = sampleRow[colName]
          
          // IMPORTANT: LangChain uses "document" column name
          const isTextType = typeof value === 'string' && !Array.isArray(value)
          const isDocumentColumn = 
            lower === 'document' ||
            lower === 'page_content' ||
            lower.includes('document') ||
            lower.includes('content') ||
            lower.includes('text') ||
            lower.includes('body')
          
          const matched = isTextType || isDocumentColumn
          if (matched) {
            console.log(`  ✓ Found text column: "${colName}" (type: ${typeof value})`)
          }
          
          return matched
        })
        .map(colName => ({
          column_name: colName,
          data_type: 'text',
          udt_name: 'text',
          is_nullable: 'YES'
        }))
      
      console.log('✅ TEXT COLUMNS FOUND:', columns.map(c => c.column_name))
      return columns
    }
    
    console.log('❌ No metadata or sample data available for text detection')
    return []
  }, [metadata, sampleData])

  // Vector/embedding column detection - with fallback to sample data (LangChain: "embedding")
  const vectorColumns = useMemo(() => {
    console.log('🔍 VECTOR COLUMN DETECTION STARTED')
    console.log('  - Vector info keys:', metadata?.vector_info ? Object.keys(metadata.vector_info).length : 0)
    console.log('  - Metadata columns:', metadata?.columns?.length || 0)
    console.log('  - Sample data rows:', sampleData?.data?.length || 0)
    
    const detectedColumns: string[] = []
    
    // Method 1: Check vector_info (primary method)
    if (metadata?.vector_info && Object.keys(metadata.vector_info).length > 0) {
      const vecInfoCols = Object.keys(metadata.vector_info)
      console.log('✅ Vector columns from vector_info:', vecInfoCols)
      detectedColumns.push(...vecInfoCols)
    }
    
    // Method 2: Check metadata columns for vector type and naming patterns
    if (metadata?.columns && metadata.columns.length > 0) {
      console.log('🔍 Checking metadata columns for vectors')
      const vectorColsFromSchema = metadata.columns
        .filter(col => {
          const colName = col.column_name.toLowerCase()
          const dataType = col.data_type || ''
          const udtName = (col.udt_name || '').toLowerCase()
          
          return (
            (dataType === 'USER-DEFINED' && udtName === 'vector') ||
            (dataType === 'ARRAY' && udtName === 'vector') ||
            udtName === 'vector' ||
            colName === 'embedding' ||
            colName === 'embeddings' ||
            colName.includes('embedding') ||
            colName.includes('vector')
          )
        })
        .map(col => col.column_name)
      
      vectorColsFromSchema.forEach(col => {
        if (!detectedColumns.includes(col)) {
          detectedColumns.push(col)
        }
      })
    }
    
    // Method 3: FALLBACK - Check sample data for array columns (for LangChain tables)
    if (detectedColumns.length === 0 && sampleData?.data && sampleData.data.length > 0) {
      console.log('🔄 FALLBACK: Using sample data for vector columns')
      const sampleRow = sampleData.data[0]
      const allColumnNames = Object.keys(sampleRow)
      console.log('📋 All columns from sample:', allColumnNames)
      
      allColumnNames.forEach(colName => {
        const value = sampleRow[colName]
        const lower = colName.toLowerCase()
        
        // IMPORTANT: LangChain uses "embedding" column name
        const isArrayOfNumbers = Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'number')
        const hasEmbeddingInName = lower === 'embedding' || lower === 'embeddings' || lower.includes('embedding')
        const hasVectorInName = lower.includes('vector')
        
        if (isArrayOfNumbers || hasEmbeddingInName || hasVectorInName) {
          const arrayLength = Array.isArray(value) ? value.length : 0
          console.log(`  ✓ Found vector column: "${colName}" (array: ${isArrayOfNumbers}, dimensions: ${arrayLength})`)
          if (!detectedColumns.includes(colName)) {
            detectedColumns.push(colName)
          }
        }
      })
    }
    
    console.log('✅ VECTOR COLUMNS FOUND:', detectedColumns)
    return detectedColumns
  }, [metadata, sampleData])

  const handleSearch = () => {
    let vectorArray: number[] | undefined = undefined
    
    if (vectorQuery.trim()) {
      // Check if collection is selected for vector search
      const tableEntry = selectedTable ? tables.find(t => t.schema === selectedTable.schema && t.name === selectedTable.name) : null
      const hasMultipleCollections = tableEntry?.collections && tableEntry.collections.length > 1
      
      if (!selectedCollectionId && hasMultipleCollections) {
        alert('⚠️ Please select a collection first to ensure embedding dimension compatibility.\n\nDifferent collections may have different embedding dimensions (e.g., 1536 vs 768), which will cause a dimension mismatch error.')
        return
      }
      
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

    console.log('🔍 Executing search with params:', {
      textQuery: textQuery || undefined,
      vectorQuery: vectorArray ? `[${vectorArray.length} dims]` : undefined,
      selectedTextColumn,
      selectedVectorColumn,
      collectionId: selectedCollectionId || undefined,
      metric,
      limit
    })

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
    
    // Auto-collapse form after search to show more results
    setIsSearchFormExpanded(false)
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
  
  const handleSaveQuery = () => {
    if (!queryName.trim()) {
      alert('Please enter a name for this query')
      return
    }
    
    const newQuery: SavedQuery = {
      id: Date.now().toString(),
      name: queryName.trim(),
      textQuery,
      vectorQuery,
      textColumn: selectedTextColumn,
      vectorColumn: selectedVectorColumn,
      metric,
      limit,
      timestamp: Date.now()
    }
    
    setSavedQueries(prev => [newQuery, ...prev].slice(0, 10)) // Keep last 10
    setQueryName('')
    setShowSavedQueries(false)
  }
  
  const handleLoadQuery = (query: SavedQuery) => {
    setTextQuery(query.textQuery)
    setVectorQuery(query.vectorQuery)
    setSelectedTextColumn(query.textColumn)
    setSelectedVectorColumn(query.vectorColumn)
    setMetric(query.metric)
    setLimit(query.limit)
    setShowSavedQueries(false)
  }
  
  const handleDeleteQuery = (id: string) => {
    setSavedQueries(prev => prev.filter(q => q.id !== id))
  }

  const copyToClipboard = async (text: string, feedbackKey?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // You could add a toast notification here if you have a toast system
      
      // Show feedback
      if (feedbackKey) {
        setCopiedStates(prev => new Set(prev).add(feedbackKey))
        // Clear feedback after 2 seconds
        setTimeout(() => {
          setCopiedStates(prev => {
            const newSet = new Set(prev)
            newSet.delete(feedbackKey)
            return newSet
          })
        }, 2000)
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      // Fallback for older browsers
      try {
        const textArea = document.createElement('textarea')
        textArea.value = text
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)

        
        // Show feedback for fallback too
        if (feedbackKey) {
          setCopiedStates(prev => new Set(prev).add(feedbackKey))
          setTimeout(() => {
            setCopiedStates(prev => {
              const newSet = new Set(prev)
              newSet.delete(feedbackKey)
              return newSet
            })
          }, 2000)
        }
      } catch (fallbackError) {
        console.error('Fallback copy also failed:', fallbackError)
      }
    }
  }

  const formatCellValue = (value: any, index?: number, columnName?: string, rowData?: any) => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 dark:text-neutral-500 italic text-xs">null</span>
    }

    // Enhanced vector detection - check if it's an array of numbers that looks like a vector
    if (Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'number')) {
      const vectorKey = `search-${index}-${JSON.stringify(value).substring(0, 50)}`
      const isExpanded = expandedVectors.has(vectorKey)
      const vectorArrayString = JSON.stringify(value)
      
      // Create a unique identifier using UUID if available, otherwise use row index and column
      const uniqueId = rowData?.id || rowData?.uuid || rowData?._id || `search-row-${index}`
      const copyFeedbackKey = `search-vector-${uniqueId}-${columnName || 'unknown'}`
      const isCopied = copiedStates.has(copyFeedbackKey)
      
      return (
        <div className="space-y-1.5 min-w-0 max-w-full">
          {/* Compact Header with dimension and controls */}
          <div className="flex items-center gap-1.5 min-w-0">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
              {value.length}D
            </Badge>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={`h-5 w-5 p-0 flex-shrink-0 transition-colors ${
                  isCopied ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : ''
                }`}
                onClick={() => copyToClipboard(vectorArrayString, copyFeedbackKey)}
                title={isCopied ? "Copied!" : "Copy vector"}
              >
                {isCopied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 flex-shrink-0"
                onClick={() => setSelectedVector(value)}
                title="View full"
              >
                <Eye className="h-2.5 w-2.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 flex-shrink-0"
                onClick={() => {
                  const newExpanded = new Set(expandedVectors)
                  if (isExpanded) {
                    newExpanded.delete(vectorKey)
                  } else {
                    newExpanded.add(vectorKey)
                  }
                  setExpandedVectors(newExpanded)
                }}
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
              </Button>
            </div>
          </div>
          
          {/* Compact Expandable preview */}
          {isExpanded && (
            <div className="bg-neutral-50 dark:bg-neutral-800 border dark:border-neutral-700 rounded p-1.5 text-[10px] font-mono max-w-full overflow-hidden">
              <div className="text-neutral-500 dark:text-neutral-400 mb-0.5">First 10:</div>
              <div className="break-all text-neutral-700 dark:text-neutral-300">
                [{value.slice(0, 10).map((v: number) => v.toFixed(3)).join(', ')}
                {value.length > 10 && '...'}]
              </div>
            </div>
          )}
        </div>
      )
    }

    if (typeof value === 'string') {
      if (value.length > 50) {
        return (
          <div className="min-w-0 max-w-full">
            <span className="text-xs block cursor-help text-neutral-700 dark:text-neutral-300" title={value}>
              {value.substring(0, 50)}...
            </span>
          </div>
        )
      }
      return (
        <span className="text-xs break-words text-neutral-700 dark:text-neutral-300">
          {value}
        </span>
      )
    }

    if (typeof value === 'object') {
      const jsonString = JSON.stringify(value, null, 1)
      return (
        <div className="min-w-0 max-w-full">
          <pre 
            className="text-[10px] bg-neutral-100 dark:bg-neutral-800 p-1 rounded overflow-hidden whitespace-pre-wrap break-all text-neutral-700 dark:text-neutral-300"
            title={jsonString}
          >
            {jsonString.length > 60 ? `${jsonString.substring(0, 60)}...` : jsonString}
          </pre>
        </div>
      )
    }

    const stringValue = String(value)
    return (
      <span 
        className="text-xs break-words text-neutral-700 dark:text-neutral-300" 
        title={stringValue.length > 30 ? stringValue : undefined}
      >
        {stringValue.length > 30 ? `${stringValue.substring(0, 30)}...` : stringValue}
      </span>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-neutral-50 via-white to-neutral-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      {/* Ultra Compact Search Form */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm flex-shrink-0 shadow-sm">
        {/* Minimal Header with Status */}
        <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                  <Search className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Search</h2>
                </div>
              </div>
              
              {/* Compact Active Search Indicators */}
              <div className="flex items-center gap-1.5">
                {textQuery && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                    <Type className="h-2.5 w-2.5 mr-0.5" />
                    Text
                  </Badge>
                )}
                {vectorQuery && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800">
                    <Zap className="h-2.5 w-2.5 mr-0.5" />
                    Vector
                  </Badge>
                )}
                {selectedCollectionId && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                    {selectedCollectionFriendlyName || collectionInfo?.name || 'Collection'}
                  </Badge>
                )}
                {searchMutation.data && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">
                    {searchMutation.data.data.length} results
              </Badge>
                )}
            </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSavedQueries(!showSavedQueries)}
                className="h-7 px-2 gap-1"
              >
                <History className="h-3 w-3" />
                {savedQueries.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {savedQueries.length}
                  </Badge>
                )}
              </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSearchFormExpanded(!isSearchFormExpanded)}
                className="h-7 px-2 gap-1"
            >
              {isSearchFormExpanded ? (
                <>
                    <ChevronDown className="h-3 w-3" />
                    <span className="text-xs">Hide</span>
                </>
              ) : (
                <>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-xs">Show</span>
                </>
              )}
            </Button>
            </div>
          </div>
        </div>

        {/* Ultra Compact Search Form */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isSearchFormExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="px-3 pb-2 space-y-2">
            {/* Main Search Fields - Ultra Compact */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {/* Minimal Text Search */}
              <TooltipProvider>
                <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-2 bg-white dark:bg-neutral-900">
                  <div className="flex items-center gap-1 mb-1.5">
                    <Type className="h-3 w-3 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">Text</span>
                  </div>
                  <div className="space-y-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                <Select value={selectedTextColumn} onValueChange={setSelectedTextColumn}>
                            <SelectTrigger className="h-6 text-[10px]">
                              <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                              {textColumns.length > 0 ? (
                                textColumns.map((column) => (
                      <SelectItem key={column.column_name} value={column.column_name}>
                                    <span className="text-[10px]">{column.column_name}</span>
                      </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none" disabled>No columns</SelectItem>
                              )}
                  </SelectContent>
                </Select>
              </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        <p>Text column to search in</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="relative">
                <Input
                  id="text-query"
                            placeholder="Search query..."
                  value={textQuery}
                  onChange={(e) => setTextQuery(e.target.value)}
                  disabled={searchMutation.isPending}
                            className="h-6 pr-6 text-[10px]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (textQuery || vectorQuery)) {
                                handleSearch()
                              }
                            }}
                          />
                          {textQuery && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-6 w-6 p-0"
                              onClick={() => setTextQuery('')}
                            >
                              <X className="h-2.5 w-2.5" />
                            </Button>
                          )}
              </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        <p>Text to search for (press Enter to search)</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </TooltipProvider>

              {/* Minimal Vector Search */}
              <TooltipProvider>
                <div className="border border-violet-200 dark:border-violet-800 rounded-lg p-2 bg-white dark:bg-neutral-900">
                  <div className="flex items-center gap-1 mb-1.5">
                    <Zap className="h-3 w-3 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300">Vector</span>
                    {collectionInfo && (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 ml-auto">
                        {collectionInfo.dimensions}D
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="grid grid-cols-2 gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                  <Select value={selectedVectorColumn} onValueChange={setSelectedVectorColumn}>
                              <SelectTrigger className="h-6 text-[10px]">
                                <SelectValue placeholder="Column..." />
                    </SelectTrigger>
                    <SelectContent>
                                {vectorColumns.length > 0 ? (
                                  vectorColumns.map((column) => (
                        <SelectItem key={column} value={column}>
                                      <span className="text-[10px]">{column}</span>
                        </SelectItem>
                                  ))
                                ) : (
                                  <SelectItem value="none" disabled>None</SelectItem>
                                )}
                    </SelectContent>
                  </Select>
                </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          <p>Vector/embedding column</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                  <Select value={metric} onValueChange={(value) => setMetric(value as any)}>
                              <SelectTrigger className="h-6 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                                <SelectItem value="cosine"><span className="text-[10px]">Cosine</span></SelectItem>
                                <SelectItem value="l2"><span className="text-[10px]">L2</span></SelectItem>
                                <SelectItem value="ip"><span className="text-[10px]">IP</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p>Distance metric (Cosine, L2, Inner Product)</p>
                        </TooltipContent>
                      </Tooltip>
              </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="relative">
                <Input
                  id="vector-query"
                            placeholder={collectionInfo ? `${collectionInfo.dimensions} values` : "[0.1, 0.2]"}
                  value={vectorQuery}
                  onChange={(e) => setVectorQuery(e.target.value)}
                  disabled={searchMutation.isPending}
                            className="h-6 pr-6 font-mono text-[10px]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (textQuery || vectorQuery)) {
                                handleSearch()
                              }
                            }}
                          />
                          {vectorQuery && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-6 w-6 p-0"
                              onClick={() => setVectorQuery('')}
                            >
                              <X className="h-2.5 w-2.5" />
                            </Button>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        <p>Vector values: [0.1, 0.2] or 0.1, 0.2 (press Enter to search)</p>
                      </TooltipContent>
                    </Tooltip>
                    {(() => {
                      const tableEntry = selectedTable ? tables.find(t => t.schema === selectedTable.schema && t.name === selectedTable.name) : null
                      const hasMultipleCollections = tableEntry?.collections && tableEntry.collections.length > 1
                      
                      if (hasMultipleCollections && !selectedCollectionId) {
                        return (
                          <div className="flex items-center gap-1 text-[8px] text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-1 py-0.5">
                            <Filter className="h-2 w-2 flex-shrink-0" />
                            <span>Select collection to avoid dimension mismatch</span>
                          </div>
                        )
                      }
                      
                      if (selectedCollectionId) {
                        return (
                          <div className="flex items-center gap-1 text-[8px] text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded px-1 py-0.5">
                            <Filter className="h-2 w-2 flex-shrink-0" />
                            <span>Filtered to collection</span>
                          </div>
                        )
                      }
                      
                      return null
                    })()}
              </div>
                </div>
              </TooltipProvider>
        </div>

            {/* Minimal Advanced Options */}
            <TooltipProvider>
              <div className="border border-neutral-200 dark:border-neutral-700 rounded overflow-hidden bg-neutral-50/50 dark:bg-neutral-800/30">
                <button
                  onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
                  className="w-full px-2 py-1 flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <SlidersHorizontal className="h-2.5 w-2.5 text-neutral-600 dark:text-neutral-400" />
                    <span className="font-medium text-[10px] text-neutral-700 dark:text-neutral-300">Advanced</span>
                    {(sortBy !== 'none' || limit !== 10) && (
                      <Badge variant="secondary" className="text-[8px] px-0.5 py-0">•</Badge>
                    )}
                  </div>
                  {isAdvancedExpanded ? (
                    <ChevronDown className="h-2.5 w-2.5 text-neutral-500" />
                  ) : (
                    <ChevronRight className="h-2.5 w-2.5 text-neutral-500" />
                  )}
                </button>
                
                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  isAdvancedExpanded ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  <div className="px-2 pb-1.5 pt-0.5 bg-white dark:bg-neutral-900">
                    <div className="grid grid-cols-3 gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
              <Select value={limit.toString()} onValueChange={(value) => setLimit(Number(value))}>
                              <SelectTrigger className="h-6 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                                <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p>Result limit (max rows)</p>
                        </TooltipContent>
                      </Tooltip>
            
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
              <Select value={sortBy} onValueChange={setSortBy}>
                              <SelectTrigger className="h-6 text-[10px]">
                                <SelectValue placeholder="Sort..." />
                </SelectTrigger>
                <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                  {metadata?.columns.map((column) => (
                    <SelectItem key={column.column_name} value={column.column_name}>
                      {column.column_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p>Sort by column</p>
                        </TooltipContent>
                      </Tooltip>

            {sortBy && sortBy !== 'none' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}>
                                <SelectTrigger className="h-6 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                                  <SelectItem value="asc"><span className="text-[10px]">↑ ASC</span></SelectItem>
                                  <SelectItem value="desc"><span className="text-[10px]">↓ DESC</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p>Sort order</p>
                          </TooltipContent>
                        </Tooltip>
            )}
          </div>
                  </div>
                </div>
              </div>
            </TooltipProvider>

            {/* Minimal Action Buttons */}
            <div className="flex items-center justify-end gap-1.5">
            <Button 
              variant="outline" 
                onClick={handleClear}
                disabled={searchMutation.isPending}
                className="gap-1 h-7 text-[10px] px-2"
              >
                <X className="h-2.5 w-2.5" />
              Clear
            </Button>
            <Button 
              onClick={handleSearch}
              disabled={searchMutation.isPending || (!textQuery && !vectorQuery)}
                className="gap-1 h-7 text-[10px] px-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white"
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-2.5 w-2.5" />
                    Search
                  </>
                )}
            </Button>
        </div>
          </div>
        </div>
        
        {/* Improved Saved Queries Panel */}
        {showSavedQueries && (
          <div className="px-6 pb-6 border-t border-neutral-200 dark:border-neutral-800 pt-4">
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden bg-white dark:bg-neutral-900 shadow-sm">
              <div className="bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-800 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                    <h4 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">Query History</h4>
                    {savedQueries.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {savedQueries.length} saved
                      </Badge>
                    )}
                  </div>
                <div className="flex items-center gap-2">
                  <Input
                      placeholder="Name this query..."
                    value={queryName}
                    onChange={(e) => setQueryName(e.target.value)}
                      className="h-8 w-56"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveQuery()}
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveQuery}
                    disabled={!textQuery && !vectorQuery}
                      className="h-8 gap-1.5"
                  >
                      <Save className="h-3.5 w-3.5" />
                      Save
                  </Button>
                  </div>
                </div>
              </div>
              
              <div className="p-4">
              {savedQueries.length === 0 ? (
                  <div className="text-center py-8 text-neutral-500">
                    <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-sm">No saved queries yet</p>
                  <p className="text-xs mt-1">Save your searches for quick access later</p>
                </div>
              ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                  {savedQueries.map((query) => (
                    <div
                      key={query.id}
                        className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all group"
                    >
                      <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm mb-1.5 text-neutral-900 dark:text-neutral-100">{query.name}</div>
                          <div className="flex items-center gap-2 text-xs text-neutral-500 flex-wrap">
                          {query.textQuery && (
                              <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                <Type className="h-3 w-3 mr-1" />
                                {query.textQuery.substring(0, 20)}{query.textQuery.length > 20 ? '...' : ''}
                            </Badge>
                          )}
                          {query.vectorQuery && (
                              <Badge variant="outline" className="text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800">
                                <Zap className="h-3 w-3 mr-1" />
                                Vector
                              </Badge>
                          )}
                            <span className="text-neutral-400">•</span>
                            <span>{query.metric}</span>
                            <span className="text-neutral-400">•</span>
                            <span>limit {query.limit}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                            className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30"
                          onClick={() => handleLoadQuery(query)}
                          title="Load query"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
                          onClick={() => handleDeleteQuery(query.id)}
                          title="Delete query"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Improved Results Section */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {searchMutation.data && (
          <div className="h-full flex flex-col p-6">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
                  <Check className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Search Results</h3>
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <span>{searchMutation.data.data.length} {searchMutation.data.data.length === 1 ? 'result' : 'results'}</span>
                    {searchMutation.data.query_info.total_available_in_collection && (
                      <>
                        <span className="text-neutral-400">•</span>
                        <span>of {searchMutation.data.query_info.total_available_in_collection} total</span>
                      </>
                    )}
                {selectedCollectionId && (
                      <>
                        <span className="text-neutral-400">•</span>
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800">
                          {selectedCollectionFriendlyName || collectionInfo?.name}
                  </Badge>
                      </>
                )}
              </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {searchMutation.data.query_info.vector_query_provided && (
                  <Badge className="bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Similarity scores included
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const csv = [
                      Object.keys(searchMutation.data.data[0] || {}).join(','),
                      ...searchMutation.data.data.map(row => 
                        Object.values(row).map(v => 
                          typeof v === 'object' ? JSON.stringify(v) : String(v)
                        ).join(',')
                      )
                    ].join('\n')
                    copyToClipboard(csv, 'export-csv')
                  }}
                  className="gap-2"
                >
                  {copiedStates.has('export-csv') ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Export CSV
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Compact Results Table */}
              {searchMutation.data.data.length > 0 ? (
              <div className="flex-1 min-h-0 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 overflow-hidden shadow-md">
                <div className="h-full overflow-auto custom-scrollbar">
                  <Table>
                    <TableHeader className="sticky top-0 bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-800 border-b border-neutral-200 dark:border-neutral-700 z-10">
                      <TableRow className="hover:bg-transparent">
                        {Object.keys(searchMutation.data.data[0] || {}).map((column) => (
                          <TableHead key={column} className="font-semibold text-xs whitespace-nowrap min-w-[120px] max-w-[300px] px-3 py-2">
                            <div className="flex items-center gap-1.5" title={column}>
                              <span className="font-mono text-neutral-700 dark:text-neutral-300">{column}</span>
                              {column === 'similarity_score' && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300">
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
                        <TableRow 
                          key={index} 
                          className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 border-b border-neutral-100 dark:border-neutral-800 transition-colors"
                        >
                          {Object.entries(row).map(([column, value]) => (
                            <TableCell key={column} className="min-w-[120px] max-w-[300px] px-3 py-2 align-top">
                              <div className="overflow-hidden">
                                {column === 'similarity_score' ? (
                                  <div className="flex items-center gap-2">
                                    <Badge 
                                      className={`font-mono text-xs font-semibold px-2 py-0.5 ${
                                        typeof value === 'number' && value > 0.8 
                                          ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800' 
                                          : typeof value === 'number' && value > 0.5 
                                          ? 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800'
                                          : 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                                      }`}
                                    >
                                      {typeof value === 'number' ? value.toFixed(4) : String(value)}
                                    </Badge>
                                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                      {typeof value === 'number' && value > 0.8 ? 'High' : 
                                       typeof value === 'number' && value > 0.5 ? 'Med' : 'Low'}
                                    </span>
                                  </div>
                                ) : (
                                  formatCellValue(value, index, column, row)
                                )}
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
              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-900">
                <div className="text-center py-12">
                  <Search className="h-16 w-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
                  <p className="text-lg font-medium text-neutral-600 dark:text-neutral-400 mb-1">No results found</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-500">Try adjusting your search criteria</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {searchMutation.error && (
            <div className="p-6">
              <div className="border-2 border-red-200 dark:border-red-800 rounded-xl p-6 bg-red-50 dark:bg-red-900/20">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                    <X className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-red-900 dark:text-red-100 mb-1">Search Error</h4>
                    <p className="text-sm text-red-700 dark:text-red-300">
                  {searchMutation.error.message}
                </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!searchMutation.data && !searchMutation.error && !searchMutation.isPending && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 dark:from-blue-900/30 dark:to-violet-900/30 flex items-center justify-center mx-auto mb-6">
                  <Search className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Ready to Search</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                  Enter a text query or vector values above to search through your data
                </p>
                <div className="flex items-center justify-center gap-4 text-xs text-neutral-400">
                  <div className="flex items-center gap-1">
                    <Type className="h-3.5 w-3.5" />
                    <span>Text search</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    <span>Vector similarity</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Filter className="h-3.5 w-3.5" />
                    <span>Advanced filters</span>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Vector Dialog */}
      <Dialog open={!!selectedVector} onOpenChange={() => setSelectedVector(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Vector Values</DialogTitle>
          </DialogHeader>
          {selectedVector && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {selectedVector.length} dimensions
                </Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  className={`transition-colors ${
                    copiedStates.has('search-dialog-vector-full') ? 'bg-green-100 text-green-700 border-green-300' : ''
                  }`}
                  onClick={() => copyToClipboard(JSON.stringify(selectedVector), 'search-dialog-vector-full')}
                >
                  {copiedStates.has('search-dialog-vector-full') ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copiedStates.has('search-dialog-vector-full') ? 'Copied!' : 'Copy Array'}
                </Button>
              </div>
              
              <div className="space-y-3">
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  Vector values (showing all {selectedVector.length} dimensions):
                </div>
                
                {/* Improved grid with better spacing and readability */}
                <div className="max-h-80 overflow-auto border dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800">
                  <div className="grid grid-cols-4 gap-3 p-4 font-mono text-xs">
                    {selectedVector.map((value, index) => (
                      <div key={index} className="flex flex-col items-center p-3 bg-white dark:bg-neutral-900 rounded border dark:border-neutral-700 hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-200 cursor-default">
                        <div className="text-xs text-neutral-400 mb-1 font-semibold">
                          [{index}]
                        </div>
                        <div className="font-medium text-neutral-800 text-center break-all">
                          {typeof value === 'number' ? value.toFixed(6) : value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Additional format options */}
                <div className="flex items-center justify-center pt-2 border-t">
                  <div className="text-xs text-neutral-500">
                    Hover over values to highlight • Values shown with 6 decimal precision
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
