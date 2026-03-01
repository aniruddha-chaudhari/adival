const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun } = require("docx");

const desktopPath = path.join(process.env.USERPROFILE, "Desktop");
const filePath = path.join(desktopPath, "test.docx");

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          children: [new TextRun("thisi ia a test type this")],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(filePath, buffer);
  console.log(`Document saved to: ${filePath}`);
});
