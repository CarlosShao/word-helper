<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-wrapper">
          <el-icon class="logo-icon"><Reading /></el-icon>
        </div>
        <h1 class="app-title">{{ t('auth.forgotPasswordTitle') }}</h1>
        <p class="app-subtitle">{{ t('auth.forgotPasswordSubtitle') }}</p>
      </div>
      
      <el-form 
        ref="formRef"
        :model="form"
        :rules="rules"
        class="login-form"
        @submit.prevent="handleSubmit"
      >
        <el-form-item prop="email">
          <el-input
            v-model="form.email"
            type="email"
            :placeholder="t('auth.emailPlaceholder')"
            size="large"
            :prefix-icon="Message"
            class="login-input"
          />
        </el-form-item>
        
        <el-form-item prop="captcha">
          <div class="captcha-container">
            <el-input
              v-model="form.captcha"
              :placeholder="t('auth.captchaPlaceholder')"
              size="large"
              class="captcha-input"
              @keyup.enter="handleSubmit"
            />
            <img 
              :src="captchaUrl" 
              :alt="t('auth.captcha')"
              class="captcha-image"
              @click="refreshCaptcha"
            />
          </div>
        </el-form-item>
        
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-btn"
            :loading="loading"
            @click="handleSubmit"
          >
            <el-icon style="margin-right: 8px"><Send /></el-icon>
            {{ t('auth.sendResetLink') }}
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="mode-switch">
        <button type="button" class="mode-switch-btn" @click="goToLogin">
          <el-icon style="margin-right: 4px"><ArrowLeft /></el-icon>
          {{ t('auth.backToLogin') }}
        </button>
      </div>
      
      <div v-if="showSuccess" class="success-message">
        <el-icon class="success-icon"><CheckCircle /></el-icon>
        <p>{{ t('auth.resetLinkSent') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Reading, Message, Send, ArrowLeft, CheckCircle } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)
const showSuccess = ref(false)
const captchaUrl = ref('/api/captcha?' + Date.now())
const captchaUuid = ref('')

const form = reactive({
  email: '',
  captcha: ''
})

const rules = reactive<FormRules>({
  email: [
    { required: true, message: t('auth.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('auth.emailInvalid'), trigger: 'blur' }
  ],
  captcha: [
    { required: true, message: t('auth.captchaRequired'), trigger: 'blur' },
    { min: 4, max: 4, message: t('auth.captchaLength'), trigger: 'blur' }
  ]
})

onMounted(() => {
  refreshCaptcha()
})

const refreshCaptcha = () => {
  fetch('/api/captcha?' + Date.now())
    .then(response => {
      const uuid = response.headers.get('captcha-uuid')
      if (uuid) {
        captchaUuid.value = uuid
      }
      return response.blob()
    })
    .then(blob => {
      captchaUrl.value = URL.createObjectURL(blob)
      form.captcha = ''
    })
    .catch(() => {
      captchaUrl.value = '/api/captcha?' + Date.now()
    })
}

const handleSubmit = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const captchaResponse = await fetch('/api/captcha/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid: captchaUuid.value, code: form.captcha })
        })
        const captchaResult = await captchaResponse.json()
        
        if (!captchaResult.success) {
          ElMessage.error(captchaResult.message)
          refreshCaptcha()
          loading.value = false
          return
        }
        
        const response = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email })
        })
        const data = await response.json()
        
        if (data.success) {
          showSuccess.value = true
          ElMessage.success(data.message)
        } else {
          ElMessage.error(data.message)
          refreshCaptcha()
        }
      } catch (error) {
        ElMessage.error(t('auth.networkError'))
        refreshCaptcha()
      } finally {
        loading.value = false
      }
    }
  })
}

const goToLogin = () => {
  router.push('/login')
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 20px;
  padding: 48px 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.logo-wrapper {
  width: 80px;
  height: 80px;
  margin: 0 auto 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
}

.logo-icon {
  font-size: 40px;
  color: #fff;
}

.app-title {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 8px;
}

.app-subtitle {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.login-form {
  margin-bottom: 32px;
}

.login-input {
  margin-bottom: 8px;
}

.login-input :deep(.el-input__wrapper) {
  border-radius: 10px;
  padding: 6px 16px;
  background: #f5f7fa;
}

.captcha-container {
  display: flex;
  gap: 12px;
}

.captcha-input {
  flex: 1;
}

.captcha-input :deep(.el-input__wrapper) {
  border-radius: 10px;
  padding: 6px 16px;
  background: #f5f7fa;
}

.captcha-image {
  width: 100px;
  height: 40px;
  border-radius: 10px;
  cursor: pointer;
  background: #f5f7fa;
}

.login-btn {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  margin-top: 12px;
}

.mode-switch {
  text-align: center;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
  margin-top: 16px;
}

.mode-switch-btn {
  background: none;
  border: none;
  color: #667eea;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
}

.mode-switch-btn:hover {
  text-decoration: underline;
}

.success-message {
  text-align: center;
  padding: 24px;
  background: #f6ffed;
  border-radius: 12px;
  margin-top: 16px;
}

.success-icon {
  font-size: 48px;
  color: #67c23a;
  margin-bottom: 12px;
}

.success-message p {
  color: #67c23a;
  font-size: 16px;
  margin: 0;
}
</style>