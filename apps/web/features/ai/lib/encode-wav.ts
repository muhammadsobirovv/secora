/// Converts a recorded audio Blob (WebM/Opus from MediaRecorder, or anything
/// the browser can decode) into 16 kHz mono 16-bit PCM WAV — the format the
/// Azure short-audio speech-to-text endpoint accepts reliably across
/// browsers (WebM is not accepted by Azure's REST API).

const TARGET_SAMPLE_RATE = 16000;

export async function blobToWav16k(blob: Blob): Promise<Blob> {
  const AudioContextCtor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  const decodeContext = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void decodeContext.close();
  }

  // OfflineAudioContext with one output channel downmixes stereo to mono and
  // resamples to the target rate in a single render pass.
  const frameCount = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, Math.max(1, frameCount), TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  return encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += bytesPerSample) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}
