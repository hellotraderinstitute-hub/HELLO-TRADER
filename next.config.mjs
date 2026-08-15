/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['hello-trader-admin.loca.lt', '*.loca.lt', '*.trycloudflare.com'],
  async rewrites() {
    const isProd = process.env.NODE_ENV === 'production';
    const target = process.env.BACKEND_URL || (isProd ? 'https://hello-trader-backend.onrender.com' : 'http://127.0.0.1:4000');
    return [
      {
        source: '/api/:path*',
        destination: `${target}/api/:path*`
      },
      {
        source: '/socket.io/:path*',
        destination: `${target}/socket.io/:path*`
      }
    ];
  }
};

export default nextConfig;
