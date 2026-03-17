import csv
import sys
import re
from datetime import datetime

def normalize_date(date_str):
    date_str = date_str.strip()
    formats = [
        ("%m/%d/%Y", "MM/DD/YYYY"),
        ("%Y-%m-%d", "YYYY-MM-DD"),
        ("%d-%b-%Y", "DD-Mon-YYYY")
    ]
    for fmt, name in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date_str

def normalize_phone(phone_str):
    digits = re.sub(r'\D', '', phone_str)
    if len(digits) == 10:
        return f"+1{digits}"
    elif len(digits) == 11 and digits.startswith('1'):
        return f"+{digits}"
    return phone_str

def normalize_currency(currency_str):
    clean = re.sub(r'[$,]', '', currency_str).strip()
    try:
        return str(float(clean))
    except ValueError:
        return currency_str

def main():
    if len(sys.argv) != 3:
        print("Usage: python csv_normalizer.py <input_path> <output_path>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    cells_changed = 0
    
    with open(input_path, mode='r', newline='', encoding='utf-8') as infile:
        reader = csv.reader(infile)
        header = next(reader)
        
        # Strip header
        new_header = [h.strip() for h in header]
        # Technically stripping header is a change, but usually users mean data cells.
        # However, the prompt says "strips whitespace from all string fields".
        # We will count data cell changes.
        
        rows = []
        for row in reader:
            new_row = []
            for i, cell in enumerate(row):
                original = cell
                # Strip whitespace
                val = cell.strip()
                
                col_name = new_header[i].lower()
                
                if "date" in col_name:
                    val = normalize_date(val)
                elif "phone" in col_name:
                    val = normalize_phone(val)
                elif "amount" in col_name or "currency" in col_name:
                    val = normalize_currency(val)
                
                if val != original:
                    cells_changed += 1
                new_row.append(val)
            rows.append(new_row)
            
    with open(output_path, mode='w', newline='', encoding='utf-8') as outfile:
        writer = csv.writer(outfile)
        writer.writerow(new_header)
        writer.writerows(rows)
    
    print(f"CellsChanged: {cells_changed}")

if __name__ == "__main__":
    main()
