import { ref, onMounted, watch } from 'vue'
import { wordApi } from '../api'

interface AppearanceSettings {
  backgroundColor: string
  useBackgroundImage: boolean
  backgroundImageUrl: string
  opacity: number
  headerColor: string
  useCustomHeaderColor: boolean
  enableGlassEffect: boolean
}

const defaultSettings: AppearanceSettings = {
  backgroundColor: '#f5f5f5',
  useBackgroundImage: false,
  backgroundImageUrl: '',
  opacity: 0.7,
  headerColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  useCustomHeaderColor: false,
  enableGlassEffect: false
}

const localStorageKey = 'appearanceSettings'

const globalSettings = ref<AppearanceSettings>({ ...defaultSettings })
let isInitialized = false

export function useAppearance() {
  const settings = globalSettings

  const loadSettings = async () => {
    const saved = localStorage.getItem(localStorageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        settings.value = { ...defaultSettings, ...parsed }
        console.log('从 localStorage 加载临时设置:', settings.value)
      } catch (e) {
        console.error('加载临时设置失败:', e)
      }
    }
    
    try {
      const response = await wordApi.getSetting('appearance')
      if (response && response.value) {
        const serverSettings = JSON.parse(response.value)
        settings.value = { ...defaultSettings, ...serverSettings }
        localStorage.setItem(localStorageKey, JSON.stringify(settings.value))
        console.log('从服务器加载设置:', settings.value)
      }
    } catch (error) {
      console.log('从服务器加载设置失败，使用本地设置:', error)
    }
    
    applySettings()
    isInitialized = true
  }

  const saveSettings = async () => {
    if (!isInitialized) return
    
    console.log('保存设置:', settings.value)
    
    localStorage.setItem(localStorageKey, JSON.stringify(settings.value))
    
    try {
      await wordApi.saveSetting('appearance', JSON.stringify(settings.value))
      console.log('设置已保存到服务器')
    } catch (error) {
      console.error('保存设置到服务器失败:', error)
    }
    
    applySettings()
  }

  const applySettings = () => {
    const { backgroundColor, useBackgroundImage, backgroundImageUrl, opacity, headerColor, useCustomHeaderColor, enableGlassEffect } = settings.value
    const body = document.body
    
    if (useBackgroundImage && backgroundImageUrl) {
      body.style.background = `url(${backgroundImageUrl}) center/cover no-repeat fixed`
    } else {
      body.style.background = backgroundColor
    }
    
    const header = document.querySelector('.app-container header.el-header') as HTMLElement
    if (header) {
      if (useCustomHeaderColor) {
        header.style.background = headerColor
      } else {
        header.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }
      
      if (enableGlassEffect) {
        header.style.backdropFilter = 'blur(20px)'
        header.style.background = `rgba(102, 126, 234, ${opacity})`
        header.style.border = '1px solid rgba(255, 255, 255, 0.2)'
      } else {
        header.style.backdropFilter = ''
        header.style.border = ''
      }
    }
    
    const mainContent = document.querySelector('.app-container .el-main') as HTMLElement
    if (mainContent) {
      if (enableGlassEffect) {
        mainContent.style.background = `rgba(255, 255, 255, ${opacity * 0.8})`
        mainContent.style.backdropFilter = 'blur(15px)'
        mainContent.style.border = '1px solid rgba(255, 255, 255, 0.3)'
      } else {
        mainContent.style.background = `rgba(255, 255, 255, ${opacity})`
        mainContent.style.backdropFilter = ''
        mainContent.style.border = ''
      }
    }
    
    const cards = document.querySelectorAll('.app-container .el-card') as NodeListOf<HTMLElement>
    cards.forEach(card => {
      if (enableGlassEffect) {
        card.style.background = `rgba(255, 255, 255, ${opacity * 0.9})`
        card.style.backdropFilter = 'blur(10px)'
        card.style.border = '1px solid rgba(255, 255, 255, 0.4)'
      } else {
        card.style.background = `rgba(255, 255, 255, ${opacity})`
        card.style.backdropFilter = ''
        card.style.border = ''
      }
    })
    
    const tables = document.querySelectorAll('.app-container .el-table') as NodeListOf<HTMLElement>
    tables.forEach(table => {
      if (enableGlassEffect) {
        table.style.background = `rgba(255, 255, 255, ${opacity * 0.95})`
        table.style.backdropFilter = 'blur(10px)'
      } else {
        table.style.background = ''
        table.style.backdropFilter = ''
      }
    })
    
    const menus = document.querySelectorAll('.app-container .el-menu') as NodeListOf<HTMLElement>
    menus.forEach(menu => {
      if (enableGlassEffect) {
        menu.style.background = 'transparent'
      }
    })
  }

  const resetSettings = async () => {
    settings.value = { ...defaultSettings }
    await saveSettings()
  }

  const uploadImage = async (file: File): Promise<string> => {
    try {
      const data = await wordApi.uploadImage(file)
      return data.url
    } catch (error) {
      console.error('上传图片失败:', error)
      throw error
    }
  }

  const setBackgroundImage = (imageUrl: string) => {
    console.log('setBackgroundImage:', imageUrl)
    settings.value.backgroundImageUrl = imageUrl
    saveSettings()
  }

  let saveTimeout: number | null = null
  
  const debouncedSave = () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    saveTimeout = window.setTimeout(() => {
      saveSettings()
    }, 500)
  }

  onMounted(() => {
    loadSettings()
  })

  watch(settings, () => {
    if (isInitialized) {
      debouncedSave()
    }
  }, { deep: true })

  return {
    settings,
    loadSettings,
    saveSettings,
    resetSettings,
    uploadImage,
    applySettings,
    setBackgroundImage
  }
}
