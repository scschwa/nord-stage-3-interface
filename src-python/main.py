"""
Nord Stage 3 Interface - Python Sidecar
Runs as a local FastAPI server on port 47821.
Handles: .ns3fp patch file parsing (Phase 3) and enhanced MusicXML processing.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

from patch_parser import parse_ns3fp

app = FastAPI(title="Nord Stage 3 Interface Sidecar", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "tauri://localhost"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class PatchParseRequest(BaseModel):
    file_path: str


@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.post("/parse-patch")
def parse_patch(req: PatchParseRequest):
    """Parse a .ns3fp patch file and return structured parameter data."""
    try:
        result = parse_ns3fp(req.file_path)
        return result
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=47821, log_level="warning")
