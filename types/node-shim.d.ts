declare module "node:test" {
  const test: (name: string, fn: () => void | Promise<void>) => void;
  export default test;
}
declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    throws(fn: () => unknown, message?: string): void;
  };
  export default assert;
}
declare module "node:crypto" {
  export function randomUUID(): string;
  export function createHmac(algorithm: string, key: string): { update(value: string): { digest(encoding: "base64url"): string } };
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  export function randomBytes(size: number): Uint8Array & { toString(encoding?: string): string };
  export function scryptSync(password: string, salt: string, keylen: number): Uint8Array & { toString(encoding?: string): string };
  export function createHash(algorithm: string): { update(value: string | Uint8Array): any; digest(): Uint8Array & { toString(encoding?: string): string } };
  export function createCipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): {
    setAAD(value: Uint8Array): void;
    update(value: string | Uint8Array, inputEncoding?: string): Uint8Array;
    final(): Uint8Array;
    getAuthTag(): Uint8Array;
  };
  export function createDecipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): {
    setAAD(value: Uint8Array): void;
    setAuthTag(value: Uint8Array): void;
    update(value: Uint8Array): Uint8Array;
    final(): Uint8Array;
  };
}
declare module "node:http" {
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: Record<string,string|string[]|undefined>;
    on(event: "data", listener: (chunk: Uint8Array|string) => void): void;
    on(event: "end", listener: () => void): void;
    on(event: "error", listener: (error: Error) => void): void;
  }
  export interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string,string|string[]>): void;
    end(data?: string): void;
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): { listen(port: number, cb?: () => void): void };
}
declare module "node:fs/promises" {
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
}
declare module "node:url" { export function fileURLToPath(url: string | URL): string; }
declare module "node:path" {
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
}
declare const process: { env: Record<string,string|undefined>; on(event: string, listener: () => void): void; };
declare const Buffer: {
  from(value: string | Uint8Array, encoding?: string): Uint8Array & {
    toString(encoding?: string): string;
    length: number;
  };
};
