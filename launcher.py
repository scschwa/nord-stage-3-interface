"""
Nord Stage 3 Interface — Dev Launcher
A GUI wrapper for all project CLI operations.
Run directly:  python launcher.py
Build to exe:  pyinstaller --onefile --noconsole --name "NordLauncher" launcher.py
"""

import tkinter as tk
from tkinter import scrolledtext
import subprocess
import threading
import socket
import os
import sys

# ── Project root detection ────────────────────────────────────────────────────
# When frozen by PyInstaller (--onefile), __file__ points to a temp extraction
# dir (_MEI...). sys.executable is always the real .exe path, so we use that
# instead. The exe lives in dist-launcher/, so the project root is one level up.

if getattr(sys, "frozen", False):
    # Frozen exe: dist-launcher/NordLauncher.exe → go up two levels
    _exe_dir     = os.path.dirname(os.path.abspath(sys.executable))   # dist-launcher/
    PROJECT_ROOT = os.path.dirname(_exe_dir)                           # project root
else:
    # Plain Python script: same directory as launcher.py
    PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

CARGO_EXE    = os.path.expandvars(r"%USERPROFILE%\.cargo\bin\cargo.exe")
SIDECAR_PORT = 47821

# ── Tooltip ───────────────────────────────────────────────────────────────────

class Tooltip:
    """
    Dark-themed hover tooltip for any tkinter widget.
    Appears after a short delay; dismisses on mouse-leave.
    """
    _PAD   = 8    # inner padding (px)
    _DELAY = 500  # ms before the tip appears

    def __init__(self, widget: tk.Widget, text: str):
        self._widget  = widget
        self._text    = text
        self._win: tk.Toplevel | None = None
        self._job: str | None = None
        widget.bind("<Enter>", self._schedule, add="+")
        widget.bind("<Leave>", self._cancel,   add="+")

    def _schedule(self, _event=None):
        self._cancel()
        self._job = self._widget.after(self._DELAY, self._show)

    def _cancel(self, _event=None):
        if self._job:
            self._widget.after_cancel(self._job)
            self._job = None
        if self._win:
            self._win.destroy()
            self._win = None

    def _show(self):
        if self._win:
            return
        x = self._widget.winfo_rootx() + self._widget.winfo_width() // 2
        y = self._widget.winfo_rooty() + self._widget.winfo_height() + 4

        self._win = tw = tk.Toplevel(self._widget)
        tw.wm_overrideredirect(True)          # borderless
        tw.wm_attributes("-topmost", True)
        tw.configure(bg="#1e1e1e")

        # Thin border frame
        border = tk.Frame(tw, bg="#3a3a3a", padx=1, pady=1)
        border.pack()

        lbl = tk.Label(
            border, text=self._text,
            bg="#1a1a1a", fg="#d0d0d0",
            font=("Segoe UI", 9),
            justify="left",
            padx=self._PAD, pady=self._PAD // 2,
            wraplength=320,
        )
        lbl.pack()

        tw.update_idletasks()
        tw_w = tw.winfo_width()
        # Keep tooltip on-screen horizontally
        screen_w = tw.winfo_screenwidth()
        x = max(4, min(x - tw_w // 2, screen_w - tw_w - 4))
        tw.wm_geometry(f"+{x}+{y}")

# ── Colours ──────────────────────────────────────────────────────────────────

C = {
    "bg":       "#0d0d0d",
    "surface":  "#1a1a1a",
    "header":   "#111111",
    "bar":      "#141414",
    "red":      "#c8102e",
    "text":     "#e0e0e0",
    "muted":    "#666666",
    "success":  "#4caf50",
    "warn":     "#ff9800",
    "error":    "#f44336",
    "border":   "#2a2a2a",
}


# ── Main window ───────────────────────────────────────────────────────────────

class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Nord Stage 3 — Launcher")
        self.geometry("820x560")
        self.minsize(640, 420)
        self.configure(bg=C["bg"])

        self._process: subprocess.Popen | None = None
        self._build_ui()
        self._schedule_port_check()
        self._log_info(f"Project root: {PROJECT_ROOT}\n")

    # ── UI construction ───────────────────────────────────────────────────────

    def _build_ui(self):
        self._build_header()
        self._build_buttons()
        self._build_status_bar()
        self._build_log()

    def _build_header(self):
        f = tk.Frame(self, bg=C["header"], height=50)
        f.pack(fill="x")
        f.pack_propagate(False)

        tk.Label(f, text="NORD", fg=C["red"], bg=C["header"],
                 font=("Segoe UI", 16, "bold")).pack(side="left", padx=(16, 0))
        tk.Label(f, text=" Stage 3 — Dev Launcher", fg=C["text"], bg=C["header"],
                 font=("Segoe UI", 12)).pack(side="left")

        self._status_lbl = tk.Label(f, text="Ready", fg=C["muted"], bg=C["header"],
                                     font=("Segoe UI", 10))
        self._status_lbl.pack(side="right", padx=16)

    def _build_buttons(self):
        f = tk.Frame(self, bg=C["bar"], pady=10)
        f.pack(fill="x")

        self._btn(f, "▶  Launch Dev",   self._launch_dev,   bg=C["red"],  fg="#fff",    bold=True, padx=14,
                  tip="Runs 'npm run tauri dev'.\n\nCompiles the Rust backend and starts the Vite dev server with hot-reload. Use this for day-to-day development. The first run takes ~1–2 min while Cargo downloads dependencies; subsequent starts are fast.")
        self._btn(f, "⬛  Stop",         self._stop,         bg="#252525",  fg=C["muted"],
                  tip="Terminates the currently running process and all its child processes (Cargo, Vite, Python sidecar).\n\nUse this to stop a running dev server or build before starting a new one.")
        self._sep(f)
        self._btn(f, "📦  Install Deps", self._npm_install,  bg="#252525",  fg=C["text"],
                  tip="Runs 'npm install'.\n\nDownloads and installs all JavaScript/TypeScript dependencies listed in package.json into the node_modules/ folder. Run this once after cloning the repo, or whenever package.json changes (e.g. after a git pull).")
        self._btn(f, "🏗   Build App",   self._build_app,    bg="#252525",  fg=C["text"],
                  tip="Runs 'npm run tauri build'.\n\nProduces a production-ready installer in src-tauri/target/release/bundle/. Compiles Rust in release mode and bundles the frontend. Takes several minutes. Use when you want a distributable .exe/.msi, not for regular development.")
        self._sep(f)
        self._btn(f, "✓  TS Check",      self._ts_check,     bg="#252525",  fg=C["text"],
                  tip="Runs 'npx tsc --noEmit'.\n\nType-checks all TypeScript source files without emitting any output. Fast and safe — does not start the app. Run after editing .ts/.tsx files to catch type errors before launching.")
        self._btn(f, "✓  Cargo Check",   self._cargo_check,  bg="#252525",  fg=C["text"],
                  tip="Runs 'cargo check' in the src-tauri/ directory.\n\nVerifies that the Rust backend compiles without errors, but skips the final linking step so it finishes much faster than a full build. Run after editing any .rs files.")
        self._sep(f)
        self._btn(f, "⚡  Kill :47821",  self._kill_port,    bg="#2d1414",  fg=C["error"],
                  tip=f"Force-kills whatever process is listening on port {SIDECAR_PORT}.\n\nThe Python sidecar (main.py) binds to this port. If the app crashes or is force-closed, the sidecar may keep running and block the next launch. Use this to free the port before restarting.")

    def _sep(self, parent):
        tk.Frame(parent, bg=C["border"], width=1, height=28).pack(side="left", padx=6)

    def _btn(self, parent, text, cmd, bg, fg, bold=False, padx=10, tip: str = ""):
        b = tk.Button(
            parent, text=text, command=cmd,
            bg=bg, fg=fg, activebackground=bg, activeforeground=fg,
            font=("Segoe UI", 11, "bold" if bold else "normal"),
            relief="flat", padx=padx, pady=6, cursor="hand2", bd=0,
        )
        b.pack(side="left", padx=(4, 0))
        r = min(255, int(bg[1:3], 16) + 22) if len(bg) == 7 else 40
        g = min(255, int(bg[3:5], 16) + 22) if len(bg) == 7 else 40
        bv = min(255, int(bg[5:7], 16) + 22) if len(bg) == 7 else 40
        hover = f"#{r:02x}{g:02x}{bv:02x}"
        b.bind("<Enter>", lambda e: b.configure(bg=hover))
        b.bind("<Leave>", lambda e: b.configure(bg=bg))
        if tip:
            Tooltip(b, tip)
        return b

    def _build_status_bar(self):
        f = tk.Frame(self, bg=C["bar"], height=24)
        f.pack(fill="x")
        f.pack_propagate(False)

        self._port_lbl = tk.Label(f, text="", fg=C["muted"], bg=C["bar"],
                                   font=("Segoe UI", 9), padx=12)
        self._port_lbl.pack(side="left")

        self._proc_lbl = tk.Label(f, text="● Idle", fg=C["muted"], bg=C["bar"],
                                   font=("Segoe UI", 9), padx=12)
        self._proc_lbl.pack(side="right")

    def _build_log(self):
        f = tk.Frame(self, bg=C["bg"])
        f.pack(fill="both", expand=True)

        self._log = scrolledtext.ScrolledText(
            f, bg="#0a0a0a", fg=C["text"],
            font=("Consolas", 10), insertbackground=C["text"],
            selectbackground="#2a2a2a", relief="flat", bd=0,
            state="disabled", wrap="word",
        )
        self._log.pack(fill="both", expand=True, padx=1, pady=1)

        self._log.tag_config("info",    foreground=C["muted"])
        self._log.tag_config("success", foreground=C["success"])
        self._log.tag_config("warn",    foreground=C["warn"])
        self._log.tag_config("error",   foreground=C["error"])
        self._log.tag_config("sep",     foreground="#2a2a2a")

    # ── Logging ───────────────────────────────────────────────────────────────

    def _append(self, text: str, tag: str = ""):
        self._log.configure(state="normal")
        self._log.insert("end", text, tag)
        self._log.see("end")
        self._log.configure(state="disabled")

    def _log_info(self, msg):    self._append(msg, "info")
    def _log_success(self, msg): self._append(msg, "success")
    def _log_warn(self, msg):    self._append(msg, "warn")
    def _log_error(self, msg):   self._append(msg, "error")

    def _log_sep(self, label: str):
        self._append(f"\n{'─' * 64}\n", "sep")
        self._append(f"  {label}\n")
        self._append(f"{'─' * 64}\n", "sep")

    def _set_status(self, text: str, color: str = C["muted"]):
        self._status_lbl.configure(text=text, fg=color)

    def _set_proc(self, text: str, color: str = C["muted"]):
        self._proc_lbl.configure(text=text, fg=color)

    # ── Command runner ────────────────────────────────────────────────────────

    def _run(self, cmd: str, cwd: str | None = None, label: str = "Running"):
        """
        Run a shell command in a background thread, streaming output to the log.

        Uses shell=True so Windows .cmd wrappers (npm, npx) are found without
        needing their full path.
        """
        if self._process and self._process.poll() is None:
            self._log_warn("A process is already running — stop it first.\n")
            return

        self._log_sep(f"{label}: {cmd}")
        self._set_status(f"{label}…", C["warn"])
        self._set_proc("● Running", C["warn"])

        def _worker():
            try:
                self._process = subprocess.Popen(
                    cmd,
                    cwd=cwd or PROJECT_ROOT,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    shell=True,                          # Required: finds npm.cmd, npx.cmd etc.
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                for line in self._process.stdout:
                    tag = "error" if any(w in line.lower()
                                         for w in ("error", "failed", "cannot")) else ""
                    self.after(0, self._append, line, tag)

                rc = self._process.wait()
                if rc == 0:
                    self.after(0, self._log_success, "\n✓ Completed successfully.\n")
                    self.after(0, self._set_status, "Done", C["success"])
                else:
                    self.after(0, self._log_error, f"\n✗ Exited with code {rc}\n")
                    self.after(0, self._set_status, f"Error (exit {rc})", C["error"])
            except Exception as exc:
                self.after(0, self._log_error, f"Error: {exc}\n")
                self.after(0, self._set_status, "Error", C["error"])
            finally:
                self.after(0, self._set_proc, "● Idle", C["muted"])
                self.after(0, self._schedule_port_check)

        threading.Thread(target=_worker, daemon=True).start()

    # ── Actions ───────────────────────────────────────────────────────────────

    def _launch_dev(self):
        self._run("npm run tauri dev", label="Launch Dev")

    def _build_app(self):
        self._run("npm run tauri build", label="Build")

    def _npm_install(self):
        self._run("npm install", label="npm install")

    def _ts_check(self):
        self._run("npx tsc --noEmit", label="TypeScript check")

    def _cargo_check(self):
        cargo = CARGO_EXE if os.path.exists(CARGO_EXE) else "cargo"
        self._run(
            f'"{cargo}" check',
            cwd=os.path.join(PROJECT_ROOT, "src-tauri"),
            label="Cargo check",
        )

    def _stop(self):
        if self._process and self._process.poll() is None:
            # Kill the whole process group so child processes (cargo, webpack…) die too
            subprocess.run(
                f"taskkill /F /T /PID {self._process.pid}",
                shell=True, creationflags=subprocess.CREATE_NO_WINDOW,
            )
            self._log_warn("\nProcess terminated.\n")
            self._set_status("Stopped", C["muted"])
            self._set_proc("● Idle", C["muted"])
        else:
            self._log_info("No process running.\n")

    def _kill_port(self):
        self._log_sep(f"Kill port {SIDECAR_PORT}")
        result = subprocess.run(
            f'for /f "tokens=5" %a in '
            f'(\'netstat -aon ^| findstr ":{SIDECAR_PORT}.*LISTENING"\') '
            f'do taskkill /F /PID %a',
            shell=True, capture_output=True, text=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        out = (result.stdout + result.stderr).strip()
        if out:
            self._log_success(f"{out}\n")
        else:
            self._log_info(f"Nothing found on port {SIDECAR_PORT}.\n")
        self.after(600, self._check_port)

    # ── Port status polling ───────────────────────────────────────────────────

    def _schedule_port_check(self):
        self.after(0, self._check_port)

    def _check_port(self):
        in_use = False
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.15)
                in_use = s.connect_ex(("127.0.0.1", SIDECAR_PORT)) == 0
        except OSError:
            pass

        if in_use:
            self._port_lbl.configure(text=f"● Sidecar on :{SIDECAR_PORT}", fg=C["success"])
        else:
            self._port_lbl.configure(text=f"○ No sidecar  :{SIDECAR_PORT}", fg=C["muted"])

        self.after(3000, self._check_port)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = Launcher()
    app.mainloop()
