import logging

from pythonjsonlogger.json import JsonFormatter


def configure_logging(debug: bool) -> None:
    """JSON logs in production, plain lines in development."""
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler()
    if debug:
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    else:
        handler.setFormatter(JsonFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if debug else logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
