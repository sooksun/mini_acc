/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@hj/shared-types'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
