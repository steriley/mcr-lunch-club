declare module 'wawoff2' {
  /** Converts WOFF2 font data to TTF. */
  export function decompress(data: Uint8Array): Promise<Uint8Array>;
  const wawoff2: { decompress: typeof decompress };
  export default wawoff2;
}
