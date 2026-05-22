<template>
  <div class="error-words">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon class="header-icon"><Warning /></el-icon>
            <span>错题集</span>
            <el-tag type="danger" size="small" style="margin-left: 12px;">{{ words.length }} 题</el-tag>
          </div>
          <el-button type="primary" @click="startPractice">
            <el-icon style="margin-right: 6px;"><Edit /></el-icon>
            开始练习错题
          </el-button>
        </div>
      </template>

      <el-table :data="words" style="width: 100%" v-loading="loading" stripe>
        <el-table-column type="index" label="序号" width="70" align="center" />
        <el-table-column label="英文" min-width="180">
          <template #default="{ row }">
            <span class="word-text">{{ row.english }}</span>
          </template>
        </el-table-column>
        <el-table-column label="词性" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.part_of_speech }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="中文" min-width="200">
          <template #default="{ row }">{{ row.chinese }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <el-button size="small" type="success" @click="removeFromErrorWords(row.id)">
              <el-icon><CircleCheck /></el-icon>
              已掌握
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="words.length === 0 && !loading" description="暂无错题，继续加油！">
        <el-button type="primary" @click="$router.push('/')">去练习</el-button>
      </el-empty>
    </el-card>

    <el-dialog v-model="practiceDialogVisible" title="错题练习" width="500px" class="practice-dialog">
      <div v-if="practiceWords.length > 0 && currentPracticeWord" class="practice-content">
        <div class="progress">
          <el-progress 
            :percentage="Math.round((practiceIndex / practiceWords.length) * 100)" 
            :show-text="false"
            :stroke-width="6"
          />
          <span class="progress-text">{{ practiceIndex + 1 }} / {{ practiceWords.length }}</span>
        </div>
        <div class="word-display">
          <div class="word-label">中文释义</div>
          <h3 class="chinese">{{ currentPracticeWord.chinese }}</h3>
          <el-tag size="small" type="info">{{ currentPracticeWord.part_of_speech }}</el-tag>
        </div>
        <el-input
          v-model="practiceAnswer"
          placeholder="请输入英文单词..."
          size="large"
          @keyup.enter="checkPracticeAnswer"
          class="practice-input"
        >
          <template #prefix>
            <el-icon><Edit /></el-icon>
          </template>
        </el-input>
        <div class="practice-btns">
          <el-button type="primary" @click="checkPracticeAnswer">
            <el-icon style="margin-right: 6px;"><Check /></el-icon>
            提交
          </el-button>
          <el-button @click="showPracticeAnswer">
            <el-icon><View /></el-icon>
            显示答案
          </el-button>
        </div>
        <transition name="fade">
          <div v-if="practiceResult" class="result" :class="{ correct: practiceIsCorrect, wrong: !practiceIsCorrect }">
            <div class="result-icon">
              <el-icon v-if="practiceIsCorrect" :size="36"><CircleCheckFilled /></el-icon>
              <el-icon v-else :size="36"><CircleCloseFilled /></el-icon>
            </div>
            <span class="result-text">{{ practiceIsCorrect ? '回答正确！' : '回答错误' }}</span>
            <p v-if="!practiceIsCorrect" class="correct-answer">正确答案: <strong>{{ currentPracticeWord.english }}</strong></p>
            <div v-if="practiceIsCorrect" style="margin-top: 16px;">
              <el-button type="success" @click="nextPracticeWord">
                <el-icon style="margin-right: 6px;"><Right /></el-icon>
                下一个
              </el-button>
            </div>
          </div>
        </transition>
      </div>
      <div v-else class="practice-content">
        <el-empty description="练习完成！" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { 
  Warning, Edit, CircleCheck, Check, View, Right, 
  CircleCheckFilled, CircleCloseFilled 
} from '@element-plus/icons-vue'
import { wordApi, type Word } from '../api'

const words = ref<Word[]>([])
const loading = ref(false)
const practiceDialogVisible = ref(false)
const practiceWords = ref<Word[]>([])
const practiceIndex = ref(0)
const currentPracticeWord = ref<Word | null>(null)
const practiceAnswer = ref('')
const practiceResult = ref(false)
const practiceIsCorrect = ref(false)

const loadErrorWords = async () => {
  loading.value = true
  try {
    const res = await wordApi.getErrorWords()
    words.value = res.data.words
  } catch (error) {
    ElMessage.error('加载错题失败')
  } finally {
    loading.value = false
  }
}

const removeFromErrorWords = async (wordId: number) => {
  try {
    await wordApi.removeErrorWord(wordId)
    ElMessage.success('已移至观察室')
    loadErrorWords()
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

const startPractice = () => {
  if (words.value.length === 0) {
    ElMessage.warning('暂无错题')
    return
  }
  practiceWords.value = [...words.value]
  practiceIndex.value = 0
  practiceAnswer.value = ''
  practiceResult.value = false
  currentPracticeWord.value = practiceWords.value[0]
  practiceDialogVisible.value = true
}

const checkPracticeAnswer = async () => {
  if (!practiceAnswer.value.trim()) {
    ElMessage.warning('请输入答案')
    return
  }
  
  practiceIsCorrect.value = practiceAnswer.value.toLowerCase().trim() === currentPracticeWord.value!.english.toLowerCase().trim()
  practiceResult.value = true

  if (practiceIsCorrect.value) {
    // 答对了，从错题集移除，加入观察室
    await wordApi.removeErrorWord(currentPracticeWord.value!.id)
  } else {
    // 答错了，保持在错题集
    await wordApi.addErrorWord(currentPracticeWord.value!.id)
  }
}

const showPracticeAnswer = () => {
  ElMessage.info(`答案: ${currentPracticeWord.value?.english}`)
}

const nextPracticeWord = () => {
  practiceIndex.value++
  if (practiceIndex.value >= practiceWords.value.length) {
    currentPracticeWord.value = null
    loadErrorWords()
  } else {
    currentPracticeWord.value = practiceWords.value[practiceIndex.value]
    practiceAnswer.value = ''
    practiceResult.value = false
  }
}

onMounted(() => {
  loadErrorWords()
})
</script>

<style scoped>
.error-words {
  max-width: 1000px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 20px;
  color: #f56c6c;
}

.word-text {
  font-weight: 500;
  color: #303133;
}

.practice-content {
  text-align: center;
}

.progress {
  margin-bottom: 30px;
}

.progress-text {
  display: block;
  margin-top: 8px;
  color: #909399;
  font-size: 14px;
}

.word-display {
  margin-bottom: 30px;
  padding: 24px;
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
  font-size: 28px;
  margin-bottom: 12px;
  color: #303133;
  font-weight: 600;
}

.practice-input {
  font-size: 16px;
}

.practice-btns {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  gap: 12px;
}

.result {
  margin-top: 24px;
  padding: 24px;
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
  font-size: 20px;
  font-weight: 600;
}

.result.correct .result-text {
  color: #67c23a;
}

.result.wrong .result-text {
  color: #f56c6c;
}

.correct-answer {
  font-size: 14px;
  margin-top: 10px;
  color: #606266;
}

.correct-answer strong {
  color: #303133;
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
    font-size: 24px;
  }
  
  .error-words :deep(.el-table) {
    font-size: 13px;
  }
  
  .error-words :deep(.el-dialog) {
    width: 90% !important;
    margin: 5vh auto;
  }
  
  .practice-btns {
    flex-wrap: wrap;
  }
}

@media (max-width: 480px) {
  .chinese {
    font-size: 22px;
  }
  
  .word-display {
    padding: 16px;
  }
}
</style>
