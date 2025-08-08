'use client'

import { useDatabaseStore } from '@/stores/database'
import { ConnectionForm } from './connection-form'
import { TablesList } from './tables-list'
import { TableView } from './table-view'
import { Header } from './header'

export function DatabaseWorkbench() {
  const { isConnected, selectedTable } = useDatabaseStore()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header />
      
      <div className="flex flex-1 overflow-hidden min-h-0 pr-[10px]">
        {!isConnected ? (
          <div className="flex flex-1 items-center justify-center">
            <ConnectionForm />
          </div>
        ) : (
          <>
            <div className="w-80 min-w-80 max-w-80 border-r border-neutral-200 bg-white overflow-hidden">
              <TablesList />
            </div>
            <div className="flex-1 bg-neutral-50 overflow-hidden min-w-0">
              {selectedTable ? (
                <TableView />
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <div className="text-center">
                    <h3 className="text-lg font-medium text-neutral-900">
                      Select a Collection
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Choose a table from the sidebar to view its vector data
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
