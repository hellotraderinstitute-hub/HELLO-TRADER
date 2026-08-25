/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['hello-trader-admin.loca.lt', '*.loca.lt', '*.trycloudflare.com', 'localhost:3000', '127.0.0.1:3000', 'localhost', '127.0.0.1'],
  async rewrites() {
    const target = process.env.BACKEND_URL || 'http://127.0.0.1:4000';
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
