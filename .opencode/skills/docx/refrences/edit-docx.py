import sys
sys.path.insert(0, "D:/Adu/col/js/project/mcpserver/.opencode/skills/docx")
from scripts.document import Document

doc = Document("D:/Adu/col/js/project/mcpserver/test-unpacked", author="User", initials="US")

node = doc["word/document.xml"].get_node(tag="w:r", contains="thisi ia a test type this")
rpr = ""
if tags := node.getElementsByTagName("w:rPr"):
    rpr = tags[0].toxml()

replacement = f'<w:r>{rpr}<w:t>Hello World! This is edited content.</w:t></w:r>'
doc["word/document.xml"].replace_node(node, replacement)

doc.save(validate=False)
print("Document updated successfully!")
