<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-wrapper">
          <el-icon class="logo-icon"><Key /></el-icon>
        </div>
        <h1 class="app-title">{{ t('auth.resetPasswordTitle') }}</h1>
        <p class="app-subtitle">{{ t('auth.resetPasswordSubtitle') }}</p>
      </div>
      
      <el-form 
        v-if="!showSuccess"
        ref="formRef"
        :model="form"
        :rules="rules"
        class="login-form"
        @submit.prevent="handleSubmit"
      >
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            :placeholder="t('auth.passwordPlaceholder')"
            size="large"
            :prefix-icon="Lock"
            show-password
            class="login-input"
            @input="checkPasswordStrength"
          />
          <div v-if="form.password" class="password-strength">
            <div class="strength-label">{{ t('auth.passwordStrength') }}:</div>
            <div class="strength-bar">
              <div 
                class="strength-fill" 
                :class="passwordStrengthClass"
                :style="{ width: passwordStrengthWidth }"
              ></div>
            </div>
            <div class="strength-text">{{ passwordStrengthText }}</div>
          </div>
        </el-form-item>
        
        <el-form-item prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            :placeholder="t('auth.confirmPasswordPlaceholder')"
            size="large"
            :prefix-icon="Lock"
            show-password
            class="login-input"
          />
        </el-form-item>
        
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-btn"
            :loading="loading"
            @click="handleSubmit"
          >
            <el-icon style="margin-right: 8px"><RefreshRight /></el-icon>
            {{ t('auth.resetPassword') }}
          </el-button>
        </el-form-item>
      </el-form>
      
      <div v-else class="success-message">
        <el-icon class="success-icon"><CircleCheck /></el-icon>
        <h3>{{ t('auth.resetSuccessTitle') }}</h3>
        <p>{{ t('auth.resetSuccessMessage') }}</p>
        <el-button
          type="primary"
          class="success-btn"
          @click="goToLogin"
        >
          {{ t('auth.backToLogin') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Key, Lock, RefreshRight, CircleCheck } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const formRef = ref<FormInstance>()
const loading = ref(false)
const showSuccess = ref(false)

const form = reactive({
  password: '',
  confirmPassword: ''
})

const passwordStrengthClass = ref('weak')
const passwordStrengthWidth = ref('0%')
const passwordStrengthText = ref('')

const rules = reactive<FormRules>({
  password: [
    { required: true, message: t('auth.passwordRequired'), trigger: 'blur' },
    { min: 6, max: 20, message: t('auth.passwordMinLength'), trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: t('auth.confirmPasswordRequired'), trigger: 'blur' },
    { 
      validator: (rule: any, value: string, callback: any) => {
        if (value !== form.password) {
          callback(new Error(t('auth.passwordMismatch')))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
})

onMounted(() => {
  const token = route.query.token
  if (!token) {
    ElMessage.error(t('auth.invalidLink'))
    setTimeout(() => {
      router.push('/login')
    }, 2000)
  }
})

const checkPasswordStrength = (event: any) => {
  const password = event.target?.value || form.password
  if (!password) {
    passwordStrengthClass.value = 'weak'
    passwordStrengthWidth.value = '0%'
    passwordStrengthText.value = ''
    return
  }
  
  let score = 0
  
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++
  
  if (score <= 2) {
    passwordStrengthClass.value = 'weak'
    passwordStrengthWidth.value = '33%'
    passwordStrengthText.value = t('auth.passwordWeak')
  } else if (score <= 4) {
    passwordStrengthClass.value = 'medium'
    passwordStrengthWidth.value = '66%'
    passwordStrengthText.value = t('auth.passwordMedium')
  } else {
    passwordStrengthClass.value = 'strong'
    passwordStrengthWidth.value = '100%'
    passwordStrengthText.value = t('auth.passwordStrong')
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const token = route.query.token
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password: form.password })
        })
        const data = await response.json()
        
        if (data.success) {
          showSuccess.value = true
          ElMessage.success(data.message)
        } else {
          ElMessage.error(data.message)
        }
      } catch (error) {
        ElMessage.error(t('auth.networkError'))
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

.password-strength {
  margin-top: 8px;
}

.strength-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.strength-bar {
  height: 6px;
  background: #e4e7ed;
  border-radius: 3px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 3px;
  transition: all 0.3s ease;
}

.strength-fill.weak { background: #f56c6c; }
.strength-fill.medium { background: #e6a23c; }
.strength-fill.strong { background: #67c23a; }

.strength-text {
  font-size: 12px;
  margin-top: 4px;
}

.strength-fill.weak + .strength-text { color: #f56c6c; }
.strength-fill.medium + .strength-text { color: #e6a23c; }
.strength-fill.strong + .strength-text { color: #67c23a; }

.login-btn {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  margin-top: 12px;
}

.success-message {
  text-align: center;
  padding: 32px;
}

.success-icon {
  font-size: 64px;
  color: #67c23a;
  margin-bottom: 16px;
}

.success-message h3 {
  color: #303133;
  font-size: 20px;
  margin: 0 0 8px;
}

.success-message p {
  color: #909399;
  font-size: 14px;
  margin: 0 0 24px;
}

.success-btn {
  border-radius: 10px;
  padding: 12px 32px;
  font-weight: 600;
}
</style>