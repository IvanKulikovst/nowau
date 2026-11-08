"""structlog: JSON-логи в stdout с маскированием персональных данных."""
import logging
import re
import sys

import structlog

EMAIL_RE = re.compile(r"\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,}|local)\b")
INN_RE = re.compile(r"\b(\d{4})\d{2,6}(\d{2})\b")


def mask(value: str) -> str:
    """email → a***@domain, ИНН → 7701****67."""
    value = EMAIL_RE.sub(lambda m: f"{m.group(1)}***@{m.group(2)}", value)
    return INN_RE.sub(lambda m: f"{m.group(1)}****{m.group(2)}", value)


def _mask_processor(_, __, event_dict):
    for k, v in list(event_dict.items()):
        if isinstance(v, str):
            event_dict[k] = mask(v)
    return event_dict


def configure_logging(level: int = logging.INFO) -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _mask_processor,
            structlog.processors.JSONRenderer(ensure_ascii=False),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=False,
    )


def get_logger(name: str = "app"):
    return structlog.get_logger(name)
