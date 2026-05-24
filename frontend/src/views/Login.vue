<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-wrapper">
          <el-icon class="logo-icon"><Reading /></el-icon>
        </div>
        <h1 class="app-title">{{ t('auth.loginTitle') }}</h1>
        <p class="app-subtitle">{{ t('auth.loginSubtitle') }}</p>
      </div>
      
      <el-form 
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            :placeholder="t('auth.usernamePlaceholder')"
            size="large"
            :prefix-icon="User"
            class="login-input"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            :placeholder="t('auth.passwordPlaceholder')"
            size="large"
            :prefix-icon="Lock"
            show-password
            class="login-input"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-btn"
            :loading="logging"
            @click="handleLogin"
          >
            <el-icon style="margin-right: 8px"><Unlock /></el-icon>
            {{ t('auth.login') }}
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="login-tips">
        <p>{{ t('auth.adminHint') }}<span class="highlight">carlos</span></p>
        <p>{{ t('auth.adminPasswordHint') }}<span class="highlight">swq</span></p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Reading, User, Lock, Unlock } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuth } from '../composables/useAuth'

const { t } = useI18n()
const router = useRouter()
const loginFormRef = ref<FormInstance>()
const logging = ref(false)
const { login } = useAuth()

const loginForm = reactive({
  username: '',
  password: ''
})

const loginRules = reactive<FormRules>({
  username: [
    { required: true, message: t('auth.usernameRequired'), trigger: 'blur' },
    { min: 2, max: 20, message: t('auth.usernameLength'), trigger: 'blur' }
  ],
  password: [
    { required: true, message: t('auth.passwordRequired'), trigger: 'blur' },
    { min: 1, max: 20, message: t('auth.passwordLength'), trigger: 'blur' }
  ]
})

const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      logging.value = true
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginForm)
        })
        const data = await response.json()
        
        if (data.success) {
          login(data.token, loginForm.username)
          ElMessage.success(t('auth.loginSuccess'))
          router.push('/')
        } else {
          ElMessage.error(data.message || t('auth.loginFailed'))
        }
      } catch (error) {
        ElMessage.error(t('auth.networkError'))
      } finally {
        logging.value = false
      }
    }
  })
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
  animation: slideUp 0.5s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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
  transition: all 0.3s ease;
}

.login-input :deep(.el-input__wrapper:hover) {
  background: #f0f2f5;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.login-input :deep(.el-input__wrapper.is-focus) {
  background: #fff;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
}

.login-btn {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  margin-top: 12px;
}

.login-tips {
  text-align: center;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 10px;
}

.login-tips p {
  margin: 8px 0;
  font-size: 13px;
  color: #606266;
}

.highlight {
  color: #667eea;
  font-weight: 600;
}

@media (max-width: 480px) {
  .login-card {
    padding: 32px 24px;
  }
  
  .logo-wrapper {
    width: 64px;
    height: 64px;
  }
  
  .logo-icon {
    font-size: 32px;
  }
  
  .app-title {
    font-size: 24px;
  }
}
</style>
