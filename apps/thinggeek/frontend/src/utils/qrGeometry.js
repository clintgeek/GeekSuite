/**
 * Pure geometry for a printed QR: how much of the physical box we hand the
 * `qrcode` library (`sizeMm` in LabelQrCode.jsx — the SVG's own `viewBox`,
 * margin included) is quiet zone versus scannable data.
 *
 * ISO/IEC 18004 requires at least 4 modules of quiet zone on every side; the
 * `qrcode` library's `margin` option is in modules and bakes it straight
 * into the rendered SVG's `viewBox` as `moduleSize + 2*margin` (see
 * node_modules/qrcode/lib/renderer/svg-tag.js). So a box rendered at
 * `boxMm` splits as: quiet zone `boxMm * margin / (moduleSize + 2*margin)`
 * per side, and a scannable data area of whatever is left.
 *
 * The module count itself is NOT a constant — it depends on the payload
 * length and the error-correction level (`QRCode.create(value, opts)`
 * decides the QR version, and the version decides the module count). A
 * label design can only choose the box size; it has to check the resulting
 * data area against real module counts for realistic payloads, not assume
 * one.
 */
export const QUIET_ZONE_MODULES = 4;

/** The physical size (mm) of the scannable data area inside a `boxMm`
 * square QR render, given the QR's own module grid size. */
export function qrDataAreaMm(boxMm, moduleSize, marginModules = QUIET_ZONE_MODULES) {
  const totalModules = moduleSize + marginModules * 2;
  return (boxMm * moduleSize) / totalModules;
}
