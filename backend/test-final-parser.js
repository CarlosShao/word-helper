const pdf = require('pdf-parse');
const fs = require('fs');

const dataBuffer = fs.readFileSync('/workspace/sample.pdf');

pdf(dataBuffer).then(function(data) {
    const lines = data.text.split('\n').map(line => line.trim()).filter(line => line);
    
    console.log('=== Lines ===');
    lines.forEach((line, i) => console.log(i, ':', line));
    
    // 找到两个 "WordMeaning" 标记的位置
    const wordMeaningIndices = [];
    lines.forEach((line, i) => {
      if (line === 'WordMeaning') {
        wordMeaningIndices.push(i);
      }
    });
    
    console.log('\n=== WordMeaning Indices ===', wordMeaningIndices);
    
    const words = [];
    if (wordMeaningIndices.length >= 2) {
      const startWords = wordMeaningIndices[0] + 1;
      const startMeanings = wordMeaningIndices[1] + 1;
      
      let endWords = startWords;
      while (endWords < lines.length && lines[endWords] !== 'WordMeaning') {
        endWords++;
      }
      
      let endMeanings = startMeanings;
      while (endMeanings < lines.length && 
             !lines[endMeanings].includes('共') && 
             !lines[endMeanings].includes('近日') &&
             !lines[endMeanings].includes('扫码')) {
        endMeanings++;
      }
      
      console.log('\n=== Ranges ===');
      console.log('Words:', startWords, '-', endWords);
      console.log('Meanings:', startMeanings, '-', endMeanings);
      
      const englishMap = new Map();
      for (let i = startWords; i < endWords - 1; i++) {
        const line = lines[i];
        const numMatch = line.match(/^(\d+)$/);
        if (numMatch) {
          const index = parseInt(numMatch[1]);
          if (i + 1 < endWords) {
            englishMap.set(index, lines[i + 1]);
          }
        }
      }
      
      const meaningMap = new Map();
      for (let i = startMeanings; i < endMeanings - 1; i++) {
        const line = lines[i];
        const numMatch = line.match(/^(\d+)$/);
        if (numMatch) {
          const index = parseInt(numMatch[1]);
          if (i + 1 < endMeanings) {
            meaningMap.set(index, lines[i + 1]);
          }
        }
      }
      
      console.log('\n=== English Map ===', englishMap);
      console.log('=== Meaning Map ===', meaningMap);
      
      const maxIndex = Math.max(...Array.from(englishMap.keys()).concat(Array.from(meaningMap.keys())));
      for (let i = 1; i <= maxIndex; i++) {
        const english = englishMap.get(i);
        const meaning = meaningMap.get(i);
        
        if (english && meaning) {
          let part_of_speech = '';
          let chinese = meaning;
          
          const posMatch = meaning.match(/^([a-z]+\.?)\s*(.*)$/i);
          if (posMatch) {
            part_of_speech = posMatch[1].trim();
            chinese = posMatch[2].trim();
          }
          
          words.push({
            english,
            part_of_speech,
            chinese
          });
        }
      }
    }
    
    console.log('\n=== Final Words ===');
    words.forEach(w => console.log(w));
    console.log('\nTotal:', words.length);
}).catch(err => {
    console.error('Error:', err);
});
