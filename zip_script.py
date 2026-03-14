import zipfile
import os
from pathlib import Path

def zip_dir(source_dir, output_zip):
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                zf.write(os.path.join(root, file), os.path.relpath(os.path.join(root, file), source_dir))

zip_dir('unpacked', 'outputs/contract_final.docx')