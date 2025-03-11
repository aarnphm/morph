import numpy as np
import pytest
import inspect
from bento_service import service, DEFAULT_SENTENCES, MODEL_ID

def print_service(test_name, message):
    # Print the function name and message on a new line.
    print(f"\n{test_name}: Passed: {message}")

def test_encode_returns_numpy_array():
    """
    Test that encode returns a numpy array for a given list of sentences.
    """
    sentences = ["Test sentence one.", "Test sentence two."]
    embeddings = service.encode(sentences)
    
    # Assertions
    assert isinstance(embeddings, np.ndarray), "Embeddings should be a numpy array."
    assert embeddings.shape[0] == len(sentences), f"Expected {len(sentences)} rows, got {embeddings.shape[0]}"
    assert embeddings.shape[1] == 384, f"Expected 384 columns, got {embeddings.shape[1]}"
    
    # Print a concise success message
    test_name = inspect.currentframe().f_code.co_name
    print_service(test_name, f"Encoding returns a numpy array with shape {embeddings.shape}")

def test_encode_default_sentences():
    """
    Test that encode returns the correct shape for the default sentences.
    """
    embeddings = service.encode()
    
    # Assertions
    assert isinstance(embeddings, np.ndarray), "Embeddings should be a numpy array."
    assert embeddings.shape[0] == len(DEFAULT_SENTENCES), f"Expected {len(DEFAULT_SENTENCES)} rows, got {embeddings.shape[0]}"
    assert embeddings.shape[1] == 384, f"Expected 384 columns, got {embeddings.shape[1]}"
    
    # Print a concise success message
    test_name = inspect.currentframe().f_code.co_name
    print_service(test_name, f"Default sentences encoded with shape {embeddings.shape}")
