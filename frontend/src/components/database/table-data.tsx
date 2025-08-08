'use client'

import { useState } from 'react'
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
import { ChevronLeft, ChevronRight, Eye, Download, MoreVertical } from 'lucide-react'
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
  
  const { selectedCollectionId } = useDatabaseStore()

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

  const formatCellValue = (value: any, columnName: string, isVector: boolean = false) => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 italic">null</span>
    }

    if (isVector && Array.isArray(value)) {
      return (
        <div className="flex items-center space-x-2 min-w-0">
          <Badge variant="outline" className="text-xs flex-shrink-0">
            {value.length}D
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 flex-shrink-0"
            onClick={() => setSelectedVector(value)}
          >
            <Eye className="h-3 w-3" />
          </Button>
        </div>
      )
    }

    if (typeof value === 'string') {
      if (value.length > 50) {
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
    return metadata?.vector_info && columnName in metadata.vector_info
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
          <h3 className="font-medium text-neutral-900">
            Table Data
          </h3>
          <Badge variant="secondary">
            {data.total_count.toLocaleString()} total rows
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
                        {formatCellValue(row[column], column, isVectorColumn(column))}
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
                <Badge variant="outline">
                  {selectedVector.length} dimensions
                </Badge>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Copy
                </Button>
              </div>
              
              <div className="grid grid-cols-8 gap-2 max-h-96 overflow-auto p-4 bg-neutral-50 rounded-lg font-mono text-sm">
                {selectedVector.map((value, index) => (
                  <div key={index} className="text-center p-2 bg-white rounded border">
                    <div className="text-xs text-neutral-500 mb-1">{index}</div>
                    <div className="font-medium">
                      {typeof value === 'number' ? value.toFixed(6) : value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
