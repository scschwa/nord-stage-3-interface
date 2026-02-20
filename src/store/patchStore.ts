import { create } from "zustand";
import { PatchData } from "../lib/patch/ns3fpTypes";

export interface PatchStore {
  // Loaded patch data (null = nothing loaded)
  patch: PatchData | null;
  filePath: string | null;

  // Python sidecar health
  sidecarReady: boolean;
  sidecarError: string | null;

  // Program Change tracking (for auto-linking)
  currentProgram: number | null;    // 0–127
  currentBank: number | null;       // 0–127 (from CC0)

  // Actions
  setPatch: (patch: PatchData, filePath: string) => void;
  clearPatch: () => void;
  setSidecarReady: (ready: boolean) => void;
  setSidecarError: (error: string | null) => void;
  setProgramChange: (program: number) => void;
  setBankSelect: (bank: number) => void;
}

export const usePatchStore = create<PatchStore>((set) => ({
  patch: null,
  filePath: null,
  sidecarReady: false,
  sidecarError: null,
  currentProgram: null,
  currentBank: null,

  setPatch: (patch, filePath) => set({ patch, filePath }),
  clearPatch: () => set({ patch: null, filePath: null }),
  setSidecarReady: (ready) => set({ sidecarReady: ready, sidecarError: null }),
  setSidecarError: (error) => set({ sidecarError: error, sidecarReady: false }),
  setProgramChange: (program) => set({ currentProgram: program }),
  setBankSelect: (bank) => set({ currentBank: bank }),
}));

export const SIDECAR_URL = "http://localhost:47821";
