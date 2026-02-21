/**
 * Manages the optional Python sidecar lifecycle.
 *
 * Since patch parsing now runs entirely in TypeScript (ns3fpParser.ts),
 * the sidecar is no longer required for core functionality. It is started
 * in the background on desktop platforms only; Android skips it entirely.
 *
 * Mount once at App level.
 */
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePatchStore } from "../store/patchStore";
import { parseNs3f } from "../lib/patch/ns3fpParser";

const SIDECAR_URL      = "http://localhost:47821";
const POLL_INTERVAL_MS = 500;
const MAX_RETRIES      = 20;

/** True when running inside a Tauri Android build. */
function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

export function useSidecar() {
  const { setSidecarReady, setSidecarError } = usePatchStore();

  useEffect(() => {
    // Patch parsing is now pure TypeScript — no sidecar needed.
    // On Android there is no Python; mark ready immediately so the UI isn't blocked.
    if (isAndroid()) {
      setSidecarReady(true);
      return;
    }

    let retries  = 0;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function start() {
      try {
        await invoke("spawn_sidecar");
      } catch (err) {
        console.warn("spawn_sidecar:", err);
      }

      pollId = setInterval(async () => {
        if (cancelled) return;
        retries++;
        try {
          const res = await fetch(`${SIDECAR_URL}/health`);
          if (res.ok) {
            clearInterval(pollId!);
            setSidecarReady(true);
            return;
          }
        } catch {
          // not ready yet
        }
        if (retries >= MAX_RETRIES) {
          clearInterval(pollId!);
          // Non-fatal: patch loading works via TypeScript parser regardless.
          setSidecarError("Python sidecar unavailable (patch loading still works).");
        }
      }, POLL_INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
    };
  }, []);
}

/**
 * Open a native file picker and return the selected path (or null).
 */
export async function loadPatchFile(): Promise<string | null> {
  try {
    const filePath = await invoke<string | null>("pick_patch_file");
    return filePath ?? null;
  } catch {
    return null;
  }
}

/**
 * Parse a .ns3fp / .ns3f file using the pure-TypeScript parser.
 * Rust handles ZIP extraction; TypeScript does the bit-level parsing.
 * Works on desktop and Android — no Python sidecar required.
 */
export async function parsePatchFromPath(filePath: string) {
  const bytes = await invoke<number[]>("read_patch_bytes", { path: filePath });
  const filename = filePath.split(/[\\/]/).pop() ?? filePath;
  return parseNs3f(new Uint8Array(bytes), filename);
}
