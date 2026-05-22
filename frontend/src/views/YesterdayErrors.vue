<template>
  <div class="yesterday-errors">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon class="header-icon"><Calendar /></el-icon>
            <span>昨日错词巩固</span>
            <el-tag v-if="words.length > 0" type="warning" size="small" style="margin-left: 12px;">
              {{ words.length }} 词
            </el-tag>
          </div>
        </div>
      </template>

      <div v-if="words.length === 0" class="empty-state">
        <el-empty description="暂无错词，继续保持！">
          <el-button type="primary" @click="$router.push('/')">去练习</el-button>
        </el-empty>
      </div>

      <div v-else class="practice-area">
        <div v-if="currentWord" class="word-card">
          <div class="progress-bar">
            <el-progress 
              :percentage="Math.round((currentIndex / words.length) * 100)" 
              :show-text="false"
              :stroke-width="8"
            />
            <div class="progress-info">
              <span class="progress-text">进度</span>
              <span class="progress-count">{{ currentIndex + 1 }} / {{ words.length }}</span>
            </div>
          </div>
          <div class="word-display">
            <div class="word-label">中文释义</div>
            <h3 class="chinese">{{ currentWord.chinese }}</h3>
            <el-tag size="small" type="info">{{ currentWord.part_of_speech }}</el-tag>
          </div>
          <el-input
            v-model="userAnswer"
            placeholder="请输入英文单词..."
            size="large"
            @keyup.enter="checkAnswer"
            class="answer-input"
          >
            <template #prefix>
              <el-icon><Edit /></el-icon>
            </template>
          </el-input>
          <div class="btn-group">
            <el-button type="primary" @click="checkAnswer">
              <el-icon style="margin-right: 6px;"><Check /></el-icon>
              提交
            </el-button>
            <el-button @click="showAnswer">
              <el-icon><View /></el-icon>
              显示答案
            </el-button>
          </div>
          <transition name="fade">
            <div v-if="showResult" class="result" :class="{ correct: isCorrect, wrong: !isCorrect }">
              <div class="result-icon">
                <el-icon v-if="isCorrect" :size="40"><CircleCheckFilled /></el-icon>
                <el-icon v-else :size="40"><CircleCloseFilled /></el-icon>
              </div>
              <span class="result-text">{{ isCorrect ? '回答正确！' : '回答错误' }}</span>
              <p v-if="!isCorrect" class="correct-answer">正确答案: <strong>{{ currentWord.english }}</strong></p>
              <el-button :type="isCorrect ? 'success' : 'primary'" @click="nextWord" class="result-btn">
                <el-icon style="margin-right: 6px;"><Right /></el-icon>
                继续
              </el-button>
            </div>
          </transition>
        </div>
        <div v-else class="complete-card">
          <div class="complete-icon">
            <el-icon :size="60"><CircleCheckFilled /></el-icon>
          </div>
          <h2>恭喜完成昨日错词巩固！</h2>
          <p class="complete-tip">继续保持，每天进步一点点</p>
          <el-button type="primary" @click="restart">
            <el-icon style="margin-right: 6px;"><RefreshRight /></el-icon>
            再练一次
          </el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { 
  Calendar, Edit, Check, View, Right, 
  CircleCheckFilled, CircleCloseFilled, RefreshRight 
} from '@element-plus/icons-vue'
import { wordApi, type Word } from '../api'

const words = ref<Word[]>([])
const currentIndex = ref(0)
const currentWord = ref<Word | null>(null)
const userAnswer = ref('')
const showResult = ref(false)
const isCorrect = ref(false)

const loadWords = async () => {
  // 昨日错词就是上次练习会话中的错题
  const res = await wordApi.getYesterdayErrors()
  words.value = res.data.words || []
  if (words.value.length > 0) {
    currentWord.value = words.value[0]
  }
}

const checkAnswer = async () => {
  if (!userAnswer.value.trim()) {
    ElMessage.warning('请输入答案')
    return
  }

  isCorrect.value = userAnswer.value.toLowerCase().trim() === currentWord.value!.english.toLowerCase().trim()
  showResult.value = true

  if (isCorrect.value) {
    // 答对了，从错题集移除，加入观察室
    await wordApi.removeErrorWord(currentWord.value!.id)
  } else {
    // 答错了，保持在错题集
    await wordApi.addErrorWord(currentWord.value!.id)
  }
}

const showAnswer = () => {
  ElMessage.info(`答案: ${currentWord.value?.english}`)
}

const nextWord = async () => {
  currentIndex.value++
  if (currentIndex.value >= words.value.length) {
    currentWord.value = null
  } else {
    // 重新加载错题集，因为可能已经有单词已经被移除
    await loadWords()
    if (currentIndex.value >= words.value.length) {
      currentWord.value = null
    } else {
      currentWord.value = words.value[currentIndex.value]
    }
    userAnswer.value = ''
    showResult.value = false
  }
}

const restart = () => {
  currentIndex.value = 0
  userAnswer.value = ''
  showResult.value = false
  loadWords()
}

onMounted(() => {
  loadWords()
})
</script>

<style scoped>
.yesterday-errors {
  max-width: 600px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 20px;
  color: #e6a23c;
}

.empty-state {
  padding: 20px;
}

.practice-area {
  text-align: center;
}

.word-card, .complete-card {
  padding: 20px;
}

.progress-bar {
  margin-bottom: 30px;
}

.progress-info {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-text {
  font-size: 12px;
  color: #909399;
}

.progress-count {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.word-display {
  margin-bottom: 30px;
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

.answer-input {
  font-size: 16px;
}

.btn-group {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  gap: 12px;
}

.result {
  margin-top: 30px;
  padding: 28px;
  border-radius: 12px;
}

.result.correct {
  background: linear-gradient(135deg, #f0f9eb 0%, #e1f3d8 100%);
}

.result.wrong {
  background: linear-gradient(135deg, #fef0f0 0%, #fde2e2 100%);
}

.result-icon {
  margin-bottom: 12px;
}

.result.correct .result-icon {
  color: #67c23a;
}

.result.wrong .result-icon {
  color: #f56c6c;
}

.result-text {
  font-size: 22px;
  font-weight: 600;
}

.result.correct .result-text {
  color: #67c23a;
}

.result.wrong .result-text {
  color: #f56c6c;
}

.correct-answer {
  font-size: 15px;
  margin-top: 10px;
  color: #606266;
}

.correct-answer strong {
  color: #303133;
}

.result-btn {
  margin-top: 16px;
}

.complete-icon {
  color: #67c23a;
  margin-bottom: 20px;
}

.complete-card h2 {
  margin-bottom: 12px;
  color: #67c23a;
  font-size: 24px;
}

.complete-tip {
  color: #909399;
  margin-bottom: 24px;
}

.fade-enter-active, .fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

@media (max-width: 768px) {
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
}

@media (max-width: 480px) {
  .chinese {
    font-size: 24px;
  }
  
  .result {
    font-size: 18px;
    padding: 20px;
  }
  
  .result-text {
    font-size: 18px;
  }
  
  .correct-answer {
    font-size: 14px;
  }
}
</style>
