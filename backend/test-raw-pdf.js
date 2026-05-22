const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const testPdf = path.join(__dirname, 'uploads', 'bbdc_944490229_20250818165516.pdf');
// const testPdf = path.join(__dirname, 'uploads', 'sample.pdf');

console.log('测试PDF:', testPdf);

const dataBuffer = fs.readFileSync(testPdf);

pdf(dataBuffer).then(function(data) {
  console.log('\n=== PDF解析完成 ===');
  console.log('总页数:', data.numpages);
  
  const lines = data.text.split('\n').map(line => line.trim()).filter(line => line);
  
  console.log('\n=== 前300行原始内容 ===');
  lines.slice(0, 300).forEach((line, i) => {
    console.log(`${String(i).padStart(3, ' ')}: ${line}`);
  });
  
  console.log('\n=== 寻找所有数字序号 ===');
  const allNumberedIndices = [];
  lines.forEach((line, i) => {
    const numMatch = line.match(/^(\d+)$/);
    if (numMatch) {
      const index = parseInt(numMatch[1]);
      allNumberedIndices.push({ index, lineNum: i });
    }
  });
  
  console.log(`找到 ${allNumberedIndices.length} 个数字序号`);
  
  console.log('\n=== 前50个序号分布 ===');
  allNumberedIndices.slice(0, 50).forEach((entry, i) => {
    console.log(`${i+1}. 序号 ${entry.index} 在第 ${entry.lineNum} 行: "${lines[entry.lineNum]}"`);
  });
  
  console.log('\n=== 序号7周围的内容 ===');
  const index7 = allNumberedIndices.find(e => e.index === 7);
  if (index7) {
    const start = Math.max(0, index7.lineNum - 10);
    const end = Math.min(lines.length, index7.lineNum + 30);
    console.log(`\n序号7在第 ${index7.lineNum} 行，看周围内容:\n`);
    for (let i = start; i < end; i++) {
      const prefix = i === index7.lineNum ? ' [序号7] ' : '        ';
      console.log(`${String(i).padStart(3, ' ')}: ${prefix}${lines[i]}`);
    }
  }
  
}).catch(function(error) {
  console.error('PDF解析失败:', error);
});
