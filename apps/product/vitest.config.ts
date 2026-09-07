import {defineConfig} from "vitest/config";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const here=dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  resolve:{
    alias:[
      {find:/^@\/(.+)$/,replacement:resolve(here,"$1")},
      {find:/^@atlas\/(.+)$/,replacement:resolve(here,"../../packages/$1/src/index.ts")}
    ]
  },
  test:{environment:"node"}
});
