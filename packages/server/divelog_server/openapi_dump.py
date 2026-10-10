"""Print the API's OpenAPI document as JSON; the frontend generates its types from it.

Run with ``uv run python -m divelog_server.openapi_dump`` from ``backend/``.
"""

import json
import sys

from divelog_server.main import create_app


def main() -> None:
    """Write the OpenAPI document of a freshly built app to stdout."""
    json.dump(create_app().openapi(), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
