import { create } from 'zustand';
import { DatabaseInfo, DatabaseTable, TableMetadata } from '@/lib/types';

interface DatabaseState {
  // Connection state
  isConnected: boolean;
  connectionString: string;
  databaseInfo: DatabaseInfo | null;
  connectionError: string | null;

  // Tables state
  tables: DatabaseTable[];
  selectedTable: DatabaseTable | null;
  selectedCollectionId: string | null;
  tableMetadata: TableMetadata | null;

  // UI state
  isConnecting: boolean;
  isLoadingTables: boolean;
  isLoadingMetadata: boolean;

  // Actions
  setConnectionString: (connectionString: string) => void;
  setConnectionState: (isConnected: boolean, databaseInfo?: DatabaseInfo | null, error?: string | null) => void;
  setTables: (tables: DatabaseTable[]) => void;
  setSelectedTable: (table: DatabaseTable | null) => void;
  setSelectedCollection: (collectionId: string | null) => void;
  setTableMetadata: (metadata: TableMetadata | null) => void;
  setConnecting: (isConnecting: boolean) => void;
  setLoadingTables: (isLoading: boolean) => void;
  setLoadingMetadata: (isLoading: boolean) => void;
  reset: () => void;
}

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  // Initial state
  isConnected: false,
  connectionString: '',
  databaseInfo: null,
  connectionError: null,
  tables: [],
  selectedTable: null,
  selectedCollectionId: null,
  tableMetadata: null,
  isConnecting: false,
  isLoadingTables: false,
  isLoadingMetadata: false,

  // Actions
  setConnectionString: (connectionString: string) => {
    set({ connectionString });
  },

  setConnectionState: (isConnected: boolean, databaseInfo?: DatabaseInfo | null, error?: string | null) => {
    set({
      isConnected,
      databaseInfo: databaseInfo ?? null,
      connectionError: error ?? null,
      isConnecting: false,
    });
  },

  setTables: (tables: DatabaseTable[]) => {
    set({ tables, isLoadingTables: false });
  },

  setSelectedTable: (table: DatabaseTable | null) => {
    set({ selectedTable: table, selectedCollectionId: null, tableMetadata: null });
  },

  setSelectedCollection: (collectionId: string | null) => {
    set({ selectedCollectionId: collectionId });
  },

  setTableMetadata: (metadata: TableMetadata | null) => {
    set({ tableMetadata: metadata, isLoadingMetadata: false });
  },

  setConnecting: (isConnecting: boolean) => {
    set({ isConnecting });
  },

  setLoadingTables: (isLoading: boolean) => {
    set({ isLoadingTables: isLoading });
  },

  setLoadingMetadata: (isLoading: boolean) => {
    set({ isLoadingMetadata: isLoading });
  },

  reset: () => {
    set({
      isConnected: false,
      connectionString: '',
      databaseInfo: null,
      connectionError: null,
      tables: [],
      selectedTable: null,
      selectedCollectionId: null,
      tableMetadata: null,
      isConnecting: false,
      isLoadingTables: false,
      isLoadingMetadata: false,
    });
  },
}));
