import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Capture the browser install event immediately, before React effects run.
// This avoids missing beforeinstallprompt during a fast page load.
let deferredInstallPrompt = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredInstallPrompt = event
    window.__serviceEstimateInstallPrompt = event
  })
}

function PwaInstallControl() {
  const [installPrompt, setInstallPrompt] = useState(
    () => (typeof window !== 'undefined' ? window.__serviceEstimateInstallPrompt || null : null)
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [installMessage, setInstallMessage] = useState('')
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('PWA service worker registration failed:', error)
      })
    }

    const handleBeforeInstall = (event) => {
      event.preventDefault()
      deferredInstallPrompt = event
      window.__serviceEstimateInstallPrompt = event
      setInstallPrompt(event)
    }

    const handleInstalled = () => {
      deferredInstallPrompt = null
      window.__serviceEstimateInstallPrompt = null
      setInstalled(true)
      setInstallPrompt(null)
      setDialogOpen(false)
      setInstallMessage('Service Estimate successfully installed.')
    }

    const syncPrompt = () => {
      const prompt = window.__serviceEstimateInstallPrompt || deferredInstallPrompt
      if (prompt) setInstallPrompt(prompt)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    syncPrompt()

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (window.matchMedia?.('(display-mode: standalone)').matches) {
      setInstalled(true)
    }
  }, [])

  if (installed) return null

  const openDialog = () => {
    setInstallMessage('')
    setDialogOpen(true)
  }

  const install = async () => {
    const promptEvent =
      installPrompt ||
      deferredInstallPrompt ||
      window.__serviceEstimateInstallPrompt

    if (!promptEvent) {
      setInstallMessage(
        'One-click install prompt is not available right now. In Edge use ⋯ → Apps → Install this site as an app.'
      )
      return
    }

    try {
      const result = await promptEvent.prompt()

      // A BeforeInstallPromptEvent is one-shot and must not be reused.
      deferredInstallPrompt = null
      window.__serviceEstimateInstallPrompt = null
      setInstallPrompt(null)

      if (result?.outcome === 'accepted') {
        setDialogOpen(false)
        return
      }

      setInstallMessage(
        'Installation was cancelled by Edge. You can install it from ⋯ → Apps → Install this site as an app.'
      )
    } catch (error) {
      console.error('PWA install failed:', error)
      deferredInstallPrompt = null
      window.__serviceEstimateInstallPrompt = null
      setInstallPrompt(null)
      setInstallMessage(
        'Edge could not open the install prompt. Use ⋯ → Apps → Install this site as an app.'
      )
    }
  }

  return (
    <>
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

      {dialogOpen && (
        <div style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(0,0,0,.55)', display:'flex',
          alignItems:'center', justifyContent:'center', padding:20
        }}>
          <div style={{
            width:'min(440px,100%)', background:'#fff', color:'#1f2933',
            borderRadius:16, padding:22, boxShadow:'0 18px 50px rgba(0,0,0,.3)'
          }}>
            <div style={{fontSize:20,fontWeight:900,marginBottom:7}}>
              Install Service Estimate
            </div>

            <div style={{fontSize:13,color:'#68737d',lineHeight:1.55}}>
              App name <b>Service Estimate</b> rahega. Neeche button dabate hi
              Microsoft Edge ka actual install prompt open hoga.
            </div>

            {installMessage && (
              <div style={{
                marginTop:14, padding:13, borderRadius:10,
                background:'#fff4e5', color:'#7a4b00',
                fontSize:13, lineHeight:1.55
              }}>
                {installMessage}
              </div>
            )}

            <div style={{display:'flex',justifyContent:'flex-end',gap:9,marginTop:18}}>
              <button
                type="button"
                onClick={()=>setDialogOpen(false)}
                style={{
                  border:'1px solid #cbd5df',background:'#fff',
                  borderRadius:10,padding:'10px 15px',fontWeight:700
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={install}
                style={{
                  border:0,background:'#0876d1',color:'#fff',
                  borderRadius:10,padding:'10px 17px',fontWeight:800
                }}
              >
                Install Now
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
