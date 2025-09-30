'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { apiClient } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface ExportButtonProps {
  schema: string
  table: string
  collectionId?: string
  searchParams?: any // Search params if exporting search results
  type: 'data' | 'search'
  disabled?: boolean
}

export function ExportButton({
  schema,
  table,
  collectionId,
  searchParams,
  type,
  disabled = false,
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const { toast } = useToast()

  const handleExport = async (format: 'json' | 'csv' | 'jsonl' | 'markdown') => {
    setIsExporting(true)

    try {
      let blob: Blob

      if (type === 'search' && searchParams) {
        blob = await apiClient.exportSearchResults(schema, table, searchParams, format)
      } else {
        blob = await apiClient.exportTableData(schema, table, format, 1, 1000, collectionId)
      }

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      
      const extension = format === 'markdown' ? 'md' : format
      const timestamp = new Date().toISOString().split('T')[0]
      a.download = `${schema}_${table}_${timestamp}.${extension}`
      
      document.body.appendChild(a)
      a.click()
      
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Export successful',
        description: `Data exported as ${format.toUpperCase()}`,
        variant: 'success',
      })
    } catch (error) {
      console.error('Export failed:', error)
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Failed to export data',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || isExporting}>
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('json')}>
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('jsonl')}>
          Export as JSON Lines
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('markdown')}>
          Export as Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
