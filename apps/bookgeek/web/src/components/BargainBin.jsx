/**
 * BargainBin — the library's empty states, as a wooden crate with a
 * hand-lettered sign on it (Used Bookstore). "No books yet" and "nothing
 * matches" are different situations and get different words; the crate is
 * the same.
 *
 * The crate is CSS (three slats, two posts) and decorative; the heading and
 * the sentence under it are the real content.
 */
import React from "react";
import { Box, Typography } from "@mui/material";
import { HAND_FONT, TALKER } from "../theme/theme";

function Crate({ sign }) {
  return (
    <Box aria-hidden="true" sx={{ position: "relative", width: 220, height: 118, mx: "auto", mb: 3 }}>
      {/* A few books sticking up out of the crate, spines out. */}
      <Box sx={{ position: "absolute", left: 30, right: 30, bottom: 70, height: 34, display: "flex", alignItems: "flex-end", gap: "3px" }}>
        {["#5b2328", "#22402f", "#2a3552", "#4b3423", "#3f2743", "#1f4146", "#3e3d24"].map((c, i) => (
          <Box key={c} sx={{ flex: 1, height: [30, 24, 34, 20, 28, 32, 22][i], bgcolor: c, borderRadius: "1px 1px 0 0", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)" }} />
        ))}
      </Box>
      {/* The crate: three slats between two posts. */}
      <Box
        sx={(t) => {
          const w = t.palette.wood;
          const slat = `linear-gradient(180deg, ${w.top}, ${w.front})`;
          return {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 76,
            borderRadius: "3px",
            background: `${slat} 0 0 / 100% 22px no-repeat, ${slat} 0 27px / 100% 22px no-repeat, ${slat} 0 54px / 100% 22px no-repeat`,
            boxShadow: `0 8px 10px -6px rgba(30, 15, 5, 0.45), inset 10px 0 0 ${w.edge}, inset -10px 0 0 ${w.edge}`,
          };
        }}
      />
      {/* The sign, tacked on the front. */}
      <Box
        sx={{
          position: "absolute",
          left: "50%",
          bottom: 16,
          transform: "translateX(-50%) rotate(-2deg)",
          px: 1.5,
          py: 0.5,
          bgcolor: TALKER.card,
          color: TALKER.ink,
          borderRadius: "2px",
          boxShadow: "0 2px 3px rgba(20, 12, 4, 0.35)",
          fontFamily: HAND_FONT,
          fontWeight: 600,
          fontSize: "1.375rem",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {sign}
      </Box>
    </Box>
  );
}

export default function BargainBin({ sign, title, description, action }) {
  return (
    <Box data-testid="bargain-bin" sx={{ textAlign: "center", py: { xs: 5, md: 7 }, px: 2 }}>
      <Crate sign={sign} />
      <Typography variant="h3" component="h2" sx={{ fontSize: { xs: "1.5rem", md: "1.75rem" }, mb: 1 }}>
        {title}
      </Typography>
      {description ? (
        <Typography sx={{ color: "text.secondary", maxWidth: 420, mx: "auto", mb: action ? 2.5 : 0, lineHeight: 1.6 }}>{description}</Typography>
      ) : null}
      {action}
    </Box>
  );
}
