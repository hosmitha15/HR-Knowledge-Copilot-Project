import { useNavigate } from 'react-router-dom'
import styles from './LandingPage.module.css'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>HR</span>
          <span className={styles.logoText}>Knowledge Co-pilot</span>
        </div>

        <h1 className={styles.title}>HR Knowledge Base</h1>
        <p className={styles.sub}>Select your role to continue</p>

        <div className={styles.cards}>
          <button className={styles.card} onClick={() => navigate('/hr/login')}>
            <span className={styles.cardIcon}>🛡️</span>
            <span className={styles.cardTitle}>HR Login</span>
            <span className={styles.cardDesc}>Manage policy documents</span>
          </button>

          <button className={styles.card} onClick={() => navigate('/user/login')}>
            <span className={styles.cardIcon}>👤</span>
            <span className={styles.cardTitle}>Employee Login</span>
            <span className={styles.cardDesc}>Ask policy questions</span>
          </button>
        </div>
      </div>
    </div>
  )
}
