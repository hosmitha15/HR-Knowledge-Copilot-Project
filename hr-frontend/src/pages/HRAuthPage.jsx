import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { loginUser, registerUser } from '../services/api.js'
import { IconChevronLeft } from '../components/Icons.jsx'
import AuthForm from '../components/AuthForm.jsx'
import styles from './AuthPage.module.css'

export default function HRAuthPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (credentials) => {
    const data = await loginUser(credentials)
    if (data.role !== 'HR') throw new Error('This account is not an HR account.')
    login(data.token, data.role)
    navigate('/hr/dashboard')
  }

  const handleRegister = async (credentials) => {
    await registerUser({ ...credentials, role: 'HR' })
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/')}>
        <IconChevronLeft size={16} /> Back to Home
      </button>

      <div className={styles.formWrapper}>
        <h2 className={styles.formTitle}>HR Portal</h2>
        <p className={styles.formSub}>Sign in or create your HR account below</p>
        <AuthForm role="HR" onLogin={handleLogin} onRegister={handleRegister} />
      </div>
    </div>
  )
}
