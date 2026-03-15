"""
csv_normalizer.py
-----------------
Normalizes a CSV file by:
  1. Stripping leading/trailing whitespace from all string fields
  2. Normalizing dates to ISO 8601 (YYYY-MM-DD)
  3. Normalizing US phone numbers to E.164 (+1XXXXXXXXXX)
  4. Normalizing currency values to plain float

Usage:
    python csv_normalizer.py <input_path> <output_path>
"""

import sys
import csv
import re
from datetime import datetime

# ── Date normalization ────────────────────────────────────────────────────────

DATE_FORMATS = [
    "%m/%d/%Y",   # MM/DD/YYYY
    "%Y-%m-%d",   # YYYY-MM-DD  (already ISO – kept for completeness)
    "%d-%b-%Y",   # DD-Mon-YYYY  (e.g. 15-Mar-2024)
]


def normalize_date(value: str) -> str:
    """Return ISO 8601 date string, or the original value if unparseable."""
    v = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return v  # unchanged if no format matched


# ── Phone normalization ───────────────────────────────────────────────────────

def normalize_phone(value: str) -> str:
    """
    Strip all non-digit characters, prepend country code 1 if needed,
    and return E.164 format (+1XXXXXXXXXX).
    Returns original value if the digit count is unexpected.
    """
    digits = re.sub(r"\D", "", value.strip())
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return value.strip()  # unchanged if unrecognised


# ── Currency normalization ────────────────────────────────────────────────────

def normalize_currency(value: str) -> str:
    """Remove $, commas, and spaces; return plain float string."""
    v = value.strip().replace("$", "").replace(",", "").strip()
    try:
        return str(float(v))
    except ValueError:
        return value.strip()


# ── Column type detection (heuristic, based on header names) ─────────────────

DATE_HEADERS   = {"date"}
PHONE_HEADERS  = {"phone"}
AMOUNT_HEADERS = {"amount", "price", "cost", "salary", "revenue", "currency"}


def classify_header(header: str) -> str:
    h = header.strip().lower()
    if h in DATE_HEADERS:
        return "date"
    if h in PHONE_HEADERS:
        return "phone"
    if h in AMOUNT_HEADERS:
        return "currency"
    return "string"


# ── Core normalization logic ──────────────────────────────────────────────────

def normalize_cell(value: str, col_type: str) -> str:
    """Normalize a single cell value according to its column type."""
    if col_type == "date":
        return normalize_date(value)
    if col_type == "phone":
        return normalize_phone(value)
    if col_type == "currency":
        return normalize_currency(value)
    # Default: strip whitespace from strings
    return value.strip()


def normalize_csv(input_path: str, output_path: str) -> int:
    """
    Read the CSV at input_path, normalize every cell, write to output_path.
    Returns the total number of cells that were changed.
    """
    changed = 0

    with open(input_path, newline="", encoding="utf-8") as infile:
        reader = csv.reader(infile)
        rows = list(reader)

    if not rows:
        print("Input file is empty.")
        return 0

    header_row = rows[0]
    col_types = [classify_header(h) for h in header_row]

    # Normalize header row (strip whitespace only)
    new_header = [h.strip() for h in header_row]
    for orig, norm in zip(header_row, new_header):
        if orig != norm:
            changed += 1

    output_rows = [new_header]

    for row in rows[1:]:
        new_row = []
        for i, cell in enumerate(row):
            col_type = col_types[i] if i < len(col_types) else "string"
            normalized = normalize_cell(cell, col_type)
            if normalized != cell:
                changed += 1
            new_row.append(normalized)
        output_rows.append(new_row)

    with open(output_path, newline="", encoding="utf-8") as _:
        pass  # just a check; will overwrite below

    with open(output_path, "w", newline="", encoding="utf-8") as outfile:
        writer = csv.writer(outfile)
        writer.writerows(output_rows)

    return changed


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) != 3:
        print("Usage: python csv_normalizer.py <input_path> <output_path>")
        sys.exit(1)

    input_path  = sys.argv[1]
    output_path = sys.argv[2]

    # Pre-create the output file so the open() check inside normalize_csv works
    import os
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    open(output_path, "w").close()

    total_changed = normalize_csv(input_path, output_path)

    print(f"Normalization complete.")
    print(f"Input : {input_path}")
    print(f"Output: {output_path}")
    print(f"Cells changed: {total_changed}")


if __name__ == "__main__":
    main()
