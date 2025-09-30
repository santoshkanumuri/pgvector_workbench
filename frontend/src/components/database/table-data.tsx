'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { TableMetadata as TableMetadataType } from '@/lib/types'
import { useDatabaseStore } from '@/stores/database'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, Eye, MoreVertical, Copy, Check, FileText, Palette, Filter, X, Download, Columns } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import TokenVisualizer from './token-visualizer'
import { tokenizeText } from '@/lib/tokenizer'

interface TableDataProps {
  schema: string
  table: string
  metadata: TableMetadataType | null | undefined
}

export function TableData({ schema, table, metadata }: TableDataProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedVector, setSelectedVector] = useState<number[] | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null)
  const [showTokenVisualizer, setShowTokenVisualizer] = useState(false)
  const [selectedJson, setSelectedJson] = useState<any>(null)
  const [selectedJsonColumnName, setSelectedJsonColumnName] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('none')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [copiedStates, setCopiedStates] = useState<Set<string>>(new Set())
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [showColumnManager, setShowColumnManager] = useState(false)
  
  const { selectedCollectionId, tables } = useDatabaseStore()
  const selectedCollectionName = useMemo(() => {
    const tableEntry = tables.find(t => t.schema === schema && t.name === table)
    if (!tableEntry || !selectedCollectionId) return null
    return tableEntry.collections?.find(c => c.id === selectedCollectionId)?.name || null
  }, [tables, schema, table, selectedCollectionId])

  const { data, isLoading } = useQuery({
    queryKey: ['table-data', schema, table, currentPage, pageSize, sortBy, sortOrder, selectedCollectionId],
    queryFn: () => apiClient.getTableData(
      schema, 
      table, 
      currentPage, 
      pageSize,
      sortBy !== 'none' ? sortBy : undefined,
      sortOrder,
      selectedCollectionId || undefined
    ),
    enabled: !!(schema && table),
  })





  // JSON syntax highlighting function
  const formatJsonWithColors = (obj: any): React.ReactElement => {
    const formatValue = (value: any, depth: number = 0): React.ReactElement => {
      const indent = '  '.repeat(depth)
      
      if (value === null) {
        return <span className="text-neutral-500">null</span>
      }
      
      if (typeof value === 'boolean') {
        return <span className="text-orange-400">{value.toString()}</span>
      }
      
      if (typeof value === 'number') {
        return <span className="text-blue-400">{value}</span>
      }
      
      if (typeof value === 'string') {
        return <span className="text-green-400">"{value}"</span>
      }
      
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return <span>[]</span>
        }
        
        return (
          <>
            <span>[</span>
            {'\n'}
            {value.map((item, index) => (
              <span key={index}>
                {indent}  {formatValue(item, depth + 1)}
                {index < value.length - 1 ? ',' : ''}
                {'\n'}
              </span>
            ))}
            {indent}<span>]</span>
          </>
        )
      }
      
      if (typeof value === 'object') {
        const entries = Object.entries(value)
        if (entries.length === 0) {
          return <span>{'{}'}</span>
        }
        
        return (
          <>
            <span>{'{'}</span>
            {'\n'}
            {entries.map(([key, val], index) => (
              <span key={key}>
                {indent}  <span className="text-cyan-300">"{key}"</span>: {formatValue(val, depth + 1)}
                {index < entries.length - 1 ? ',' : ''}
                {'\n'}
              </span>
            ))}
            {indent}<span>{'}'}</span>
          </>
        )
      }
      
      return <span>{String(value)}</span>
    }
    
    return <>{formatValue(obj)}</>
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

  const formatCellValue = (value: any, columnName: string, isVector: boolean = false, rowData?: any, rowIndex?: number) => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 italic">null</span>
    }

    // Enhanced vector detection - check if it's marked as vector OR if it's an array of numbers that looks like a vector
    const isActuallyVector = isVector || (
      Array.isArray(value) && 
      value.length > 0 && 
      value.every(v => typeof v === 'number') &&
      (value.length >= 50 || isVectorColumn(columnName)) // Either has many dimensions or column name suggests it's a vector
    )

    if (isActuallyVector && Array.isArray(value)) {
      // Create a unique identifier using UUID if available, otherwise use row index and column
      const uniqueId = rowData?.id || rowData?.uuid || rowData?._id || `row-${rowIndex}`
      const copyFeedbackKey = `table-vector-${uniqueId}-${columnName}`
      const isCopied = copiedStates.has(copyFeedbackKey)
      

      
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
                className={`h-6 px-2 flex-shrink-0 transition-colors ${
                  isCopied ? 'bg-green-100 text-green-700' : ''
                }`}
                onClick={() => copyToClipboard(JSON.stringify(value), copyFeedbackKey)}
                title={isCopied ? "Copied!" : "Copy vector to clipboard"}
              >
                {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 flex-shrink-0"
                onClick={() => setSelectedVector(value)}
                title="View in dialog"
              >
                <Eye className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )
    }

    if (typeof value === 'string') {
      // Check if this is a JSON column with stringified JSON
      if (isJsonColumn(columnName)) {
        try {
          const parsedJson = JSON.parse(value)
          if (typeof parsedJson === 'object' && parsedJson !== null) {
            // Handle as JSON object
            const uniqueId = rowData?.id || rowData?.uuid || rowData?._id || `row-${rowIndex}`
            const copyFeedbackKey = `table-json-${uniqueId}-${columnName}`
            const isCopied = copiedStates.has(copyFeedbackKey)
            
            return (
              <div className="space-y-2 min-w-0 max-w-full">
                {/* Header with JSON info and controls */}
                <div className="flex items-center space-x-2 min-w-0">
                  <Badge variant="outline" className="text-xs flex-shrink-0 bg-purple-50 text-purple-700 border-purple-200">
                    JSON
                  </Badge>
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-6 px-2 flex-shrink-0 transition-colors ${
                        isCopied ? 'bg-green-100 text-green-700' : ''
                      }`}
                      onClick={() => copyToClipboard(JSON.stringify(parsedJson, null, 2), copyFeedbackKey)}
                      title={isCopied ? "Copied!" : "Copy JSON to clipboard"}
                    >
                      {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 flex-shrink-0"
                      onClick={() => {
                        setSelectedJson(parsedJson)
                        setSelectedJsonColumnName(columnName)
                      }}
                      title="View JSON"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {/* Preview of JSON content */}
                <div className="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                  <pre className="bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 p-1 rounded overflow-hidden whitespace-pre-wrap break-all">
                    {value.length > 80 ? `${value.substring(0, 80)}...` : value}
                  </pre>
                </div>
              </div>
            )
          }
        } catch (e) {
          // Not valid JSON, fall through to regular string handling
        }
      }
      
      // Check if this is a document field and it has substantial content
      if (isDocumentColumn(columnName) && value.length > 20) {
        // Create a unique identifier for this document field
        const uniqueId = rowData?.id || rowData?.uuid || rowData?._id || `row-${rowIndex}`
        const copyFeedbackKey = `table-document-${uniqueId}-${columnName}`
        const isCopied = copiedStates.has(copyFeedbackKey)
        
        return (
          <div className="space-y-2 min-w-0 max-w-full">
            {/* Header with document info and controls */}
            <div className="flex items-center space-x-2 min-w-0">
              <Badge variant="outline" className="text-xs flex-shrink-0 bg-green-50 text-green-700 border-green-200">
                Document
              </Badge>
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 px-2 flex-shrink-0 transition-colors ${
                    isCopied ? 'bg-green-100 text-green-700' : ''
                  }`}
                  onClick={() => copyToClipboard(value, copyFeedbackKey)}
                  title={isCopied ? "Copied!" : "Copy document to clipboard"}
                >
                  {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 flex-shrink-0"
                  onClick={() => setSelectedDocument(value)}
                  title="View document"
                >
                  <Eye className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {/* Preview of document content */}
            <div className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
              {value.length > 100 ? `${value.substring(0, 100)}...` : value}
            </div>
          </div>
        )
      }
      
      // Regular string handling (unchanged)
      if (value.length > 50) {
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
      
      // Check if this is a JSON/metadata column that should have enhanced viewing
      if (isJsonColumn(columnName)) {
        const uniqueId = rowData?.id || rowData?.uuid || rowData?._id || `row-${rowIndex}`
        const copyFeedbackKey = `table-json-${uniqueId}-${columnName}`
        const isCopied = copiedStates.has(copyFeedbackKey)
        
        return (
          <div className="space-y-2 min-w-0 max-w-full">
            {/* Header with JSON info and controls */}
            <div className="flex items-center space-x-2 min-w-0">
              <Badge variant="outline" className="text-xs flex-shrink-0 bg-purple-50 text-purple-700 border-purple-200">
                JSON
              </Badge>
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 px-2 flex-shrink-0 transition-colors ${
                    isCopied ? 'bg-green-100 text-green-700' : ''
                  }`}
                  onClick={() => copyToClipboard(JSON.stringify(value, null, 2), copyFeedbackKey)}
                  title={isCopied ? "Copied!" : "Copy JSON to clipboard"}
                >
                  {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 flex-shrink-0"
                  onClick={() => {
                    setSelectedJson(value)
                    setSelectedJsonColumnName(columnName)
                  }}
                  title="View JSON"
                >
                  <Eye className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {/* Preview of JSON content */}
            <div className="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
              <pre className="bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 p-1 rounded overflow-hidden whitespace-pre-wrap break-all">
                {jsonString.length > 80 ? `${jsonString.substring(0, 80)}...` : jsonString}
              </pre>
            </div>
          </div>
        )
      }
      
      // Default object handling for non-JSON columns
      return (
        <div className="min-w-0 max-w-full">
          <pre 
            className="text-xs bg-neutral-100 p-1 rounded overflow-hidden whitespace-pre-wrap break-all"
            title={jsonString}
          >
            {jsonString.length > 100 ? `${jsonString.substring(0, 100)}...` : jsonString}
          </pre>
        </div>
      )
    }

    const stringValue = String(value)
    return (
      <span 
        className="text-sm break-words" 
        title={stringValue.length > 30 ? stringValue : undefined}
      >
        {stringValue.length > 30 ? `${stringValue.substring(0, 30)}...` : stringValue}
      </span>
    )
  }

  const isVectorColumn = (columnName: string) => {
    // Check if it's in the vector_info metadata (primary check)
    if (metadata?.vector_info && columnName in metadata.vector_info) {
      return true
    }
    
    // Also check for common vector/embedding column names
    const vectorColumnNames = ['embedding', 'embeddings', 'vector', 'vectors', 'features']
    return vectorColumnNames.some(name => 
      columnName.toLowerCase().includes(name.toLowerCase())
    )
  }
  
  const isDocumentColumn = (columnName: string) => {
    // Check for common document column names
    const documentColumnNames = ['document', 'content', 'text', 'page_content', 'body']
    return documentColumnNames.some(name => 
      columnName.toLowerCase().includes(name.toLowerCase())
    )
  }
  
  const isJsonColumn = (columnName: string) => {
    // Check for common JSON/metadata column names
    const jsonColumnNames = ['metadata', 'cmetadata', 'meta', 'json_data', 'properties', 'attributes']
    return jsonColumnNames.some(name => 
      columnName.toLowerCase().includes(name.toLowerCase())
    )
  }

  const totalPages = data ? Math.ceil(data.total_count / pageSize) : 0

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          {/* Header skeleton */}
          <div className="flex justify-between items-center">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
          
          {/* Table skeleton */}
          <div className="border rounded-lg">
            <div className="p-4 border-b">
              <div className="flex space-x-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-20" />
                ))}
              </div>
            </div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="p-4 border-b last:border-b-0">
                <div className="flex space-x-4">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-20" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <MoreVertical className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">No Data</h3>
          <p className="text-sm text-neutral-500">This table appears to be empty</p>
        </div>
      </div>
    )
  }

  const columns = Object.keys(data.data[0] || {})
  const visibleColumns = columns.filter(col => !hiddenColumns.has(col))

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-950">
      {/* Controls - Fixed Header */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-gradient-to-r from-white to-slate-50 dark:from-neutral-900 dark:to-neutral-950 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100 flex items-center flex-wrap gap-2">
            <span>Table Data</span>
            {selectedCollectionName && <span className="text-neutral-400 dark:text-neutral-500">›</span>}
            {selectedCollectionName && (
              <span className="text-blue-700 dark:text-blue-400 font-medium" title={selectedCollectionName}>{selectedCollectionName}</span>
            )}
          </h3>
          <Badge variant="secondary" title={selectedCollectionId ? `Collection ID: ${selectedCollectionId}` : undefined}>
            {data.total_count.toLocaleString()} {selectedCollectionId ? 'collection rows' : 'total rows'}
          </Badge>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-neutral-600 dark:text-neutral-400 dark:text-neutral-300">Rows per page:</span>
            <Select value={pageSize.toString()} onValueChange={(value) => {
              setPageSize(Number(value))
              setCurrentPage(1)
            }}>
              <SelectTrigger className="w-20 h-8">
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
            <Label htmlFor="sort-by" className="text-sm text-neutral-600 dark:text-neutral-400 dark:text-neutral-300">
              Sort By{selectedCollectionId ? ' (Collection)' : ''}:
            </Label>
            <Select value={sortBy} onValueChange={(value) => {
              setSortBy(value)
              setCurrentPage(1) // Reset to first page when sorting changes
            }}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue placeholder="No sorting" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No sorting</SelectItem>
                {/* First try to use metadata columns */}
                {metadata?.columns && metadata.columns.length > 0 ? (
                  metadata.columns.map((column) => (
                    <SelectItem key={column.column_name} value={column.column_name}>
                      {column.column_name}
                    </SelectItem>
                  ))
                ) : (
                  /* Fallback: use columns from actual data if available */
                  data?.data?.[0] ? (
                    Object.keys(data.data[0]).map((columnName) => (
                      <SelectItem key={columnName} value={columnName}>
                        {columnName}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="debug-info" disabled>
                      {!metadata ? 'Loading metadata...' : 
                       !metadata.columns ? 'Metadata loaded but no columns property found' :
                       metadata.columns.length === 0 ? 'Metadata loaded but columns array is empty - using data fallback' :
                       'Unknown state'}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {sortBy && sortBy !== 'none' && (
            <div className="flex items-center space-x-2">
              <Label htmlFor="sort-order" className="text-sm text-neutral-600 dark:text-neutral-400">Order:</Label>
              <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}>
                <SelectTrigger className="w-20 h-8">
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
      </div>
        
        {/* Quick Actions Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowColumnManager(true)}
              className="h-8 hover-lift"
            >
              <Columns className="h-3.5 w-3.5 mr-2" />
              Manage Columns
            </Button>
            
            {Object.keys(columnFilters).length > 0 && (
              <Badge variant="secondary" className="cursor-pointer hover:bg-neutral-200" onClick={() => setColumnFilters({})}>
                {Object.keys(columnFilters).length} filter{Object.keys(columnFilters).length > 1 ? 's' : ''} active
                <X className="h-3 w-3 ml-1" />
              </Badge>
            )}
            
            {hiddenColumns.size > 0 && (
              <Badge variant="outline" className="text-xs">
                {hiddenColumns.size} column{hiddenColumns.size > 1 ? 's' : ''} hidden
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="font-mono">
                {visibleColumns.length}/{columns.length} cols
              </Badge>
              <Badge variant="outline" className="font-mono">
                {data.data.length} rows
              </Badge>
              {selectedCollectionId && (
                <Badge variant="default" className="bg-blue-600 text-xs">
                  Collection View
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table Container - Scrollable */}
      <div className="flex-1 overflow-hidden bg-white dark:bg-neutral-950">
        <div className="h-full w-full overflow-auto custom-scrollbar">
          <Table>
            <TableHeader className="sticky top-0 bg-white dark:bg-neutral-900 border-b dark:border-neutral-800 z-10">
              <TableRow>
                {visibleColumns.map((column) => (
                  <TableHead key={column} className="font-medium whitespace-nowrap min-w-[150px] max-w-[250px] px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm truncate">{column}</span>
                      {isVectorColumn(column) && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          vector
                        </Badge>
                      )}
                      {isDocumentColumn(column) && (
                        <Badge variant="outline" className="text-xs flex-shrink-0 bg-green-50 text-green-700 border-green-200">
                          document
                        </Badge>
                      )}
                      {isJsonColumn(column) && (
                        <Badge variant="outline" className="text-xs flex-shrink-0 bg-purple-50 text-purple-700 border-purple-200">
                          json
                        </Badge>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row, index) => (
                <TableRow key={index} className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                  {visibleColumns.map((column) => (
                    <TableCell key={column} className="min-w-[150px] max-w-[250px] px-4 py-3 align-top">
                      <div className="overflow-hidden">
                        {formatCellValue(row[column], column, isVectorColumn(column), row, index)}
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination - Fixed Footer */}
      <div className="flex items-center justify-between p-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, data.total_count)} of {data.total_count} rows
        </div>
        
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={!data.has_previous}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Page</span>
            <Input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const page = parseInt(e.target.value)
                if (!isNaN(page) && page >= 1 && page <= totalPages) {
                  setCurrentPage(page)
                }
              }}
              className="w-16 h-8 text-center text-sm"
            />
            <span className="text-sm text-neutral-600 dark:text-neutral-400">of {totalPages}</span>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={!data.has_next}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
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
                <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                  {selectedVector.length} dimensions
                </Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  className={`transition-colors ${
                    copiedStates.has('dialog-vector-full') ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-800' : ''
                  }`}
                  onClick={() => copyToClipboard(JSON.stringify(selectedVector), 'dialog-vector-full')}
                >
                  {copiedStates.has('dialog-vector-full') ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copiedStates.has('dialog-vector-full') ? 'Copied!' : 'Copy Array'}
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
                        <div className="font-medium text-neutral-800 dark:text-neutral-200 text-center break-all">
                          {typeof value === 'number' ? value.toFixed(6) : value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Additional format options */}
                <div className="flex items-center justify-center pt-2 border-t">
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Hover over values to highlight • Values shown with 6 decimal precision
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Document Dialog */}
      <Dialog open={!!selectedDocument} onOpenChange={(open) => {
        if (!open) {
          setSelectedDocument(null)
          setShowTokenVisualizer(false)
        }
      }}>
        <DialogContent className="w-[900px] max-w-[calc(100%-2rem)] sm:max-w-none max-h-[80vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Document Content</DialogTitle>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <FileText className="h-3 w-3 mr-1" />
                  Document
                </Badge>
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowTokenVisualizer(!showTokenVisualizer)}
                    className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                  >
                    <Palette className="h-4 w-4 mr-2" />
                    {showTokenVisualizer ? 'Hide' : 'Visualize'} Tokens
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className={`transition-colors ${
                      copiedStates.has('dialog-document-full') ? 'bg-green-100 text-green-700 border-green-300' : ''
                    }`}
                    onClick={() => copyToClipboard(selectedDocument, 'dialog-document-full')}
                  >
                    {copiedStates.has('dialog-document-full') ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    {copiedStates.has('dialog-document-full') ? 'Copied!' : 'Copy Document'}
                  </Button>
                </div>
              </div>
              
              {showTokenVisualizer ? (
                <div className="space-y-3">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400">
                    Token visualization:
                  </div>
                  <div className="h-96 border dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900">
                    <TokenVisualizer 
                      tokens={tokenizeText(selectedDocument)} 
                      theme="light"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-neutral-600 dark:text-neutral-400">
                    Document content:
                  </div>
                  
                  {/* Document content with good readability */}
                  <div className="h-96 overflow-y-auto overflow-x-hidden border dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 p-4">
                    <div className="whitespace-pre-wrap break-words text-sm">
                      {selectedDocument}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Word count info */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-xs text-neutral-500">
                  {selectedDocument.split(/\s+/).filter(Boolean).length} words • {selectedDocument.length} characters • {tokenizeText(selectedDocument).length} tokens
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* JSON Viewer Dialog */}
      <Dialog open={!!selectedJson} onOpenChange={() => {
        setSelectedJson(null)
        setSelectedJsonColumnName('')
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>JSON Data - {selectedJsonColumnName}</DialogTitle>
          </DialogHeader>
          {selectedJson && (
            <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                  {Object.keys(selectedJson).length} {Object.keys(selectedJson).length === 1 ? 'field' : 'fields'}
                </Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  className={`transition-colors ${
                    copiedStates.has('dialog-json-full') ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-800' : ''
                  }`}
                  onClick={() => copyToClipboard(JSON.stringify(selectedJson, null, 2), 'dialog-json-full')}
                >
                  {copiedStates.has('dialog-json-full') ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copiedStates.has('dialog-json-full') ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              
              <div className="flex-1 overflow-auto border dark:border-neutral-700 rounded-lg bg-neutral-900 dark:bg-neutral-950">
                <pre className="p-4 text-sm font-mono overflow-x-auto">
                  <code className="language-json">
                    {formatJsonWithColors(selectedJson)}
                  </code>
                </pre>
              </div>
              
              {/* Info footer */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {Object.keys(selectedJson).length} fields • {JSON.stringify(selectedJson).length} characters
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Column Manager Dialog */}
      <Dialog open={showColumnManager} onOpenChange={setShowColumnManager}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Columns className="h-5 w-5" />
              Manage Columns
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Show or hide columns from the table view
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHiddenColumns(new Set())}
                  disabled={hiddenColumns.size === 0}
                >
                  Show All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHiddenColumns(new Set(columns))}
                  disabled={hiddenColumns.size === columns.length}
                >
                  Hide All
                </Button>
              </div>
            </div>
            
            <div className="border rounded-lg max-h-96 overflow-y-auto custom-scrollbar">
              <div className="divide-y">
                {columns.map((column) => {
                  const isHidden = hiddenColumns.has(column)
                  const isVector = isVectorColumn(column)
                  const isDocument = isDocumentColumn(column)
                  const isJson = isJsonColumn(column)
                  
                  return (
                    <div
                      key={column}
                      className="flex items-center justify-between p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Button
                          variant={isHidden ? "ghost" : "secondary"}
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            const newHidden = new Set(hiddenColumns)
                            if (isHidden) {
                              newHidden.delete(column)
                            } else {
                              newHidden.add(column)
                            }
                            setHiddenColumns(newHidden)
                          }}
                        >
                          {isHidden ? <Eye className="h-3.5 w-3.5 opacity-30" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <span className="font-mono text-sm truncate">{column}</span>
                        <div className="flex gap-1">
                          {isVector && (
                            <Badge variant="secondary" className="text-xs">vector</Badge>
                          )}
                          {isDocument && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700">doc</Badge>
                          )}
                          {isJson && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">json</Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant={isHidden ? "outline" : "default"} className="text-xs">
                        {isHidden ? 'Hidden' : 'Visible'}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700">
                💡 Tip: Hiding large vector or document columns can improve table rendering performance
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
