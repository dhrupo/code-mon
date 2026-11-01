// The engine's runtime has TC39 base64 on Uint8Array; the es2023 lib does not declare it yet.
interface Uint8Array {
  toBase64(): string
}
interface Uint8ArrayConstructor {
  fromBase64(base64: string): Uint8Array<ArrayBuffer>
}
