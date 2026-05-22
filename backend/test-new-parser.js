const pdf = require('pdf-parse');
const fs = require('fs');

const dataBuffer = fs.readFileSync('/workspace/sample.pdf');

pdf(dataBuffer).then(function(data) {
    const lines = data.text.split('\n').filter(line => line.trim());
    
    console.log('=== Lines ===');
    lines.forEach((line, i) => console.log(i, ':', line));
    
    const numberedLines = [];
    lines.forEach((line, i) => {
      line = line.trim();
      const match = line.match(/^(\d+)\s*(.*)$/);
      if (match) {
        numberedLines.push({
          index: parseInt(match[1]),
          text: match[2].trim()
        });
      }
    });
    
    console.log('\n=== Numbered Lines ===');
    numberedLines.forEach(l => console.log(l.index, ':', l.text));
    
    const maxIndex = numberedLines.length > 0 ? Math.max(...numberedLines.map(l => l.index)) : 0;
    console.log('\nMax index:', maxIndex);
    
    const words = [];
    for (let i = 1; i <= maxIndex; i++) {
      const occurrences = numberedLines.filter(l => l.index === i);
      
      console.log(`\nOccurrences for ${i}:`, occurrences.length);
      
      if (occurrences.length >= 2) {
        const englishPart = occurrences[0].text;
        const meaningPart = occurrences[1].text;
        
        let part_of_speech = '';
        let chinese = meaningPart;
        
        const posMatch = meaningPart.match(/^([a-z]+\.?)\s*(.*)$/i);
        if (posMatch) {
          part_of_speech = posMatch[1].trim();
          chinese = posMatch[2].trim();
        }
        
        words.push({
          english: englishPart,
          part_of_speech,
          chinese
        });
      }
    }
    
    console.log('\n=== Parsed Words ===');
    words.forEach(w => console.log(w));
    console.log('\nTotal:', words.length);
}).catch(err => {
    console.error('Error:', err);
});
