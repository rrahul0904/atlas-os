import type {NextConfig} from "next";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const here=dirname(fileURLToPath(import.meta.url));
const nextConfig:NextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  turbopack:{root:resolve(here,"../..")}
};
export default nextConfig;
