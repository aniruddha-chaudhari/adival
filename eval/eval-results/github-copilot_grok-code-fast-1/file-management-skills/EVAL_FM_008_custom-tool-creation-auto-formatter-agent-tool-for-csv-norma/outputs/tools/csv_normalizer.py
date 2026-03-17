import csv
import sys
from datetime import datetime
import re

def normalize_date(date_str):
    date_str = date_str.strip()
    formats = ['%m/%d/%Y', '%Y-%m-%d', '%d-%b-%Y', '%d/%m/%Y']  # added %d/%m/%Y for some
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    return date_str  # if can't parse, leave as is

def normalize_phone(phone_str):
    phone_str = phone_str.strip()
    digits = re.sub(r'\D', '', phone_str)
    if len(digits) == 10:
        return '+1' + digits
    elif len(digits) == 11 and digits.startswith('1'):
        return '+' + digits
    else:
        return phone_str  # or raise error, but leave as is

def normalize_amount(amount_str):
    amount_str = amount_str.strip()
    # remove $ and commas
    cleaned = re.sub(r'[$,]', '', amount_str)
    try:
        return str(float(cleaned))
    except ValueError:
        return amount_str

def normalize_string(s):
    return s.strip()

def normalize_csv(input_path, output_path):
    with open(input_path, 'r', newline='') as infile, open(output_path, 'w', newline='') as outfile:
        reader = csv.reader(infile)
        writer = csv.writer(outfile)
        changes = 0
        for row_num, row in enumerate(reader):
            normalized_row = []
            for col_num, cell in enumerate(row):
                original = cell
                if col_num == 0:  # Name
                    normalized = normalize_string(cell)
                elif col_num == 1:  # Phone
                    normalized = normalize_phone(cell)
                elif col_num == 2:  # Amount
                    normalized = normalize_amount(cell)
                elif col_num == 3:  # Date
                    normalized = normalize_date(cell)
                elif col_num == 4:  # Email
                    normalized = normalize_string(cell)
                else:
                    normalized = cell
                if original != normalized:
                    changes += 1
                normalized_row.append(normalized)
            writer.writerow(normalized_row)
        return changes

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python csv_normalizer.py <input_path> <output_path>")
        sys.exit(1)
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    changes = normalize_csv(input_path, output_path)
    print(f"Cells changed: {changes}")