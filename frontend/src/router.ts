import { createRouter, createWebHistory } from 'vue-router'
import Login from './views/Login.vue'
import Home from './views/Home.vue'
import Practice from './views/Practice.vue'
import ErrorWords from './views/ErrorWords.vue'
import YesterdayErrors from './views/YesterdayErrors.vue'
import Settings from './views/Settings.vue'
import { useAuth } from './composables/useAuth'

const routes = [
  { path: '/login', component: Login },
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
  console.log('[DEBUG-ROUTIN] Query params:', JSON.stringify(to.query));
  
  const { login } = useAuth()
  
  const githubToken = to.query.github_token as string
  const username = to.query.username as string

  if (githubToken) {
    console.log('[DEBUG-ROUTER] GitHub token detected in URL!');
    console.log('[DEBUG-ROUTER] Token:', githubToken.substring(0, 30) + '...');
    console.log('[DEBUG-ROUTER] Username:', username);
    
    login(githubToken, username || '')
    console.log('[DEBUG-ROUTER] Calling login() and redirecting to /');
    next({ path: '/', query: {} })
    return
  }

  const token = localStorage.getItem('token')
  console.log('[DEBUG-ROUTER] Token from localStorage:', token ? 'present (' + token.substring(0, 20) + '...)' : 'none');
  
  if (to.meta.requiresAuth && !token) {
    console.log('[DEBUG-ROUTER] No token, requires auth - redirecting to /login');
    next('/login')
  } else if (to.path === '/login' && token) {
    console.log('[DEBUG-ROUTER] Already logged in, redirecting to /');
    next('/')
  } else {
    console.log('[DEBUG-ROUTER] Allowing navigation');
    next()
  }
})

export default router
