"""
Serves the classic, human-playable Flappy Bird game (static/index.html +
style.css + script.js -- plain HTML5 Canvas and JavaScript, no server-side
game logic, no AI).

Local run:      uvicorn app:app --reload
Render start:   uvicorn app:app --host 0.0.0.0 --port $PORT
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Flappy Bird")


@app.get("/health")
def health():
    return {"status": "ok"}


# Serves index.html at "/" and style.css / script.js alongside it.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
