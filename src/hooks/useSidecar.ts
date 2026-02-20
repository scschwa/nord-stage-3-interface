/**
 * Manages the Python sidecar lifecycle.
 * - On mount: calls spawn_sidecar (Tauri command) and polls /health
 * - Exposes sidecarReady + sidecarError from patchStore
 * - On unmount: does NOT stop the sidecar (let it persist for app lifetime)
 *
 * Mount this once at the App level.
 */
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePatchStore, SIDECAR_URL } from "../store/patchStore";

const POLL_INTERVAL_MS = 500;
const MAX_RETRIES = 20;

export function useSidecar() {
  const { sidecarReady, sidecarError, setSidecarReady, setSidecarError } = usePatchStore();

  useEffect(() => {
    let retries = 0;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function start() {
      try {
        await invoke("spawn_sidecar");
      } catch (err) {
        // spawn_sidecar may return an error if already running — ignore
        console.warn("spawn_sidecar:", err);
      }

      // Poll the health endpoint until ready
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
          setSidecarError(
            "Python sidecar did not start in time. Patch loading unavailable."
          );
        }
      }, POLL_INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
    };
  }, []);

  return { sidecarReady, sidecarError };
}

/**
 * Load a patch file through the sidecar.
 * Calls Tauri pick_patch_file command (Rust native dialog), then POSTs to sidecar.
 */
export async function loadPatchFile(): Promise<string | null> {
  try {
    const filePath = await invoke<string | null>("pick_patch_file");
    return filePath ?? null;
  } catch {
    return null;
  }
}

export async function parsePatchFromPath(filePath: string) {
  const res = await fetch(`${SIDECAR_URL}/parse-patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_path: filePath }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}
