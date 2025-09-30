'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { TableMetadata as TableMetadataType } from '@/lib/types'
import { useDatabaseStore } from '@/stores/database'
import { useTheme } from 'next-themes'
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import dynamic from 'next/dynamic'

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Layers, TrendingUp, AlertCircle, Download, Play, Info, Eye, GitBranch, Maximize2, Minimize2, X } from 'lucide-react'
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

interface VectorVisualizationProps {
  schema: string
  table: string
  metadata: TableMetadataType | null | undefined
}

interface VisualizationData {
  reduced_vectors: number[][]
  statistics: {
    count: number
    dimensions: number
    mean_norm: number
    std_norm: number
  }
  outlier_indices: number[]
  method: string
  n_components: number
  cluster_labels?: number[]
  original_data?: any[]  // Row data for each point
  total_vectors?: number
}

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
]

export function VectorVisualization({ schema, table, metadata }: VectorVisualizationProps) {
  const [selectedVectorColumn, setSelectedVectorColumn] = useState<string>('')
  const [method, setMethod] = useState<'pca' | 'tsne' | 'umap'>('umap')
  const [dimensions, setDimensions] = useState<2 | 3>(2)
  const [limit, setLimit] = useState(500)
  const [enableClustering, setEnableClustering] = useState(false)
  const [nClusters, setNClusters] = useState(5)
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // Get theme for Plotly colors
  const { theme, systemTheme } = useTheme()
  const isDark = theme === 'dark' || (theme === 'system' && systemTheme === 'dark')
  
  // Get selected collection from store
  const { selectedCollectionId, tables } = useDatabaseStore()
  
  // Get collection name if one is selected
  const selectedCollectionName = useMemo(() => {
    const tableEntry = tables.find(t => t.schema === schema && t.name === table)
    if (!tableEntry || !selectedCollectionId) return null
    return tableEntry.collections?.find(c => c.id === selectedCollectionId)?.name || null
  }, [tables, schema, table, selectedCollectionId])
  
  // Query actual table data to get column names when metadata fails
  const { data: sampleData } = useQuery({
    queryKey: ['table-sample-for-viz', schema, table],
    queryFn: () => apiClient.getTableData(schema, table, 1, 1),
    enabled: !!metadata && (!metadata.columns || metadata.columns.length === 0),
  })

  const vectorColumns = useMemo(() => {
    if (!metadata) return []
    
    const detectedColumns: string[] = []
    
    // Method 1: Check vector_info (primary method)
    if (metadata.vector_info && Object.keys(metadata.vector_info).length > 0) {
      detectedColumns.push(...Object.keys(metadata.vector_info))
    }
    
    // Method 2: Check columns for vector type
    if (metadata.columns && metadata.columns.length > 0) {
      const vectorColsFromSchema = metadata.columns
        .filter(col => {
          // Check multiple conditions for vector columns
          return (
            // Standard pgvector type
            (col.data_type === 'USER-DEFINED' && col.udt_name === 'vector') ||
            // Sometimes reported as ARRAY
            (col.data_type === 'ARRAY' && col.udt_name === 'vector') ||
            // Column name patterns (LangChain and common patterns)
            col.column_name.toLowerCase().includes('embedding') ||
            col.column_name.toLowerCase().includes('vector') ||
            col.column_name === 'embedding' ||
            col.column_name === 'embeddings'
          )
        })
        .map(col => col.column_name)
      
      // Add columns that aren't already in the list
      vectorColsFromSchema.forEach(col => {
        if (!detectedColumns.includes(col)) {
          detectedColumns.push(col)
        }
      })
    }
    
    // Method 3: FALLBACK - Get columns from actual data (like Data tab does)
    if (detectedColumns.length === 0 && sampleData?.data?.[0]) {
      const columnsFromData = Object.keys(sampleData.data[0])
      const vectorColsFromData = columnsFromData.filter(colName => {
        const value = sampleData.data[0][colName]
        // Check if it's a vector (array of numbers) or column name suggests it's a vector
        return (
          (Array.isArray(value) && value.length > 10 && value.every((v: any) => typeof v === 'number')) ||
          colName.toLowerCase().includes('embedding') ||
          colName.toLowerCase().includes('vector')
        )
      })
      
      detectedColumns.push(...vectorColsFromData)
    }
    
    return detectedColumns
  }, [metadata, sampleData])

  // Auto-select first vector column
  React.useEffect(() => {
    if (vectorColumns.length > 0 && !selectedVectorColumn) {
      setSelectedVectorColumn(vectorColumns[0])
    }
  }, [vectorColumns, selectedVectorColumn])

  // Handle ESC key to exit fullscreen
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isFullscreen])
  
  // Debug logging
  React.useEffect(() => {
    if (metadata) {
      console.log('🔍 Vector Visualization Debug:', {
        hasMetadata: !!metadata,
        hasVectorInfo: !!metadata.vector_info,
        vectorInfoKeys: metadata.vector_info ? Object.keys(metadata.vector_info) : [],
        hasColumns: !!metadata.columns,
        columnsCount: metadata.columns?.length || 0,
        allColumns: metadata.columns?.map(c => ({
          name: c.column_name,
          dataType: c.data_type,
          udtName: c.udt_name,
        })),
        vectorColumnsDetected: vectorColumns,
        detectionMethods: {
          fromVectorInfo: metadata.vector_info ? Object.keys(metadata.vector_info) : [],
          fromColumnType: metadata.columns?.filter(col => 
            (col.data_type === 'USER-DEFINED' && col.udt_name === 'vector') ||
            (col.data_type === 'ARRAY' && col.udt_name === 'vector')
          ).map(c => c.column_name) || [],
          fromColumnName: metadata.columns?.filter(col =>
            col.column_name.toLowerCase().includes('embedding') ||
            col.column_name.toLowerCase().includes('vector')
          ).map(c => c.column_name) || [],
          fromActualData: sampleData?.data?.[0] ? Object.keys(sampleData.data[0]).filter(colName => {
            const value = sampleData.data[0][colName]
            return (
              (Array.isArray(value) && value.length > 10 && value.every((v: any) => typeof v === 'number')) ||
              colName.toLowerCase().includes('embedding') ||
              colName.toLowerCase().includes('vector')
            )
          }) : []
        },
        usedFallback: !metadata.columns || metadata.columns.length === 0,
        sampleDataLoaded: !!sampleData
      })
    }
  }, [metadata, vectorColumns, sampleData])

  const [shouldFetch, setShouldFetch] = useState(false)

  const { data: vizData, isLoading, error } = useQuery({
    queryKey: ['vector-visualization', schema, table, selectedVectorColumn, method, dimensions, limit, enableClustering, nClusters, selectedCollectionId],
    queryFn: async () => {
      const data = await apiClient.getVectorVisualizationData(
        schema,
        table,
        selectedVectorColumn,
        method,
        selectedCollectionId || undefined, // Use selected collection
        limit,
        dimensions
      )
      
      // Optionally fetch clustering
      if (enableClustering && data.reduced_vectors.length > 0) {
        const clusterData = await apiClient.getClusteringData(
          schema,
          table,
          selectedVectorColumn,
          nClusters,
          'kmeans',
          selectedCollectionId || undefined, // Use selected collection
          limit
        )
        return { ...data, cluster_labels: clusterData.labels }
      }
      
      return data as VisualizationData
    },
    enabled: shouldFetch && !!selectedVectorColumn && vectorColumns.length > 0,
  })

  const chartData = useMemo(() => {
    if (!vizData) return []
    
    return vizData.reduced_vectors.map((point, idx) => {
      const rowData = vizData.original_data?.[idx] || {}
      const docId = rowData.id || rowData._id || rowData.uuid || rowData.document_id || `row_${idx}`
      
      // Try to get a text preview from common fields
      let preview = ''
      const textFields = ['document', 'text', 'content', 'page_content', 'body', 'description']
      for (const field of textFields) {
        if (rowData[field] && typeof rowData[field] === 'string') {
          preview = rowData[field].substring(0, 100)
          break
        }
      }
      
      // Get metadata if available
      let metadataPreview = ''
      const metadataFields = ['metadata', 'cmetadata', 'custom_metadata']
      for (const field of metadataFields) {
        if (rowData[field]) {
          metadataPreview = JSON.stringify(rowData[field]).substring(0, 50)
          break
        }
      }
      
      return {
        x: point[0],
        y: point[1],
        z: point[2] || 0,
        index: idx,
        docId,
        preview,
        metadataPreview,
        fullData: rowData,
        isOutlier: vizData.outlier_indices?.includes(idx),
        cluster: vizData.cluster_labels?.[idx] ?? 0,
      }
    })
  }, [vizData])

  // Memoized Plotly data to prevent re-renders
  const plotlyData = useMemo(() => {
    if (!chartData.length) return []
    
    return [{
      type: 'scatter3d' as const,
      mode: 'markers' as const,
      x: chartData.map(d => d.x),
      y: chartData.map(d => d.y),
      z: chartData.map(d => d.z),
      text: chartData.map(d => 
        `Doc: ${d.docId}<br>Point #${d.index + 1}<br>` +
        `Position: (${d.x.toFixed(2)}, ${d.y.toFixed(2)}, ${d.z.toFixed(2)})<br>` +
        (d.isOutlier ? '⚠️ Outlier<br>' : '') +
        (enableClustering ? `Cluster: ${d.cluster}<br>` : '') +
        (d.preview ? `Preview: ${d.preview.substring(0, 50)}...` : '') +
        '<br><i>Click to view full details</i>'
      ),
      hoverinfo: 'text' as const,
      marker: {
        size: 6,
        color: chartData.map(d => 
          d.isOutlier 
            ? '#ef4444' 
            : enableClustering 
              ? COLORS[d.cluster % COLORS.length]
              : '#3b82f6'
        ),
        opacity: 0.8,
        line: {
          color: 'white',
          width: 0.5
        }
      },
      customdata: chartData
    }]
  }, [chartData, enableClustering])

  // Memoized layout configuration
  const plotlyLayout = useMemo(() => ({
    autosize: true,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    paper_bgcolor: isDark ? '#0a0a0a' : '#ffffff',
    plot_bgcolor: isDark ? '#0a0a0a' : '#ffffff',
    scene: {
      xaxis: { 
        title: 'Component 1',
        gridcolor: isDark ? '#404040' : '#e5e5e5',
        zerolinecolor: isDark ? '#525252' : '#d4d4d4',
        color: isDark ? '#e5e5e5' : '#404040'
      },
      yaxis: { 
        title: 'Component 2',
        gridcolor: isDark ? '#404040' : '#e5e5e5',
        zerolinecolor: isDark ? '#525252' : '#d4d4d4',
        color: isDark ? '#e5e5e5' : '#404040'
      },
      zaxis: { 
        title: 'Component 3',
        gridcolor: isDark ? '#404040' : '#e5e5e5',
        zerolinecolor: isDark ? '#525252' : '#d4d4d4',
        color: isDark ? '#e5e5e5' : '#404040'
      },
      camera: {
        eye: { x: 1.5, y: 1.5, z: 1.5 }
      }
    },
    hovermode: 'closest' as const,
    showlegend: false,
    clickmode: 'event+select' as const,
    font: {
      color: isDark ? '#e5e5e5' : '#404040'
    }
  }), [isDark])

  // Memoized config
  const plotlyConfig = useMemo(() => ({
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
    responsive: true
  }), [])

  const handleVisualize = () => {
    setShouldFetch(true)
  }

  // Memoized click handler to prevent re-creating function on each render
  const handlePlotClick = React.useCallback((event: any) => {
    console.log('3D Plot clicked!', event)
    if (event.points && event.points.length > 0) {
      const point = event.points[0]
      console.log('Point data:', point)
      
      // Try multiple ways to get the point data
      let pointData = null
      
      // Method 1: Use pointIndex
      if (point.pointIndex !== undefined && chartData[point.pointIndex]) {
        pointData = chartData[point.pointIndex]
        console.log('Found via pointIndex:', pointData)
      }
      
      // Method 2: Use customdata
      if (!pointData && point.customdata) {
        pointData = point.customdata
        console.log('Found via customdata:', pointData)
      }
      
      // Method 3: Use pointNumber
      if (!pointData && point.pointNumber !== undefined && chartData[point.pointNumber]) {
        pointData = chartData[point.pointNumber]
        console.log('Found via pointNumber:', pointData)
      }
      
      if (pointData) {
        console.log('Opening dialog with point:', pointData)
        setSelectedPoint(pointData)
        setExpandedFields(new Set())
        setIsDialogOpen(true)
      } else {
        console.error('Could not find point data')
      }
    } else {
      console.log('No points in event')
    }
  }, [chartData])

  const toggleFieldExpansion = (fieldName: string) => {
    const newExpanded = new Set(expandedFields)
    if (newExpanded.has(fieldName)) {
      newExpanded.delete(fieldName)
    } else {
      newExpanded.add(fieldName)
    }
    setExpandedFields(newExpanded)
  }

  const formatFieldValue = (fieldName: string, value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-neutral-400 italic">null</span>
    }

    const isExpanded = expandedFields.has(fieldName)

    // Handle arrays (especially embeddings/vectors)
    if (Array.isArray(value)) {
      const isVector = value.length > 10 && value.every((v: any) => typeof v === 'number')
      
      if (isVector) {
        const preview = `[${value.slice(0, 3).map(v => v.toFixed(4)).join(', ')}... +${value.length - 3} more]`
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Vector ({value.length}D)</Badge>
              <button
                onClick={() => toggleFieldExpansion(fieldName)}
                className="text-xs text-blue-600 hover:underline"
              >
                {isExpanded ? 'Hide' : 'View Full'}
              </button>
            </div>
            {isExpanded ? (
              <div className="bg-neutral-100 p-2 rounded text-xs font-mono overflow-auto max-h-32 break-all">
                {JSON.stringify(value, null, 2)}
              </div>
            ) : (
              <code className="text-xs text-neutral-600">{preview}</code>
            )}
          </div>
        )
      }
      
      // Regular array
      const strValue = JSON.stringify(value)
      if (strValue.length > 80 && !isExpanded) {
        return (
          <div className="space-y-1">
            <div className="text-xs text-neutral-700 truncate">{strValue.substring(0, 80)}...</div>
            <button
              onClick={() => toggleFieldExpansion(fieldName)}
              className="text-xs text-blue-600 hover:underline"
            >
              View Full
            </button>
          </div>
        )
      }
      return <code className="text-xs">{strValue}</code>
    }

    // Handle objects (JSON)
    if (typeof value === 'object') {
      const strValue = JSON.stringify(value, null, 2)
      if (strValue.length > 80 && !isExpanded) {
        return (
          <div className="space-y-1">
            <div className="text-xs text-neutral-700 truncate">{strValue.substring(0, 80)}...</div>
            <button
              onClick={() => toggleFieldExpansion(fieldName)}
              className="text-xs text-blue-600 hover:underline"
            >
              View Full
            </button>
          </div>
        )
      }
      
      if (isExpanded) {
        return (
          <div className="space-y-1">
            <div className="bg-neutral-100 p-2 rounded text-xs font-mono overflow-auto max-h-48">
              <pre>{strValue}</pre>
            </div>
            <button
              onClick={() => toggleFieldExpansion(fieldName)}
              className="text-xs text-blue-600 hover:underline"
            >
              Hide
            </button>
          </div>
        )
      }
      return <code className="text-xs">{strValue}</code>
    }

    // Handle long strings
    if (typeof value === 'string' && value.length > 100 && !isExpanded) {
      return (
        <div className="space-y-1">
          <div className="text-sm text-neutral-700">{value.substring(0, 100)}...</div>
          <button
            onClick={() => toggleFieldExpansion(fieldName)}
            className="text-xs text-blue-600 hover:underline"
          >
            View Full
          </button>
        </div>
      )
    }
    
    if (typeof value === 'string' && value.length > 100 && isExpanded) {
      return (
        <div className="space-y-1">
          <div className="text-sm text-neutral-700 whitespace-pre-wrap">{value}</div>
          <button
            onClick={() => toggleFieldExpansion(fieldName)}
            className="text-xs text-blue-600 hover:underline"
          >
            Hide
          </button>
        </div>
      )
    }

    // Regular values
    return <span className="text-sm text-neutral-700 dark:text-neutral-300">{String(value)}</span>
  }

  if (!metadata) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Layers className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">No Metadata Available</h3>
          <p className="text-sm text-neutral-500">Unable to load table metadata</p>
        </div>
      </div>
    )
  }

  if (vectorColumns.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">No Vector Columns Detected</h3>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-4">
            This table doesn't appear to have any vector columns. 
            {metadata?.columns && metadata.columns.length === 0 && (
              <span className="block mt-2 text-amber-600">
                <strong>Issue:</strong> Column metadata is empty. Check backend logs for errors.
              </span>
            )}
          </p>
          <details className="text-left max-w-md mx-auto bg-neutral-50 dark:bg-neutral-800 p-4 rounded-lg">
            <summary className="cursor-pointer text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Debug Information
            </summary>
            <pre className="text-xs text-neutral-600 dark:text-neutral-400 overflow-auto">
              {JSON.stringify({
                schema,
                table,
                hasMetadata: !!metadata,
                columnsCount: metadata?.columns?.length || 0,
                vectorInfoKeys: metadata?.vector_info ? Object.keys(metadata.vector_info) : []
              }, null, 2)}
            </pre>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
              Open browser console (F12) for detailed debug information.
            </p>
          </details>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-white to-slate-50 dark:from-neutral-950 dark:to-neutral-900">
      {/* Configuration Panel */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
        {/* Sub-Collection Indicator */}
        {selectedCollectionId && selectedCollectionName && (
          <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <GitBranch className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-neutral-600 dark:text-neutral-400">Visualizing sub-collection:</span>
              <Badge variant="secondary" className="text-xs font-mono">
                {selectedCollectionName}
              </Badge>
              <span className="text-xs text-neutral-400">({selectedCollectionId.substring(0, 8)}...)</span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Vector Column Selection */}
          <div className="space-y-2">
            <Label htmlFor="vector-column" className="text-xs font-medium">
              Vector Column
            </Label>
            <Select value={selectedVectorColumn} onValueChange={setSelectedVectorColumn}>
              <SelectTrigger id="vector-column" className="h-9">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {vectorColumns.map((col) => (
                  <SelectItem key={col} value={col}>
                    <div className="flex items-center gap-2">
                      <span>{col}</span>
                      {metadata?.vector_info?.[col]?.dimension && (
                        <Badge variant="secondary" className="text-xs">
                          {metadata.vector_info[col].dimension}D
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Method Selection */}
          <div className="space-y-2">
            <Label htmlFor="method" className="text-xs font-medium flex items-center gap-1">
              Method
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3 w-3 text-neutral-400" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      <strong>PCA:</strong> Fast, linear. Good for quick exploration.<br/>
                      <strong>t-SNE:</strong> Preserves local structure. Great for clusters.<br/>
                      <strong>UMAP:</strong> Best balance. Preserves both local and global structure.
                    </p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </Label>
            <Select value={method} onValueChange={(v) => setMethod(v as any)}>
              <SelectTrigger id="method" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pca">PCA (Fastest)</SelectItem>
                <SelectItem value="tsne">t-SNE (Best for clusters)</SelectItem>
                <SelectItem value="umap">UMAP (Recommended)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Dimensions */}
          <div className="space-y-2">
            <Label htmlFor="dimensions" className="text-xs font-medium">
              Dimensions
            </Label>
            <Select value={dimensions.toString()} onValueChange={(v) => setDimensions(parseInt(v) as any)}>
              <SelectTrigger id="dimensions" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2D</SelectItem>
                <SelectItem value="3">3D</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Limit */}
          <div className="space-y-2">
            <Label htmlFor="limit" className="text-xs font-medium">
              Sample Size
            </Label>
            <Input
              id="limit"
              type="number"
              min="10"
              max="10000"
              step="50"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="h-9"
            />
          </div>
        </div>

        {/* Advanced Options */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="clustering"
              checked={enableClustering}
              onChange={(e) => setEnableClustering(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="clustering" className="text-xs font-medium cursor-pointer">
              Enable Clustering
            </Label>
          </div>
          
          {enableClustering && (
            <div className="flex items-center gap-2">
              <Label htmlFor="n-clusters" className="text-xs">
                Clusters:
              </Label>
              <Input
                id="n-clusters"
                type="number"
                min="2"
                max="20"
                value={nClusters}
                onChange={(e) => setNClusters(parseInt(e.target.value))}
                className="h-8 w-20"
              />
            </div>
          )}

          <Button onClick={handleVisualize} disabled={isLoading} className="ml-auto">
            <Play className="h-4 w-4 mr-2" />
            {isLoading ? 'Visualizing...' : 'Visualize Vectors'}
          </Button>
        </div>
      </div>

      {/* Visualization Area */}
      <div className="flex-1 overflow-auto p-4">
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="font-medium text-red-900">Visualization Error</p>
                  <p className="text-sm text-red-700">{(error as Error).message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="space-y-4">
            <div className="flex items-center justify-center h-96 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
              <div className="text-center">
                <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent mb-4"></div>
                <h3 className="text-lg font-medium text-neutral-700 mb-2">Processing Vectors...</h3>
                <p className="text-sm text-neutral-500">
                  Reducing {limit} vectors from {metadata?.vector_info?.[selectedVectorColumn]?.dimension || '???'}D to {dimensions}D using {method.toUpperCase()}
                </p>
                <p className="text-xs text-neutral-400 mt-2">This may take a few seconds for large datasets</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          </div>
        )}

        {vizData && !isLoading && (
          <div className="space-y-4">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Vectors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{vizData.statistics.count.toLocaleString()}</div>
                  <p className="text-xs text-neutral-500">visualized</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Dimensions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{vizData.statistics.dimensions}</div>
                  <p className="text-xs text-neutral-500">original → {dimensions}D</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Mean Norm</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{vizData.statistics.mean_norm.toFixed(2)}</div>
                  <p className="text-xs text-neutral-500">±{vizData.statistics.std_norm.toFixed(2)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Outliers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">{vizData.outlier_indices.length}</div>
                  <p className="text-xs text-neutral-500">detected</p>
                </CardContent>
              </Card>
            </div>

            {/* Scatter Plot */}
            <Card className={isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}>
              <CardHeader className={isFullscreen ? 'border-b' : ''}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <CardTitle>Vector Space Visualization</CardTitle>
                    <CardDescription>
                      Reduced from {vizData.statistics.dimensions}D to {dimensions}D using {method.toUpperCase()}
                      {dimensions === 3 && <span className="ml-2 text-blue-600">🎯 Interactive 3D - Drag to rotate!</span>}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {!isFullscreen ? (
                      <TooltipProvider>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsFullscreen(true)}
                              className="h-8"
                            >
                              <Maximize2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Fullscreen (ESC to exit)</p>
                          </TooltipContent>
                        </UITooltip>
                      </TooltipProvider>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsFullscreen(false)}
                        className="h-8"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Exit Fullscreen
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className={isFullscreen ? 'h-[calc(100vh-80px)]' : ''}>
                {dimensions === 3 ? (
                  // 3D Visualization using Plotly
                  <div className={`w-full ${isFullscreen ? 'h-full' : 'h-[600px]'}`}>
                    {chartData.length > 0 ? (
                      <Plot
                        data={plotlyData}
                        layout={plotlyLayout}
                        config={plotlyConfig}
                        onClick={handlePlotClick}
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <AlertCircle className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
                          <p className="text-neutral-500">No data to display</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // 2D Visualization using Recharts
                  <ResponsiveContainer width="100%" height={isFullscreen ? '100%' : 500}>
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="x" name="Component 1" />
                      <YAxis type="number" dataKey="y" name="Component 2" />
                      <Tooltip 
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-white dark:bg-neutral-900 border dark:border-neutral-700 rounded-lg shadow-lg p-3 max-w-sm">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div>
                                    <p className="font-semibold text-sm text-blue-600">Document: {data.docId}</p>
                                    <p className="text-xs text-neutral-500">Point #{data.index + 1}</p>
                                  </div>
                                  <div className="flex gap-1">
                                    {data.isOutlier && (
                                      <Badge variant="destructive" className="text-xs">Outlier</Badge>
                                    )}
                                    {enableClustering && (
                                      <Badge variant="secondary" className="text-xs">
                                        C{data.cluster}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {data.preview && (
                                  <p className="text-xs text-neutral-700 dark:text-neutral-300 mb-2 line-clamp-2 bg-neutral-50 dark:bg-neutral-800 p-2 rounded">
                                    "{data.preview}..."
                                  </p>
                                )}
                                {data.metadataPreview && (
                                  <p className="text-xs text-neutral-500 mb-2">
                                    📋 {data.metadataPreview}...
                                  </p>
                                )}
                                <div className="border-t pt-2 mt-2">
                                  <p className="text-xs text-neutral-500">
                                    Position: ({data.x.toFixed(2)}, {data.y.toFixed(2)})
                                  </p>
                                  <p className="text-xs text-blue-500 mt-1">💡 Click point to view full details</p>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Legend />
                      <Scatter 
                        name="Vectors" 
                        data={chartData}
                        onClick={(data) => {
                          setSelectedPoint(data)
                          setExpandedFields(new Set())
                          setIsDialogOpen(true)
                        }}
                        cursor="pointer"
                      >
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={
                              entry.isOutlier 
                                ? '#ef4444' 
                                : enableClustering 
                                  ? COLORS[entry.cluster % COLORS.length]
                                  : '#3b82f6'
                            }
                            opacity={entry.isOutlier ? 1 : 0.6}
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Explanation Card */}
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <CardTitle className="text-base">What am I looking at?</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-neutral-700 dark:text-neutral-300 space-y-2">
                <p>
                  <strong>Table:</strong> <code className="bg-white dark:bg-neutral-800 dark:text-neutral-200 px-2 py-0.5 rounded">{schema}.{table}</code>
                </p>
                {selectedCollectionId && selectedCollectionName ? (
                  <p className="flex items-center gap-2">
                    <strong>Sub-Collection:</strong> 
                    <Badge variant="secondary" className="text-xs">
                      {selectedCollectionName}
                    </Badge>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">(ID: {selectedCollectionId.substring(0, 8)}...)</span>
                  </p>
                ) : (
                  <p className="text-amber-600 dark:text-amber-400 text-xs">
                    ⚠️ Showing <strong>all sub-collections</strong> in this table (no filter applied)
                  </p>
                )}
                <p>
                  <strong>Sample:</strong> Showing the <strong>first {limit}</strong> documents{selectedCollectionId ? ' from this sub-collection' : ''} (not random).
                  {vizData.total_vectors && vizData.total_vectors < limit && (
                    <span className="text-amber-600 dark:text-amber-400"> Found {vizData.total_vectors} valid vectors.</span>
                  )}
                </p>
                <p>
                  <strong>Each point</strong> represents one document/embedding. Points close together have similar semantic meaning.
                </p>
                <p className="text-blue-600 dark:text-blue-400">
                  💡 <strong>Hover</strong> over points to see document preview, <strong>click</strong> to view full details.
                </p>
              </CardContent>
            </Card>

            {/* Export Button */}
            <div className="flex justify-end">
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Visualization Data
              </Button>
            </div>
          </div>
        )}

        {!vizData && !isLoading && !error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <TrendingUp className="h-16 w-16 text-neutral-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-neutral-700 dark:text-neutral-300 mb-2">Ready to Visualize</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                Configure your visualization settings above and click "Visualize Vectors" to see your embeddings in {dimensions}D space
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Document Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Document Details
            </DialogTitle>
            <DialogDescription>
              Point #{(selectedPoint?.index || 0) + 1} - {selectedPoint?.docId}
            </DialogDescription>
          </DialogHeader>
          
          {selectedPoint && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Classification Badges */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Classification</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {selectedPoint.isOutlier && (
                      <Badge variant="destructive">
                        ⚠️ Outlier - Semantically distant
                      </Badge>
                    )}
                    {enableClustering && (
                      <Badge variant="secondary" className="text-sm">
                        Cluster {selectedPoint.cluster} - {COLORS[selectedPoint.cluster % COLORS.length]}
                      </Badge>
                    )}
                    {!selectedPoint.isOutlier && !enableClustering && (
                      <span className="text-xs text-neutral-500">No classification applied</span>
                    )}
                  </CardContent>
                </Card>

                {/* Position Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Vector Space Position</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-neutral-600 space-y-1">
                    <p>Component 1: <code className="bg-neutral-100 px-2 py-0.5 rounded">{selectedPoint.x.toFixed(4)}</code></p>
                    <p>Component 2: <code className="bg-neutral-100 px-2 py-0.5 rounded">{selectedPoint.y.toFixed(4)}</code></p>
                    {dimensions === 3 && (
                      <p>Component 3: <code className="bg-neutral-100 px-2 py-0.5 rounded">{selectedPoint.z.toFixed(4)}</code></p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Document Fields */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Document Fields</CardTitle>
                  <CardDescription className="text-xs">
                    Click "View Full" to expand long values
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(selectedPoint.fullData || {}).map(([key, value]) => (
                      <div key={key} className="border-b border-neutral-200 pb-3 last:border-0">
                        <div className="flex items-start gap-6">
                          <div className="flex-shrink-0 w-48">
                            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                              {key}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            {formatFieldValue(key, value)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Document Preview (if text available) */}
              {selectedPoint.preview && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Document Content Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800 p-3 rounded">
                      {selectedPoint.fullData.document || selectedPoint.fullData.text || selectedPoint.fullData.content || selectedPoint.fullData.page_content}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
