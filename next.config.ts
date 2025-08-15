import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Não deixar o build falhar por lint/TS em produção
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
