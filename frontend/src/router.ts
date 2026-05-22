import { createRouter, createWebHistory } from 'vue-router'
import Login from './views/Login.vue'
import Home from './views/Home.vue'
import Practice from './views/Practice.vue'
import ErrorWords from './views/ErrorWords.vue'
import YesterdayErrors from './views/YesterdayErrors.vue'
import Settings from './views/Settings.vue'

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

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/')
  } else {
    next()
  }
})

export default router
