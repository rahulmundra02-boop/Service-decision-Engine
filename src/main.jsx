import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

function PwaInstallControl() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [appName, setAppName] = useState(() => localStorage.getItem('serviceEstimateInstallName') || 'Service Estimate')
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
      setDialogOpen(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (!installPrompt || installed) return null

  const openDialog = () => {
    setAppName(localStorage.getItem('serviceEstimateInstallName') || 'Service Estimate')
    setDialogOpen(true)
  }

  const install = async () => {
    const name = String(appName || '').trim().replace(/[<>\\/\x00-\x1F]/g, '').slice(0, 40) || 'Service Estimate'
    localStorage.setItem('serviceEstimateInstallName', name)
    document.title = name
    setDialogOpen(false)

    try {
      const result = await installPrompt.prompt()
      if (result?.outcome !== 'accepted') setInstallPrompt(null)
    } catch (error) {
      console.error('PWA install failed:', error)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
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
            width:'min(420px,100%)', background:'#fff', color:'#1f2933',
            borderRadius:16, padding:22, boxShadow:'0 18px 50px rgba(0,0,0,.3)'
          }}>
            <div style={{fontSize:20,fontWeight:900,marginBottom:7}}>Install App</div>
            <div style={{fontSize:13,color:'#68737d',marginBottom:16}}>
              Choose the name you want to use for this browser session.
            </div>
            <input
              autoFocus
              value={appName}
              maxLength={40}
              onChange={(e)=>setAppName(e.target.value)}
              onKeyDown={(e)=>{ if(e.key==='Enter') install() }}
              placeholder="Service Estimate"
              style={{
                width:'100%', boxSizing:'border-box', padding:'12px 13px',
                border:'1px solid #cbd5df', borderRadius:10, fontSize:15,
                outline:'none'
              }}
            />
            <div style={{display:'flex',justifyContent:'flex-end',gap:9,marginTop:18}}>
              <button
                type="button"
                onClick={()=>setDialogOpen(false)}
                style={{border:'1px solid #cbd5df',background:'#fff',borderRadius:10,padding:'10px 15px',fontWeight:700}}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={install}
                style={{border:0,background:'#0876d1',color:'#fff',borderRadius:10,padding:'10px 17px',fontWeight:800}}
              >
                Continue Install
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
