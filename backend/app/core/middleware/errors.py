"""Глобальные обработчики ошибок: {"error": "...", "request_id": "..."}."""
from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.exceptions import AppError
from app.core.logging import get_logger

log = get_logger("errors")


def _rid(request: Request):
    return getattr(request.state, "request_id", None)


def register_error_handlers(app):
    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError):
        return JSONResponse({"error": exc.message, "request_id": _rid(request)}, status_code=exc.status_code)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"error": str(exc.detail), "request_id": _rid(request)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse({"error": "Некорректные данные запроса", "details": jsonable_encoder(exc.errors(), custom_encoder={Exception: str}),
                             "request_id": _rid(request)}, status_code=422)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.error("unhandled", error=repr(exc), request_id=_rid(request))
        return JSONResponse({"error": "Внутренняя ошибка сервера", "request_id": _rid(request)}, status_code=500)
