const pdf = require('pdf-parse');
const fs = require('fs');

const dataBuffer = fs.readFileSync('/workspace/sample.pdf');

pdf(dataBuffer).then(function(data) {
    console.log('=== PDF Content ===');
    console.log(data.text);
    console.log('\n=== Number of pages ===', data.numpages);
    console.log('=== Metadata ===', data.info);
    
    // 简单测试我们的解析逻辑
    const lines = data.text.split('\n').filter(line => line.trim());
    console.log('\n=== Lines ===');
    lines.forEach((line, i) => console.log(i, ':', line));
    
    // 尝试匹配常见格式
    console.log('\n=== Parsing test ===');
    const words = [];
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        
        // 格式1: dominating; adj.; 统治的，支配的；个性强势的
        const parts1 = line.split(/[;；]/).map(p => p.trim()).filter(p => p);
        if (parts1.length >= 3) {
            words.push({
                english: parts1[0],
                part_of_speech: parts1[1],
                chinese: parts1.slice(2).join('；')
            });
            console.log('Match 1:', words[words.length - 1]);
        }
        // 格式2: dominating adj. 统治的，支配的
        else {
            const posPattern = /\b(adj|adv|n|v|prep|conj|pron|num|interj)\.?\b/i;
            const match = line.match(posPattern);
            if (match) {
                const posIndex = match.index;
                const english = line.slice(0, posIndex).trim();
                const part_of_speech = match[0];
                const chinese = line.slice(posIndex + match[0].length).trim();
                
                if (english && chinese) {
                    words.push({
                        english,
                        part_of_speech,
                        chinese
                    });
                    console.log('Match 2:', words[words.length - 1]);
                }
            }
        }
    }
    console.log('\n=== Total words parsed:', words.length);
}).catch(err => {
    console.error('Error:', err);
});
