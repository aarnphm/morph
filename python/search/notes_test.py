import pytest
import inspect
from fastapi.testclient import TestClient
from app import app
from storage import cursor, conn, get_all_chunks

client = TestClient(app)

# A long story with eight paragraphs.
LONG_STORY = """
In the quiet village of Everwood, a young writer named Clara began documenting her life. Her early days were filled with the wonder of childhood adventures and the magic of first discoveries.

The village was a picturesque haven, with cobblestone streets, ivy-covered cottages, and a centuries-old oak that whispered legends to those who would listen.

Clara's memories of her childhood were vivid; she recalled playing in sun-dappled fields and listening to her grandmother's enchanting tales of mystical creatures and far-off lands.

As she grew older, the landscapes of Everwood transformed in her writing. However, her descriptions of the natural environment remained brief, leaving readers yearning for more detailed imagery of the rolling meadows and vibrant forests.

Her narrative then shifted to the emotional depths of growing up, yet the portrayal of inner struggles and personal challenges often felt underdeveloped, leaving a gap between her vivid memories and her present reflections.

In one chapter, she recounted a mysterious encounter with a wandering storyteller whose words painted a curious picture of love and loss—but the emotions behind that meeting were left largely unexplored.

Later, Clara critiqued the rapid changes in modern society, noting how traditions were slowly fading in the face of relentless progress, though this critique was presented in a rather vague manner.

Finally, the story took an unexpected twist when Clara revealed that the very essence of her creative spark was entwined with the secrets of Everwood, leaving readers with an open-ended invitation to ponder what truly made the village magical.
"""

def clear_database():
    cursor.execute("DELETE FROM text_chunks")
    conn.commit()

@pytest.fixture(autouse=True)
def run_before_and_after_tests():
    clear_database()
    yield
    clear_database()

def split_text_into_chunks(text: str):
    """
    Splits the given text into paragraphs (chunks) based on double newlines.
    Returns a list of tuples: (chunk_text, start_index, end_index)
    """
    paragraphs = text.strip().split("\n\n")
    chunks = []
    current_index = 0
    for para in paragraphs:
        para = para.strip().replace("\n", " ")  # flatten newlines within a paragraph
        start_index = current_index
        end_index = start_index + len(para) - 1
        chunks.append((para, start_index, end_index))
        # Assume two newline characters separate paragraphs (adding 2 plus 1 for spacing).
        current_index = end_index + 3  
    return chunks

def add_story_chunks():
    chunks = split_text_into_chunks(LONG_STORY)
    for chunk_text, start_index, end_index in chunks:
        payload = {
            "content": chunk_text,
            "start_index": start_index,
            "end_index": end_index
        }
        response = client.post("/chunk", json=payload)
        assert response.status_code == 200, f"Failed to add chunk starting at {start_index}"
    stored_chunks = get_all_chunks()
    assert len(stored_chunks) == len(chunks)
    return chunks

def print_match(note_content, best_match):
    import inspect
    current_frame = inspect.currentframe()
    caller_frame = inspect.getouterframes(current_frame)[1]
    function_name = caller_frame.function
    print(f"\n{function_name}: Passed: Note: \"{note_content}\" matched chunk starting at index {best_match['start_index']}.")


# --- Test Cases ---

def test_note_suggestion_childhood_magic():
    """
    Note 1: "The writer should elaborate more on the magic of childhood adventures."
    Expect the best matching chunk to reference childhood and magic.
    """
    add_story_chunks()
    note = "The writer should elaborate more on the magic of childhood adventures."
    note_payload = {"content": note}
    response = client.post("/note", json=note_payload)
    data = response.json()
    assert data["message"] == "Note processed"
    best_match = data["best_match"]
    assert best_match is not None, "Expected a best match for childhood magic note."
    content = best_match["content"].lower()
    keywords = ["childhood", "magic", "adventures"]
    assert any(k in content for k in keywords), f"Expected one of {keywords} in: {content}"
    print_match(note, best_match)

def test_note_suggestion_village_beauty():
    """
    Note 2: "The description of the village should be more vivid and detailed."
    Expect the matching chunk to include details like cobblestone, cottages, or oak.
    """
    add_story_chunks()
    note = "The description of the village should be more vivid and detailed."
    note_payload = {"content": note}
    response = client.post("/note", json=note_payload)
    data = response.json()
    assert data["message"] == "Note processed"
    best_match = data["best_match"]
    assert best_match is not None, "Expected a best match for village beauty note."
    content = best_match["content"].lower()
    keywords = ["village", "cobblestone", "cottages", "oak"]
    assert any(k in content for k in keywords), f"Expected one of {keywords} in: {content}"
    print_match(note, best_match)

def test_note_suggestion_environment_detail():
    """
    Note 3: "Please expand on the environmental details, describing the meadows and forests."
    Expect the matching chunk to mention natural scenery.
    """
    add_story_chunks()
    note = "Please expand on the environmental details, describing the meadows and forests."
    note_payload = {"content": note}
    response = client.post("/note", json=note_payload)
    data = response.json()
    assert data["message"] == "Note processed"
    best_match = data["best_match"]
    assert best_match is not None, "Expected a best match for environmental detail note."
    content = best_match["content"].lower()
    keywords = ["meadows", "forests", "environment", "landscapes"]
    assert any(k in content for k in keywords), f"Expected one of {keywords} in: {content}"
    print_match(note, best_match)

def test_note_suggestion_narrative_depth():
    """
    Note 4: "The narrative feels shallow; more depth should be added to the story."
    Expect the matching chunk to address narrative or storytelling aspects.
    """
    add_story_chunks()
    note = "The narrative feels shallow; more depth should be added to the story."
    note_payload = {"content": note}
    response = client.post("/note", json=note_payload)
    data = response.json()
    assert data["message"] == "Note processed"
    best_match = data["best_match"]
    assert best_match is not None, "Expected a best match for narrative depth note."
    content = best_match["content"].lower()
    keywords = ["narrative", "depth", "story"]
    assert any(k in content for k in keywords), f"Expected one of {keywords} in: {content}"
    print_match(note, best_match)

def test_note_suggestion_emotional_intensity():
    """
    Note 5: "The emotional expressions are weak; please intensify the depiction of personal struggles."
    Expect the matching chunk to mention emotions or inner struggles.
    """
    add_story_chunks()
    note = "The emotional expressions are weak; please intensify the depiction of personal struggles."
    note_payload = {"content": note}
    response = client.post("/note", json=note_payload)
    data = response.json()
    assert data["message"] == "Note processed"
    best_match = data["best_match"]
    assert best_match is not None, "Expected a best match for emotional intensity note."
    content = best_match["content"].lower()
    keywords = ["emotional", "struggles", "challenges"]
    assert any(k in content for k in keywords), f"Expected one of {keywords} in: {content}"
    print_match(note, best_match)

def test_note_suggestion_modern_critique():
    """
    Note 6: "The critique of modern society seems vague; expand on how traditions are fading."
    Expect the matching chunk to reference modern society or fading traditions.
    """
    add_story_chunks()
    note = "The critique of modern society seems vague; expand on how traditions are fading."
    note_payload = {"content": note}
    response = client.post("/note", json=note_payload)
    data = response.json()
    assert data["message"] == "Note processed"
    best_match = data["best_match"]
    assert best_match is not None, "Expected a best match for modern critique note."
    content = best_match["content"].lower()
    keywords = ["modern society", "traditions", "fading", "critique"]
    assert any(k in content for k in keywords), f"Expected one of {keywords} in: {content}"
    print_match(note, best_match)

def test_note_suggestion_final_twist():
    """
    Note 7: "The ending is too predictable; consider adding an unexpected twist."
    Expect the matching chunk to refer to the final twist or secret.
    """
    add_story_chunks()
    note = "The ending is too predictable; consider adding an unexpected twist."
    note_payload = {"content": note}
    response = client.post("/note", json=note_payload)
    data = response.json()
    assert data["message"] == "Note processed"
    best_match = data["best_match"]
    assert best_match is not None, "Expected a best match for final twist note."
    content = best_match["content"].lower()
    keywords = ["twist", "secret", "magical"]
    assert any(k in content for k in keywords), f"Expected one of {keywords} in: {content}"
    print_match(note, best_match)

def test_note_suggestion_overall_improvement():
    """
    Note 8: "Overall, the story could use more cohesion and clearer transitions."
    Expect the matching chunk to reference the flow or structure of the narrative.
    """
    add_story_chunks()
    note = "Overall, the story could use more cohesion and clearer transitions."
    note_payload = {"content": note}
    response = client.post("/note", json=note_payload)
    data = response.json()
    assert data["message"] == "Note processed"
    best_match = data["best_match"]
    assert best_match is not None, "Expected a best match for overall improvement note."
    content = best_match["content"].lower()
    keywords = ["transitions", "cohesion", "flow", "narrative"]
    assert any(k in content for k in keywords), f"Expected one of {keywords} in: {content}"
    print_match(note, best_match)
