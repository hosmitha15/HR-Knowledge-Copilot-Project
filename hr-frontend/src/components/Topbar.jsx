import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { IconDarwinbox, IconLogout } from './Icons.jsx'
import styles from './Topbar.module.css'

export default function Topbar() {
  const { role, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <IconDarwinbox size={20} />
        <span>darwinbox</span>
      </div>

      <div className={styles.right}>
        <span className={styles.roleTag}>
          {role === 'HR' ? 'HR Manager' : 'Employee'}
        </span>
        <button className={styles.logoutBtn} onClick={handleLogout} title="Logout">
          <IconLogout size={18} />
        </button>
      </div>
    </header>
  )
}
