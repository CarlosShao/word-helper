<template>
  <div class="settings-container">
    <div class="settings-header">
      <h2>词性管理</h2>
      <el-button type="primary" size="small" @click="showAddModal = true">
        <el-icon><Plus /></el-icon>
        添加词性
      </el-button>
      <el-button type="info" size="small" @click="initFromWords">
          <el-icon><Refresh /></el-icon>
          从单词导入
        </el-button>
    </div>

    <el-table :data="partsOfSpeech" border style="width: 100%" :loading="loading">
      <el-table-column prop="code" label="代码" width="100" />
      <el-table-column prop="name" label="名称" width="120" />
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="created_at" label="创建时间" width="180" :formatter="formatTime" />
      <el-table-column prop="updated_at" label="更新时间" width="180" :formatter="formatTime" />
      <el-table-column label="操作" width="150">
        <template #default="scope">
          <el-button size="small" @click="editItem(scope.row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteItem(scope.row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showAddModal" :title="editingItem ? '编辑词性' : '添加词性'" width="450px">
      <el-form :model="formData" label-width="80px">
        <el-form-item label="代码" required>
          <el-input v-model="formData.code" placeholder="如: n." />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="formData.name" placeholder="如: 名词" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="formData.description" type="textarea" :rows="3" placeholder="词性描述（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddModal = false">取消</el-button>
        <el-button type="primary" @click="saveItem">{{ editingItem ? '保存修改' : '添加' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { posApi } from '../api'

interface PartOfSpeech {
  id: number
  code: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

const partsOfSpeech = ref<PartOfSpeech[]>([])
const loading = ref(false)
const showAddModal = ref(false)
const editingItem = ref<PartOfSpeech | null>(null)
const formData = ref({
  code: '',
  name: '',
  description: ''
})

const loadData = async () => {
  loading.value = true
  try {
    const result = await posApi.getAll()
    if (result.success) {
      partsOfSpeech.value = result.data
    }
  } catch (error) {
    console.error('加载词性数据失败:', error)
  }
  loading.value = false
}

const formatTime = (row: PartOfSpeech) => {
  return row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-'
}

const editItem = (item: PartOfSpeech) => {
  editingItem.value = item
  formData.value = {
    code: item.code,
    name: item.name,
    description: item.description || ''
  }
  showAddModal.value = true
}

const saveItem = async () => {
  if (!formData.value.code.trim() || !formData.value.name.trim()) {
    ElMessage.error('代码和名称不能为空')
    return
  }

  try {
    if (editingItem.value) {
      await posApi.update(editingItem.value.id, formData.value)
      ElMessage.success('更新成功')
    } else {
      await posApi.add(formData.value)
      ElMessage.success('添加成功')
    }
    showAddModal.value = false
    editingItem.value = null
    formData.value = { code: '', name: '', description: '' }
    await loadData()
  } catch (error: any) {
    ElMessage.error(error?.message || '操作失败')
  }
}

const deleteItem = async (item: PartOfSpeech) => {
  try {
    await posApi.delete(item.id)
    ElMessage.success('删除成功')
    await loadData()
  } catch (error: any) {
    ElMessage.error(error?.message || '删除失败')
  }
}

const initFromWords = async () => {
  try {
    const result = await posApi.initFromWords()
    ElMessage.success(`成功导入 ${result.addedCount} 个词性`)
    await loadData()
  } catch (error: any) {
    ElMessage.error(error?.message || '导入失败')
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.settings-container {
  padding: 20px;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.settings-header h2 {
  margin: 0;
  flex: 1;
}
</style>