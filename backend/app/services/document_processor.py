"""Загрузка документов: извлечение текста (PDF/DOCX/OCR) и фактов (regex-эвристики).

Факты — кандидаты: пользователь подтверждает их вручную; до подтверждения они
«требуют проверки», и расчёт применяет консервативные допущения.
Фактическая аффилированность, мотив и осведомлённость не извлекаются (только экспертно).
"""
import re
from pathlib import Path

ALLOWED = {
    "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

DOC_TYPES = [
    ("pledge", ("договор залога", "предмет залога", "залогодержатель")),
    ("loan", ("договор займа", "заимодавец", "процент")),
    ("payment", ("платёжное поручение", "платежное поручение", "платёжн", "платежн")),
    ("act", ("акт сверки", "акт выполненных", "универсальный передаточный", "накладная")),
    ("claim_letter", ("претензия", "требование об оплате")),
    ("supply", ("договор поставки", "поставщик", "покупатель")),
]

DATE_RE = r"(\d{2}\.\d{2}\.\d{4})"
AMOUNT_RE = r"(\d[\d\s ]*(?:[.,]\d{1,2})?)\s*(?:руб|₽|р\.)"


def extract_text(path: str, mime: str) -> str:
    if mime == "application/pdf":
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            text = "\n".join((p.extract_text() or "") for p in pdf.pages)
        return text if text.strip() else _ocr_pdf(path)
    if mime in ("image/jpeg", "image/png"):
        return _ocr_image(path)
    if mime.endswith("wordprocessingml.document"):
        import docx
        return "\n".join(p.text for p in docx.Document(path).paragraphs)
    raise ValueError(f"Неподдерживаемый тип файла: {mime}")


def _ocr_image(path: str) -> str:
    try:
        import pytesseract
        from PIL import Image
        return pytesseract.image_to_string(Image.open(path), lang="rus+eng")
    except Exception:  # noqa: BLE001 — OCR недоступен: пустой текст, факты не извлекутся
        return ""


def _ocr_pdf(path: str) -> str:
    try:
        import pdfplumber
        import pytesseract
        with pdfplumber.open(path) as pdf:
            return "\n".join(pytesseract.image_to_string(p.to_image(resolution=200).original, lang="rus+eng")
                             for p in pdf.pages)
    except Exception:  # noqa: BLE001
        return ""


def classify(text: str) -> str:
    low = text.lower()
    best, score = "other", 0
    for name, keys in DOC_TYPES:
        s = sum(k in low for k in keys)
        if s > score:
            best, score = name, s
    return best


def _num(s: str) -> float:
    return float(re.sub(r"[\s ]", "", s).replace(",", "."))


def extract_facts(text: str, doc_type: str) -> list[dict]:
    """Возвращает [{field, value, confidence}]."""
    facts: list[dict] = []
    low = text.lower()

    def add(field, value, conf):
        facts.append({"field": field, "value": str(value), "confidence": conf})

    if m := re.search(r"(?:договор|контракт)[^\n]{0,60}?от\s*" + DATE_RE, low) or \
            re.search(r"от\s*" + DATE_RE, low):
        add("contract_date", m.group(1), 0.7)
    if m := re.search(r"(?:оплачено|оплата|платёж|платеж|исполнен)[^\n]{0,60}?" + DATE_RE, low):
        add("execution_date", m.group(1), 0.6)
    amounts = [_num(a) for a in re.findall(AMOUNT_RE, text, flags=re.I)]
    if amounts:
        add("principal_amount", max(amounts), 0.6)
    if m := re.search(r"(?:неустойк|штраф|пени)[^\n]{0,60}?" + AMOUNT_RE, text, flags=re.I):
        add("penalty_amount", _num(m.group(1)), 0.5)
    for inn in sorted(set(re.findall(r"инн\D{0,5}(\d{10}|\d{12})", low))):
        add("party_inn", inn, 0.9)
    if m := re.search(r"(\d{1,2}(?:[.,]\d+)?)\s*%\s*годовых", low):
        add("interest_rate", m.group(1), 0.7)
    if "отсрочк" in low or "рассрочк" in low or "пролонгац" in low:
        add("rescue_form_marker", "отсрочка/пролонгация", 0.5)
    if doc_type == "pledge":
        add("collateral_registered", "да" if "реестр уведомлений" in low else "нет", 0.5)
        if m := re.search(r"(?:оценочная|рыночная)\s+стоимость[^\n]{0,40}?" + AMOUNT_RE, text, flags=re.I):
            add("collateral_value", _num(m.group(1)), 0.6)
    if any(k in low for k in ("просроч", "иск о взыскании", "претензи")):
        add("crisis_marker", "просрочка/иск/претензия", 0.5)
    if doc_type in ("act", "supply") or "встречн" in low:
        add("counter_performance", "да", 0.4)
    return facts


def levels_from_documents(doc_types: set[str], confirmed: bool) -> dict:
    """Какие флаги данных повышают уровни (раздел 9.6). Без подтверждения уровни не повышаются."""
    if not confirmed:
        return {}
    flags = {}
    if "payment" in doc_types and ({"supply", "loan", "act"} & doc_types):
        flags["has_payment_docs"] = True
    if "pledge" in doc_types:
        flags["has_collateral"] = True
    if "affiliation" in doc_types:
        flags["has_affiliation_docs"] = True
    return flags


def storage_path(base: str, claim_id: int, filename: str) -> Path:
    safe = re.sub(r"[^\w.\-]", "_", filename)[:100] or "file"
    p = Path(base) / "documents" / str(claim_id)
    p.mkdir(parents=True, exist_ok=True)
    return p / safe
