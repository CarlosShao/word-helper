<template>
  <div class="practice">
    <!-- 开始页面 - 只有在没有fromIndex且没有currentWord时显示 -->
    <el-card v-if="!currentWord && !hasFromIndex" class="start-card">
      <div class="start-content">
        <div class="icon-wrapper">
          <el-icon class="practice-icon"><EditPen /></el-icon>
        </div>
        <h2>随手拼练习</h2>
        <p>根据中文提示拼写英文单词，提升记忆效果</p>
        <div class="start-buttons">
          <el-button type="primary" size="large" @click="startPractice" class="start-btn">
            <el-icon style="margin-right: 8px;"><CaretRight /></el-icon>
            开始练习
          </el-button>
          <el-button size="large" @click="clearProgress" class="clear-btn">
            <el-icon style="margin-right: 8px;"><Delete /></el-icon>
            清除进度
          </el-button>
        </div>
        <div v-if="savedIndex > 0" class="progress-hint">
          <el-icon><Timer /></el-icon>
          <span>上次练习到第 {{ savedIndex + 1 }} 个单词</span>
        </div>
      </div>
    </el-card>

    <!-- 练习页面 - 当有currentWord或者有fromIndex时显示 -->
    <el-card v-if="currentWord || hasFromIndex" class="practice-card">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <el-icon class="loading-icon is-loading" :size="40"><Loading /></el-icon>
        <p>加载中...</p>
      </div>

      <!-- 练习内容 -->
      <template v-else>
        <div class="progress-bar">
          <div class="progress-info">
            <span class="progress-text">进度</span>
            <span class="progress-count">{{ getProgressText() }}</span>
          </div>
          <el-progress 
            :percentage="Math.round((correctCount / practiceTotal) * 100)" 
            :show-text="false"
            :stroke-width="8"
            class="progress-line"
          />
          <div class="progress-actions">
            <el-button @click="saveProgress" size="small" text>
              <el-icon><FolderChecked /></el-icon>
              保存进度
            </el-button>
            <el-button @click="clearProgress" size="small" text>
              <el-icon><Delete /></el-icon>
              清除进度
            </el-button>
            <el-button @click="goBack" size="small" text :disabled="isGoBackDisabled">
              <el-icon><ArrowLeft /></el-icon>
              上一个
            </el-button>
            <el-button @click="goHome" size="small" text class="go-home-btn">
              <el-icon><HomeFilled /></el-icon>
              返回首页
            </el-button>
          </div>
        </div>

        <div v-if="currentWord" class="word-display">
          <div class="word-label">中文释义</div>
          <h3 class="chinese">{{ currentWord.chinese }}</h3>
          <el-tag size="small" type="info" class="pos-tag">{{ currentWord.part_of_speech }}</el-tag>
        </div>

        <el-form @submit.prevent="checkAnswer" class="answer-form">
          <el-form-item>
            <el-input
              v-model="userAnswer"
              placeholder="请输入英文单词..."
              size="large"
              ref="inputRef"
              @keyup.enter="checkAnswer"
              class="answer-input"
            >
              <template #prefix>
                <el-icon><Edit /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item class="btn-group">
            <el-button type="primary" size="large" @click="checkAnswer" :loading="checking">
              <el-icon style="margin-right: 6px;"><Check /></el-icon>
              提交
            </el-button>
            <el-button size="large" @click="showAnswer">
              <el-icon><View /></el-icon>
              显示答案
            </el-button>
            <el-button size="large" @click="skipWord">
              <el-icon><ArrowRight /></el-icon>
              跳过
            </el-button>
          </el-form-item>
        </el-form>

        <transition name="fade">
          <div v-if="showResult" class="result" :class="{ correct: isCorrect, wrong: !isCorrect }">
            <div class="result-icon">
              <el-icon v-if="isCorrect" :size="48"><CircleCheckFilled /></el-icon>
              <el-icon v-else :size="48"><CircleCloseFilled /></el-icon>
            </div>
            <span class="result-text">{{ isCorrect ? '回答正确！' : '回答错误' }}</span>
            <p v-if="!isCorrect" class="correct-answer">正确答案: <strong>{{ currentWord?.english }}</strong></p>
            <el-button v-if="!isCorrect" type="primary" @click="tryAgain" class="result-btn">
              <el-icon style="margin-right: 6px;"><Refresh /></el-icon>
              再试一次
            </el-button>
            <el-button v-else type="success" @click="nextWord" class="result-btn">
              <el-icon style="margin-right: 6px;"><ArrowRight /></el-icon>
              下一个
            </el-button>
          </div>
        </transition>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  EditPen, CaretRight, FolderChecked, Edit, Check, View, ArrowRight, 
  CircleCheckFilled, CircleCloseFilled, Refresh, Delete, Timer, ArrowLeft, HomeFilled, Loading
} from '@element-plus/icons-vue'
import { wordApi, type Word } from '../api'
import { useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

// 核心数据
const words = ref<Word[]>([])
const currentIndex = ref(0)
const savedIndex = ref(0)
const savedTotal = ref(0)
const savedCorrectCount = ref(0)
const savedSkipCount = ref(0)
const currentWord = ref<Word | null>(null)
const userAnswer = ref('')
const showResult = ref(false)
const isCorrect = ref(false)
const checking = ref(false)
const inputRef = ref()
const sessionId = ref<number | null>(null)
const loading = ref(false)

// 从首页过来的参数
const fromIndex = ref<number | null>(null)
const fromPage = ref<number | null>(null)

// 总数和进度
const totalWords = ref(0)
const correctCount = ref(0)
const practiceTotal = ref(0)
const skipCount = ref(0)

// 判断是否有fromIndex参数
const hasFromIndex = computed(() => route.query.fromIndex !== undefined)

// 判断上一个按钮是否禁用：从表格进入时，只能回到起始词
const isGoBackDisabled = computed(() => {
  if (fromIndex.value !== null) {
    return currentIndex.value <= fromIndex.value
  }
  return currentIndex.value === 0
})

const loadWords = async () => {
  try {
    // 获取第一页数据以获取总数
    const firstPage = await wordApi.getWords(1, 1000)
    totalWords.value = firstPage.data.total || firstPage.data.words.length
    
    // 如果总数超过1000，分批获取所有单词
    if (totalWords.value > 1000) {
      const pages = Math.ceil(totalWords.value / 1000)
      const allWords = [...firstPage.data.words]
      
      for (let page = 2; page <= pages; page++) {
        const res = await wordApi.getWords(page, 1000)
        allWords.push(...res.data.words)
      }
      
      words.value = allWords
    } else {
      words.value = firstPage.data.words
    }
  } catch (error) {
    ElMessage.error('加载单词失败')
  }
}

const getProgressText = () => {
  return `${correctCount.value} / ${practiceTotal.value}`
}

const loadProgress = async (startIndex?: number) => {
  try {
    let prefix = 'practice'
    if (startIndex !== undefined) {
      prefix = `practice_${startIndex}`
    }
    
    const indexRes = await wordApi.getSetting(`${prefix}Index`)
    if (indexRes.data.value !== null) {
      const index = parseInt(indexRes.data.value)
      savedIndex.value = index
    }
    
    const totalRes = await wordApi.getSetting(`${prefix}Total`)
    if (totalRes.data.value !== null) {
      const total = parseInt(totalRes.data.value)
      savedTotal.value = total
    }
    
    const correctRes = await wordApi.getSetting(`${prefix}CorrectCount`)
    if (correctRes.data.value !== null) {
      const count = parseInt(correctRes.data.value)
      savedCorrectCount.value = count
    }
    
    const skipRes = await wordApi.getSetting(`${prefix}SkipCount`)
    if (skipRes.data.value !== null) {
      const count = parseInt(skipRes.data.value)
      savedSkipCount.value = count
    }
  } catch (error) {
    console.error('Load progress error:', error)
  }
}

const saveProgress = async () => {
  try {
    let prefix = 'practice'
    let isTablePractice = false
    
    if (fromIndex.value !== null) {
      prefix = `practice_${fromIndex.value}`
      isTablePractice = true
    }
    
    await wordApi.saveSetting(`${prefix}Index`, currentIndex.value.toString())
    await wordApi.saveSetting(`${prefix}Total`, practiceTotal.value.toString())
    await wordApi.saveSetting(`${prefix}CorrectCount`, correctCount.value.toString())
    await wordApi.saveSetting(`${prefix}SkipCount`, skipCount.value.toString())
    
    if (isTablePractice) {
      ElMessage.success(`已保存从第${fromIndex.value + 1}个词开始的练习进度`)
    } else {
      ElMessage.success('进度已保存')
    }
  } catch (error) {
    ElMessage.error('保存进度失败')
  }
}

const autoSaveProgress = async () => {
  try {
    let prefix = 'practice'
    
    if (fromIndex.value !== null) {
      prefix = `practice_${fromIndex.value}`
    }
    
    await wordApi.saveSetting(`${prefix}Index`, currentIndex.value.toString())
    await wordApi.saveSetting(`${prefix}Total`, practiceTotal.value.toString())
    await wordApi.saveSetting(`${prefix}CorrectCount`, correctCount.value.toString())
    await wordApi.saveSetting(`${prefix}SkipCount`, skipCount.value.toString())
  } catch (error) {
    console.error('Auto save progress error:', error)
  }
}

const clearProgress = async () => {
  try {
    const message = fromIndex.value !== null 
      ? '确定要清除练习进度吗？将回到当前练习的起始单词。'
      : '确定要清除练习进度吗？下次将从第一个单词开始练习。'
    await ElMessageBox.confirm(
      message,
      '清除进度',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    let prefix = 'practice'
    if (fromIndex.value !== null) {
      prefix = `practice_${fromIndex.value}`
    }
    
    // 清除进度后回到起始词
    if (fromIndex.value !== null) {
      currentIndex.value = fromIndex.value
      practiceTotal.value = totalWords.value - fromIndex.value
    } else {
      currentIndex.value = 0
      practiceTotal.value = totalWords.value
    }
    
    // 清除存储中的进度
    await wordApi.saveSetting(`${prefix}Index`, '0')
    await wordApi.saveSetting(`${prefix}Total`, '0')
    await wordApi.saveSetting(`${prefix}CorrectCount`, '0')
    await wordApi.saveSetting(`${prefix}SkipCount`, '0')
    
    savedIndex.value = 0
    savedTotal.value = 0
    savedCorrectCount.value = 0
    savedSkipCount.value = 0
    correctCount.value = 0
    skipCount.value = 0
    
    showResult.value = false
    showCurrentWord()
    ElMessage.success('进度已清除')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('清除失败')
    }
  }
}

const startPractice = async () => {
  loading.value = true
  try {
    const res = await wordApi.startPractice()
    sessionId.value = res.data.sessionId
  } catch (error) {
    console.error('Start practice error:', error)
  }
  
  await loadWords()
  if (words.value.length === 0) {
    ElMessage.warning('请先导入单词')
    router.push('/')
    return
  }
  
  const queryFromIndex = route.query.fromIndex
  const queryFromPage = route.query.fromPage
  
  if (queryFromIndex !== undefined) {
    fromIndex.value = parseInt(queryFromIndex as string)
    
    // 加载该起始词的独立进度
    await loadProgress(fromIndex.value)
    
    // 如果有保存的进度，且不在起始位置，弹出提示
    if (savedIndex.value > fromIndex.value) {
      const completed = savedCorrectCount.value
      const skipped = savedSkipCount.value
      ElMessage.info(`上次从第${fromIndex.value + 1}个词开始练习，已完成${completed}个，跳过${skipped}个，现在从第${savedIndex.value + 1}个词继续`)
      currentIndex.value = savedIndex.value
    } else {
      currentIndex.value = fromIndex.value
    }
    
    if (queryFromPage !== undefined) {
      fromPage.value = parseInt(queryFromPage as string)
    }
    
    practiceTotal.value = savedTotal.value > 0 ? savedTotal.value : (totalWords.value - fromIndex.value)
    correctCount.value = savedCorrectCount.value
    skipCount.value = savedSkipCount.value
  } else {
    await loadProgress()
    if (savedIndex.value >= words.value.length) {
      currentIndex.value = 0
    } else {
      currentIndex.value = savedIndex.value
    }
    practiceTotal.value = savedTotal.value > 0 ? savedTotal.value : totalWords.value
    correctCount.value = savedCorrectCount.value
    skipCount.value = savedSkipCount.value
    
    if (savedIndex.value > 0 || savedCorrectCount.value > 0 || savedSkipCount.value > 0) {
      const completed = savedCorrectCount.value
      const skipped = savedSkipCount.value
      ElMessage.info(`上次练习已完成${completed}个，跳过${skipped}个，现在从第${savedIndex.value + 1}个词继续`)
    }
  }
  loading.value = false
  showCurrentWord()
}

const showCurrentWord = () => {
  if (words.value.length > 0 && currentIndex.value >= 0 && currentIndex.value < words.value.length) {
    currentWord.value = words.value[currentIndex.value]
  }
  userAnswer.value = ''
  showResult.value = false
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const checkAnswer = async () => {
  if (!currentWord.value) return
  if (!userAnswer.value.trim()) {
    ElMessage.warning('请输入答案')
    return
  }
  checking.value = true
  
  isCorrect.value = userAnswer.value.toLowerCase().trim() === currentWord.value.english.toLowerCase().trim()
  showResult.value = true
  checking.value = false

  if (!isCorrect.value) {
    await wordApi.addErrorWord(currentWord.value.id)
  }
}

const showAnswer = () => {
  if (currentWord.value) {
    ElMessage.info(`答案: ${currentWord.value.english}`)
  }
}

const skipWord = async () => {
  if (!currentWord.value) return
  currentIndex.value++
  skipCount.value++
  if (practiceTotal.value > 0) {
    practiceTotal.value--
  }
  await autoSaveProgress()
  if (currentIndex.value >= words.value.length) {
    currentIndex.value = 0
    await autoSaveProgress()
    ElMessage.success('恭喜完成一轮练习！')
    if (sessionId.value) {
      try {
        await wordApi.endPractice(sessionId.value)
      } catch (error) {
        console.error('End practice error:', error)
      }
    }
  }
  showCurrentWord()
}

const tryAgain = () => {
  userAnswer.value = ''
  showResult.value = false
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const nextWord = async () => {
  if (!currentWord.value) return
  if (isCorrect.value) {
    correctCount.value++
    currentIndex.value++
    await autoSaveProgress()
    if (currentIndex.value >= words.value.length) {
      currentIndex.value = 0
      await autoSaveProgress()
      ElMessage.success('恭喜完成一轮练习！')
      if (sessionId.value) {
        try {
          await wordApi.endPractice(sessionId.value)
        } catch (error) {
          console.error('End practice error:', error)
        }
      }
    }
  }
  showCurrentWord()
}

const goBack = () => {
  const minIndex = fromIndex.value !== null ? fromIndex.value : 0
  if (currentIndex.value > minIndex) {
    currentIndex.value--
    practiceTotal.value++
    showCurrentWord()
  }
}

const goHome = () => {
  if (fromPage.value !== null) {
    router.push({ path: '/', query: { page: fromPage.value } })
  } else {
    router.push('/')
  }
}

onMounted(() => {
  // 直接调用startPractice，会根据是否有fromIndex来决定行为
  startPractice()
})

onBeforeUnmount(async () => {
  if (sessionId.value) {
    try {
      await wordApi.endPractice(sessionId.value)
    } catch (error) {
      console.error('End practice error:', error)
    }
  }
})
</script>

<style scoped>
.practice {
  max-width: 600px;
  margin: 0 auto;
}

.start-card, .practice-card {
  text-align: center;
}

.start-content {
  padding: 40px 20px;
}

.icon-wrapper {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.practice-icon {
  font-size: 40px;
  color: #fff;
}

.start-content h2 {
  margin-bottom: 12px;
  font-size: 28px;
  color: #303133;
}

.start-content p {
  margin-bottom: 32px;
  color: #909399;
  font-size: 15px;
}

.start-buttons {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 24px;
}

.start-btn {
  padding: 12px 40px;
  font-size: 16px;
}

.clear-btn {
  padding: 12px 40px;
  font-size: 16px;
  background: #f5f7fa;
  color: #606266;
  border: 1px solid #dcdfe6;
}

.clear-btn:hover {
  background: #e4e7ed;
  color: #606266;
}

.progress-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fffbe6;
  border-radius: 8px;
  color: #d4a76a;
  font-size: 14px;
}

.progress-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  padding: 16px;
  background: #f8f9fb;
  border-radius: 10px;
}

.progress-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 80px;
}

.progress-text {
  font-size: 12px;
  color: #909399;
}

.progress-count {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.progress-line {
  flex: 1;
}

.progress-actions {
  display: flex;
  gap: 8px;
}

.word-display {
  margin-bottom: 40px;
  padding: 30px;
  background: linear-gradient(135deg, #f8f9fb 0%, #f0f2f5 100%);
  border-radius: 12px;
}

.word-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.chinese {
  font-size: 36px;
  margin-bottom: 12px;
  color: #303133;
  font-weight: 600;
}

.pos-tag {
  font-size: 13px;
}

.answer-form {
  margin-bottom: 20px;
}

.answer-input {
  font-size: 16px;
}

.btn-group {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
}

.result {
  margin-top: 32px;
  padding: 32px;
  border-radius: 12px;
}

.result.correct {
  background: linear-gradient(135deg, #f0f9eb 0%, #e1f3d8 100%);
}

.result.wrong {
  background: linear-gradient(135deg, #fef0f0 0%, #fde2e2 100%);
}

.result-icon {
  margin-bottom: 16px;
}

.result.correct .result-icon {
  color: #67c23a;
}

.result.wrong .result-icon {
  color: #f56c6c;
}

.result-text {
  font-size: 24px;
  font-weight: 600;
}

.result.correct .result-text {
  color: #67c23a;
}

.result.wrong .result-text {
  color: #f56c6c;
}

.correct-answer {
  font-size: 16px;
  margin-top: 12px;
  color: #606266;
}

.correct-answer strong {
  color: #303133;
}

.result-btn {
  margin-top: 20px;
  padding: 10px 30px;
}

.fade-enter-active, .fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.loading-container {
  padding: 60px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-icon {
  color: #667eea;
}

.loading-container p {
  color: #909399;
  font-size: 16px;
  margin: 0;
}

.go-home-btn {
  display: inline-flex;
}

@media (max-width: 768px) {
  .go-home-btn {
    display: none;
  }
  
  .start-content {
    padding: 30px 15px;
  }
  
  .icon-wrapper {
    width: 60px;
    height: 60px;
  }
  
  .practice-icon {
    font-size: 30px;
  }
  
  .chinese {
    font-size: 28px;
  }
  
  .word-display {
    padding: 20px;
  }
  
  .result {
    font-size: 20px;
    padding: 24px;
  }
  
  .btn-group {
    flex-wrap: wrap;
  }
  
  .progress-bar {
    flex-wrap: wrap;
  }
  
  .progress-actions {
    margin-top: 8px;
  }
}

@media (max-width: 480px) {
  .chinese {
    font-size: 24px;
  }
  
  .result {
    padding: 20px;
  }
  
  .result-text {
    font-size: 20px;
  }
  
  .correct-answer {
    font-size: 14px;
  }
  
  .progress-bar {
    flex-wrap: wrap;
    gap: 12px;
  }
  
  .start-buttons {
    flex-direction: column;
    align-items: center;
  }
}
</style>
