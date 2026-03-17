"""
csv_normalizer.py
-----------------
Normalizes a CSV file by fixing:
  1. Mixed date formats  -> ISO 8601 (YYYY-MM-DD)
  2. Varied phone formats -> E.164 (+1XXXXXXXXXX for US numbers)
  3. Currency strings    -> plain float (strip $, commas)
  4. Leading/trailing whitespace in all string fields

Usage:
    python csv_normalizer.py <input_path> <output_path>
"""

import sys
import csv
import re
from datetime import datetime

# ── Date normalisation ────────────────────────────────────────────────────────

DATE_FORMATS = [
    "%m/%d/%Y",        # MM/DD/YYYY
    "%Y-%m-%d",        # YYYY-MM-DD  (ISO – already canonical)
    "%d-%b-%Y",        # DD-Mon-YYYY  e.g. 15-Mar-2024
    "%d/%m/%Y",        # DD/MM/YYYY  (fallback)
    "%m-%d-%Y",        # MM-DD-YYYY
    "%B %d, %Y",       # Month DD, YYYY
    "%d %B %Y",        # DD Month YYYY
]

def normalize_date(value: str) -> str:
    """Return ISO 8601 date string, or original value if unparseable."""
    v = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return value  # unchanged if no format matched


# ── Phone normalisation ───────────────────────────────────────────────────────

def normalize_phone(value: str) -> str:
    """Strip formatting and return E.164 (+1XXXXXXXXXX) for 10-digit US numbers."""
    digits = re.sub(r"\D", "", value.strip())
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]          # drop leading country code
    if len(digits) == 10:
        return f"+1{digits}"
    return value  # unchanged if not a recognisable US number


# ── Currency normalisation ────────────────────────────────────────────────────

CURRENCY_RE = re.compile(r"^\s*\$?\s*[\d,]+(\.\d+)?\s*$")

def normalize_currency(value: str) -> str:
    """Strip $ and commas, return plain float string, or original if not currency."""
    v = value.strip()
    if CURRENCY_RE.match(v):
        cleaned = v.replace("$", "").replace(",", "").strip()
        try:
            return str(float(cleaned))
        except ValueError:
            pass
    return value


# ── Column type detection ─────────────────────────────────────────────────────

def detect_column_types(rows: list[dict], fieldnames: list[str]) -> dict[str, str]:
    """
    Heuristically decide the type of each column based on data patterns.
    Returns a dict mapping column name -> 'date' | 'phone' | 'currency' | 'text'
    """
    col_types: dict[str, str] = {}

    # Regex hints
    date_re   = re.compile(
        r"(\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}-[A-Za-z]{3}-\d{4})"
    )
    phone_re  = re.compile(r"[\(\d][\d\s\.\-\(\)]{6,}\d")
    money_re  = re.compile(r"\$|\d[\d,]+\.\d{2}")

    for col in fieldnames:
        votes = {"date": 0, "phone": 0, "currency": 0, "text": 0}
        for row in rows:
            v = (row.get(col) or "").strip()
            if not v:
                continue
            if date_re.fullmatch(v):
                votes["date"] += 1
            elif money_re.search(v) and CURRENCY_RE.match(v):
                votes["currency"] += 1
            elif phone_re.fullmatch(v):
                votes["phone"] += 1
            else:
                votes["text"] += 1

        # Pick the type with most votes (excluding 'text' unless it wins outright)
        non_text = {k: v for k, v in votes.items() if k != "text"}
        best = max(non_text, key=lambda k: non_text[k])
        col_types[col] = best if non_text[best] > 0 else "text"

    return col_types


# ── Main normalisation logic ──────────────────────────────────────────────────

def normalize_csv(input_path: str, output_path: str) -> int:
    """
    Read *input_path*, normalise every cell, write to *output_path*.
    Returns the total count of cells whose value changed.
    """
    with open(input_path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        fieldnames: list[str] = list(reader.fieldnames or [])
        rows = list(reader)

    col_types = detect_column_types(rows, fieldnames)

    cells_changed = 0
    cleaned_rows: list[dict] = []

    for row in rows:
        new_row: dict = {}
        for col in fieldnames:
            original = row.get(col, "") or ""
            value = original

            # 1. Strip whitespace from every cell first
            stripped = value.strip()
            if stripped != value:
                value = stripped

            # 2. Apply type-specific normalisation
            ctype = col_types.get(col, "text")
            if ctype == "date":
                value = normalize_date(value)
            elif ctype == "phone":
                value = normalize_phone(value)
            elif ctype == "currency":
                value = normalize_currency(value)
            # text: whitespace-stripping already done above

            if value != original:
                cells_changed += 1

            new_row[col] = value
        cleaned_rows.append(new_row)

    import os
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cleaned_rows)

    return cells_changed


# ── CLI entry-point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python csv_normalizer.py <input_path> <output_path>")
        sys.exit(1)

    input_path  = sys.argv[1]
    output_path = sys.argv[2]

    total_changed = normalize_csv(input_path, output_path)
    print(f"Normalisation complete.")
    print(f"Input : {input_path}")
    print(f"Output: {output_path}")
    print(f"Cells changed: {total_changed}")
