from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, mapped_column

JSONType = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


def created_col():
    return mapped_column(DateTime, server_default=func.now(), default=datetime.utcnow)
