import numpy as np
import pytest
import hnswlib
import inspect
from storage import add_chunk_to_db, get_all_chunks  # Optionally, reuse clear_database
from index_manager import rebuild_index, query_index, DIM

@pytest.fixture(autouse=True)
def clear_db_and_index():
    # Clear database before tests.
    from storage import cursor, conn
    cursor.execute("DELETE FROM text_chunks")
    conn.commit()
    yield
    cursor.execute("DELETE FROM text_chunks")
    conn.commit()

def print_index(message):
    # Get the name of the calling test function.
    test_name = inspect.currentframe().f_back.f_code.co_name
    print(f"\n{test_name}: Passed - {message}")

def test_rebuild_index_empty():
    # Rebuild the index when there are no chunks.
    rebuild_index()
    random_emb = np.random.rand(DIM).astype(np.float32)
    labels, distances = query_index(random_emb, k=1)
    assert labels is None, "Expected no labels when no chunks are stored."
    print_index("Rebuild index empty returns no labels as expected.")

def test_rebuild_index_with_data():
    # Add two chunks.
    embedding1 = np.random.rand(DIM).astype(np.float32)
    embedding2 = np.random.rand(DIM).astype(np.float32)
    add_chunk_to_db("Chunk 1", embedding1, 0, 7)
    add_chunk_to_db("Chunk 2", embedding2, 8, 15)
    rebuild_index()
    
    chunks = get_all_chunks()
    assert len(chunks) == 2, "Should have 2 chunks stored."
    
    # Query with an embedding close to embedding1.
    query_emb = embedding1 + np.random.normal(0, 0.01, embedding1.shape).astype(np.float32)
    labels, distances = query_index(query_emb, k=1)
    assert labels is not None, "Expected valid labels from query."
    
    # The returned label should match one of the chunk IDs from the DB.
    returned_label = labels[0][0]
    chunk_ids = [chunk[0] for chunk in chunks]
    assert returned_label in chunk_ids, "Returned label does not match any chunk ID."
    print_index(f"Rebuild index with data returns valid label {returned_label} matching one of the stored chunk IDs.")