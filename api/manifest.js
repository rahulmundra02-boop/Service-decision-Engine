const DEFAULT_NAME = 'Service Estimate'

function cleanName(value) {
  const name = String(value || '')
    .replace(/[\\u0000-\\u001F\\u007F]/g, '')
    .trim()

  return name.slice(0, 60) || DEFAULT_NAME
}

export default function handler(req, res) {
  const name = cleanName(req.query?.name)

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.status(200).json({
    name,
    short_name: name,
    description: 'Vehicle service decision and estimate application',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    prefer_related_applications: false,
    icons: [
      {
        src: '/favicon.svg?v=20261006-7',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any'
      },
      {
        src: '/icon-light-192.jpg?v=20261006-7',
        sizes: '192x192',
        type: 'image/jpeg',
        purpose: 'any'
      },
      {
        src: '/icon-light-512.jpg?v=20261006-7',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any'
      }
    ]
  })
}
