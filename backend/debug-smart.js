const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const testFiles = [
  'test.pdf',
  'sample.pdf',
  'bbdc_944490229_20250818165516.pdf'
];

async function analyzePDF(fileName) {
  const filePath = path.join(__dirname, 'uploads', fileName);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ 文件不存在: ${fileName}`);
    return;
  }

  console.log(`\n========== 分析文件: ${fileName} ==========`);
  
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    const lines = data.text.split('\n').map(line => line.trim()).filter(line => line);
    
    console.log(`\n📊 基本信息:`);
    console.log(`- 页数: ${data.numpages}`);
    console.log(`- 总行数: ${lines.length}`);
    
    // 查找WordMeaning标记
    const wordMeaningPositions = [];
    lines.forEach((line, i) => {
      if (line === 'WordMeaning') {
        wordMeaningPositions.push(i);
      }
    });
    
    console.log(`- WordMeaning标记数量: ${wordMeaningPositions.length}`);
    console.log(`- WordMeaning位置: [${wordMeaningPositions.join(', ')}]`);
    
    // 如果标记太少，尝试其他分析方式
    if (wordMeaningPositions.length < 2) {
      console.log(`\n⚠️ WordMeaning标记太少，尝试其他方式分析...`);
      
      // 统计纯数字行
      let numberLines = 0;
      const numberPositions = [];
      lines.forEach((line, i) => {
        if (/^\d+$/.test(line)) {
          numberLines++;
          if (numberPositions.length < 20) {
            numberPositions.push({ index: i, num: line });
          }
        }
      });
      
      console.log(`- 纯数字行数: ${numberLines}`);
      console.log(`- 前20个数字位置:`, numberPositions);
      
      // 显示前50行和后50行
      console.log(`\n📝 前50行:`);
      lines.slice(0, 50).forEach((line, i) => {
        console.log(`[${i}] ${line}`);
      });
      
      console.log(`\n📝 后50行:`);
      const start = Math.max(0, lines.length - 50);
      lines.slice(start).forEach((line, i) => {
        console.log(`[${start + i}] ${line}`);
      });
    } else {
      console.log(`\n✅ 结构正常，显示第一个WordMeaning区域的内容:`);
      const start = wordMeaningPositions[0] + 1;
      const end = Math.min(wordMeaningPositions[1], start + 50);
      lines.slice(start, end).forEach((line, i) => {
        console.log(`[${start + i}] ${line}`);
      });
    }
    
  } catch (error) {
    console.error(`❌ 解析失败:`, error.message);
    console.error(error.stack);
  }
}

async function main() {
  for (const file of testFiles) {
    await analyzePDF(file);
  }
}

main();
