'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { BookmarkPlus, Star, Trash2, Play, Search, Tag, Clock } from 'lucide-react'

interface SavedQuery {
  id: string
  name: string
  description?: string
  query_type: string
  schema_name: string
  table_name: string
  collection_id?: string
  parameters: any
  tags: string[]
  is_favorite: boolean
  use_count: number
  last_used_at?: string
  created_at: string
}

interface SavedQueriesDialogProps {
  onSelectQuery?: (query: SavedQuery) => void
}

export function SavedQueriesDialog({ onSelectQuery }: SavedQueriesDialogProps) {
  const [open, setOpen] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const queryClient = useQueryClient()

  const { data: savedQueries = [], isLoading } = useQuery({
    queryKey: ['saved-queries'],
    queryFn: () => apiClient.getSavedQueries(),
    enabled: open,
  })

  const deleteMutation = useMutation({
    mutationFn: (queryId: string) => apiClient.deleteSavedQuery(queryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] })
    },
  })

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ queryId, isFavorite }: { queryId: string; isFavorite: boolean }) =>
      apiClient.updateSavedQuery(queryId, { isFavorite: !isFavorite }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-queries'] })
    },
  })

  const filteredQueries = savedQueries.filter((q: SavedQuery) => {
    const matchesSearch = !searchFilter || 
      q.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      q.description?.toLowerCase().includes(searchFilter.toLowerCase())
    
    const matchesTags = tagFilter.length === 0 || 
      tagFilter.some(tag => q.tags.includes(tag))
    
    return matchesSearch && matchesTags
  })

  const allTags = [...new Set(savedQueries.flatMap((q: SavedQuery) => q.tags))]

  const handleLoadQuery = (query: SavedQuery) => {
    apiClient.recordQueryUse(query.id)
    onSelectQuery?.(query)
    setOpen(false)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return `${Math.floor(diffDays / 30)} months ago`
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BookmarkPlus className="h-4 w-4 mr-2" />
          Saved Queries
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Saved Queries</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="space-y-3 border-b pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search queries..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-10"
            />
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={tagFilter.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    setTagFilter(prev =>
                      prev.includes(tag)
                        ? prev.filter(t => t !== tag)
                        : [...prev, tag]
                    )
                  }}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Queries List */}
        <div className="flex-1 overflow-auto space-y-3">
          {isLoading && (
            <div className="text-center py-8 text-neutral-500">Loading...</div>
          )}

          {!isLoading && filteredQueries.length === 0 && (
            <div className="text-center py-8 text-neutral-500">
              {searchFilter || tagFilter.length > 0
                ? 'No queries match your filters'
                : 'No saved queries yet. Save a query to get started!'}
            </div>
          )}

          {filteredQueries.map((query: SavedQuery) => (
            <Card key={query.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{query.name}</h3>
                      {query.is_favorite && (
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500 flex-shrink-0" />
                      )}
                    </div>

                    {query.description && (
                      <p className="text-sm text-neutral-600 mb-2">{query.description}</p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {query.schema_name}.{query.table_name}
                      </Badge>
                      <span>•</span>
                      <span className="capitalize">{query.query_type.replace('_', ' ')}</span>
                      {query.use_count > 0 && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Used {query.use_count} {query.use_count === 1 ? 'time' : 'times'}
                          </span>
                        </>
                      )}
                      {query.last_used_at && (
                        <>
                          <span>•</span>
                          <span>Last used: {formatDate(query.last_used_at)}</span>
                        </>
                      )}
                    </div>

                    {query.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {query.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFavoriteMutation.mutate({ 
                        queryId: query.id, 
                        isFavorite: query.is_favorite 
                      })}
                      title={query.is_favorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star className={`h-4 w-4 ${query.is_favorite ? 'fill-amber-500 text-amber-500' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadQuery(query)}
                      className="text-blue-600 hover:text-blue-700"
                      title="Load and execute this query"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this saved query?')) {
                          deleteMutation.mutate(query.id)
                        }
                      }}
                      className="text-red-500 hover:text-red-600"
                      title="Delete this query"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!isLoading && filteredQueries.length > 0 && (
          <div className="border-t pt-3 text-xs text-neutral-500 text-center">
            Showing {filteredQueries.length} of {savedQueries.length} saved {savedQueries.length === 1 ? 'query' : 'queries'}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
