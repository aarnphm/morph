from __future__ import annotations

import logging, typing as t

from llama_index.core.schema import TransformComponent
from llama_index.core import Document

from libs.protocol import TaskType

if t.TYPE_CHECKING:
  from llama_index.core.schema import BaseNode

logger = logging.getLogger('bentoml.service')

T = t.TypeVar('T', bound=object)


def make_labels(task: TaskType) -> dict[str, t.Any]:
  return {'owner': 'aarnphm', 'type': 'engine', 'task': task}


class LineNumberMetadataExtractor(TransformComponent):
  def __call__(self, nodes: t.Sequence[BaseNode], **kwargs: t.Any) -> list[BaseNode]:
    for node in nodes:
      # Ensure it's a TextNode derived from a Document and has source info
      if (
        isinstance(node, Document)
        or not hasattr(node, 'source_node')
        or not node.source_node
        or not hasattr(node.source_node, 'text')
      ):
        continue

      original_text = node.source_node.text
      chunk_text = node.get_content()  # Use get_content() for robustness

      node.metadata['start_line'] = -1  # Default value indicating failure
      node.metadata['end_line'] = -1

      try:
        start_char_index = original_text.find(chunk_text)
        if start_char_index == -1:
          # Log a warning if the exact chunk text isn't found
          logger.warning(
            'Could not find exact chunk text for node %s in original document %s. Line numbers will not be added.',
            node.node_id,
            node.source_node.node_id,
          )
          continue

        # Calculate start line (1-based)
        start_line = original_text.count('\n', 0, start_char_index) + 1

        # Calculate end line (1-based)
        # Count newlines *within* the chunk itself
        end_line = start_line + chunk_text.count('\n')

        node.metadata['start_line'] = start_line
        node.metadata['end_line'] = end_line

      except Exception as e:
        logger.error('Error extracting line numbers for node %s: %s', node.node_id, e)
        # Keep default -1 values if an error occurs

    return nodes
