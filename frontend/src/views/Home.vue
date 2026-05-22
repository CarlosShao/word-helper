<template>
  <div class="home">
    <el-card class="word-list-card">
      <template #header>
        <div class="card-header">
          <div class="header-top">
            <div class="header-left">
              <el-icon class="header-icon"><Notebook /></el-icon>
              <span>单词列表</span>
              <el-tag type="info" size="small" style="margin-left: 12px;">共 {{ total }} 个</el-tag>
            </div>
            <div class="header-actions">
              <el-button type="danger" @click="batchDeleteSelected" :disabled="selectedWords.length === 0" size="small">
                <el-icon><Delete /></el-icon>
                批量删除 ({{ selectedWords.length }})
              </el-button>
              <el-button type="warning" @click="reclassifyWords" :loading="classifying" size="small">
                <el-icon><Refresh /></el-icon>
                重新分类
              </el-button>
              <el-button type="primary" @click="showUploadDialog" size="small">
                <el-icon><Upload /></el-icon>
                导入
              </el-button>
              <el-button type="info" @click="showImportLogs" size="small">
                <el-icon><Document /></el-icon>
                导入日志
              </el-button>
            </div>
          </div>
          <div class="search-bar">
            <div class="search-bar-row1">
              <el-input
                v-model="searchText"
                placeholder="搜索中英文..."
                style="width: 220px;"
                clearable
                @keyup.enter="loadWords"
                @clear="handleSearchClear"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
              <el-button type="primary" @click="loadWords" size="small">
                <el-icon><Search /></el-icon>
              </el-button>
              <el-button type="primary" @click="startAddNew" size="small" class="add-word-btn">
                <el-icon><Plus /></el-icon>
                新增单词
              </el-button>
            </div>
            <div class="search-bar-row2">
              <el-divider direction="vertical" />
              <el-button @click="toggleAllChinese" size="small">
                <el-icon v-if="allChineseHidden"><View /></el-icon>
                <el-icon v-else><Hide /></el-icon>
                {{ allChineseHidden ? '显示中文' : '隐藏中文' }}
              </el-button>
              <el-button @click="toggleAllEnglish" size="small">
                <el-icon v-if="allEnglishHidden"><View /></el-icon>
                <el-icon v-else><Hide /></el-icon>
                {{ allEnglishHidden ? '显示英文' : '隐藏英文' }}
              </el-button>
              <el-button type="success" @click="goToPractice" size="small">
                <el-icon style="margin-right: 4px;"><Edit /></el-icon>
                随手拼
              </el-button>
            </div>
          </div>
        </div>
      </template>

      <div class="table-wrapper">
        <el-table 
          :data="tableData" 
          class="word-table"
          style="width: 100%;" 
          stripe
          row-key="id"
          :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
          v-loading="loading"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="55" align="center" :selectable="checkSelectable" />
          <el-table-column label="序号" width="70" align="center">
            <template #default="{ row, $index }">
              <span v-if="!row.isChild && row.type !== 'group'">{{ (currentPage - 1) * pageSize + $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column label="英文" width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <template v-if="row.type === 'group'">
                <el-tag size="small" type="warning">{{ row.title }}</el-tag>
              </template>
              <template v-else-if="row.id">
                <template v-if="!row.isChild && editingId === row.id && editingField === 'english'">
                  <el-input v-model="editingValue" size="small" @blur="saveEdit()" @keyup.enter="saveEdit()" @keyup.esc="cancelEdit" ref="editInput" />
                </template>
                <template v-else>
                  <span 
                    v-if="!hiddenEnglish.has(row.id)" 
                    :class="['word-text', !row.isChild ? 'editable' : '']" 
                    @click.stop="!row.isChild && startEdit(row, 'english', $event)"
                  >{{ row.english }}</span>
                  <span v-else class="hidden-text">****</span>
                </template>
              </template>
            </template>
          </el-table-column>
          <el-table-column label="词性" width="130" align="left">
            <template #default="{ row }">
              <template v-if="row.type !== 'group' && row.id">
                <template v-if="!row.isChild && editingId === row.id && editingField === 'part_of_speech'">
                  <el-select v-model="editingValue" size="small" @change="saveEdit()" @blur="saveEdit()" filterable placeholder="选择词性">
                    <el-option label="(空)" value="" />
                    <el-option v-for="pos in partsOfSpeech" :key="pos.code" :label="`${pos.code} - ${pos.name}`" :value="pos.code" />
                  </el-select>
                </template>
                <template v-else>
                  <el-tag v-if="row.part_of_speech" size="small" type="info" :class="!row.isChild ? 'editable' : ''" @click.stop="!row.isChild && startEdit(row, 'part_of_speech', $event)">{{ row.part_of_speech }}</el-tag>
                  <span v-else :class="!row.isChild ? 'editable' : ''" @click.stop="!row.isChild && startEdit(row, 'part_of_speech', $event)" style="color: #909399; font-size: 12px;">{{ row.isChild ? '-' : '点击添加' }}</span>
                </template>
              </template>
            </template>
          </el-table-column>
          <el-table-column label="中文" min-width="350" show-overflow-tooltip>
            <template #default="{ row }">
              <template v-if="row.type !== 'group' && row.id">
                <template v-if="!row.isChild && editingId === row.id && editingField === 'chinese'">
                  <el-input v-model="editingValue" size="small" @blur="saveEdit()" @keyup.enter="saveEdit()" @keyup.esc="cancelEdit" />
                </template>
                <template v-else>
                  <span v-if="!hiddenChinese.has(row.id)" :class="!row.isChild ? 'editable' : ''" @click.stop="!row.isChild && startEdit(row, 'chinese', $event)">{{ row.chinese }}</span>
                  <span v-else class="hidden-text">****</span>
                </template>
              </template>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="380" align="left" fixed="right">
            <template #default="{ row }">
              <template v-if="row.type !== 'group' && row.id">
                <div class="action-buttons-row">
                  <el-tooltip :content="hiddenChinese.has(row.id) ? '显示中文' : '隐藏中文'" placement="top">
                    <el-button size="small" @click="toggleChinese(row.id)" :type="hiddenChinese.has(row.id) ? 'info' : 'default'" v-if="!row.isChild">
                      <el-icon v-if="hiddenChinese.has(row.id)"><View /></el-icon>
                      <el-icon v-else><Hide /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip :content="hiddenEnglish.has(row.id) ? '显示英文' : '隐藏英文'" placement="top">
                    <el-button size="small" @click="toggleEnglish(row.id)" :type="hiddenEnglish.has(row.id) ? 'info' : 'default'" v-if="!row.isChild">
                      <el-icon v-if="hiddenEnglish.has(row.id)"><View /></el-icon>
                      <el-icon v-else><Hide /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-button size="small" type="success" @click="startPracticeFromWord(row.id)" v-if="!row.isChild">
                    <el-icon><EditPen /></el-icon>
                    随手拼
                  </el-button>
                  <el-dropdown trigger="click" size="small" v-if="!row.isChild && !row.hasParent">
                    <el-button size="small" type="default">
                      <el-icon><More /></el-icon>
                      更多
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item @click="resetWordClassification(row.id)">
                          <el-icon><Refresh /></el-icon>
                          重新分类
                        </el-dropdown-item>
                        <el-dropdown-item @click="showManualClassification(row.id)">
                          <el-icon><Edit /></el-icon>
                          手动分类
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                  <el-button size="small" type="danger" @click="deleteWord(row)" v-if="!row.isChild">
                    <el-icon><Delete /></el-icon>
                    删除
                  </el-button>
                </div>
              </template>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 添加新单词行 -->
      <template v-if="addingNew" class="new-word-row">
        <div class="new-word-container">
          <div class="new-word-row">
            <div class="new-word-label">新增单词</div>
            <div class="new-word-fields">
              <div class="field-group">
                <span class="field-label">英文：</span>
                <el-input v-model="newWord.english" placeholder="请输入英文" size="small" class="field-input" />
              </div>
              <div class="field-group">
                <span class="field-label">词性：</span>
                <el-select v-model="newWord.part_of_speech" size="small" class="field-input pos-input" placeholder="选择词性" filterable>
                  <el-option label="(空)" value="" />
                  <el-option v-for="pos in partsOfSpeech" :key="pos.code" :label="`${pos.code} - ${pos.name}`" :value="pos.code" />
                </el-select>
              </div>
              <div class="field-group">
                <span class="field-label">中文：</span>
                <el-input v-model="newWord.chinese" placeholder="请输入中文释义" size="small" class="field-input chinese-input" />
              </div>
              <div class="field-actions">
                <el-button type="primary" size="small" @click="saveNewWord">保存</el-button>
                <el-button size="small" @click="cancelAddNew">取消</el-button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadWords"
          @current-change="loadWords"
        />
      </div>
    </el-card>

    <!-- 手动分类对话框 -->
    <el-dialog
      v-model="manualClassificationDialogVisible"
      title="手动分类"
      width="800px"
      class="manual-classification-dialog"
    >
      <div class="manual-classification-content">
        <div class="current-word-section">
          <h4>当前单词</h4>
          <div v-if="currentWordData" class="current-word-card">
            <span class="word-name">{{ currentWordData.english }}</span>
            <el-tag size="small" type="info">{{ currentWordData.part_of_speech }}</el-tag>
            <span class="word-meaning">{{ currentWordData.chinese }}</span>
          </div>
        </div>

        <div class="relations-section">
          <h4>当前分类关系</h4>
          <div v-if="currentWordData && currentWordData.children && currentWordData.children.length > 0">
            <el-tree
              :data="currentWordData.children"
              :props="{ children: 'children', label: 'english' }"
              default-expand-all
            >
              <template #default="{ node, data }">
                <div class="tree-item">
                  <span>{{ data.english }}</span>
                  <el-tag v-if="data.type === 'group'" size="small" type="warning">{{ data.title }}</el-tag>
                  <el-button 
                    v-if="data.id" 
                    size="small" 
                    type="danger" 
                    text 
                    @click="removeRelation(data.relationId)"
                  >
                    删除
                  </el-button>
                </div>
              </template>
            </el-tree>
          </div>
          <div v-else class="empty-state">
            暂无分类关系
          </div>
        </div>

        <div class="add-section">
          <h4>添加到根词</h4>
          <div class="relation-type-selector">
            <span class="type-label">关系类型：</span>
            <el-radio-group v-model="selectedRelationType" size="small">
              <el-radio value="derivative">衍生词</el-radio>
              <el-radio value="phrase">短语</el-radio>
            </el-radio-group>
          </div>
          <div class="search-box">
            <el-input 
              v-model="manualSearchText" 
              placeholder="搜索根词"
              @input="() => {}"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>
          <div class="word-list">
            <div 
              v-for="word in availableWords.filter(w => 
                !manualSearchText || w.english.toLowerCase().includes(manualSearchText.toLowerCase())
              ).slice(0, 10)" 
              :key="word.id"
              class="word-item"
              @click="addRelation(word.id)"
            >
              <span class="word-label">{{ word.english }}</span>
              <span class="word-pos">{{ word.part_of_speech }}</span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closeManualClassification">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 上传对话框 -->
    <el-dialog
      v-model="uploadDialogVisible"
      title="导入单词"
      width="520px"
      class="upload-dialog"
    >
      <div class="upload-content">
        <el-upload
          class="upload-area"
          drag
          action="/api/import"
          :auto-upload="false"
          :on-change="handleFileChange"
          accept=".pdf"
          ref="uploadRef"
        >
          <div class="upload-icon">
            <el-icon :size="48"><DocumentAdd /></el-icon>
          </div>
          <div class="upload-text">
            拖拽 PDF 文件到此处或 <em>点击上传</em>
          </div>
          <template #tip>
            <div class="upload-tip">
              支持 PDF 文件，将解析表格中的单词数据
            </div>
          </template>
        </el-upload>

        <div v-if="selectedFile" class="file-info">
          <el-icon><Document /></el-icon>
          <span>{{ selectedFile.name }}</span>
          <el-tag size="small" type="info" style="margin-left: 8px;">
            {{ formatFileSize(selectedFile.size) }}
          </el-tag>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="uploadDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleImport" :loading="importing">
            <el-icon style="margin-right: 6px;"><Upload /></el-icon>
            开始导入
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 导入日志对话框 -->
    <el-dialog
      v-model="importLogsVisible"
      title="导入日志"
      width="800px"
      class="import-logs-dialog"
    >
      <div v-if="loadingImportLogs" style="text-align: center; padding: 40px;">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p>加载中...</p>
      </div>
      <div v-else>
        <div class="import-stats">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-card shadow="hover">
                <template #header>
                  <span>最近导入记录</span>
                </template>
                <div v-if="importStats.length > 0">
                  <div v-for="item in importStats" :key="item.id" class="import-item">
                    <div class="import-item-header">
                      <el-tag type="info" size="small">{{ item.filename }}</el-tag>
                      <span class="import-time">{{ formatTime(item.imported_at) }}</span>
                    </div>
                    <div class="import-item-stats">
                      <el-tag v-if="item.error_count > 0" type="danger" size="small">
                        错误 {{ item.error_count }} 条
                      </el-tag>
                      <el-tag v-else type="success" size="small">无错误</el-tag>
                    </div>
                  </div>
                </div>
                <div v-else class="empty-text">暂无导入记录</div>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card shadow="hover">
                <template #header>
                  <span>错误详情</span>
                </template>
                <div v-if="importErrors.length > 0" class="error-list">
                  <el-scrollbar height="300px">
                    <div v-for="error in importErrors" :key="error.id" class="error-item">
                      <div class="error-header">
                        <el-tag type="warning" size="small">序号 {{ error.index_number }}</el-tag>
                        <span v-if="error.english" class="error-english">{{ error.english }}</span>
                        <span class="error-time">{{ formatTime(error.created_at) }}</span>
                      </div>
                      <div class="error-reason">{{ error.reason }}</div>
                    </div>
                  </el-scrollbar>
                </div>
                <div v-else class="empty-text">暂无错误</div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="importLogsVisible = false">关闭</el-button>
          <el-button type="primary" @click="loadImportLogs">
            <el-icon style="margin-right: 6px;"><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Search, View, Hide, Edit, Upload, 
  DocumentAdd, Notebook, Document, Refresh,
  Delete, Loading, Plus, EditPen, More
} from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { wordApi, posApi, type Word } from '../api'

const router = useRouter()

const searchText = ref('')
const words = ref<Word[]>([])
const tableData = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(10)
const importing = ref(false)
const selectedFile = ref<File | null>(null)
const uploadDialogVisible = ref(false)
const uploadRef = ref()

const hiddenChinese = ref<Set<number>>(new Set())
const hiddenEnglish = ref<Set<number>>(new Set())
const allChineseHidden = ref(false)
const allEnglishHidden = ref(false)
const classifying = ref(false)
const loading = ref(false)

const manualClassificationDialogVisible = ref(false)
const currentWordId = ref(0)
const currentWordData = ref<any>(null)
const manualSearchText = ref('')
const availableWords = ref<any[]>([])
const selectedRelationType = ref('derivative')
const selectedWords = ref<any[]>([])

const importLogsVisible = ref(false)
const loadingImportLogs = ref(false)
const importStats = ref<any[]>([])
const importErrors = ref<any[]>([])

// 编辑功能
const editingId = ref<number | null>(null)
const editingField = ref<string>('')
const editingValue = ref<string>('')
const editingRow = ref<any>(null)

// 词性列表
const partsOfSpeech = ref<any[]>([])

const loadPartsOfSpeech = async () => {
  try {
    const result = await posApi.getAll()
    if (result.success) {
      partsOfSpeech.value = result.data
    }
  } catch (error) {
    console.error('加载词性数据失败:', error)
  }
}

// 添加新单词
const addingNew = ref(false)
const newWord = ref({
  english: '',
  part_of_speech: '',
  chinese: ''
})

const checkSelectable = (row: any) => {
  return row.type !== 'group' && row.id && !row.isChild
}

const handleSelectionChange = (selection: any[]) => {
  selectedWords.value = selection
}

const batchDeleteSelected = async () => {
  if (selectedWords.value.length === 0) {
    ElMessage.warning('请先选择要删除的单词')
    return
  }
  
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedWords.value.length} 个单词吗？`,
      '批量删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    loading.value = true
    const wordIds = selectedWords.value.map(w => w.id)
    await wordApi.batchDeleteWords(wordIds)
    ElMessage.success(`成功删除 ${wordIds.length} 个单词`)
    selectedWords.value = []
    await loadWords()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('批量删除失败')
    }
  } finally {
    loading.value = false
  }
}

const handleSearchClear = () => {
  currentPage.value = 1
  searchText.value = ''
  // 跳转到不带page参数的首页，确保完全重置
  router.push('/')
  loadWords()
}

const loadWords = async () => {
  loading.value = true
  try {
    const res = await wordApi.getWords(currentPage.value, pageSize.value, searchText.value)
    tableData.value = res.data.words
    total.value = res.data.total
    words.value = res.data.words.map((w: any) => ({ ...w }))
  } catch (error) {
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

const showUploadDialog = () => {
  uploadDialogVisible.value = true
  selectedFile.value = null
}

const handleFileChange = (file: any) => {
  selectedFile.value = file.raw
  
  if (file.size > 1024 * 1024) {
    ElMessage.warning({
      message: '文件较大，解析和导入可能需要一些时间，请耐心等待...',
      duration: 5000
    })
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const handleImport = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择文件')
    return
  }
  
  if (selectedFile.value.size > 1024 * 1024) {
    ElMessage.info('正在解析文件，请稍候...')
  }
  
  importing.value = true
  try {
    const res = await wordApi.importFile(selectedFile.value)
    ElMessage.success(`成功导入 ${res.data.count} 个单词`)
    uploadDialogVisible.value = false
    currentPage.value = 1
    loadWords()
  } catch (error) {
    ElMessage.error('导入失败，请检查文件格式是否正确')
  } finally {
    importing.value = false
  }
}

const toggleChinese = (id: number) => {
  if (hiddenChinese.value.has(id)) {
    hiddenChinese.value.delete(id)
  } else {
    hiddenChinese.value.add(id)
  }
}

const toggleEnglish = (id: number) => {
  if (hiddenEnglish.value.has(id)) {
    hiddenEnglish.value.delete(id)
  } else {
    hiddenEnglish.value.add(id)
  }
}

const toggleAllChinese = () => {
  allChineseHidden.value = !allChineseHidden.value
  if (allChineseHidden.value) {
    words.value.forEach(w => hiddenChinese.value.add(w.id))
  } else {
    hiddenChinese.value.clear()
  }
}

const toggleAllEnglish = () => {
  allEnglishHidden.value = !allEnglishHidden.value
  if (allEnglishHidden.value) {
    words.value.forEach(w => hiddenEnglish.value.add(w.id))
  } else {
    hiddenEnglish.value.clear()
  }
}

const goToPractice = () => {
  router.push('/practice')
}

const reclassifyWords = async () => {
  loading.value = true
  try {
    classifying.value = true
    const res = await wordApi.classifyAll(false)
    ElMessage.success(`成功分类 ${res.data.classified} 个单词`)
    await loadWords()
  } catch (error) {
    ElMessage.error('分类失败')
  } finally {
    classifying.value = false
    loading.value = false
  }
}

const resetWordClassification = async (wordId: number) => {
  loading.value = true
  try {
    await wordApi.resetWordClassification(wordId)
    ElMessage.success('重置分类成功')
    await loadWords()
  } catch (error) {
    ElMessage.error('重置分类失败')
  } finally {
    loading.value = false
  }
}

const deleteWord = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除单词 "${row.english}" 吗？`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    loading.value = true
    await wordApi.deleteWord(row.id)
    ElMessage.success('删除成功')
    await loadWords()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  } finally {
    loading.value = false
  }
}

const showManualClassification = async (wordId: number) => {
  currentWordId.value = wordId
  manualClassificationDialogVisible.value = true
  await loadCurrentWordData(wordId)
}

const loadCurrentWordData = async (wordId: number) => {
  try {
    const res = await wordApi.getWordRelations(wordId)
    currentWordData.value = res.data
    
    const allWordsRes = await wordApi.getWords(1, 10000)
    availableWords.value = allWordsRes.data.words.filter(w => w.id !== wordId)
  } catch (error) {
    ElMessage.error('加载数据失败')
  }
}

const findWordInTree = (tree: any[], wordId: number): any => {
  for (const node of tree) {
    if (node.id === wordId) {
      return node
    }
    if (node.children && node.children.length > 0) {
      const found = findWordInTree(node.children, wordId)
      if (found) return found
    }
  }
  return null
}

const addRelation = async (childWordId: number) => {
  try {
    await wordApi.addRelation(currentWordId.value, childWordId, selectedRelationType.value)
    ElMessage.success('添加成功')
    await loadCurrentWordData(currentWordId.value)
    loadWords()
  } catch (error) {
    ElMessage.error('添加失败')
  }
}

const removeRelation = async (relationId: number) => {
  try {
    await wordApi.deleteRelation(relationId)
    ElMessage.success('移除成功')
    await loadCurrentWordData(currentWordId.value)
    loadWords()
  } catch (error) {
    ElMessage.error('移除失败')
  }
}

const closeManualClassification = () => {
  manualClassificationDialogVisible.value = false
  currentWordId.value = 0
  currentWordData.value = null
  manualSearchText.value = ''
  selectedRelationType.value = 'derivative'
}

const showImportLogs = async () => {
  importLogsVisible.value = true
  await loadImportLogs()
}

const loadImportLogs = async () => {
  loadingImportLogs.value = true
  try {
    const [statsRes, errorsRes] = await Promise.all([
      fetch('/api/import-stats').then(r => r.json()),
      fetch('/api/import-errors').then(r => r.json())
    ])
    if (statsRes.success) {
      importStats.value = statsRes.imports
    }
    if (errorsRes.success) {
      importErrors.value = errorsRes.errors
    }
  } catch (error) {
    console.error('加载导入日志失败:', error)
    ElMessage.error('加载导入日志失败')
  } finally {
    loadingImportLogs.value = false
  }
}

const formatTime = (timeStr: string) => {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 开始编辑单元格
const startEdit = (row: any, field: string, event: Event) => {
  if (row.type === 'group' || !row.id) return
  editingId.value = row.id
  editingField.value = field
  editingValue.value = row[field] || ''
  editingRow.value = { ...row }
  event.stopPropagation()
}

// 保存编辑
const saveEdit = async () => {
  if (!editingId.value || !editingField.value || !editingRow.value) return
  try {
    const row = editingRow.value
    const data = {
      english: editingField.value === 'english' ? editingValue.value : row.english,
      part_of_speech: editingField.value === 'part_of_speech' ? editingValue.value : (row.part_of_speech || ''),
      chinese: editingField.value === 'chinese' ? editingValue.value : row.chinese
    }
    await wordApi.updateWord(editingId.value, data)
    ElMessage.success('保存成功')
    await loadWords()
  } catch (error) {
    ElMessage.error('保存失败')
  }
  editingId.value = null
  editingField.value = ''
  editingValue.value = ''
  editingRow.value = null
}

// 取消编辑
const cancelEdit = () => {
  editingId.value = null
  editingField.value = ''
  editingValue.value = ''
}

// 从指定单词开始随手拼
const startPracticeFromWord = async (wordId: number) => {
  try {
    const res = await wordApi.getWordIndex(wordId)
    if (res.data && res.data.index !== undefined) {
      router.push({
        path: '/practice',
        query: {
          fromWord: wordId,
          fromIndex: res.data.index,
          fromPage: currentPage.value
        }
      })
    }
  } catch (error) {
    ElMessage.error('无法开始练习')
  }
}

// 开始添加新单词
const startAddNew = () => {
  addingNew.value = true
  newWord.value = { english: '', part_of_speech: '', chinese: '' }
}

// 保存新单词
const saveNewWord = async () => {
  if (!newWord.value.english || !newWord.value.chinese) {
    ElMessage.warning('请填写英文和中文')
    return
  }
  try {
    await wordApi.addWord(newWord.value)
    ElMessage.success('添加成功')
    addingNew.value = false
    newWord.value = { english: '', part_of_speech: '', chinese: '' }
    await loadWords()
  } catch (error) {
    ElMessage.error('添加失败')
  }
}

// 取消添加
const cancelAddNew = () => {
  addingNew.value = false
  newWord.value = { english: '', part_of_speech: '', chinese: '' }
}

const route = useRoute()

onMounted(() => {
  const pageParam = route.query.page
  if (pageParam) {
    currentPage.value = parseInt(pageParam as string)
  } else {
    currentPage.value = 1
  }
  loadWords()
  loadPartsOfSpeech()
})
</script>

<style scoped>
.home {
  width: 100%;
  padding: 0 20px;
  margin: 0 auto;
  box-sizing: border-box;
}

.word-list-card {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 20px;
  color: #667eea;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions .el-button {
  padding: 6px 16px;
  font-size: 13px;
}

.search-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.search-bar-row1 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-bar-row2 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-bar .el-button {
  padding: 6px 14px;
  font-size: 13px;
}

.add-word-btn {
  margin-left: 8px;
}

.word-text {
  font-weight: 500;
  color: #303133;
}

.hidden-text {
  color: #c0c4cc;
  letter-spacing: 2px;
}

.editable {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.editable:hover {
  background: #ecf5ff;
}

.new-word-row {
  display: flex;
  align-items: center;
}

.new-word-container {
  margin: 12px 0;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.new-word-row {
  display: flex;
  align-items: center;
  gap: 24px;
}

.new-word-label {
  width: 60px;
  color: #909399;
  font-size: 14px;
  font-weight: 500;
}

.new-word-fields {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
}

.field-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-label {
  color: #606266;
  font-size: 14px;
  white-space: nowrap;
}

.field-input {
  width: 180px;
}

.field-input.pos-input {
  width: 100px;
}

.field-input.chinese-input {
  width: 250px;
}

.field-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
  border-radius: 8px;
}

.table-wrapper::-webkit-scrollbar {
  height: 8px;
}

.table-wrapper::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.table-wrapper::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.table-wrapper::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.word-table {
  min-width: 1200px;
}

.word-table :deep(.el-table__header-wrapper) {
  background: #f8f9fb !important;
}

.word-table :deep(.el-table__header th) {
  background: #f8f9fb !important;
  color: #606266;
  font-weight: 600;
}

.word-table :deep(.el-table__body td) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.word-table :deep(.el-table__header th.el-table__cell) {
  background: #f8f9fb !important;
}

/* 操作栏固定列的样式优化 */
.word-table :deep(.el-table__fixed-right) {
  box-shadow: -4px 0 6px rgba(0, 0, 0, 0.08);
  z-index: 10;
}

.word-table :deep(.el-table__fixed-right .el-table__header th) {
  background: #f8f9fb !important;
}

.word-table :deep(.el-table__fixed-right-patch) {
  background-color: #f7f8fa !important;
  box-shadow: -4px 0 6px rgba(0, 0, 0, 0.08);
  z-index: 10;
}

.word-table :deep(.el-table__fixed-right .el-table__header-wrapper th) {
  background-color: #f7f8fa !important;
}

/* 确保表格内容不会被操作栏挡住 */
.word-table :deep(.el-table__body-wrapper) {
  overflow-x: auto;
}

/* 操作栏内边距优化 */
.word-table :deep(.el-table__fixed-right .cell) {
  padding-right: 0;
}

.action-buttons-row {
  display: flex;
  gap: 8px;
  justify-content: flex-start;
  align-items: center;
}

.action-buttons-row .el-button {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  white-space: nowrap;
}

.pagination-wrapper {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
}

.upload-content {
  padding: 20px 0;
}

.upload-area {
  width: 100%;
}

.upload-icon {
  color: #667eea;
  margin-bottom: 16px;
}

.upload-text {
  color: #606266;
  font-size: 14px;
}

.upload-text em {
  color: #667eea;
  font-style: normal;
}

.upload-tip {
  color: #909399;
  font-size: 12px;
  margin-top: 8px;
}

.file-info {
  display: flex;
  align-items: center;
  margin-top: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
  font-size: 14px;
  color: #606266;
}

.file-info .el-icon {
  margin-right: 8px;
  color: #667eea;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:deep(.upload-area .el-upload-dragger) {
  border-radius: 12px;
  border: 2px dashed #dcdfe6;
  transition: all 0.3s ease;
  padding: 40px 20px;
}

:deep(.upload-area .el-upload-dragger:hover) {
  border-color: #667eea;
  background: #f5f7fa;
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .header-top {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .header-left {
    width: 100%;
    display: flex;
    align-items: center;
  }
  
  .header-actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    justify-items: stretch;
  }
  
  .header-actions .el-button {
    width: 100%;
    padding: 8px 10px;
    font-size: 12px;
    border-radius: 6px;
    box-sizing: border-box;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
  }
  
  .header-actions .el-button .el-icon {
    margin-right: 4px;
  }
  
  .search-bar {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .search-bar-row1 {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  
  .search-bar-row1 .el-input {
    flex: 1;
    width: auto;
  }
  
  .search-bar-row1 .add-word-btn {
    margin-left: auto;
  }
  
  .search-bar-row2 {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  
  .search-bar .el-input {
    max-width: none;
  }
  
  .search-bar .el-button {
    padding: 5px 10px;
    font-size: 11px;
  }
  
  .search-bar :deep(.el-divider--vertical) {
    display: none;
  }
  
  .word-list-card :deep(.el-table) {
    font-size: 13px;
  }
  
  .word-list-card :deep(.el-button) {
    padding: 4px 8px;
    font-size: 11px;
  }
  
  .pagination-wrapper {
    justify-content: center;
    padding: 12px 8px;
  }
  
  .pagination-wrapper :deep(.el-pagination) {
    font-size: 12px;
  }
  
  .pagination-wrapper :deep(.el-pagination__page) {
    width: 28px;
    height: 28px;
    line-height: 28px;
    font-size: 12px;
  }
  
  .pagination-wrapper :deep(.el-pagination__prev),
  .pagination-wrapper :deep(.el-pagination__next) {
    width: 28px;
    height: 28px;
    line-height: 28px;
  }
  
  .action-buttons-row {
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .word-table :deep(.el-table__header th) {
    font-size: 12px;
    padding: 8px 4px;
  }
  
  .word-table :deep(.el-table__body td) {
    padding: 8px 4px;
    font-size: 12px;
  }
  
  .word-table :deep(.el-table__fixed-right) {
    display: none;
  }
  
  .word-table :deep(.el-table__column--selection) {
    width: 40px;
  }
}

@media (max-width: 480px) {
  .home {
    padding: 0 6px;
  }
  
  .word-list-card {
    margin-bottom: 10px;
    border-radius: 8px;
  }
  
  .word-list-card :deep(.el-button) {
    padding: 3px 6px;
    font-size: 10px;
  }
  
  .word-list-card :deep(.el-table-column) {
    min-width: 35px;
  }
  
  .search-bar {
    gap: 4px;
  }
  
  .search-bar .el-input {
    min-width: 100px;
    max-width: 160px;
  }
  
  .search-bar .el-button {
    padding: 4px 10px;
    font-size: 11px;
  }
  
  .header-actions {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  
  .header-actions .el-button {
    padding: 6px 8px;
    font-size: 11px;
  }
  
  .word-table :deep(.el-table__header th) {
    font-size: 11px;
    padding: 6px 2px;
  }
  
  .word-table :deep(.el-table__body td) {
    padding: 6px 2px;
    font-size: 11px;
  }
  
  .word-table :deep(.el-table__column--selection) {
    width: 30px !important;
  }
  
  .action-buttons-row {
    gap: 2px;
  }
  
  .action-buttons-row .el-button {
    padding: 2px 5px;
    font-size: 9px;
    min-width: 40px;
  }
  
  .new-word-row {
    flex-direction: column;
    gap: 10px;
  }
  
  .new-word-fields {
    flex-direction: column;
    width: 100%;
    gap: 10px;
  }
  
  .field-input {
    width: 100% !important;
  }
  
  .field-group {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  
  .field-label {
    font-size: 12px;
  }
  
  .pagination-wrapper {
    padding: 10px 4px;
  }
  
  .pagination-wrapper :deep(.el-pagination) {
    font-size: 10px;
  }
  
  .pagination-wrapper :deep(.el-pagination__page) {
    width: 24px;
    height: 24px;
    line-height: 24px;
    font-size: 10px;
  }
  
  .pagination-wrapper :deep(.el-pagination__prev),
  .pagination-wrapper :deep(.el-pagination__next) {
    width: 24px;
    height: 24px;
    line-height: 24px;
  }
  
  .pagination-wrapper :deep(.el-pagination__sizes) {
    display: none;
  }
  
  .pagination-wrapper :deep(.el-pagination__jump) {
    display: none;
  }
  
  .header-left .el-tag {
    font-size: 11px;
    padding: 2px 8px;
  }
  
  .header-icon {
    font-size: 18px;
  }
  
  .header-left span {
    font-size: 16px;
  }
}

/* 手动分类对话框样式 */
.manual-classification-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.current-word-section h4,
.relations-section h4,
.add-section h4 {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.current-word-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.word-name {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.word-meaning {
  color: #606266;
  font-size: 14px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: #909399;
  background: #f5f7fa;
  border-radius: 8px;
}

.relation-type-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.type-label {
  font-size: 14px;
  color: #606266;
}

.search-box {
  margin-bottom: 12px;
}

.word-list {
  max-height: 200px;
  overflow-y: auto;
}

.word-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.word-item:hover {
  background: #f5f7fa;
}

.word-label {
  font-weight: 500;
  color: #303133;
}

.word-pos {
  font-size: 12px;
  color: #909399;
}

.empty-text {
  text-align: center;
  color: #909399;
  padding: 20px;
}

.import-stats {
  padding: 8px 0;
}

.import-item {
  padding: 12px;
  border-bottom: 1px solid #ebeef5;
}

.import-item:last-child {
  border-bottom: none;
}

.import-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.import-time {
  font-size: 12px;
  color: #909399;
}

.import-item-stats {
  display: flex;
  gap: 8px;
}

.error-list {
  padding: 4px 0;
}

.error-item {
  padding: 12px;
  border-bottom: 1px solid #ebeef5;
  background: #fff5f5;
}

.error-item:last-child {
  border-bottom: none;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.error-english {
  font-weight: 500;
  color: #303133;
}

.error-time {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}

.error-reason {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}
</style>
