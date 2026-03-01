const { Document, Packer, Paragraph, TextRun } = require('docx');

const description = `What does it take to gaze through time to our universe's very first stars, galaxies, and light? "Cosmic Dawn: The Untold Story of the James Webb Space Telescope," a NASA+ documentary, takes you behind the scenes of Webb's journey, through the eyes of the dreamers who made it possible. From the earliest concepts to the cutting-edge technology, witness the triumphs and challenges of building the most complex space observatory ever created. This is the story of Cosmic Dawn – the moment when we first saw the light.`;

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({
        children: [new TextRun(description)],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  require('fs').writeFileSync('space_documentary_description.docx', buffer);
  console.log('Word document created: space_documentary_description.docx');
});