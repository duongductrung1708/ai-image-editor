import { create } from "zustand";

type HistoryDateFilter = "all" | "today" | "week" | "month";

interface UiState {
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  toggleHistoryOpen: () => void;

  historySearchQuery: string;
  setHistorySearchQuery: (query: string) => void;

  historyDateFilter: HistoryDateFilter;
  setHistoryDateFilter: (filter: HistoryDateFilter) => void;
}

export const useUiStore = create<UiState>((set) => ({
  historyOpen: false,
  setHistoryOpen: (open) => set({ historyOpen: open }),
  toggleHistoryOpen: () => set((s) => ({ historyOpen: !s.historyOpen })),

  historySearchQuery: "",
  setHistorySearchQuery: (query) => set({ historySearchQuery: query }),

  historyDateFilter: "all",
  setHistoryDateFilter: (filter) => set({ historyDateFilter: filter }),
}));

