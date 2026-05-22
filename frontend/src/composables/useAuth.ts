import { ref } from 'vue'

const isLoggedIn = ref(false)
const username = ref('')

export function useAuth() {
  const updateAuthState = () => {
    isLoggedIn.value = !!localStorage.getItem('token')
    username.value = localStorage.getItem('username') || ''
  }

  const login = (token: string, name: string) => {
    localStorage.setItem('token', token)
    localStorage.setItem('username', name)
    updateAuthState()
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    updateAuthState()
  }

  return {
    isLoggedIn,
    username,
    updateAuthState,
    login,
    logout
  }
}
