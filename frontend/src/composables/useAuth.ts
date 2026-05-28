import { ref } from 'vue'

const isLoggedIn = ref(false)
const username = ref('')

export function useAuth() {
  const updateAuthState = () => {
    isLoggedIn.value = !!localStorage.getItem('token')
    username.value = localStorage.getItem('username') || ''
  }

  const validateToken = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      logout()
      return false
    }
    
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        logout()
        return false
      }
      
      const data = await response.json()
      if (data.success && data.username) {
        username.value = data.username
        isLoggedIn.value = true
        return true
      } else {
        logout()
        return false
      }
    } catch {
      logout()
      return false
    }
  }

  const login = (token: string, name: string) => {
    localStorage.setItem('token', token)
    localStorage.setItem('username', name)
    updateAuthState()
  }

  const logout = async () => {
    const token = localStorage.getItem('token')
    
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
      }
    } catch (error) {
      console.warn('Failed to logout from server:', error)
    }
    
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    isLoggedIn.value = false
    username.value = ''
  }

  return {
    isLoggedIn,
    username,
    updateAuthState,
    validateToken,
    login,
    logout
  }
}
