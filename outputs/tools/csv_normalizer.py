#!/usr/bin/env python3
import csv
import re
import sys
from datetime import datetime


DATE_FORMATS = [
    "%m/%d/%Y",
    "%Y-%m-%d",
    "%d-%b-%Y",
]


def normalize_date(value: str) -> str:
    text = value.strip()
    candidates = [text]
    if re.match(r"^\d{1,2}-[A-Za-z]{3}-\d{4}$", text):
        parts = text.split("-")
        candidates.append(f"{parts[0]}-{parts[1].title()}-{parts[2]}")

    for candidate in candidates:
        for fmt in DATE_FORMATS:
            try:
                dt = datetime.strptime(candidate, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
    return text


def normalize_phone(value: str) -> str:
    text = value.strip()
    digits = re.sub(r"\D", "", text)
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return text


def normalize_currency(value: str) -> str:
    text = value.strip()
    no_symbols = text.replace("$", "").replace(",", "")

    if re.fullmatch(r"[+-]?\d+(\.\d+)?", no_symbols):
        try:
            return str(float(no_symbols))
        except ValueError:
            return text
    return text


def normalize_cell(value: str) -> str:
    normalized = value.strip()

    date_candidate = normalize_date(normalized)
    if date_candidate != normalized:
        return date_candidate

    phone_candidate = normalize_phone(normalized)
    if phone_candidate != normalized:
        return phone_candidate

    currency_candidate = normalize_currency(normalized)
    if currency_candidate != normalized:
        return currency_candidate

    return normalized


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python csv_normalizer.py <input_path> <output_path>")
        return 1

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    changed_cells = 0

    with open(input_path, "r", newline="", encoding="utf-8") as infile:
        reader = csv.reader(infile)
        rows = list(reader)

    if not rows:
        with open(output_path, "w", newline="", encoding="utf-8") as outfile:
            writer = csv.writer(outfile)
            writer.writerows(rows)
        print("Cells changed: 0")
        return 0

    header = rows[0]
    normalized_rows = [header]

    for row in rows[1:]:
        normalized_row = []
        for cell in row:
            new_value = normalize_cell(cell)
            if new_value != cell:
                changed_cells += 1
            normalized_row.append(new_value)
        normalized_rows.append(normalized_row)

    with open(output_path, "w", newline="", encoding="utf-8") as outfile:
        writer = csv.writer(outfile)
        writer.writerows(normalized_rows)

    print(f"Cells changed: {changed_cells}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
