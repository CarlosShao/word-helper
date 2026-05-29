import { createRouter, createWebHistory } from 'vue-router'
import Login from './views/Login.vue'
import ForgotPassword from './views/ForgotPassword.vue'
import ResetPassword from './views/ResetPassword.vue'
import Home from './views/Home.vue'
import Practice from './views/Practice.vue'
import ErrorWords from './views/ErrorWords.vue'
import YesterdayErrors from './views/YesterdayErrors.vue'
import Settings from './views/Settings.vue'
import { useAuth } from './composables/useAuth'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const routes = [
  { path: '/login', component: Login },
  { path: '/forgot-password', component: ForgotPassword },
  { path: '/reset-password', component: ResetPassword },
  { path: '/', component: Home, meta: { requiresAuth: true } },
  { path: '/practice', component: Practice, meta: { requiresAuth: true } },
  { path: '/error-words', component: ErrorWords, meta: { requiresAuth: true } },
  { path: '/yesterday-errors', component: YesterdayErrors, meta: { requiresAuth: true } },
  { path: '/settings', component: Settings, meta: { requiresAuth: true } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  console.log('[DEBUG-ROUTER] ====== ROUTER GUARD ======');
  console.log('[DEBUG-ROUTER] Navigating from:', from.path, 'to:', to.path);
  console.log('[DEBUG-ROUTER] Query params:', JSON.stringify(to.query));
  
  const { t } = useI18n()
  const { login, logout, validateToken, isLoggedIn } = useAuth()
  
  const githubToken = to.query.github_token as string
  const username = to.query.username as string

  if (githubToken) {
    console.log('[DEBUG-ROUTER] GitHub token detected in URL!');
    console.log('[DEBUG-ROUTER] Token:', githubToken.substring(0, 30) + '...');
    console.log('[DEBUG-ROUTER] Username:', username);
    
    login(githubToken, username || '')
    
    const maxRetries = 5
    let retryCount = 0
    let tokenSaved = false
    
    while (retryCount < maxRetries && !tokenSaved) {
      await new Promise(resolve => setTimeout(resolve, 200))
      const currentToken = localStorage.getItem('token')
      if (currentToken) {
        tokenSaved = true
        console.log('[DEBUG-ROUTER] Login successful on attempt', retryCount + 1);
        next({ path: '/', query: {} })
      }
      retryCount++
    }
    
    if (!tokenSaved) {
      console.log('[DEBUG-ROUTER] Login failed after', maxRetries, 'attempts, redirecting to /login');
      next('/login')
    }
    return
  }

  const token = localStorage.getItem('token')
  console.log('[DEBUG-ROUTER] Token from localStorage:', token ? 'present (' + token.substring(0, 20) + '...)' : 'none');
  
  if (to.meta.requiresAuth) {
    if (!token) {
      console.log('[DEBUG-ROUTER] No token, requires auth - redirecting to /login');
      next('/login')
    } else {
      console.log('[DEBUG-ROUTER] Token exists, validating...');
      const isValid = await validateToken()
      if (!isValid) {
        console.log('[DEBUG-ROUTER] Token invalid or expired - redirecting to /login');
        ElMessage.warning(t('auth.loginExpired'))
        next('/login')
      } else {
        console.log('[DEBUG-ROUTER] Token valid, allowing navigation');
        next()
      }
    }
  } else if (to.path === '/login' && token) {
    console.log('[DEBUG-ROUTER] Already logged in, redirecting to /');
    next('/')
  } else {
    console.log('[DEBUG-ROUTER] Allowing navigation');
    next()
  }
})

export default router
