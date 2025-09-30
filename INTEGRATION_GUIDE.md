# Integration Guide - New Features

This guide shows you exactly how to integrate the new features into your existing DB Look application.

## 🚀 Quick Start

### 1. Install New Backend Dependencies

```bash
cd backend
uv sync
# or if using pip:
# pip install numpy scikit-learn umap-learn pandas
```

### 2. Install New Frontend Dependencies

```bash
cd frontend
npm install @radix-ui/react-toast@^1.2.4 @radix-ui/react-dropdown-menu@^2.1.4
```

### 3. Add Toast Provider to Your Layout

Update `frontend/src/app/layout.tsx`:

```typescript
import { Toaster } from '@/components/ui/toaster'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster /> {/* Add this line */}
      </body>
    </html>
  )
}
```

### 4. Add Export Button to Search Interface

Update `frontend/src/components/database/search-interface.tsx`:

```typescript
// Add import at the top
import { ExportButton } from './export-button'

// In the search results section, add the export button:
<div className="flex items-center justify-between mb-3 flex-shrink-0">
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
    
    {/* NEW: Add export button */}
    {searchMutation.data.data.length > 0 && (
      <ExportButton
        schema={schema}
        table={table}
        collectionId={selectedCollectionId || undefined}
        type="search"
        searchParams={{
          query: textQuery || undefined,
          vector_query: vectorQuery ? JSON.parse(vectorQuery) : undefined,
          search_column: selectedTextColumn || undefined,
          vector_column: selectedVectorColumn || undefined,
          limit,
          metric,
          sortBy: (sortBy && sortBy !== 'none') ? sortBy : undefined,
          sortOrder,
          collectionId: selectedCollectionId || undefined,
        }}
      />
    )}
    
    {searchMutation.data.query_info.total_available_in_collection && (
      <Badge variant="outline" className="text-xs">
        of {searchMutation.data.query_info.total_available_in_collection} total
        {selectedCollectionId ? ' in collection' : ' in table'}
      </Badge>
    )}
  </div>
</div>
```

### 5. Add Export Button to Table Data View

Update `frontend/src/components/database/table-data.tsx` (if you have one):

```typescript
import { ExportButton } from './export-button'

// Add in the table header section:
<div className="flex items-center justify-between p-4">
  <h3 className="text-lg font-medium">Table Data</h3>
  
  <ExportButton
    schema={schema}
    table={table}
    collectionId={selectedCollectionId}
    type="data"
  />
</div>
```

---

## 📊 Using Vector Visualization

### Example: Visualize Embeddings with UMAP

Create a new component `frontend/src/components/database/vector-visualizer.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Loader2 } from 'lucide-react'

interface VectorVisualizerProps {
  schema: string
  table: string
  vectorColumn: string
  collectionId?: string
}

export function VectorVisualizer({ schema, table, vectorColumn, collectionId }: VectorVisualizerProps) {
  const [method, setMethod] = useState<'pca' | 'tsne' | 'umap'>('umap')
  const [limit, setLimit] = useState(500)

  const visualizationMutation = useMutation({
    mutationFn: () => apiClient.getVectorVisualizationData(
      schema,
      table,
      vectorColumn,
      method,
      collectionId,
      limit,
      2
    ),
  })

  const chartData = visualizationMutation.data?.reduced_vectors.map((point, idx) => ({
    x: point[0],
    y: point[1],
    name: `Point ${idx}`,
    isOutlier: visualizationMutation.data?.outlier_indices.includes(idx)
  })) || []

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <Select value={method} onValueChange={(v: any) => setMethod(v)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pca">PCA</SelectItem>
            <SelectItem value="tsne">t-SNE</SelectItem>
            <SelectItem value="umap">UMAP</SelectItem>
          </SelectContent>
        </Select>

        <Select value={limit.toString()} onValueChange={(v) => setLimit(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100 vectors</SelectItem>
            <SelectItem value="500">500 vectors</SelectItem>
            <SelectItem value="1000">1000 vectors</SelectItem>
          </SelectContent>
        </Select>

        <Button
          onClick={() => visualizationMutation.mutate()}
          disabled={visualizationMutation.isPending}
        >
          {visualizationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Visualize
        </Button>
      </div>

      {visualizationMutation.data && (
        <div className="space-y-4">
          <div className="p-4 bg-neutral-50 rounded-lg">
            <h4 className="font-medium mb-2">Statistics</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-neutral-600">Total Vectors</div>
                <div className="font-mono">{visualizationMutation.data.statistics.count}</div>
              </div>
              <div>
                <div className="text-neutral-600">Dimensions</div>
                <div className="font-mono">{visualizationMutation.data.statistics.dimensions}</div>
              </div>
              <div>
                <div className="text-neutral-600">Outliers</div>
                <div className="font-mono">{visualizationMutation.data.outlier_indices.length}</div>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={500}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" name="X" />
              <YAxis dataKey="y" name="Y" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter 
                name="Vectors" 
                data={chartData} 
                fill="#8884d8" 
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
```

Then add it to your table view:

```typescript
import { VectorVisualizer } from './vector-visualizer'

// In your table component:
<Tabs defaultValue="data">
  <TabsList>
    <TabsTrigger value="data">Data</TabsTrigger>
    <TabsTrigger value="metadata">Metadata</TabsTrigger>
    <TabsTrigger value="search">Search</TabsTrigger>
    <TabsTrigger value="visualize">Visualize</TabsTrigger> {/* NEW */}
  </TabsList>

  {/* ... other tabs ... */}

  <TabsContent value="visualize">
    <VectorVisualizer
      schema={schema}
      table={table}
      vectorColumn={selectedVectorColumn}
      collectionId={selectedCollectionId}
    />
  </TabsContent>
</Tabs>
```

---

## 📜 Adding Query History

Update your search interface to track queries:

```typescript
import { QueryHistory } from '@/lib/query-history'
import { useEffect, useState } from 'react'

export function SearchInterface({ schema, table, metadata }: SearchInterfaceProps) {
  const [queryHistory, setQueryHistory] = useState<SearchHistoryItem[]>([])

  // Load history on mount
  useEffect(() => {
    setQueryHistory(QueryHistory.getRecentForTable(schema, table, 10))
  }, [schema, table])

  const handleSearch = () => {
    // ... existing search logic ...

    searchMutation.mutate(searchParams, {
      onSuccess: (data) => {
        // Save to history
        QueryHistory.saveQuery({
          schema,
          table,
          textQuery: textQuery || undefined,
          vectorQuery: vectorArray,
          searchColumn: selectedTextColumn || undefined,
          vectorColumn: selectedVectorColumn || undefined,
          metric,
          limit,
          resultsCount: data.data.length
        })
        
        // Refresh history
        setQueryHistory(QueryHistory.getRecentForTable(schema, table, 10))
      }
    })
  }

  // Add a history section in your UI:
  return (
    <div>
      {/* Existing search form */}
      
      {/* NEW: Query History */}
      {queryHistory.length > 0 && (
        <div className="mt-4 p-4 bg-neutral-50 rounded-lg">
          <h4 className="font-medium mb-2">Recent Searches</h4>
          <div className="space-y-2">
            {queryHistory.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 bg-white rounded cursor-pointer hover:bg-neutral-100"
                onClick={() => {
                  // Restore search parameters
                  if (item.textQuery) setTextQuery(item.textQuery)
                  if (item.vectorQuery) setVectorQuery(JSON.stringify(item.vectorQuery))
                  if (item.searchColumn) setSelectedTextColumn(item.searchColumn)
                  if (item.vectorColumn) setSelectedVectorColumn(item.vectorColumn)
                  setMetric(item.metric)
                  setLimit(item.limit)
                }}
              >
                <div className="text-sm">
                  {item.textQuery && <span>Text: {item.textQuery}</span>}
                  {item.vectorQuery && <span className="text-neutral-600"> • Vector search</span>}
                  {item.resultsCount && <span className="text-neutral-600"> • {item.resultsCount} results</span>}
                </div>
                <div className="text-xs text-neutral-500">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## 🔔 Using Toasts

Examples of using the toast system:

### Success Toast
```typescript
import { useToast } from '@/hooks/use-toast'

const { toast } = useToast()

// After successful operation:
toast({
  title: 'Success!',
  description: 'Your data has been exported',
  variant: 'success',
})
```

### Error Toast
```typescript
toast({
  title: 'Error',
  description: 'Failed to load data. Please try again.',
  variant: 'destructive',
})
```

### Toast with Action
```typescript
toast({
  title: 'Export ready',
  description: 'Your file is ready to download',
  action: (
    <Button size="sm" onClick={() => downloadFile()}>
      Download
    </Button>
  ),
})
```

---

## 🧪 Testing the Features

### 1. Test Export Functionality

```bash
# Start backend
cd backend
uv run uvicorn main:app --reload --port 8011

# Start frontend
cd frontend
npm run dev

# Navigate to a table with data
# Click "Export" button
# Select format (JSON/CSV/etc.)
# File should download automatically
```

### 2. Test Vector Visualization

```bash
# Using curl:
curl -X POST http://localhost:8011/api/tables/public/embeddings/vector-visualization \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Session-Id: YOUR_SESSION" \
  -H "Content-Type: application/json" \
  -d '{
    "vector_column": "embedding",
    "method": "umap",
    "n_components": 2,
    "limit": 500,
    "collection_id": "optional-collection-id"
  }'
```

### 3. Test Batch Search

```bash
curl -X POST http://localhost:8011/api/tables/public/embeddings/batch-search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Session-Id: YOUR_SESSION" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
    "vector_column": "embedding",
    "limit_per_query": 5,
    "metric": "cosine"
  }'
```

---

## 🎨 Customization

### Change Export Button Style

```typescript
<ExportButton
  schema={schema}
  table={table}
  type="data"
  // Add custom styling via className (if you extend the component)
/>
```

### Customize Toast Duration

Update `frontend/src/hooks/use-toast.ts`:

```typescript
const TOAST_REMOVE_DELAY = 3000 // Change from 5000 to 3000 for 3 seconds
```

### Customize Query History Limit

Update `frontend/src/lib/query-history.ts`:

```typescript
const MAX_HISTORY_ITEMS = 100 // Change from 50 to 100
```

---

## 🐛 Troubleshooting

### "Module not found" errors
```bash
# Frontend
cd frontend
npm install

# Backend
cd backend
uv sync
```

### Toast not appearing
Make sure you've added `<Toaster />` to your layout component.

### Export button not working
Check browser console for errors. Verify your API_BASE_URL is correct.

### Vector visualization slow
- Reduce the `limit` parameter (try 100 instead of 500)
- Use PCA instead of t-SNE/UMAP for faster results
- Ensure you have enough CPU resources

### UMAP import error
```bash
cd backend
pip install umap-learn
# Note: May require compilation tools on Windows
```

---

## 📚 Additional Resources

- **API Documentation**: See `backend/api.py` for all endpoints
- **Component Documentation**: Check individual component files for props and usage
- **Type Definitions**: See `frontend/src/lib/types.ts` for TypeScript types

---

## 🎯 Next Steps

1. ✅ Add export buttons to your table and search views
2. ✅ Integrate toast notifications for better UX
3. ✅ Add query history tracking
4. 🔄 Create vector visualization UI
5. 🔄 Implement dark mode
6. 🔄 Add keyboard shortcuts

See `docs/improvements-roadmap.md` for the complete feature roadmap!

---

## 💡 Pro Tips

1. **Performance**: Use PCA for initial exploration, UMAP for final visualization
2. **Export**: Use JSONL for streaming large datasets
3. **History**: Clear old queries periodically to keep localStorage clean
4. **Toasts**: Don't show toasts for every action - only important ones
5. **Caching**: Adjust cache TTLs based on your data update frequency

---

Your integration is complete! 🎉 Enjoy the new features!
