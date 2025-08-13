'use client'

import { useState, useMemo } from 'react'
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
import { ChevronLeft, ChevronRight, Eye, Download, MoreVertical, Copy, Check } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface TableDataProps {
  schema: string
  table: string
  metadata: TableMetadataType | null | undefined
}

export function TableData({ schema, table, metadata }: TableDataProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedVector, setSelectedVector] = useState<number[] | null>(null)
  const [sortBy, setSortBy] = useState<string>('none')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [copiedStates, setCopiedStates] = useState<Set<string>>(new Set())
  
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

  const copyToClipboard = async (text: string, feedbackKey?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // You could add a toast notification here if you have a toast system
      console.log('Vector copied to clipboard')
      
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
        console.log('Vector copied to clipboard (fallback)')
        
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
      
      // Debug: Log the unique identifier (remove this in production)
      console.log(`Copy key for ${columnName}:`, copyFeedbackKey, 'Available fields:', Object.keys(rowData || {}))
      
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

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Controls - Fixed Header */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-200 bg-white flex-shrink-0">
        <div className="flex items-center space-x-4">
          <h3 className="font-medium text-neutral-900 flex items-center flex-wrap gap-2">
            <span>Table Data</span>
            {selectedCollectionName && <span className="text-neutral-400">›</span>}
            {selectedCollectionName && (
              <span className="text-blue-700 font-medium" title={selectedCollectionName}>{selectedCollectionName}</span>
            )}
          </h3>
          <Badge variant="secondary" title={selectedCollectionId ? `Collection ID: ${selectedCollectionId}` : undefined}>
            {data.total_count.toLocaleString()} {selectedCollectionId ? 'collection rows' : 'total rows'}
          </Badge>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-neutral-600">Rows per page:</span>
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
            <Label htmlFor="sort-by" className="text-sm text-neutral-600">Sort By:</Label>
            <Select value={sortBy} onValueChange={(value) => {
              setSortBy(value)
              setCurrentPage(1) // Reset to first page when sorting changes
            }}>
              <SelectTrigger className="w-40 h-8">
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
              <Label htmlFor="sort-order" className="text-sm text-neutral-600">Order:</Label>
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

          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Table Container - Scrollable */}
      <div className="flex-1 overflow-hidden bg-white">
        <div className="h-full w-full overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white border-b z-10">
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column} className="font-medium whitespace-nowrap min-w-[150px] max-w-[250px] px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm truncate">{column}</span>
                      {isVectorColumn(column) && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          vector
                        </Badge>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row, index) => (
                <TableRow key={index} className="hover:bg-neutral-50">
                  {columns.map((column) => (
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
      <div className="flex items-center justify-between p-4 border-t border-neutral-200 bg-white flex-shrink-0">
        <div className="text-sm text-neutral-600">
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
            <span className="text-sm text-neutral-600">Page</span>
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
            <span className="text-sm text-neutral-600">of {totalPages}</span>
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
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {selectedVector.length} dimensions
                </Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  className={`transition-colors ${
                    copiedStates.has('dialog-vector-full') ? 'bg-green-100 text-green-700 border-green-300' : ''
                  }`}
                  onClick={() => copyToClipboard(JSON.stringify(selectedVector), 'dialog-vector-full')}
                >
                  {copiedStates.has('dialog-vector-full') ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copiedStates.has('dialog-vector-full') ? 'Copied!' : 'Copy Array'}
                </Button>
              </div>
              
              <div className="space-y-3">
                <div className="text-sm text-neutral-600">
                  Vector values (showing all {selectedVector.length} dimensions):
                </div>
                
                {/* Improved grid with better spacing and readability */}
                <div className="max-h-80 overflow-auto border rounded-lg bg-neutral-50">
                  <div className="grid grid-cols-4 gap-3 p-4 font-mono text-xs">
                    {selectedVector.map((value, index) => (
                      <div key={index} className="flex flex-col items-center p-3 bg-white rounded border hover:bg-blue-50 hover:border-blue-200 transition-all duration-200 cursor-default">
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
