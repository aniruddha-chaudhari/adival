import csv
import sys
import re
from datetime import datetime

def normalize_date(date_str):
    date_str = date_str.strip()
    # Mixed formats: MM/DD/YYYY, YYYY-MM-DD, DD-Mon-YYYY
    fmts = ['%m/%d/%Y', '%Y-%m-%d', '%d-%b-%Y']
    for fmt in fmts:
        try:
            return datetime.strptime(date_str, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return date_str

def normalize_phone(phone_str):
    nums = re.sub(r'\D', '', phone_str)
    if len(nums) == 10:
        return f"+1{nums}"
    elif len(nums) == 11 and nums.startswith('1'):
        return f"+{nums}"
    return phone_str

def normalize_currency(curr_str):
    clean = curr_str.replace('$', '').replace(',', '').strip()
    try:
        return f"{float(clean):.2f}"
    except ValueError:
        return clean

def main():
    if len(sys.argv) != 3:
        sys.exit(1)
    
    in_path, out_path = sys.argv[1], sys.argv[2]
    cells_changed = 0
    
    with open(in_path, 'r', encoding='utf-8') as f:
        reader = list(csv.reader(f))
    
    header = [h.strip() for h in reader[0]]
    data = reader[1:]
    
    clean_data = []
    for row in data:
        new_row = []
        for i, cell in enumerate(row):
            orig = cell
            val = cell.strip()
            col = header[i].lower()
            
            if 'date' in col:
                val = normalize_date(val)
            elif 'phone' in col:
                val = normalize_phone(val)
            elif 'amount' in col or 'currency' in col:
                val = normalize_currency(val)
            
            if val != orig:
                cells_changed += 1
            new_row.append(val)
        clean_data.append(new_row)
        
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(clean_data)
    
    print(f"TotalCellsChanged: {cells_changed}")

if __name__ == "__main__":
    main()
