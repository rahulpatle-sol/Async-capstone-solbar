import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    'recharts', 
    'es-toolkit', 
    '@solana/wallet-adapter-react', 
    '@solana/wallet-adapter-react-ui',
    '@solana/wallet-adapter-phantom',
    '@solana/wallet-adapter-solflare'
  ],
};

export default nextConfig;