/**
 * One way to ask "is there a barcode in this picture?", whatever the phone.
 *
 * Android Chrome has a decoder built in (`BarcodeDetector`); it is fast and
 * costs no download, so it is used when it is there and knows the product
 * formats. Everything else — every iPhone — gets zxing-cpp as WebAssembly,
 * loaded on demand from our own files (wasmDecoder.js).
 *
 * Both answer with the same shape, `[{ rawValue, format }]`, and neither is
 * trusted: the scanner runs every read through `normalizeProductCode`.
 */

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

const createNativeDetector = async () => {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    if (!NATIVE_FORMATS.every((format) => supported.includes(format))) return null;
    const native = new window.BarcodeDetector({ formats: NATIVE_FORMATS });
    return {
      kind: 'native',
      detect: async (canvas) =>
        (await native.detect(canvas)).map((b) => ({ rawValue: b.rawValue, format: b.format })),
    };
  } catch {
    return null;
  }
};

const createWasmDetector = async () => {
  const { decodeFrame } = await import('./wasmDecoder.js');
  return {
    kind: 'wasm',
    detect: async (canvas) => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return [];
      return decodeFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
    },
  };
};

/** The detector for live camera frames. */
export const createDetector = async () => (await createNativeDetector()) || createWasmDetector();

/**
 * Read a still photo. Always zxing-cpp: it tries the picture at several sizes
 * and turned on its side, which a single native pass does not.
 */
export const decodePhotoFile = async (file) => {
  const { decodePhoto } = await import('./wasmDecoder.js');
  return decodePhoto(file);
};
