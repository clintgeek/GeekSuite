import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "framer-motion";
import EggIcon from "@mui/icons-material/EggOutlined";
import HatchIcon from "@mui/icons-material/TrackChangesOutlined";
import BirdIcon from "@mui/icons-material/PetsOutlined";
import { GeekEmptyState } from "@geeksuite/ui";
import { displayCalendarDate } from "@geeksuite/utils";

const meta = {
  egg:   { icon: <EggIcon sx={{ fontSize: 16 }} />,   color: "#e8a735" },
  hatch: { icon: <HatchIcon sx={{ fontSize: 16 }} />, color: "#3d6b4f" },
  bird:  { icon: <BirdIcon sx={{ fontSize: 16 }} />,  color: "#d4910a" }
};

const listStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } }
};
const rowFade = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" } }
};

/**
 * Going-over 2026-09-05 — this list mixes two kinds of date, and used to
 * render both as an elapsed time.
 *
 * A bird's `createdAt` is a real instant, so "20m ago" is exactly right. An
 * egg harvest's `date` and a hatch's `setDate` are *calendar days*, stored at
 * UTC midnight: subtracting one from `now` measured the distance to midnight
 * UTC, which for a harvest logged this afternoon in US Central reads "19h ago"
 * — a made-up precision on a value that never had a time of day, and off by a
 * day west of UTC. Calendar-day rows now show the day itself.
 */
const formatInstant = (dateStr) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const diffMin = Math.floor((new Date() - d) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatTime = (dateStr, calendarDay = false) => {
  if (!dateStr) return "";
  if (calendarDay) return displayCalendarDate(dateStr, "en-US", { month: "short", day: "numeric" });
  return formatInstant(dateStr);
};

const RecentActivity = ({ items = [] }) => {
  if (!items.length) {
    return (
      <GeekEmptyState
        compact
        title="No recent activity yet."
        description="Log an egg or add a bird to get started."
      />
    );
  }

  return (
    <motion.ul
      variants={listStagger}
      initial="hidden"
      animate="show"
      style={{ listStyle: "none", margin: 0, padding: 0 }}
    >
      {items.map((it, i) => {
        const { icon, color } = meta[it.type] || meta.bird;
        return (
          <motion.li key={it.id} variants={rowFade}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 1.25,
                borderBottom: (theme) =>
                  i < items.length - 1 ? `1px solid ${theme.palette.divider}` : "none",
                "&:hover .activity-badge": {
                  transform: "scale(1.1)"
                }
              }}
            >
              <Box
                className="activity-badge"
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 0.75,
                  bgcolor: (theme) => alpha(color, 0.1),
                  color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "transform 0.2s ease"
                }}
              >
                {icon}
              </Box>
              <Typography variant="body2" sx={{ flex: 1, color: "text.primary" }}>
                {it.text}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.muted", flexShrink: 0, textTransform: "none", letterSpacing: 0 }}>
                {formatTime(it.occurredAt, it.calendarDay)}
              </Typography>
            </Box>
          </motion.li>
        );
      })}
    </motion.ul>
  );
};

export default RecentActivity;
