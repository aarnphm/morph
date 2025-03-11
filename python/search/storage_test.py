import numpy as np
import pytest
import sqlite3
import inspect
from storage import (
    numpy_to_blob, blob_to_numpy, 
    add_chunk_to_db, remove_chunk_from_db, get_all_chunks, DB_FILE, conn
)

@pytest.fixture(autouse=True)
def clear_db():
    # Clear the text_chunks table before and after each test.
    cursor = conn.cursor()
    cursor.execute("DELETE FROM text_chunks")
    conn.commit()
    yield
    cursor.execute("DELETE FROM text_chunks")
    conn.commit()

def print_storage(message):
    # Get the name of the calling function
    test_name = inspect.currentframe().f_back.f_code.co_name
    print(f"\n{test_name}: Passed: {message}")

def test_numpy_blob_conversion():
    # Create a random embedding vector.
    vector = np.random.rand(384).astype(np.float32)
    blob = numpy_to_blob(vector)
    recovered_vector = blob_to_numpy(blob, shape=(384,))
    np.testing.assert_allclose(vector, recovered_vector, err_msg="Converted array does not match original.")
    print_storage("Numpy-to-blob conversion and back is correct.")

def test_add_and_get_chunk():
    # Add a chunk and verify it's stored.
    content = "Sample text chunk."
    embedding = np.random.rand(384).astype(np.float32)
    start_index = 0
    end_index = len(content) - 1

    add_chunk_to_db(content, embedding, start_index, end_index)
    chunks = get_all_chunks()
    assert len(chunks) == 1, "Expected one chunk in the database."
    chunk = chunks[0]
    assert chunk[1] == content, "Content does not match."
    # Verify the blob can be converted back.
    recovered_embedding = blob_to_numpy(chunk[2], shape=(384,))
    np.testing.assert_allclose(embedding, recovered_embedding, err_msg="Embeddings do not match.")
    print_storage("Chunk added and retrieved correctly.")

def test_remove_chunk():
    # Add a chunk, then remove it and check that it is gone.
    content = "Chunk to be removed."
    embedding = np.random.rand(384).astype(np.float32)
    start_index = 0
    end_index = len(content) - 1

    add_chunk_to_db(content, embedding, start_index, end_index)
    chunks = get_all_chunks()
    assert len(chunks) == 1, "Expected one chunk before removal."
    chunk_id = chunks[0][0]
    remove_chunk_from_db(chunk_id)
    chunks_after = get_all_chunks()
    assert len(chunks_after) == 0, "Expected zero chunks after removal."
    print_storage("Chunk removed successfully.")
