const path = require("path");

/** @type {import("next").NextConfig} */
const nextConfig = {
  turbopack: { root: path.join(__dirname, "../..") },

  allowedDevOrigins: [
    "192.168.1.101:3001",
    "192.168.1.101:3000",
    "localhost:3001",
    "localhost:3000",

    // Cloudflared cambia el subdominio: usa wildcard sin protocolo
    "*.trycloudflare.com",
  ],
};

module.exports = nextConfig;
