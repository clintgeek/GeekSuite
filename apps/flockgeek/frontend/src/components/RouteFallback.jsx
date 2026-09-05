/**
 * The loading surface a lazy route shows while its chunk arrives.
 *
 * Same centred `CircularProgress` as `App.jsx`'s auth-loading state — the
 * app has exactly one "we're fetching, hold on" visual and this is it — but
 * sized to the content area rather than the viewport: the shell (sidebar,
 * top bar, bottom nav) stays mounted around it, so a `100vh` box would push
 * the page taller than the frame and bounce the scroll position.
 *
 * `40vh` is deliberately shorter than a typical page so the fallback never
 * makes the frame grow; it is tall enough that the spinner lands roughly
 * where the page's own content will.
 */
import { Box, CircularProgress } from "@mui/material";

const RouteFallback = () => (
  <Box
    sx={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "40vh"
    }}
  >
    {/* Named: an unlabelled `role="progressbar"` is an axe finding
        (`aria-progressbar-name`), and the harness runs with --enforce-a11y. */}
    <CircularProgress aria-label="Loading page" />
  </Box>
);

export default RouteFallback;
