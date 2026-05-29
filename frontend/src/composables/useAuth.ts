import { ref } from 'vue'

const isLoggedIn = ref(false)
const username = ref('')

export function useAuth() {
  const updateAuthState = () => {
    console.log('[DEBUG-AUTH] updateAuthState called');
    const token = localStorage.getItem('token')
    const storedUsername = localStorage.getItem('username')
    isLoggedIn.value = !!token
    username.value = storedUsername || ''
    console.log('[DEBUG-AUTH] Auth state updated - isLoggedIn:', isLoggedIn.value, 'username:', username.value);
  }

  const validateToken = async () => {
    const token = localStorage.getItem('token')
    console.log('[DEBUG-AUTH] validateToken called, token:', token ? 'present' : 'none');
    
    if (!token) {
      console.log('[DEBUG-AUTH] No token, calling logout');
      logout()
      return false
    }
    
    try {
      console.log('[DEBUG-AUTH] Calling /api/auth/validate...');
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      console.log('[DEBUG-AUTH] Validate response status:', response.status);
      
      if (!response.ok) {
        console.log('[DEBUG-AUTH] Response not ok, calling logout');
        logout()
        return false
      }
      
      const data = await response.json()
      console.log('[DEBUG-AUTH] Validate response data:', JSON.stringify(data));
      
      if (data.success && data.username) {
        username.value = data.username
        isLoggedIn.value = true
        console.log('[DEBUG-AUTH] Token valid, user:', data.username);
        return true
      } else {
        console.log('[DEBUG-AUTH] Token invalid or no username, calling logout');
        logout()
        return false
      }
    } catch (error) {
      console.error('[DEBUG-AUTH] Validate error:', error);
      logout()
      return false
    }
  }

  const login = (token: string, name: string, remember: boolean = false) => {
    console.log('[DEBUG-AUTH] login() called with token:', token.substring(0, 30) + '...', 'name:', name, 'remember:', remember);
    localStorage.setItem('token', token)
    localStorage.setItem('username', name)
    
    if (remember) {
      localStorage.setItem('rememberMe', 'true')
    } else {
      localStorage.removeItem('rememberMe')
      localStorage.removeItem('savedUsername')
      localStorage.removeItem('savedPassword')
    }
    
    updateAuthState()
  }
  
  const saveLoginCredentials = (username: string, password: string) => {
    localStorage.setItem('savedUsername', username)
    localStorage.setItem('savedPassword', password)
  }

  const logout = async () => {
    console.log('[DEBUG-AUTH] logout() called');
    const token = localStorage.getItem('token')
    console.log('[DEBUG-AUTH] Token to logout:', token ? token.substring(0, 30) + '...' : 'none');
    
    try {
      if (token) {
        console.log('[DEBUG-AUTH] Calling /api/auth/logout...');
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        console.log('[DEBUG-AUTH] Logout API called');
      }
    } catch (error) {
      console.warn('[DEBUG-AUTH] Logout API error:', error);
    }
    
    console.log('[DEBUG-AUTH] Clearing localStorage');
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    isLoggedIn.value = false
    username.value = ''
    console.log('[DEBUG-AUTH] Logout complete');
  }

  return {
    isLoggedIn,
    username,
    updateAuthState,
    validateToken,
    login,
    logout,
    saveLoginCredentials
  }
}
