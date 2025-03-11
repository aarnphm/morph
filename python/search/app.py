# app.py
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Import the BentoML service instance.
from bento_service import service

# Import storage functions.
from storage import add_chunk_to_db, remove_chunk_from_db, get_all_chunks

# Import index manager functions.
from index_manager import rebuild_index, query_index, DIM

app = FastAPI(title="Text Editor Embedding Service")

# ---------------------------
# Pydantic Models for Requests
# ---------------------------
class ChunkRequest(BaseModel):
    content: str
    start_index: int
    end_index: int

class NoteRequest(BaseModel):
    content: str

# ---------------------------
# API Endpoints
# ---------------------------
@app.post("/chunk")
async def add_chunk(chunk: ChunkRequest):
    """
    Adds a new text chunk:
      - Computes its embedding using the BentoML service.
      - Persists the chunk in the database.
      - Rebuilds the HNSW index.
    """
    embeddings = service.encode([chunk.content])
    embedding = embeddings[0]  # Take the single embedding.
    add_chunk_to_db(chunk.content, embedding, chunk.start_index, chunk.end_index)
    rebuild_index()
    return {"message": "Chunk added successfully"}

@app.delete("/chunk/{chunk_id}")
async def delete_chunk(chunk_id: int):
    """
    Deletes a text chunk by its ID and rebuilds the HNSW index.
    """
    remove_chunk_from_db(chunk_id)
    rebuild_index()
    return {"message": f"Chunk {chunk_id} deleted successfully"}

@app.post("/note")
async def process_note(note: NoteRequest):
    """
    Processes a note:
      - Computes its embedding using the BentoML service.
      - Queries the HNSW index to find the most similar text chunk.
      - Returns the matching chunk's details.
    """
    embeddings = service.encode([note.content])
    note_embedding = embeddings[0]

    labels, distances = query_index(note_embedding, k=1)
    if labels is None:
        return {"message": "Note processed", "best_match": None}

    best_label = labels[0][0]
    
    # Retrieve the best matching chunk from the database.
    chunks = get_all_chunks()
    best_chunk = None
    for row in chunks:
        if row[0] == best_label:
            best_chunk = {
                "id": row[0],
                "content": row[1],
                "start_index": row[3],
                "end_index": row[4]
            }
            break

    return {"message": "Note processed", "best_match": best_chunk}

# ---------------------------
# Run the FastAPI App
# ---------------------------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
