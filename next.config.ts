import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // WebSocket and API optimizations
  async headers() {
    return [
      {
        source: '/api/websocket',
        headers: [
          {
            key: 'Upgrade',
            value: 'websocket',
          },
          {
            key: 'Connection',
            value: 'Upgrade',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: 'http://localhost:3000', // Main PodTalk app
          
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ]
  },
  // Optimize for real-time features
  async rewrites() {
    return [
      {
        source: '/socket.io/:path*',
        destination: '/api/websocket/:path*',
      },
    ]
  },
  // Webpack configuration for audio processing
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(mp3|wav|ogg|m4a)$/,
      use: {
        loader: 'file-loader',
        options: {
          publicPath: '/_next/static/audio/',
          outputPath: 'static/audio/',
        },
      },
    })
    return config
  },
}

export default nextConfig 