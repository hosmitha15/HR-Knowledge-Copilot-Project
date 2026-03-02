import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { loginUser, registerUser } from '../services/api.js'
import { IconUser, IconCheck, IconChevronLeft, IconDarwinbox } from '../components/Icons.jsx'
import AuthForm from '../components/AuthForm.jsx'
import styles from './AuthPage.module.css'

const FEATURES = [
  'Ask questions in plain, natural language',
  'AI answers sourced directly from HR policies',
  'See which documents your answer came from',
  'Available any time, instant responses',
]

export default function UserAuthPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (credentials) => {
    const data = await loginUser(credentials)
    if (data.role !== 'USER') throw new Error('This account is not an employee account.')
    login(data.token, data.role)
    navigate('/chat')
  }

  const handleRegister = async (credentials) => {
    await registerUser({ ...credentials, role: 'USER' })
  }

  return (
    <div className={styles.page}>
      {/* Left panel */}
      <div className={`${styles.panel} ${styles.userPanel}`}>
        <div className={styles.panelGlow} />
        <div className={styles.panelContent}>
          <div className={styles.panelLogo}>
            <IconDarwinbox size={20} />
            <span>darwinbox</span>
          </div>
          <h2 className={styles.panelTitle}>
            Employee <span className={styles.panelHighlight}>Access</span>
          </h2>
          <p className={styles.panelSub}>
            Get instant answers to your HR questions. No more waiting for replies or searching through policy folders.
          </p>
          <ul className={styles.features}>
            {FEATURES.map((f, i) => (
              <li key={i} className={styles.feature}>
                <span className={styles.featureDot}><IconCheck size={13} /></span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right form side */}
      <div className={styles.formSide}>
        <button className={styles.back} onClick={() => navigate('/')}>
          <IconChevronLeft size={16} /> Back to Home
        </button>

        <div className={styles.formWrapper}>
          <h2 className={styles.formTitle}>Employee Access</h2>
          <p className={styles.formSub}>Sign in or create your employee account below</p>
          <AuthForm role="USER" onLogin={handleLogin} onRegister={handleRegister} />
        </div>
      </div>
    </div>
  )
}
