import EggIcon from "@mui/icons-material/EggOutlined";
import GroupIcon from "@mui/icons-material/GroupsOutlined";
import BirdIcon from "@mui/icons-material/PetsOutlined";
import { useState } from "react";
import { Box, Button, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useQuery } from "@apollo/client";
import { motion } from "framer-motion";
import { Link as RouterLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import SummaryCards from "../components/home/SummaryCards";
import RecentActivity from "../components/home/RecentActivity";
import QuickHarvestSheet from "../components/QuickHarvestSheet";
import { HARVEST_FAB_CLEARANCE } from "../utils/harvestDefaults";
import TodayLine from "../components/home/TodayLine";
import useHomeData from "../hooks/useHomeData";
import { GET_LOCATIONS } from "../graphql/queries";
import { GeekLoadError, geekLayout } from "@geeksuite/ui";

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
  // Only for the thumb-zone harvest sheet: the same location list the Egg log
  // hands `QuickHarvestEntry`, so the sheet can default and label the pen.
  const { data: locData } = useQuery(GET_LOCATIONS);
  const locations = locData?.flockLocations || [];
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  // Held here so the "Today" line can open the same sheet the FAB opens.
  const [harvestOpen, setHarvestOpen] = useState(false);
  const locationName = (id) => locations.find((l) => l.id === id)?.name ?? null;

  const rawName = user?.name || user?.username || user?.email?.split("@")[0] || "";
  const displayName = rawName
    ? rawName.charAt(0).toUpperCase() + rawName.split(/[._@\s]/)[0].slice(1)
    : "Caretaker";

  return (
    <Box component={motion.div} variants={stagger} initial="hidden" animate="show" sx={{ pb: HARVEST_FAB_CLEARANCE }}>
      {/* The "Log eggs" FAB and the sheet it opens. Renders nothing at `md`+. */}
      <QuickHarvestSheet locations={locations} open={harvestOpen} onOpenChange={setHarvestOpen} />

      {/* Greeting header — left-hung, extra vertical air */}
      <motion.div variants={fadeUp}>
        <Box sx={{ mb: 3, maxWidth: 520 }}>
          <Typography variant="overline" sx={{ color: "text.muted", mb: 1, display: "block" }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </Typography>
          <Typography variant="h1" component="h1" sx={{ mb: 1.5, fontSize: { xs: "2rem", sm: "2.75rem" } }}>
            {getGreeting()}, {displayName}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Here's what's happening with your flock today.
          </Typography>
        </Box>
      </motion.div>

      {/* Did anyone collect today? Hidden while the reads fail: the load error
          below says so, and "not logged yet" would be a guess. */}
      {!homeData.error && !homeData.loading && (
        <motion.div variants={fadeUp}>
          <TodayLine
            today={homeData.today}
            locationName={locationName}
            isMobile={isMobile}
            onLog={() => setHarvestOpen(true)}
          />
        </motion.div>
      )}

      {/* Primary CTA — promoted above the fold, full visual weight. Below `md`
          the thumb-zone FAB *is* this action (it opens the harvest sheet in
          place instead of routing away), so the button stands down. */}
      <motion.div variants={fadeUp}>
        <Box sx={{ mb: 4, maxWidth: 320, display: { xs: "none", md: "block" } }}>
          <Button
            component={RouterLink}
            to="/egg-log"
            variant="contained"
            color="primary"
            size="large"
            startIcon={<EggIcon />}
            sx={{ px: 4, py: 1.25, display: { xs: "none", md: "inline-flex" } }}
          >
            Log today's eggs
          </Button>
          {/* The phone's tab bar already has Birds and Groups. */}
          <Stack direction="row" spacing={1.5} sx={{ mt: 2, display: { xs: "none", md: "flex" } }}>
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
                  minHeight: 44,
                  "&:hover": { color: "primary.main" }
                }}
              >
                {label}
              </Button>
            ))}
          </Stack>
        </Box>
      </motion.div>

      {/* A failed read must not draw as zeros ("0 eggs a day"): the cards and
          the activity list give way to one error with Retry. */}
      {homeData.error ? (
        <Box sx={{ mb: 4 }}>
          <GeekLoadError
            what="your flock's numbers"
            error={homeData.error}
            onRetry={homeData.refetch}
            data-testid="home-load-error"
          />
        </Box>
      ) : (
        <>
        {/* Summary cards — asymmetric: first card wider */}
        <motion.div variants={fadeUp}>
          <SummaryCards stats={homeData.stats} />
        </motion.div>

        {/* Activity — full width, no dead right column */}
        <motion.div variants={fadeUp}>
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 1.5 }}>
              <Typography variant="h4">Recent activity</Typography>
              <Typography variant="caption" color="text.muted">
                Last 8 events
              </Typography>
            </Box>
            <RecentActivity items={homeData.items} />
          </Box>
        </motion.div>
        </>
      )}

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
            <Typography variant="overline" sx={{ color: "text.muted", display: "block", mb: 0.25 }}>
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
    </Box>
  );
};

export default HomePage;
