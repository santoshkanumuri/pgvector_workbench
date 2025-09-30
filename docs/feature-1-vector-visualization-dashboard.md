# Feature 1: Interactive Vector Visualization Dashboard

## 🎯 Overview

Transform your existing vector visualization backend APIs into a stunning interactive dashboard that lets users explore high-dimensional embeddings visually.

## Why This Matters

Your backend already has:
- ✅ PCA, t-SNE, UMAP dimensionality reduction
- ✅ Clustering algorithms (K-Means, DBSCAN)
- ✅ Outlier detection
- ✅ Vector statistics

**But** users can't see any of it! This feature unlocks your most powerful capability.

## User Stories

1. **ML Engineer**: "I want to see if my embeddings cluster by topic"
2. **Data Scientist**: "I need to identify poorly embedded outliers"
3. **Developer**: "I want to compare two embedding models visually"
4. **Manager**: "Show me a visual proof that our RAG system is working"

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Vector Visualization Tab (New)                          │
│                                                          │
│  ┌────────────────┐  ┌──────────────────────────────┐  │
│  │ Config Panel   │  │  Scatter Plot (Recharts)     │  │
│  │                │  │                               │  │
│  │ • Method       │  │  ┌──────────────────────┐    │  │
│  │ • Dimensions   │  │  │   Interactive 2D/3D  │    │  │
│  │ • Limit        │  │  │   ● ● ●    ● ●      │    │  │
│  │ • Filters      │  │  │  ●   ● ●            │    │  │
│  │                │  │  │    ●  ● ●  ●        │    │  │
│  │ [Visualize]    │  │  │ ●     ●     ●   ●   │    │  │
│  └────────────────┘  │  └──────────────────────┘    │  │
│                      │                               │  │
│  ┌────────────────┐  │  Hover Info:                 │  │
│  │ Statistics     │  │  Point #42                   │  │
│  │ • Mean norm    │  │  Text: "Example document..." │  │
│  │ • Clusters     │  │  Similarity: 0.87            │  │
│  │ • Outliers     │  └──────────────────────────────┘  │
│  └────────────────┘                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation

### Step 1: Add Recharts Dependency

```bash
cd frontend
npm install recharts @types/recharts
```

### Step 2: Create Visualization Tab Component

**File: `frontend/src/components/database/vector-visualization.tsx`**

```typescript
'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { TableMetadata as TableMetadataType } from '@/lib/types'
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Layers, TrendingUp, AlertCircle, Download, Play, Info } from 'lucide-react'
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
  
  const vectorColumns = useMemo(() => {
    if (!metadata?.vector_info) return []
    return Object.keys(metadata.vector_info)
  }, [metadata])

  // Auto-select first vector column
  React.useEffect(() => {
    if (vectorColumns.length > 0 && !selectedVectorColumn) {
      setSelectedVectorColumn(vectorColumns[0])
    }
  }, [vectorColumns, selectedVectorColumn])

  const [shouldFetch, setShouldFetch] = useState(false)

  const { data: vizData, isLoading, error } = useQuery({
    queryKey: ['vector-visualization', schema, table, selectedVectorColumn, method, dimensions, limit, enableClustering, nClusters],
    queryFn: async () => {
      const data = await apiClient.getVectorVisualizationData(
        schema,
        table,
        selectedVectorColumn,
        method,
        undefined, // collectionId
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
          undefined,
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
    
    return vizData.reduced_vectors.map((point, idx) => ({
      x: point[0],
      y: point[1],
      z: point[2] || 0,
      index: idx,
      isOutlier: vizData.outlier_indices?.includes(idx),
      cluster: vizData.cluster_labels?.[idx] ?? 0,
    }))
  }, [vizData])

  const handleVisualize = () => {
    setShouldFetch(true)
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
          <h3 className="text-lg font-medium text-neutral-900 mb-2">No Vector Columns</h3>
          <p className="text-sm text-neutral-500">This table doesn't have any vector columns to visualize</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-white to-slate-50">
      {/* Configuration Panel */}
      <div className="p-4 border-b border-neutral-200 bg-white shadow-sm">
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
                      <Badge variant="secondary" className="text-xs">
                        {metadata.vector_info[col]?.dimension}D
                      </Badge>
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
            <Skeleton className="h-96 w-full" />
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
            <Card>
              <CardHeader>
                <CardTitle>Vector Space Visualization</CardTitle>
                <CardDescription>
                  Reduced from {vizData.statistics.dimensions}D to {dimensions}D using {method.toUpperCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={500}>
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" name="Component 1" />
                    <YAxis type="number" dataKey="y" name="Component 2" />
                    {dimensions === 3 && <ZAxis type="number" dataKey="z" name="Component 3" range={[50, 400]} />}
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div className="bg-white border rounded-lg shadow-lg p-3">
                              <p className="font-semibold text-sm">Point #{data.index}</p>
                              <p className="text-xs text-neutral-600">
                                x: {data.x.toFixed(3)}, y: {data.y.toFixed(3)}
                              </p>
                              {data.isOutlier && (
                                <Badge variant="destructive" className="text-xs mt-1">Outlier</Badge>
                              )}
                              {enableClustering && (
                                <Badge variant="secondary" className="text-xs mt-1">
                                  Cluster {data.cluster}
                                </Badge>
                              )}
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Legend />
                    <Scatter name="Vectors" data={chartData}>
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
              <h3 className="text-lg font-medium text-neutral-700 mb-2">Ready to Visualize</h3>
              <p className="text-sm text-neutral-500 max-w-md mx-auto">
                Configure your visualization settings above and click "Visualize Vectors" to see your embeddings in {dimensions}D space
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

### Step 3: Add Visualization API Methods

**File: `frontend/src/lib/api.ts`** (Add these methods)

```typescript
async getVectorVisualizationData(
  schema: string,
  table: string,
  vectorColumn: string,
  method: 'pca' | 'tsne' | 'umap',
  collectionId?: string,
  limit: number = 500,
  nComponents: 2 | 3 = 2
) {
  const response = await this.client.post(
    `/api/tables/${schema}/${table}/vector-visualization`,
    {
      vector_column: vectorColumn,
      method,
      n_components: nComponents,
      collection_id: collectionId,
      limit,
    }
  )
  return response.data
}

async getClusteringData(
  schema: string,
  table: string,
  vectorColumn: string,
  nClusters: number,
  method: 'kmeans' | 'dbscan',
  collectionId?: string,
  limit: number = 1000
) {
  const response = await this.client.post(
    `/api/tables/${schema}/${table}/clustering`,
    {
      vector_column: vectorColumn,
      n_clusters: nClusters,
      method,
      collection_id: collectionId,
      limit,
    }
  )
  return response.data
}
```

### Step 4: Add Visualization Tab to Table View

**File: `frontend/src/components/database/table-view.tsx`**

```typescript
// Add import
import { VectorVisualization } from './vector-visualization'

// In the component, add new tab:
<TabsList className="bg-white/50 backdrop-blur-sm border-b border-slate-200">
  {/* ... existing tabs ... */}
  
  {/* Add this new tab */}
  <TabsTrigger 
    value="visualization" 
    className="data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700"
  >
    <TrendingUp className="h-4 w-4 mr-2" />
    Visualization
  </TabsTrigger>
</TabsList>

{/* Add this new tab content */}
<TabsContent value="visualization" className="h-full m-0 p-0 overflow-hidden">
  <VectorVisualization 
    schema={selectedTable.schema} 
    table={selectedTable.name}
    metadata={metadata}
  />
</TabsContent>
```

---

## Testing

### 1. Start the App
```bash
# Terminal 1 - Backend
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8011

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 2. Test the Visualization
1. Login and connect to a database
2. Select a table with vector columns
3. Click the "Visualization" tab
4. Configure settings:
   - Select vector column
   - Choose UMAP method
   - Set limit to 500
   - Enable clustering with 5 clusters
5. Click "Visualize Vectors"
6. See the interactive scatter plot!

### 3. Verify Features
- ✅ Hover over points to see details
- ✅ Outliers shown in red
- ✅ Clusters colored differently
- ✅ Statistics cards show correct values
- ✅ Can switch between 2D and 3D
- ✅ Can change visualization methods

---

## Performance Considerations

1. **Sampling**: Default limit of 500 vectors is optimal for interactivity
2. **Async Processing**: Backend uses async to avoid blocking
3. **Caching**: Consider caching visualization results (future enhancement)
4. **Progressive Loading**: Show stats first, then plot (future enhancement)

---

## Future Enhancements

1. **3D Rotation**: Add controls for 3D view rotation
2. **Point Labeling**: Show actual document text on hover
3. **Selection Tool**: Click-and-drag to select points
4. **Comparison View**: Visualize two vector columns side-by-side
5. **Animation**: Animate transitions between methods
6. **Export**: Download visualization as PNG/SVG

---

## Estimated Implementation Time

- **Backend**: Already done! ✅
- **Frontend Component**: 6-8 hours
- **Integration**: 2-3 hours
- **Testing & Polish**: 3-4 hours

**Total: 2-3 days of focused development**

---

## Success Metrics

- Users can visualize 1000+ vectors in < 5 seconds
- Outlier detection helps identify data quality issues
- Clustering reveals natural groupings in embeddings
- Export functionality enables sharing insights

This feature will transform DB Look from a database browser into a full-fledged vector exploration platform! 🚀
