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
      return new URLSearchParams(window.location.search).get('pwaName') || 'Service Estimate'
    } catch {
      return 'Service Estimate'
    }
  })
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const installName = params.get('pwaName') || ''
      const installFlow = params.get('pwaInstall') === '1'

      if (installFlow && installName.trim()) {
        setAppName(installName)
        setShowNameDialog(true)
      }
    } catch {
      // Ignore URL parsing failures.
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
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('pwaName')
        cleanUrl.searchParams.delete('pwaInstall')
        window.history.replaceState({}, '', cleanUrl)
      } catch {
        // Ignore URL cleanup failures.
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
    const params = new URLSearchParams(window.location.search)
    const alreadyPrepared = params.get('pwaInstall') === '1' && Boolean(params.get('pwaName'))

    if (isAndroid && !alreadyPrepared) {
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.set('pwaName', trimmedName)
      nextUrl.searchParams.set('pwaInstall', '1')
      setInstalling(true)
      window.location.assign(nextUrl.toString())
      return
    }

    setInstalling(true)

    try {
      document.title = trimmedName
      const promptPromise = installPrompt.prompt()

      Promise.resolve(promptPromise)
        .then((result) => {
          if (result?.outcome === 'accepted') {
            try {
              const cleanUrl = new URL(window.location.href)
              cleanUrl.searchParams.delete('pwaName')
              cleanUrl.searchParams.delete('pwaInstall')
              window.history.replaceState({}, '', cleanUrl)
            } catch {
              // Ignore URL cleanup failures.
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
