# index_manager.py
import numpy as np
import hnswlib
from storage import get_all_chunks, blob_to_numpy, add_chunk_to_db

# Constants for the index
DIM = 384            # Embedding dimension
MAX_ELEMENTS = 10000 # Maximum number of elements in the index

# Global variable to hold the HNSW index instance.
hnsw_index = None

def rebuild_index():
    """
    Rebuilds the HNSW index from all stored text chunks.
    Each text chunk's auto-generated integer ID (from SQLite) is used as the label.
    Note: Although each chunk in the DB has start and end indexes, these are not used
    in the indexing process.
    """
    global hnsw_index
    chunks = get_all_chunks()
    if len(chunks) == 0:
        hnsw_index = None
        return

    embeddings = []
    labels = []
    for row in chunks:
        # Each row: (id, content, embedding, start_index, end_index)
        # We only need the id and embedding for the index.
        chunk_id = row[0]  # integer ID
        embedding_blob = row[2]
        embedding = blob_to_numpy(embedding_blob)
        embeddings.append(embedding)
        labels.append(chunk_id)

    embeddings = np.vstack(embeddings)

    # Initialize a new HNSW index.
    index = hnswlib.Index(space='cosine', dim=DIM)
    index.init_index(max_elements=MAX_ELEMENTS, ef_construction=200, M=16)  # Hyper parameters (TBD tuning)
    index.set_ef(50)
    index.add_items(embeddings, np.array(labels))
    hnsw_index = index

def query_index(query_embedding: np.ndarray, k: int = 1):
    """
    Queries the HNSW index with the given embedding.
    
    Args:
        query_embedding: A numpy array of shape (DIM,).
        k: Number of nearest neighbors to return.
    
    Returns:
        Tuple of (labels, distances) from the HNSW index.
        If the index is empty, returns (None, None).
    """
    if hnsw_index is None:
        return None, None
    query_embedding = query_embedding.reshape(1, -1)
    labels, distances = hnsw_index.knn_query(query_embedding, k=k)
    return labels, distances