#!/usr/bin/env python3
"""
csv_normalizer.py - Reusable CSV normalization tool.

Normalizes:
  - Dates to ISO 8601 (YYYY-MM-DD)
  - Phone numbers to E.164 format (+1XXXXXXXXXX for US numbers)
  - Currency values to plain float (strips $, commas)
  - All string fields: strips leading/trailing whitespace

Usage:
    python csv_normalizer.py <input_path> <output_path>
"""

import sys
import re
import csv
from datetime import datetime


# ---------------------------------------------------------------------------
# Normalizers
# ---------------------------------------------------------------------------

DATE_FORMATS = [
    "%m/%d/%Y",   # MM/DD/YYYY
    "%Y-%m-%d",   # YYYY-MM-DD (ISO already)
    "%d-%b-%Y",   # DD-Mon-YYYY  (e.g. 15-Mar-2024)
    "%d/%m/%Y",   # DD/MM/YYYY fallback
]


def normalize_date(value: str) -> tuple:
    """Return (normalized, changed)."""
    v = value.strip()
    for fmt in DATE_FORMATS:
        try:
            dt = datetime.strptime(v, fmt)
            normalized = dt.strftime("%Y-%m-%d")
            return normalized, (normalized != value)
        except ValueError:
            continue
    return value, False  # not a recognised date - return as-is


def normalize_phone(value: str) -> tuple:
    """
    Strip everything except digits, assume US (+1).
    Returns E.164 (+1XXXXXXXXXX) when exactly 10 or 11 digits found.
    """
    v = value.strip()
    digits = re.sub(r"\D", "", v)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        normalized = "+1" + digits
        return normalized, (normalized != value)
    return value, False  # can't normalize safely


def normalize_currency(value: str) -> tuple:
    """Strip $, commas; return plain float string with 2 decimal places."""
    v = value.strip()
    cleaned = v.replace("$", "").replace(",", "").strip()
    try:
        f = float(cleaned)
        normalized = f"{f:.2f}"
        return normalized, (normalized != value)
    except ValueError:
        return value, False


def normalize_string(value: str) -> tuple:
    """Strip leading/trailing whitespace."""
    normalized = value.strip()
    return normalized, (normalized != value)


# ---------------------------------------------------------------------------
# Column-type detection
# ---------------------------------------------------------------------------

DATE_HINTS   = {"date", "dob", "birth", "created", "updated", "timestamp"}
PHONE_HINTS  = {"phone", "tel", "mobile", "cell", "fax"}
MONEY_HINTS  = {"amount", "price", "cost", "salary", "revenue", "total", "balance", "currency"}


def detect_column_type(header: str) -> str:
    h = header.strip().lower()
    if any(k in h for k in DATE_HINTS):
        return "date"
    if any(k in h for k in PHONE_HINTS):
        return "phone"
    if any(k in h for k in MONEY_HINTS):
        return "currency"
    return "string"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def normalize_csv(input_path: str, output_path: str) -> int:
    """
    Read input CSV, normalize each cell, write to output CSV.
    Returns the total number of cells that were changed.
    """
    with open(input_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)

    if not rows:
        print("Empty CSV - nothing to do.")
        return 0

    headers = rows[0]
    col_types = [detect_column_type(h) for h in headers]

    normalizer_map = {
        "date":     normalize_date,
        "phone":    normalize_phone,
        "currency": normalize_currency,
        "string":   normalize_string,
    }

    total_changed = 0
    out_rows = []

    # Normalize header row (strip whitespace only)
    norm_headers = []
    for h in headers:
        nh, changed = normalize_string(h)
        norm_headers.append(nh)
        if changed:
            total_changed += 1
    out_rows.append(norm_headers)

    # Normalize data rows
    for row_idx, row in enumerate(rows[1:], start=2):
        out_row = []
        for col_idx, cell in enumerate(row):
            col_type = col_types[col_idx] if col_idx < len(col_types) else "string"

            # Always strip whitespace first
            stripped, ws_changed = normalize_string(cell)

            # Then apply domain-specific normalizer (if not plain "string")
            if col_type != "string":
                normalizer = normalizer_map[col_type]
                normalized, domain_changed = normalizer(stripped)
            else:
                normalized = stripped
                domain_changed = False

            changed = (normalized != cell)
            if changed:
                total_changed += 1
                print(f"  Row {row_idx}, col '{headers[col_idx].strip()}': "
                      f"{repr(cell)} -> {repr(normalized)}")

            out_row.append(normalized)

        # Pad short rows to header length
        while len(out_row) < len(headers):
            out_row.append("")

        out_rows.append(out_row)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(out_rows)

    return total_changed


def main():
    if len(sys.argv) != 3:
        print("Usage: python csv_normalizer.py <input_path> <output_path>")
        sys.exit(1)

    input_path  = sys.argv[1]
    output_path = sys.argv[2]

    print(f"Normalizing: {input_path} -> {output_path}")
    total_changed = normalize_csv(input_path, output_path)
    print(f"\nDone. Total cells changed: {total_changed}")
    print(f"Clean file saved to: {output_path}")


if __name__ == "__main__":
    main()
