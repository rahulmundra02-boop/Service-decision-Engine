export default function handler(req, res) {
  const raw = String(req.query?.name || "Service Estimate").trim();
  const name = raw.replace(/[<>\\/\x00-\x1F]/g, "").slice(0, 40) || "Service Estimate";
  const shortName = name.slice(0, 20);

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({
    name,
    short_name: shortName,
    description: "Vehicle service decision and estimate application",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    prefer_related_applications: false,
    icons: [
      {
        src: "/favicon.svg?v=20261006-7",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/icon-light-192.jpg?v=20261006-7",
        sizes: "192x192",
        type: "image/jpeg",
        purpose: "any"
      },
      {
        src: "/icon-light-512.jpg?v=20261006-7",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any"
      }
    ]
  });
}