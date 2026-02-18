import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { useMidiStore } from "../../store/midiStore";

// Note range to display
const FIRST_NOTE = 21;
const LAST_NOTE = 108;
const NOTE_RANGE = LAST_NOTE - FIRST_NOTE + 1;

// Colors per velocity (reuses a gradient)
function noteColorHex(velocity: number): number {
  // Map velocity to a color: soft (low vel) = blue-purple, hard (high vel) = cyan-white
  const t = velocity / 127;
  const r = Math.floor(0x20 + t * (0xff - 0x20));
  const g = Math.floor(0x80 + t * (0xff - 0x80));
  const b = 0xff;
  return (r << 16) | (g << 8) | b;
}

// Black key pitch classes
const BLACK_KEY_PCS = new Set([1, 3, 6, 8, 10]);

interface ActiveBar {
  note: number;
  startY: number;
  color: number;
  alpha: number;
  velocity: number;
}

interface FallingBar extends ActiveBar {
  endY: number;
  graphics: PIXI.Graphics;
}

export function FallingBars() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const barsRef = useRef<Map<number, FallingBar>>(new Map());
  const completedBarsRef = useRef<PIXI.Graphics[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new PIXI.Application();
    appRef.current = app;

    const container = canvasRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 300;

    app.init({
      width,
      height,
      background: 0x0d0d0d,
      antialias: true,
      resizeTo: container,
    }).then(() => {
      container.appendChild(app.canvas);

      // Draw static key guide lines (faint vertical lines for each note)
      const guide = new PIXI.Graphics();
      for (let note = FIRST_NOTE; note <= LAST_NOTE; note++) {
        const x = noteToX(note, app.renderer.width);
        const pc = note % 12;
        const isBlack = BLACK_KEY_PCS.has(pc);
        guide.stroke({ width: 0.5, color: isBlack ? 0x1a1a1a : 0x222222 });
        guide.moveTo(x, 0);
        guide.lineTo(x, app.renderer.height);
      }
      app.stage.addChild(guide);

      // Scroll loop
      let lastTime = performance.now();
      const FALL_SPEED = 60; // pixels per second

      const tick = (currentTime: number) => {
        const dt = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        const activeNotes = useMidiStore.getState().activeNotes;
        const rendererHeight = app.renderer.height;
        const rendererWidth = app.renderer.width;

        // Update falling active bars (growing downward from top)
        activeNotes.forEach((noteState, note) => {
          if (!barsRef.current.has(note)) {
            // New note: create bar starting at top (y=0)
            const color = noteColorHex(noteState.velocity);
            const gfx = new PIXI.Graphics();
            app.stage.addChild(gfx);
            barsRef.current.set(note, {
              note,
              startY: 0,
              endY: 0,
              color,
              alpha: 0.85 + (noteState.velocity / 127) * 0.15,
              velocity: noteState.velocity,
              graphics: gfx,
            });
          }

          const bar = barsRef.current.get(note)!;
          bar.endY += FALL_SPEED * dt;

          const x = noteToX(note, rendererWidth);
          const w = noteWidth(note, rendererWidth);
          bar.graphics.clear();
          bar.graphics.roundRect(x + 1, bar.startY, w - 2, bar.endY - bar.startY, 3);
          bar.graphics.fill({ color: bar.color, alpha: bar.alpha });
          // Glow effect (inner lighter rectangle)
          bar.graphics.roundRect(x + 2, bar.startY + 2, w - 4, Math.min(8, bar.endY - bar.startY - 4), 2);
          bar.graphics.fill({ color: 0xffffff, alpha: 0.2 });
        });

        // For notes that ended: slide completed bars downward and fade
        const toRemove: PIXI.Graphics[] = [];
        completedBarsRef.current.forEach((gfx) => {
          gfx.y += FALL_SPEED * dt;
          gfx.alpha -= dt * 0.8;
          if (gfx.alpha <= 0 || gfx.y > rendererHeight) {
            toRemove.push(gfx);
          }
        });
        toRemove.forEach((gfx) => {
          app.stage.removeChild(gfx);
          completedBarsRef.current = completedBarsRef.current.filter((g) => g !== gfx);
        });

        // Check for released notes (in barsRef but not in activeNotes)
        const toRelease: number[] = [];
        barsRef.current.forEach((_bar, note) => {
          if (!activeNotes.has(note)) {
            toRelease.push(note);
          }
        });
        toRelease.forEach((note) => {
          const bar = barsRef.current.get(note)!;
          app.stage.removeChild(bar.graphics);
          // Create a "completed" copy that will fall and fade
          const completedGfx = new PIXI.Graphics();
          const x = noteToX(note, rendererWidth);
          const w = noteWidth(note, rendererWidth);
          completedGfx.roundRect(x + 1, bar.startY, w - 2, bar.endY - bar.startY, 3);
          completedGfx.fill({ color: bar.color, alpha: bar.alpha });
          app.stage.addChild(completedGfx);
          completedBarsRef.current.push(completedGfx);
          barsRef.current.delete(note);
        });

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      barsRef.current.clear();
      completedBarsRef.current = [];
      app.destroy(true);
      appRef.current = null;
    };
  }, []);

  return <div ref={canvasRef} style={{ width: "100%", height: "100%", overflow: "hidden" }} />;
}

function noteToX(note: number, width: number): number {
  return ((note - FIRST_NOTE) / NOTE_RANGE) * width;
}

function noteWidth(note: number, width: number): number {
  const pc = note % 12;
  const isBlack = BLACK_KEY_PCS.has(pc);
  const unitWidth = width / NOTE_RANGE;
  return isBlack ? unitWidth * 0.7 : unitWidth * 0.9;
}
