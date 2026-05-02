//A reusable login/register form component used in both HRAuthPage.jsx and UserAuthPage.jsx. Has two tabs (Login / Register), form validation, loading state, error and success messages, and keyboard support (Enter key submits).
import { useState } from 'react'
import styles from './AuthForm.module.css'

export default function AuthForm({ role, onLogin, onRegister }) {
  const [tab, setTab] = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const switchTab = (t) => {
    setTab(t)
    setError('')
    setSuccess('')
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.')
      return
    }
    setLoading(true)
    try {
      if (tab === 'register') {
        await onRegister({ email, password, role })
        setSuccess('Account created! You can now log in.')
        switchTab('login')
      } else {
        await onLogin({ email, password })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className={styles.form}>
      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'login' ? styles.active : ''}`}
          onClick={() => switchTab('login')}
        >
          Login
        </button>
        <button
          className={`${styles.tab} ${tab === 'register' ? styles.active : ''}`}
          onClick={() => switchTab('register')}
        >
          Register
        </button>
      </div>

      {/* Alerts */}
      {error   && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {/* Fields */}
      <div className={styles.group}>
        <label className={styles.label}>Email Address</label>
        <input
          className={styles.input}
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={handleKey}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Password</label>
        <input
          className={styles.input}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKey}
        />
      </div>

      <button
        className={styles.submitBtn}
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading
          ? <span className={styles.spinner} />
          : tab === 'login' ? 'Sign In' : 'Create Account'
        }
      </button>
    </div>
  )
}
