"""``divelog-server``: run the API with uvicorn, host and port from ``HOST`` and ``PORT``."""

import os

import uvicorn


def main() -> None:
    """Serve ``divelog_server.main:app`` on ``HOST``:``PORT`` (default 0.0.0.0:8000)."""
    uvicorn.run(
        "divelog_server.main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        proxy_headers=True,
        forwarded_allow_ips=os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1"),
        workers=1,
    )


if __name__ == "__main__":
    main()
