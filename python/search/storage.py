import sqlite3
import numpy as np

# DB File
DB_FILE = "embeddings.db"

# Connection to DB
conn = sqlite3.connect(DB_FILE, check_same_thread=False)
cursor = conn.cursor()

# Create the text_chunks table
# ID, Chunk_sentences, chunk_embeddings, start_index of the document, end_index of the document
cursor.execute("""
CREATE TABLE IF NOT EXISTS text_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    embedding BLOB,
    start_index INTEGER,
    end_index INTEGER
)
""")
conn.commit()

# convert to blob since sqlite3 does not support numpy arrays
def numpy_to_blob(arr: np.ndarray) -> bytes:
    """Convert a NumPy array to bytes for storage."""
    return arr.tobytes()

# convert back to numpy array
def blob_to_numpy(blob: bytes, shape: tuple = (384,)) -> np.ndarray:
    """Convert a blob back to a NumPy array with the specified shape."""
    return np.frombuffer(blob, dtype=np.float32).reshape(shape)

# Add a chunk to the database
def add_chunk_to_db(content: str, embedding: np.ndarray, start_index: int, end_index: int):
    """
    Insert a text chunk record into the SQLite database with its location.
    The id is auto-generated.
    """
    blob = numpy_to_blob(embedding)
    cursor.execute(
        "INSERT INTO text_chunks (content, embedding, start_index, end_index) VALUES (?, ?, ?, ?)",
        (content, blob, start_index, end_index)
    )
    conn.commit()

# Remove a chunk from the database
def remove_chunk_from_db(chunk_id: int):
    """Remove a text chunk from the SQLite database using its integer ID."""
    cursor.execute("DELETE FROM text_chunks WHERE id = ?", (chunk_id,))
    conn.commit()

# List all chunks with their metadata
def get_all_chunks() -> list:
    """
    Return all text chunks as a list of tuples:
    (id, content, embedding, start_index, end_index)
    """
    cursor.execute("SELECT id, content, embedding, start_index, end_index FROM text_chunks")
    return cursor.fetchall()