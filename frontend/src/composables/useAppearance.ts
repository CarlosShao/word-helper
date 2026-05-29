import { ref, onMounted, watch } from 'vue'

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

// 使用单例模式，确保全局只有一个设置实例
const globalSettings = ref<AppearanceSettings>({ ...defaultSettings })

export function useAppearance() {
  const settings = globalSettings

  const loadSettings = () => {
    const saved = localStorage.getItem('appearanceSettings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        settings.value = { ...defaultSettings, ...parsed }
        console.log('从 localStorage 加载设置:', settings.value)
      } catch (e) {
        console.error('加载设置失败:', e)
      }
    }
    applySettings()
  }

  const saveSettings = () => {
    console.log('保存设置:', settings.value)
    localStorage.setItem('appearanceSettings', JSON.stringify(settings.value))
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

  const resetSettings = () => {
    settings.value = { ...defaultSettings }
    saveSettings()
  }

  const uploadImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        resolve(result)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const setBackgroundImage = (imageUrl: string) => {
    console.log('setBackgroundImage:', imageUrl)
    settings.value.backgroundImageUrl = imageUrl
    saveSettings()
  }

  onMounted(() => {
    loadSettings()
  })

  watch(settings, () => {
    saveSettings()
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
