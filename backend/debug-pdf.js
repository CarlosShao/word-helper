const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const testFiles = [
  'test.pdf',
  'sample.pdf',
  'bbdc_944490229_20250818165516.pdf'
];

async function testPDF(fileName) {
  const filePath = path.join(__dirname, 'uploads', fileName);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ 文件不存在: ${fileName}`);
    return;
  }

  console.log(`\n========== 测试文件: ${fileName} ==========`);
  
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    console.log('📄 PDF原始文本:');
    console.log('─'.repeat(80));
    console.log(data.text);
    console.log('─'.repeat(80));
    
    console.log('\n📊 PDF信息:');
    console.log(`页数: ${data.numpages}`);
    console.log(`文本长度: ${data.text.length} 字符`);
    console.log(`行数: ${data.text.split('\n').length} 行`);
    
  } catch (error) {
    console.error(`❌ 解析失败:`, error.message);
  }
}

async function main() {
  for (const file of testFiles) {
    await testPDF(file);
  }
}

main();
