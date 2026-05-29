<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-wrapper">
          <el-icon class="logo-icon"><Reading /></el-icon>
        </div>
        <h1 class="app-title">{{ isLoginMode ? t('auth.loginTitle') : t('auth.registerTitle') }}</h1>
        <p class="app-subtitle">{{ isLoginMode ? t('auth.loginSubtitle') : t('auth.registerSubtitle') }}</p>
      </div>
      
      <el-form 
        v-if="isLoginMode"
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
      
      <el-form 
        v-else
        ref="registerFormRef"
        :model="registerForm"
        :rules="registerRules"
        class="login-form"
        @submit.prevent="handleRegister"
      >
        <el-form-item prop="username">
          <el-input
            v-model="registerForm.username"
            :placeholder="t('auth.usernamePlaceholder')"
            size="large"
            :prefix-icon="User"
            class="login-input"
          />
        </el-form-item>
        
        <el-form-item prop="email">
          <el-input
            v-model="registerForm.email"
            type="email"
            :placeholder="t('auth.emailPlaceholder')"
            size="large"
            :prefix-icon="Message"
            class="login-input"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            :placeholder="t('auth.passwordPlaceholder')"
            size="large"
            :prefix-icon="Lock"
            show-password
            class="login-input"
            @keyup.enter="handleRegister"
          />
        </el-form-item>
        
        <el-form-item prop="confirmPassword">
          <el-input
            v-model="registerForm.confirmPassword"
            type="password"
            :placeholder="t('auth.confirmPasswordPlaceholder')"
            size="large"
            :prefix-icon="Lock"
            show-password
            class="login-input"
            @keyup.enter="handleRegister"
          />
        </el-form-item>
        
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-btn"
            :loading="registering"
            @click="handleRegister"
          >
            <el-icon style="margin-right: 8px"><Plus /></el-icon>
            {{ t('auth.register') }}
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="divider">
        <span>{{ t('auth.or') }}</span>
      </div>
      
      <el-form-item v-if="isLoginMode">
        <el-button
          type="default"
          size="large"
          class="github-login-btn"
          :loading="githubLogging"
          @click="handleGitHubLogin"
        >
          <svg class="github-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          {{ t('auth.githubLogin') }}
        </el-button>
      </el-form-item>
      
      <div class="mode-switch">
        <span v-if="isLoginMode">{{ t('auth.noAccount') }}</span>
        <span v-else>{{ t('auth.haveAccount') }}</span>
        <button type="button" class="mode-switch-btn" @click="toggleMode">
          {{ isLoginMode ? t('auth.register') : t('auth.login') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Reading, User, Lock, Unlock, Message, Plus } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuth } from '../composables/useAuth'

const { t } = useI18n()
const router = useRouter()
const loginFormRef = ref<FormInstance>()
const registerFormRef = ref<FormInstance>()
const logging = ref(false)
const registering = ref(false)
const githubLogging = ref(false)
const isLoginMode = ref(true)
const { login, updateAuthState } = useAuth()

const loginForm = reactive({
  username: '',
  password: ''
})

const registerForm = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: ''
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

const registerRules = reactive<FormRules>({
  username: [
    { required: true, message: t('auth.usernameRequired'), trigger: 'blur' },
    { min: 2, max: 20, message: t('auth.usernameLength'), trigger: 'blur' }
  ],
  email: [
    { required: true, message: t('auth.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('auth.emailInvalid'), trigger: 'blur' }
  ],
  password: [
    { required: true, message: t('auth.passwordRequired'), trigger: 'blur' },
    { min: 6, max: 20, message: t('auth.passwordMinLength'), trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: t('auth.confirmPasswordRequired'), trigger: 'blur' },
    { 
      validator: (rule: any, value: string, callback: any) => {
        if (value !== registerForm.password) {
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
  updateAuthState()
})

const toggleMode = () => {
  isLoginMode.value = !isLoginMode.value
}

const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      logging.value = true
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginForm.username, password: loginForm.password })
        })
        const data = await response.json()
        
        if (data.success) {
          login(data.token, data.username)
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

const handleRegister = async () => {
  if (!registerFormRef.value) return
  
  await registerFormRef.value.validate(async (valid) => {
    if (valid) {
      registering.value = true
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            username: registerForm.username,
            email: registerForm.email,
            password: registerForm.password
          })
        })
        const data = await response.json()
        
        if (data.success) {
          ElMessage.success(data.message || t('auth.registerSuccess'))
          isLoginMode.value = true
          registerForm.username = ''
          registerForm.email = ''
          registerForm.password = ''
          registerForm.confirmPassword = ''
        } else {
          ElMessage.error(data.message || t('auth.registerFailed'))
        }
      } catch (error) {
        ElMessage.error(t('auth.networkError'))
      } finally {
        registering.value = false
      }
    }
  })
}

const handleGitHubLogin = async () => {
  githubLogging.value = true
  try {
    window.location.href = '/api/auth/github'
  } catch (error) {
    githubLogging.value = false
    ElMessage.error(t('auth.networkError'))
  }
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

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 24px 0;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #e4e7ed;
}

.divider span {
  padding: 0 16px;
  color: #909399;
  font-size: 14px;
}

.github-login-btn {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  border: 1px solid #d9d9d9;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s ease;
}

.github-login-btn:hover {
  border-color: #667eea;
  background: #f5f7fa;
}

.github-icon {
  width: 20px;
  height: 20px;
}

.mode-switch {
  text-align: center;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
  margin-top: 16px;
}

.mode-switch span {
  font-size: 14px;
  color: #606266;
}

.mode-switch-btn {
  background: none;
  border: none;
  color: #667eea;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-left: 4px;
  padding: 0;
}

.mode-switch-btn:hover {
  text-decoration: underline;
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