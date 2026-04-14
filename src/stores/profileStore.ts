import { create } from "zustand";

interface ProfileState {
  ocrHistoryQuery: string;
  setOcrHistoryQuery: (q: string) => void;

  selectedHistoryId: string | null;
  setSelectedHistoryId: (id: string | null) => void;

  reset: () => void;
}

const initialState: Pick<ProfileState, "ocrHistoryQuery" | "selectedHistoryId"> =
  {
    ocrHistoryQuery: "",
    selectedHistoryId: null,
  };

export const useProfileStore = create<ProfileState>((set) => ({
  ...initialState,
  setOcrHistoryQuery: (q) => set({ ocrHistoryQuery: q }),
  setSelectedHistoryId: (id) => set({ selectedHistoryId: id }),
  reset: () => set(initialState),
}));

