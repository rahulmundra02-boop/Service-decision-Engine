import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

function PwaInstallControl() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [appName, setAppName] = useState(() => {
    try {
      return localStorage.getItem('pwaPendingAppName') || 'Service Estimate'
    } catch {
      return 'Service Estimate'
    }
  })
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    try {
      const pendingName = localStorage.getItem('pwaPendingAppName') || ''
      if (pendingName.trim()) {
        setAppName(pendingName)
        setShowNameDialog(true)
      }
    } catch {
      // Ignore storage access failures.
    }

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
      setShowNameDialog(false)
      setInstalling(false)
      try {
        localStorage.removeItem('pwaPendingAppName')
      } catch {
        // Ignore storage cleanup failures.
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (!installPrompt || installed) return null

  const updateManifestName = async (name) => {
    const manifestLink = document.querySelector('link[rel="manifest"]')
    if (!manifestLink) return

    const manifestUrl = `/api/manifest?name=${encodeURIComponent(name)}&v=${Date.now()}`

    await new Promise((resolve) => {
      const nextLink = manifestLink.cloneNode(true)
      nextLink.href = manifestUrl
      nextLink.onload = resolve
      nextLink.onerror = resolve
      manifestLink.replaceWith(nextLink)
    })
  }

  const startInstall = () => {
    const trimmedName = appName.trim()

    if (!trimmedName) {
      return
    }

    const isAndroid = /Android/i.test(navigator.userAgent)

    // On Android the manifest must be loaded with the selected name before
    // Chromium creates the install prompt. The first Continue saves the name
    // and reloads; after reload the same dialog is shown again and the second
    // Continue opens the native install sheet.
    if (isAndroid) {
      let pendingName = ''
      try {
        pendingName = localStorage.getItem('pwaPendingAppName') || ''
      } catch {
        pendingName = ''
      }

      if (!pendingName.trim()) {
        try {
          localStorage.setItem('pwaPendingAppName', trimmedName)
        } catch {
          // Continue even if localStorage is unavailable.
        }

        setInstalling(true)
        window.location.reload()
        return
      }
    }

    setInstalling(true)

    try {
      document.title = trimmedName
      updateManifestName(trimmedName)

      const promptPromise = installPrompt.prompt()
      Promise.resolve(promptPromise)
        .then((result) => {
          if (result?.outcome === 'accepted') {
            try {
              localStorage.removeItem('pwaPendingAppName')
            } catch {
              // Ignore storage cleanup failures.
            }
          } else {
            setInstalling(false)
            setInstallPrompt(null)
            setShowNameDialog(false)
          }
        })
        .catch((error) => {
          console.error('PWA install failed:', error)
          setInstalling(false)
        })
    } catch (error) {
      console.error('PWA install failed:', error)
      setInstalling(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShowNameDialog(true)
        }}
        style={{
          position:'fixed', right:16, bottom:16, zIndex:9998,
          border:'0', borderRadius:12, padding:'11px 16px',
          background:'#0876d1', color:'#fff', fontWeight:800,
          boxShadow:'0 6px 20px rgba(0,0,0,.22)', cursor:'pointer'
        }}
      >
        Install App
      </button>

      {showNameDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          style={{
            position:'fixed',
            inset:0,
            zIndex:9999,
            background:'rgba(0,0,0,.45)',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            padding:20
          }}
        >
          <div
            style={{
              width:'100%',
              maxWidth:390,
              background:'#fff',
              borderRadius:16,
              padding:22,
              boxShadow:'0 12px 40px rgba(0,0,0,.28)',
              fontFamily:'Arial, sans-serif'
            }}
          >
            <div id="pwa-install-title" style={{fontSize:20, fontWeight:800, marginBottom:8}}>
              App Name
            </div>

            <div style={{fontSize:14, color:'#555', marginBottom:14}}>
              Enter the name you want to use for the installed app.
            </div>

            <input
              autoFocus
              type="text"
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !installing) startInstall()
              }}
              maxLength={60}
              disabled={installing}
              style={{
                width:'100%',
                boxSizing:'border-box',
                border:'1px solid #bbb',
                borderRadius:10,
                padding:'12px 13px',
                fontSize:16,
                outline:'none',
                marginBottom:16
              }}
            />

            <div style={{display:'flex', justifyContent:'flex-end', gap:10}}>
              <button
                type="button"
                onClick={() => setShowNameDialog(false)}
                disabled={installing}
                style={{
                  border:'1px solid #bbb',
                  borderRadius:10,
                  padding:'10px 15px',
                  background:'#fff',
                  color:'#333',
                  fontWeight:700,
                  cursor:installing ? 'default' : 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={startInstall}
                disabled={installing || !appName.trim()}
                style={{
                  border:'0',
                  borderRadius:10,
                  padding:'10px 16px',
                  background:installing || !appName.trim() ? '#9bbce0' : '#0876d1',
                  color:'#fff',
                  fontWeight:800,
                  cursor:installing || !appName.trim() ? 'default' : 'pointer'
                }}
              >
                {installing ? 'Installing…' : 'Continue Install'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <PwaInstallControl />
  </StrictMode>,
)
