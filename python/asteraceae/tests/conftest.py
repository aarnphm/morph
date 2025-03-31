import pytest


@pytest.fixture(scope='package')
def service():
  from ..service import LLM

  return LLM
