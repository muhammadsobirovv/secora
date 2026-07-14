/// Node's `Buffer` types its backing store as `ArrayBufferLike` (which
/// includes `SharedArrayBuffer`), while `fetch()`'s `BodyInit` and
/// `Blob`'s `BlobPart` (lib.dom.d.ts) require a view backed specifically
/// by `ArrayBuffer` — a well-known friction point since TypeScript made
/// typed arrays generic over their buffer type. `ArrayBuffer.prototype
/// .slice()` always returns a genuine `ArrayBuffer` (a copy, not a view),
/// which satisfies both APIs without an unsafe cast.
export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}
