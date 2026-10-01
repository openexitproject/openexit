from __future__ import annotations

from typing import Any


class OpenExitError(Exception):
    """Base exception for the OpenExit Python SDK."""


class PaspError(OpenExitError):
    """A PASP validation failure with a stable protocol error code."""

    def __init__(self, code: str, message: str, *, context: Any = None) -> None:
        self.code = code
        self.context = context
        super().__init__(message)
