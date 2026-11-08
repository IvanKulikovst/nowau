"""Фасад источников данных: live (ЕФРСБ + КАД) или mock — переключается PARSERS_MODE."""
from app.core.config import settings
from app.services.parsers import mock
from app.services.parsers.resilience import SourceUnavailable


async def fetch_case_bundle(*, inn: str | None = None, case_number: str | None = None) -> dict:
    """Возвращает единый словарь данных по делу. При сбое источников: status=partial + ручной ввод."""
    if settings.PARSERS_MODE == "mock":
        return {**mock.case_bundle(inn, case_number), "status": "ok", "warnings": [
            "Режим PARSERS_MODE=mock: используются демонстрационные данные, а не реальные сведения КАД/ЕФРСБ."]}
    warnings: list[str] = []
    bundle: dict = {"source": "live", "found": False, "messages": []}
    try:
        from app.services.parsers import kad
        cases = await kad.search_cases(inn=inn, case_number=case_number)
        if cases:
            bundle.update(found=True, case_number=cases[0]["number"])
    except SourceUnavailable as e:
        warnings.append(f"КАД Арбитр недоступен: {e}")
    except Exception as e:  # noqa: BLE001
        warnings.append(f"КАД Арбитр: ошибка {e!r}")
    if inn:
        try:
            from app.services.parsers import efrsb
            b = await efrsb.get_bankrupt(inn)
            if b:
                bundle.update(found=True, debtor={"inn": inn, "name": b.get("name")},
                              efrsb_guid=b.get("guid"))
                bundle["messages"] = await efrsb.get_messages(b["guid"]) if b.get("guid") else []
        except SourceUnavailable as e:
            warnings.append(f"ЕФРСБ недоступен: {e}")
        except Exception as e:  # noqa: BLE001
            warnings.append(f"ЕФРСБ: ошибка {e!r}")
    status = "partial" if warnings else "ok"
    return {**bundle, "status": status, "warnings": warnings, "manual_input_required": status == "partial"}
