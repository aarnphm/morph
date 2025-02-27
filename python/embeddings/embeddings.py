from nltk.tokenize import sent_tokenize
import json
import numpy as np
from sentence_transformers import SentenceTransformer

# Load a Modern BERT-style embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")
print("Modern BERT Model Loaded Successfully!")

# Overlapping Chunking Function
def chunker(text, chunk_size=3, overlap=1):
    chunks = {}
    paragraphs = text.split("\n\n")  # Split text by paragraphs
    chunk_id = 0  

    for paragraph in paragraphs:
        sentences = sent_tokenize(paragraph)  # Tokenize sentences using nltk
        num_sentences = len(sentences)

        if num_sentences == 0:
            continue

        for i in range(0, num_sentences, chunk_size - overlap):
            chunk = " ".join(sentences[i:i + chunk_size])  
            chunks[chunk_id] = chunk  
            chunk_id += 1  

    return chunks


def generate_embeddings(chunks):
    text_chunks = list(chunks.values())  
    embeddings = model.encode(text_chunks, convert_to_numpy=True)  
    return {chunk_id: embeddings[i] for i, chunk_id in enumerate(chunks.keys())}


def notes_embeddings(note_text):
    note_embedding = model.encode([note_text], convert_to_numpy=True)[0]  # Get a single embedding
    return note_embedding  # Returns a (384,) shape vector


def cosine_similarity(a, b):
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    return dot_product / (norm_a * norm_b)


def find_best_matching_chunks(note_embedding, editor_embeddings, chunked_text, top_k=3):
    top_matches = []  # Stores top K matches as (chunk_id, similarity)

    for chunk_id, chunk_embedding in editor_embeddings.items():
        similarity = cosine_similarity(note_embedding, chunk_embedding)

        # If we haven't filled the top K list yet, just add the chunk
        if len(top_matches) < top_k:
            top_matches.append((chunk_id, similarity))

        else:
            # Find the lowest similarity in the top list
            min_index = min(range(len(top_matches)), key=lambda i: top_matches[i][1])

            # If the new similarity is better than the lowest in the top 3, replace it
            if similarity > top_matches[min_index][1]:
                top_matches[min_index] = (chunk_id, similarity)

    print("\n**Top Matching Chunks:**\n")
    for rank, (chunk_id, similarity) in enumerate(top_matches, start=1):
        print(f"{rank}. (Similarity: {similarity:.4f})")
        print(f"Chunk {chunk_id}: {chunked_text[chunk_id]}\n")

    return [chunked_text[chunk_id] for chunk_id, _ in top_matches]


if __name__ == "__main__":
    # Load editor text from "text.md"
    with open("text.md", "r", encoding="utf-8") as file:
        editor_text = file.read()

    # Load notes text from "Notes.txt"
    with open("Notes.txt", "r", encoding="utf-8") as file:
        notes_text = file.read().strip()

    # Generate chunks & embeddings for the editor
    chunked_text = chunker(editor_text, chunk_size=3, overlap=1)
    editor_embeddings = generate_embeddings(chunked_text)

    # Generate embeddings for the note
    note_embedding = notes_embeddings(notes_text)

    # Find the top 3 matching chunks for the note
    top_matches = find_best_matching_chunks(note_embedding, editor_embeddings, chunked_text, top_k=3)

    # Save all embeddings & chunks
    # with open("embeddings.json", "w") as f:
    #     json.dump({"chunks": chunked_text, "embeddings": {k: v.tolist() for k, v in editor_embeddings.items()}}, f, indent=4)

    # print("\nEmbeddings Generated & Saved to `embeddings.json`")
