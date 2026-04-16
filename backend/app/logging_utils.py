"""Lightweight structured logging utilities."""
import json
import logging


def get_logger(name: str) -> logging.Logger:
    """Return a logger with a stream handler if not already configured."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


def log_event(logger: logging.Logger, event: str, **fields) -> None:
    """Emit a structured JSON log line."""
    logger.info(json.dumps({"event": event, **{k: str(v) for k, v in fields.items()}}))
