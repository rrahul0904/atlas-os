import type {NextConfig} from "next";

const nextConfig:NextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  webpack(config){
    config.resolve.extensionAlias={
      ...(config.resolve.extensionAlias??{}),
      ".js":[".ts",".js"],
      ".jsx":[".tsx",".jsx"],
      ".mjs":[".mts",".mjs"]
    };
    return config;
  }
};
export default nextConfig;
