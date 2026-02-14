import EggIcon from "@mui/icons-material/EggOutlined";
import GroupIcon from "@mui/icons-material/GroupsOutlined";
import BirdIcon from "@mui/icons-material/PetsOutlined";
import { Box, Button, Stack, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import SummaryCards from "../components/home/SummaryCards";
import RecentActivity from "../components/home/RecentActivity";
import useHomeData from "../hooks/useHomeData";

const quickLinks = [
  { label: "Log eggs", to: "/egg-log", icon: <EggIcon /> },
  { label: "View birds", to: "/birds", icon: <BirdIcon /> },
  { label: "Groups", to: "/groups", icon: <GroupIcon /> }
];

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } }
};
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } }
};

const HomePage = () => {
  const { user } = useAuth();
  const homeData = useHomeData();

  const rawName = user?.name || user?.username || user?.email?.split("@")[0] || "";
  const displayName = rawName
    ? rawName.charAt(0).toUpperCase() + rawName.split(/[._@\s]/)[0].slice(1)
    : "Caretaker";

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      {/* Greeting header — left-hung, extra vertical air */}
      <motion.div variants={fadeUp}>
        <Box sx={{ mb: 5, maxWidth: 520 }}>
          <Typography variant="overline" sx={{ color: "text.disabled", mb: 1, display: "block" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Typography>
          <Typography variant="h1" component="h1" sx={{ mb: 1.5 }}>
            {getGreeting()}, {displayName}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Here's what's happening with your flock today.
          </Typography>
        </Box>
      </motion.div>

      {/* Primary CTA — promoted above the fold, full visual weight */}
      <motion.div variants={fadeUp}>
        <Box sx={{ mb: 4, maxWidth: 320 }}>
          <Button
            component={RouterLink}
            to="/egg-log"
            variant="contained"
            color="primary"
            size="large"
            startIcon={<EggIcon />}
            sx={{ px: 4, py: 1.25 }}
          >
            Log today's eggs
          </Button>
          <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
            {quickLinks.filter(l => l.to !== "/egg-log").map(({ label, to, icon }) => (
              <Button
                key={label}
                component={RouterLink}
                to={to}
                variant="text"
                color="inherit"
                size="small"
                startIcon={icon}
                sx={{
                  color: "text.secondary",
                  px: 1,
                  "&:hover": { color: "primary.main" }
                }}
              >
                {label}
              </Button>
            ))}
          </Stack>
        </Box>
      </motion.div>

      {/* Summary cards — asymmetric: first card wider */}
      <motion.div variants={fadeUp}>
        <SummaryCards stats={homeData.stats} />
      </motion.div>

      {/* Activity — full width, no dead right column */}
      <motion.div variants={fadeUp}>
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 1.5 }}>
            <Typography variant="h4">Recent activity</Typography>
            <Typography variant="caption" color="text.disabled">
              Last 8 events
            </Typography>
          </Box>
          <RecentActivity items={homeData.items} />
        </Box>
      </motion.div>

      {/* Seasonal note — quiet inline footer, not a card */}
      <motion.div variants={fadeUp}>
        <Box
          sx={{
            mt: 4,
            pt: 2.5,
            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
            display: "flex",
            gap: 1.5,
            alignItems: "flex-start",
            maxWidth: 600
          }}
        >
          <Box sx={{ width: 3, minHeight: 32, bgcolor: "secondary.main", borderRadius: 1, flexShrink: 0, mt: 0.25 }} />
          <Box>
            <Typography variant="overline" sx={{ color: "text.disabled", display: "block", mb: 0.25 }}>
              Seasonal note
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
              {new Date().getMonth() >= 10 || new Date().getMonth() <= 1
                ? "Shorter days mean lower production. Keep an eye on lighting schedules and feed intake."
                : new Date().getMonth() <= 3
                ? "Spring is peak laying season. Watch for broody hens and keep nesting boxes clean."
                : new Date().getMonth() <= 6
                ? "Summer heat can stress flocks. Ensure shade, ventilation, and fresh water."
                : "Fall molt season approaching. Expect a temporary dip in egg production."}
            </Typography>
          </Box>
        </Box>
      </motion.div>
    </motion.div>
  );
};

export default HomePage;
