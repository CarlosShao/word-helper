<template>
  <div class="settings-container">
    <div class="settings-layout">
      <aside class="settings-sidebar">
        <h2 class="sidebar-title">{{ t('settings.title') }}</h2>
        <nav class="settings-nav">
          <el-menu 
            :default-active="activeMenu" 
            class="settings-menu"
            @select="handleMenuSelect"
          >
            <el-menu-item index="general">
              <el-icon><Setting /></el-icon>
              <span>{{ t('settings.general') }}</span>
            </el-menu-item>
            <el-menu-item index="appearance">
              <el-icon><Picture /></el-icon>
              <span>{{ t('settings.appearance') }}</span>
            </el-menu-item>
            <el-menu-item index="pos">
              <el-icon><Document /></el-icon>
              <span>{{ t('settings.posConfig') }}</span>
            </el-menu-item>
          </el-menu>
        </nav>
      </aside>

      <main class="settings-content">
        <div v-if="activeMenu === 'general'" class="settings-section">
          <h3 class="section-title">{{ t('settings.general') }}</h3>
          
          <div class="settings-item">
            <div class="item-left">
              <label class="item-label">{{ t('settings.language') }}</label>
            </div>
            <div class="item-right">
              <el-select v-model="currentLanguage" @change="changeLanguage" style="width: 150px;">
                <el-option :label="t('settings.chinese')" value="zh" />
                <el-option :label="t('settings.english')" value="en" />
              </el-select>
            </div>
          </div>
        </div>

        <div v-if="activeMenu === 'appearance'" class="settings-section">
          <h3 class="section-title">{{ t('settings.appearance') }}</h3>

          <div class="settings-item">
            <div class="item-left">
              <label class="item-label">{{ t('settings.backgroundColor') }}</label>
            </div>
            <div class="item-right">
              <el-color-picker v-model="appearanceSettings.backgroundColor" show-alpha />
            </div>
          </div>

          <div class="settings-item">
            <div class="item-left">
              <label class="item-label">{{ t('settings.opacity') }}</label>
              <p class="item-desc">{{ appearanceSettings.opacity * 100 }}%</p>
            </div>
            <div class="item-right">
              <el-slider 
                v-model="appearanceSettings.opacity" 
                :min="0.1" 
                :max="1" 
                :step="0.05"
                style="width: 200px;"
              />
            </div>
          </div>

          <div class="settings-divider"></div>

          <div class="settings-item">
            <div class="item-left">
              <label class="item-label">{{ t('settings.useImage') }}</label>
            </div>
            <div class="item-right">
              <el-switch v-model="appearanceSettings.useBackgroundImage" />
            </div>
          </div>

          <div v-if="appearanceSettings.useBackgroundImage" class="settings-item">
            <div class="item-left">
              <label class="item-label">{{ t('settings.backgroundImage') }}</label>
              <p class="item-desc">{{ t('settings.uploadImageHint') }}</p>
            </div>
            <div class="item-right">
              <div class="image-input-wrapper">
                <el-upload
                  class="image-uploader"
                  :show-file-list="false"
                  :on-change="handleImageUpload"
                  :before-upload="beforeUpload"
                  accept="image/*"
                >
                  <div v-if="!appearanceSettings.backgroundImageUrl" class="upload-placeholder">
                    <el-icon><Plus /></el-icon>
                    <span>{{ t('settings.uploadImage') }}</span>
                  </div>
                </el-upload>
                <div class="or-divider">{{ t('settings.or') }}</div>
                <el-input 
                  v-model="appearanceSettings.backgroundImageUrl" 
                  :placeholder="t('settings.imageUrlPlaceholder')"
                  style="flex: 1;"
                />
              </div>
            </div>
          </div>

          <div v-if="appearanceSettings.useBackgroundImage && appearanceSettings.backgroundImageUrl" class="settings-item">
            <div class="item-left">
              <label class="item-label">{{ t('settings.preview') }}</label>
            </div>
            <div class="item-right">
              <div class="image-preview">
                <img :src="appearanceSettings.backgroundImageUrl" alt="Preview" />
              </div>
            </div>
          </div>

          <div class="settings-divider"></div>

          <div class="settings-item">
            <div class="item-left">
              <label class="item-label">{{ t('settings.useCustomHeaderColor') }}</label>
            </div>
            <div class="item-right">
              <el-switch v-model="appearanceSettings.useCustomHeaderColor" />
            </div>
          </div>

          <div v-if="appearanceSettings.useCustomHeaderColor" class="settings-item">
            <div class="item-left">
              <label class="item-label">{{ t('settings.headerColor') }}</label>
            </div>
            <div class="item-right">
              <el-color-picker v-model="appearanceSettings.headerColor" show-alpha />
            </div>
          </div>

          <div class="settings-divider"></div>

          <div class="settings-item">
            <div class="item-left">
              <label class="item-label">{{ t('settings.enableGlassEffect') }}</label>
              <span class="item-hint">{{ t('settings.glassEffectHint') }}</span>
            </div>
            <div class="item-right">
              <el-switch v-model="appearanceSettings.enableGlassEffect" />
            </div>
          </div>

          <div class="settings-item">
            <div class="item-left"></div>
            <div class="item-right">
              <el-button type="danger" @click="resetAppearanceConfirm">
                <el-icon><RefreshRight /></el-icon>
                {{ t('settings.reset') }}
              </el-button>
            </div>
          </div>
        </div>

        <div v-if="activeMenu === 'pos'" class="settings-section">
          <div class="pos-header">
            <h3 class="section-title">{{ t('settings.posConfig') }}</h3>
            <div class="pos-actions">
              <el-button type="primary" size="small" @click="showAddModal = true">
                <el-icon><Plus /></el-icon>
                {{ t('settings.addPos') }}
              </el-button>
              <el-button type="info" size="small" @click="initFromWords">
                <el-icon><RefreshRight /></el-icon>
                {{ t('settings.importFromWords') }}
              </el-button>
            </div>
          </div>

          <div class="pos-table-wrapper">
            <el-table :data="partsOfSpeech" border :loading="loading" class="pos-table">
              <el-table-column prop="code" :label="t('settings.code')" width="100" />
              <el-table-column prop="name" :label="t('settings.name')" width="140" />
              <el-table-column prop="description" :label="t('settings.description')" flex="1" />
              <el-table-column prop="created_at" :label="t('settings.createdAt')" width="180" :formatter="formatCreatedTime" />
              <el-table-column prop="updated_at" :label="t('settings.updatedAt')" width="180" :formatter="formatUpdatedTime" />
              <el-table-column :label="t('settings.editPos')" width="140" align="center">
                <template #default="scope">
                  <el-button size="small" @click="editItem(scope.row)">{{ t('common.edit') }}</el-button>
                  <el-button size="small" type="danger" @click="deleteItem(scope.row)">{{ t('common.delete') }}</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </main>
    </div>

    <el-dialog v-model="showAddModal" :title="editingItem ? t('settings.editPos') : t('settings.addPos')" width="450px">
      <el-form :model="formData" label-width="80px">
        <el-form-item :label="t('settings.code')" required>
          <el-input v-model="formData.code" :placeholder="t('settings.placeholderCode')" />
        </el-form-item>
        <el-form-item :label="t('settings.name')" required>
          <el-input v-model="formData.name" :placeholder="t('settings.placeholderName')" />
        </el-form-item>
        <el-form-item :label="t('settings.description')">
          <el-input v-model="formData.description" type="textarea" :rows="3" :placeholder="t('settings.placeholderDesc')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddModal = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveItem">{{ editingItem ? t('settings.saveEdit') : t('common.add') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, RefreshRight, Setting, Picture, Document } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { posApi } from '../api'
import { useAppearance } from '../composables/useAppearance'

const { t, locale } = useI18n()
const { settings: appearanceSettings, resetSettings, uploadImage, saveSettings, loadSettings, applySettings, setBackgroundImage } = useAppearance()

interface PartOfSpeech {
  id: number
  code: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

const activeMenu = ref('general')
const partsOfSpeech = ref<PartOfSpeech[]>([])
const loading = ref(false)
const showAddModal = ref(false)
const editingItem = ref<PartOfSpeech | null>(null)
const formData = ref({
  code: '',
  name: '',
  description: ''
})

const currentLanguage = computed({
  get: () => locale.value,
  set: (val: string) => {
    locale.value = val
  }
})

const changeLanguage = (lang: string) => {
  localStorage.setItem('language', lang)
  ElMessage.success(t('settings.saveSuccess'))
}

const handleMenuSelect = (key: string) => {
  activeMenu.value = key
}

const loadData = async () => {
  loading.value = true
  try {
    const result = await posApi.getAll()
    if (result.success) {
      partsOfSpeech.value = result.data
    }
  } catch (error) {
    console.error('Load POS data failed:', error)
  }
  loading.value = false
}

const formatCreatedTime = (row: PartOfSpeech) => {
  return row.created_at ? new Date(row.created_at).toLocaleString() : '-'
}

const formatUpdatedTime = (row: PartOfSpeech) => {
  return row.updated_at ? new Date(row.updated_at).toLocaleString() : '-'
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
    ElMessage.error(t('settings.codeNameRequired'))
    return
  }

  try {
    if (editingItem.value) {
      await posApi.update(editingItem.value.id, formData.value)
      ElMessage.success(t('settings.editSuccess'))
    } else {
      await posApi.add(formData.value)
      ElMessage.success(t('settings.addSuccess'))
    }
    showAddModal.value = false
    editingItem.value = null
    formData.value = { code: '', name: '', description: '' }
    await loadData()
  } catch (error: any) {
    ElMessage.error(error?.message || t('settings.operationFailed'))
  }
}

const deleteItem = async (item: PartOfSpeech) => {
  try {
    await posApi.delete(item.id)
    ElMessage.success(t('settings.deleteSuccess'))
    await loadData()
  } catch (error: any) {
    ElMessage.error(error?.message || t('settings.operationFailed'))
  }
}

const initFromWords = async () => {
  try {
    const result = await posApi.initFromWords()
    ElMessage.success(t('settings.importSuccess', { count: result.addedCount }))
    await loadData()
  } catch (error: any) {
    ElMessage.error(error?.message || t('settings.importFailed'))
  }
}

const resetAppearanceConfirm = async () => {
  try {
    await ElMessageBox.confirm(
      t('settings.resetConfirm'),
      t('common.warning'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )
    resetSettings()
    ElMessage.success(t('settings.saveSuccess'))
  } catch {
  }
}

const handleImageUpload = async (file: any) => {
  try {
    console.log('开始上传图片', file)
    const imageData = await uploadImage(file.raw)
    console.log('图片转换完成', imageData)
    setBackgroundImage(imageData)
    ElMessage.success(t('settings.saveSuccess'))
  } catch (error) {
    console.error('上传失败:', error)
    ElMessage.error(t('settings.operationFailed'))
  }
}

const beforeUpload = () => {
  return false
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.settings-container {
  padding: 0;
  height: calc(100vh - 60px);
}

.settings-layout {
  display: flex;
  height: 100%;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 0;
}

.settings-sidebar {
  width: 280px;
  background: #f8f9fa;
  border-right: 1px solid #e4e7ed;
  padding: 24px 0;
}

.sidebar-title {
  margin: 0 0 16px 24px;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.settings-nav {
  padding: 0 8px;
}

.settings-menu {
  border: none;
  background: transparent;
}

.settings-menu .el-menu-item {
  height: 48px;
  line-height: 48px;
  margin-bottom: 4px;
  border-radius: 8px;
}

.settings-menu .el-menu-item:hover {
  background: #ecf5ff;
}

.settings-menu .el-menu-item.is-active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.settings-content {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}

.settings-section {
  max-width: 800px;
}

.section-title {
  margin: 0 0 24px 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.settings-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  border-bottom: 1px solid #f0f0f0;
}

.item-left {
  flex: 1;
}

.item-label {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.item-desc {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.item-right {
  display: flex;
  align-items: center;
}

.settings-divider {
  height: 16px;
}

.image-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 350px;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 120px;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  color: #909399;
}

.upload-placeholder:hover {
  border-color: #409eff;
  color: #409eff;
}

.upload-placeholder .el-icon {
  font-size: 28px;
}

.or-divider {
  text-align: center;
  color: #909399;
  font-size: 13px;
}

.image-preview {
  width: 300px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.image-preview img {
  width: 100%;
  height: auto;
  display: block;
}

.pos-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.pos-actions {
  display: flex;
  gap: 12px;
}

.pos-table-wrapper {
  width: 100%;
  overflow-x: auto;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.pos-table {
  width: 100%;
  min-width: 900px;
}

.pos-table :deep(.el-table__header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.pos-table :deep(.el-table__header th) {
  color: #fff;
  font-weight: 600;
  border-bottom: none;
}

.pos-table :deep(.el-table__header th:first-child) {
  border-radius: 12px 0 0 0;
}

.pos-table :deep(.el-table__header th:last-child) {
  border-radius: 0 12px 0 0;
}

.pos-table :deep(.el-table__body tr:hover) {
  background-color: #f8f9fa;
}

.pos-table :deep(.el-table__body tr:last-child td:first-child) {
  border-radius: 0 0 0 12px;
}

.pos-table :deep(.el-table__body tr:last-child td:last-child) {
  border-radius: 0 0 12px 0;
}

@media (max-width: 768px) {
  .pos-table {
    min-width: 600px;
  }
  
  .pos-table :deep(.el-table__header th),
  .pos-table :deep(.el-table__body td) {
    font-size: 13px;
    padding: 10px 8px;
  }
}
</style>
