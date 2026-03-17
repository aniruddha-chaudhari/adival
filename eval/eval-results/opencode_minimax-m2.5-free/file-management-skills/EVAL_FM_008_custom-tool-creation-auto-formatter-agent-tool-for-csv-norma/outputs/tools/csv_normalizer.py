#!/usr/bin/env python3
import csv
import re
import sys
from datetime import datetime
from pathlib import Path


def normalize_date(value: str) -> str:
    value = value.strip()
    formats = [
        "%m/%d/%Y",
        "%Y-%m-%d",
        "%d-%b-%Y",
        "%d-%B-%Y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return value


def normalize_phone(value: str) -> str:
    value = value.strip()
    digits = re.sub(r'\D', '', value)
    if len(digits) == 10:
        return f"+1{digits}"
    elif len(digits) == 11 and digits[0] == '1':
        return f"+{digits}"
    return value


def normalize_currency(value: str) -> str:
    value = value.strip()
    value = value.replace('$', '').replace(',', '')
    try:
        return str(float(value))
    except ValueError:
        return value


def normalize_string(value: str) -> str:
    return value.strip()


def detect_column_type(header: str, values: list) -> str:
    header_lower = header.lower()
    sample_values = [v for v in values if v][:5]
    
    if 'phone' in header_lower:
        return 'phone'
    if 'date' in header_lower:
        return 'date'
    if 'amount' in header_lower or 'price' in header_lower or 'cost' in header_lower:
        return 'currency'
    if 'email' in header_lower or 'name' in header_lower:
        return 'string'
    
    for val in sample_values:
        if re.match(r'^\$?\d{1,3}(,\d{3})*(\.\d{2})?$', val.strip()):
            return 'currency'
        if re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', val.strip()):
            return 'date'
        if re.match(r'^\d{4}-\d{2}-\d{2}$', val.strip()):
            return 'date'
        if re.match(r'^\d{1,2}-\w{3}-\d{4}$', val.strip()):
            return 'date'
        if re.match(r'^[\d\.\-\(\)\s\+]+$', val) and len(re.sub(r'\D', '', val)) >= 10:
            return 'phone'
    
    return 'string'


def normalize_csv(input_path: str, output_path: str) -> tuple:
    with open(input_path, 'r', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)
    
    if not rows:
        return 0
    
    headers = rows[0]
    data_rows = rows[1:]
    
    col_types = {}
    for i, header in enumerate(headers):
        values = [row[i] for row in data_rows if i < len(row)]
        col_types[i] = detect_column_type(header, values)
    
    cells_changed = 0
    normalized_rows = []
    
    for row in data_rows:
        normalized_row = []
        for i, value in enumerate(row):
            original = value
            col_type = col_types.get(i, 'string')
            
            value = normalize_string(value)
            
            if col_type == 'date':
                value = normalize_date(value)
            elif col_type == 'phone':
                value = normalize_phone(value)
            elif col_type == 'currency':
                value = normalize_currency(value)
            
            normalized_row.append(value)
            
            if value != original:
                cells_changed += 1
        
        normalized_rows.append(normalized_row)
    
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(normalized_rows)
    
    return cells_changed


def main():
    if len(sys.argv) != 3:
        print(f"Usage: python {sys.argv[0]} <input_path> <output_path>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    if not Path(input_path).exists():
        print(f"Error: Input file '{input_path}' not found")
        sys.exit(1)
    
    cells_changed = normalize_csv(input_path, output_path)
    print(f"Normalization complete. {cells_changed} cells changed.")
    print(f"Cleaned file saved to: {output_path}")


if __name__ == "__main__":
    main()
