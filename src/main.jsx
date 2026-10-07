import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

function PwaInstallControl() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('PWA service worker registration failed:', error)
      })
    }

    const handleBeforeInstall = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }

    const handleInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (!installPrompt || installed) return null

  const install = async () => {
    try {
      const result = await installPrompt.prompt()
      if (result?.outcome !== 'accepted') setInstallPrompt(null)
    } catch (error) {
      console.error('PWA install failed:', error)
    }
  }

  return (
    <button
      type="button"
      onClick={install}
      style={{
        position:'fixed', right:16, bottom:16, zIndex:9998,
        border:'0', borderRadius:12, padding:'11px 16px',
        background:'#0876d1', color:'#fff', fontWeight:800,
        boxShadow:'0 6px 20px rgba(0,0,0,.22)', cursor:'pointer'
      }}
    >
      Install App
    </button>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <PwaInstallControl />
  </StrictMode>,
)
