import csv
import re
import sys
from datetime import datetime


DATE_FORMATS = ("%m/%d/%Y", "%Y-%m-%d", "%d-%b-%Y", "%d-%B-%Y")
PHONE_COLUMN_KEYS = ("phone", "mobile", "tel")
CURRENCY_COLUMN_KEYS = ("amount", "price", "cost", "total", "balance")
DATE_COLUMN_KEYS = ("date",)


def normalize_date(value: str) -> str:
    text = value.strip()
    if not text:
        return text
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return text


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"+1{digits}"
    return value.strip()


def normalize_currency(value: str) -> str:
    text = value.strip().replace("$", "").replace(",", "")
    if not text:
        return text
    try:
        return str(float(text))
    except ValueError:
        return value.strip()


def column_has_key(column_name: str, keys: tuple[str, ...]) -> bool:
    lowered = column_name.lower()
    return any(key in lowered for key in keys)


def normalize_csv(input_path: str, output_path: str) -> int:
    with open(input_path, "r", newline="", encoding="utf-8") as infile:
        reader = csv.DictReader(infile)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise ValueError("Input CSV has no header row.")

        rows = list(reader)

    changed_cells = 0
    normalized_rows = []

    for row in rows:
        normalized_row = {}
        for col in fieldnames:
            original = row.get(col, "")
            value = original if original is not None else ""
            value = value.strip()

            if column_has_key(col, DATE_COLUMN_KEYS):
                value = normalize_date(value)
            elif column_has_key(col, PHONE_COLUMN_KEYS):
                value = normalize_phone(value)
            elif column_has_key(col, CURRENCY_COLUMN_KEYS):
                value = normalize_currency(value)

            normalized_row[col] = value
            if value != (original if original is not None else ""):
                changed_cells += 1

        normalized_rows.append(normalized_row)

    with open(output_path, "w", newline="", encoding="utf-8") as outfile:
        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(normalized_rows)

    return changed_cells


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python csv_normalizer.py <input_path> <output_path>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    changed = normalize_csv(input_path, output_path)
    print(f"Cells changed: {changed}")


if __name__ == "__main__":
    main()
