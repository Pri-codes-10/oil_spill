"""
conftest.py

OWNER: shared. Makes `from app...` imports work when running `pytest` from
the backend/ directory, without needing an editable install.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
