import { create } from "zustand";

type SingleActiveTab = "markdown" | "json" | "tables";
type BatchActiveTab = "markdown" | "json";

interface WorkspaceState {
  // Shared
  showHistory: boolean;
  setShowHistory: (open: boolean) => void;
  toggleHistory: () => void;

  // Single OCR workspace
  singleActiveTab: SingleActiveTab;
  setSingleActiveTab: (tab: SingleActiveTab) => void;

  // Batch OCR workspace
  batchActiveTab: BatchActiveTab;
  setBatchActiveTab: (tab: BatchActiveTab) => void;

  reset: () => void;
}

const initialState: Pick<
  WorkspaceState,
  "showHistory" | "singleActiveTab" | "batchActiveTab"
> = {
  showHistory: false,
  singleActiveTab: "markdown",
  batchActiveTab: "markdown",
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...initialState,

  setShowHistory: (open) => set({ showHistory: open }),
  toggleHistory: () => set((s) => ({ showHistory: !s.showHistory })),

  setSingleActiveTab: (tab) => set({ singleActiveTab: tab }),
  setBatchActiveTab: (tab) => set({ batchActiveTab: tab }),

  reset: () => set(initialState),
}));

