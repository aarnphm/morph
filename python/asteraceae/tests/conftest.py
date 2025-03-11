import pytest

@pytest.fixture(scope="package")
def service():
  from ..service import Engine
  return Engine
