import pdf from 'pdf-parse';

export interface ParseError {
  index: number;
  english: string | null;
  reason: string;
}

export interface ParseResult {
  words: Array<{ english: string; part_of_speech: string; chinese: string }>;
  errors: ParseError[];
}

export async function parsePdf(filePath: string): Promise<ParseResult> {
  const dataBuffer = require('fs').readFileSync(filePath);
  const data = await pdf(dataBuffer);
  
  const lines = data.text.split('\n').map(line => line.trim()).filter(line => line);
  
  console.log(`总 ${lines.length} 行`);
  
  // 错误日志
  const errors: ParseError[] = [];
  
  // 找到所有WordMeaning的位置
  const wordMeaningPositions: number[] = [];
  lines.forEach((line, i) => {
    if (line === 'WordMeaning') {
      wordMeaningPositions.push(i);
    }
  });
  
  console.log(`找到 ${wordMeaningPositions.length} 个WordMeaning标记`);
  
  if (wordMeaningPositions.length < 2) {
    console.log('WordMeaning标记太少');
    return { words: [], errors: [] };
  }
  
  // 收集所有英语词汇和释义
  const englishMap = new Map<number, string[]>();
  const meaningMap = new Map<number, string[]>();
  
  // 模式：WordMeaning -> 英语 -> WordMeaning -> 释义 -> WordMeaning -> ...
  // 或者：WordMeaning -> 英语 -> WordMeaning -> 释义（结束）
  // 所以索引为偶数的WordMeaning后面是英语，奇数的后面是释义
  for (let i = 0; i < wordMeaningPositions.length; i++) {
    const start = wordMeaningPositions[i] + 1;
    // 如果是最后一个WordMeaning，就取到文件末尾
    const end = i < wordMeaningPositions.length - 1 ? wordMeaningPositions[i + 1] : lines.length;
    const sectionLines = lines.slice(start, end);
    
    // 判断是英语部分还是释义部分
    const isEnglish = i % 2 === 0;
    
    console.log(`处理区块 ${i} (${isEnglish ? '英语' : '释义'}): 行 ${start}~${end}`);
    
    // 解析这部分的内容
    const sectionMap = parseNumberedSectionWithArray(sectionLines);
    
    // 合并到全局Map
    sectionMap.forEach((content, index) => {
      if (isEnglish) {
        if (!englishMap.has(index)) {
          englishMap.set(index, []);
        }
        englishMap.get(index)!.push(...content);
      } else {
        if (!meaningMap.has(index)) {
          meaningMap.set(index, []);
        }
        meaningMap.get(index)!.push(...content);
      }
    });
  }
  
  console.log(`解析出 ${englishMap.size} 个英语词汇，${meaningMap.size} 个释义`);
  
  // 合并结果
  const words: Array<{ english: string; part_of_speech: string; chinese: string }> = [];
  const maxIndex = Math.max(...Array.from(englishMap.keys()), ...Array.from(meaningMap.keys()));
  
  for (let i = 1; i <= maxIndex; i++) {
    const englishParts = englishMap.get(i);
    const meaningParts = meaningMap.get(i);
    
    // 如果英语和释义都缺失，跳过并记录错误
    if (!englishParts && !meaningParts) {
      console.log(`序号${i}: 英语和释义都缺失，跳过`);
      errors.push({
        index: i,
        english: null,
        reason: '英语和释义都为空（PDF源文件缺失该序号数据）'
      });
      continue;
    }
    
    // 如果只有英语没有释义，标记为待补充并记录错误
    if (englishParts && !meaningParts) {
      const english = englishParts.join(' ').trim();
      if (/^\d+$/.test(english)) continue;
      console.log(`序号${i}: 英语="${english}"，释义缺失，标记为待补充`);
      errors.push({
        index: i,
        english: english,
        reason: '有英语但释义为空'
      });
      words.push({
        english,
        part_of_speech: '',
        chinese: '[待补充释义]'
      });
      continue;
    }
    
    // 如果只有释义没有英语，记录错误
    if (!englishParts && meaningParts) {
      const meaning = meaningParts.join(' ').trim();
      console.log(`序号${i}: 释义存在但英语缺失，跳过`);
      errors.push({
        index: i,
        english: null,
        reason: '有释义但英语为空'
      });
      continue;
    }
    
    const english = englishParts!.join(' ').trim();
    let meaning = meaningParts!.join(' ').trim();
    
    console.log(`序号${i}: 英语="${english}"，释义="${meaning}"`);
    
    // 过滤纯数字
    if (/^\d+$/.test(english)) {
      continue;
    }
    
    // 清理页脚脏数据（可能和释义在同一行）
    meaning = cleanFooterData(meaning);
    
    let part_of_speech = '';
    let chinese = meaning;
    
    const posMatch = meaning.match(/^([a-z]+\.)\s*(.*)$/i);
    if (posMatch) {
      part_of_speech = posMatch[1].trim();
      chinese = posMatch[2].trim();
    }
    
    // 再次清理中文释义中的脏数据
    chinese = cleanFooterData(chinese);
    
    words.push({
      english,
      part_of_speech,
      chinese
    });
  }
  
  console.log(`共合并出 ${words.length} 个单词`);
  console.log(`共发现 ${errors.length} 个解析错误`);
  
  return { words, errors };
}

function cleanFooterData(text: string): string {
  let result = text;
  
  // 方法1：查找脏数据起始位置并截断
  // 匹配"全部"后面跟着任意内容
  const dirtyMatch = result.match(/(全部|共|已学|复习完成|Shao|Ye|词表|二维码)/);
  if (dirtyMatch && dirtyMatch.index !== undefined && dirtyMatch.index > 0) {
    result = result.substring(0, dirtyMatch.index).trim();
  }
  
  // 方法2：如果还有剩余的页码信息，继续清理
  result = result.replace(/\d+\/\d+\s*页/g, '').trim();
  
  // 方法3：清理二维码相关内容
  result = result.replace(/扫描二维码/g, '').trim();
  
  return result;
}

function isFooterLine(line: string): boolean {
  // 更精确的页脚检测
  const footerPatterns = [
    /^共\s*\d+\s*词.*\/.*页/,        // 共 X 词 X/X 页
    /^扫码听单词/,                     // 扫码听单词
    /^纸上默写.*耳边复习/,             // 纸上默写，耳边复习
    /^近日已学.*复习/,                // 近日已学·复习
    /^背单词.*App/,                   // 背单词 App
    /^下载\s*App/,                    // 下载 App
    /^在学配套词书/,                   // 在学配套词书
    /^扫码.*二维码/,                   // 扫码二维码
    /^单词不用背.*自然会/,             // 单词不用背，自然会
    /^[Ss]hao\s*[Yy]e.*词表/,         // Shao Ye 的词表
    /^词表全部.*共.*词/,              // 词表全部 共 X 词
    /\d+\/\d+\s*页.*二维码/          // X/X 页 扫描二维码
  ];
  
  return footerPatterns.some(pattern => pattern.test(line));
}

function parseNumberedSectionWithArray(lines: string[]): Map<number, string[]> {
  const result = new Map<number, string[]>();
  let currentIndex: number | null = null;
  let currentContent: string[] = [];
  
  // 智能合并跨行内容
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // 跳过纯页脚脏数据行（使用更精确的检测）
    if (isFooterLine(line)) {
      continue;
    }
    
    const numMatch = line.match(/^(\d+)$/);
    
    if (numMatch) {
      // 保存之前的内容
      if (currentIndex !== null && currentContent.length > 0) {
        result.set(currentIndex, [...currentContent]);
      }
      
      currentIndex = parseInt(numMatch[1]);
      currentContent = [];
    } else if (currentIndex !== null) {
      // 检查下一行是否是序号，如果是，说明当前内容结束
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const nextIsNumber = /^\d+$/.test(nextLine.trim());
      
      // 清理行内的页脚脏数据
      line = cleanFooterData(line);
      
      if (nextIsNumber) {
        // 如果下一行是序号，检查当前行清理后是否还有内容
        if (line.trim()) {
          currentContent.push(line);
        }
      } else {
        // 下一行不是序号，继续添加（可能是跨行的内容）
        if (line.trim()) {
          currentContent.push(line);
        }
      }
    }
  }
  
  // 保存最后的内容
  if (currentIndex !== null && currentContent.length > 0) {
    result.set(currentIndex, [...currentContent]);
  }
  
  return result;
}
