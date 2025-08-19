import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // não falhar build por lint/type em produção
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
