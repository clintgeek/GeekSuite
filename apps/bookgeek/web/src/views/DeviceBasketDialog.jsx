/**
 * BookGeek device basket result sheet — shown after a Kindle basket is made.
 *
 * `GeekSheet` (DOCS/MOBILE_UI_PLAN.md §3.5): the content is unchanged from
 * the old hand-rolled overlay (the big mono landing URL / device word is
 * right), only the surface and the colors move to theme tokens so light
 * mode looks right. Rendered only when a basket exists, so `basketResult`
 * is always populated here — the parent only mounts this component while
 * `basketResultOpen && basketResult` hold, so "rendered" means "open".
 */
import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material";
import { GeekSheet } from "@geeksuite/ui";

export default function DeviceBasketDialog({
  basketResult,
  clearBasket,
  profile,
  setBasketError,
  setBasketResult,
  setBasketResultOpen,
}) {
  const hasDeviceWord = Boolean(profile?.deviceWord);

  return (
    <GeekSheet
      open
      onClose={() => setBasketResultOpen(false)}
      title="Device download basket"
      description={
        hasDeviceWord
          ? "Visit the page and enter your word on your e-reader"
          : "Type this URL into your Kindle browser"
      }
      actions={
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Button
            type="button"
            variant="outlined"
            fullWidth
            onClick={() => {
              const toCopy = basketResult.url || "";
              if (navigator.clipboard) {
                navigator.clipboard.writeText(toCopy).catch(() => {});
              }
            }}
          >
            Copy URL to clipboard
          </Button>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <Button
              type="button"
              variant="outlined"
              onClick={() => {
                setBasketResult(null);
                setBasketResultOpen(false);
                setBasketError(null);
              }}
            >
              Create new basket
            </Button>
            <Button type="button" variant="contained" onClick={() => clearBasket()}>
              Done
            </Button>
          </Box>
        </Box>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        {hasDeviceWord ? (
          <>
            {/* Easy path — device word is set, this is primary */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderRadius: 2,
                border: (t) => `1px solid ${alpha(t.palette.progress.main, 0.4)}`,
                bgcolor: (t) => alpha(t.palette.progress.main, 0.12),
                px: 2,
                py: 2.5,
                textAlign: "center",
              }}
            >
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mb: 0.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: (t) => alpha(t.palette.progress.main, 0.8),
                  }}
                >
                  On your e-reader, go to
                </Typography>
                <Typography
                  sx={{
                    fontFamily: '"Roboto Mono", monospace',
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    lineHeight: 1.3,
                    color: "text.primary",
                    wordBreak: "break-all",
                  }}
                >
                  {basketResult.landingUrl || "/download-basket"}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mb: 0.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: (t) => alpha(t.palette.progress.main, 0.8),
                  }}
                >
                  and enter your word
                </Typography>
                <Typography
                  sx={{
                    fontFamily: '"Roboto Mono", monospace',
                    fontSize: "1.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "text.primary",
                    wordBreak: "break-all",
                  }}
                >
                  {profile.deviceWord}
                </Typography>
              </Box>
            </Box>

            {/* Full URL — secondary fallback */}
            <Box
              sx={{
                borderRadius: 1.5,
                border: (t) => `1px solid ${t.palette.divider}`,
                bgcolor: "background.default",
                px: 1.5,
                py: 1.5,
                textAlign: "center",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mb: 0.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "text.muted",
                }}
              >
                Or type the full URL directly
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", wordBreak: "break-all" }}>
                {basketResult.url || ""}
              </Typography>
            </Box>
          </>
        ) : (
          <>
            {/* Large slug display — hand-typed on Kindle keyboard */}
            <Box
              sx={{
                borderRadius: 2,
                border: (t) => `1px solid ${alpha(t.palette.progress.main, 0.4)}`,
                bgcolor: (t) => alpha(t.palette.progress.main, 0.12),
                px: 2,
                py: 2.5,
                textAlign: "center",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mb: 0.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: (t) => alpha(t.palette.progress.main, 0.8),
                }}
              >
                4-word URL
              </Typography>
              <Typography
                sx={{
                  fontFamily: '"Roboto Mono", monospace',
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  lineHeight: 1.3,
                  color: "text.primary",
                  wordBreak: "break-all",
                }}
              >
                {basketResult.slug ? basketResult.slug.split("-").join(" · ") : ""}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1.5, color: "text.secondary", wordBreak: "break-all" }}>
                {basketResult.url || ""}
              </Typography>
            </Box>

            <Box
              sx={{
                borderRadius: 1.5,
                border: (t) => `1px solid ${t.palette.divider}`,
                bgcolor: "background.default",
                px: 1.5,
                py: 1,
                textAlign: "center",
              }}
            >
              <Typography variant="body2" sx={{ color: "text.muted" }}>
                Tip: set a device word in Settings to make this easier to type on your e-reader.
              </Typography>
            </Box>
          </>
        )}

        {/* Expiry */}
        {basketResult.expiresAt ? (
          <Typography variant="body2" sx={{ textAlign: "center", color: "text.secondary" }}>
            Expires at{" "}
            <Box component="span" sx={{ fontWeight: 500, color: "text.primary" }}>
              {new Date(basketResult.expiresAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Box>{" "}
            (30 minutes)
          </Typography>
        ) : null}
      </Box>
    </GeekSheet>
  );
}
