// Status koneksi SSE untuk banner SSE_RECONNECTING dan teks home.replayStarting.
import { create } from "zustand";
import type { SseBridge } from "../contracts/data.ts";

export interface SseState {
  status: ReturnType<SseBridge["status"]>;
  /** gameRef dari event replay_starting terakhir; null setelah clearReplayStarting(). */
  replayStarting: string | null;
  clearReplayStarting(): void;
}

export const useSseStore = create<SseState>()((set) => ({
  status: "closed",
  replayStarting: null,
  clearReplayStarting: () => set({ replayStarting: null }),
}));
