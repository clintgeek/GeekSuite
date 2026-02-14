import CheckCircleIcon from "@mui/icons-material/CheckCircleOutlined";
import LaunchIcon from "@mui/icons-material/ArrowForward";
import { Box, Button, Card, CardActions, CardContent, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

const highlights = [
  "Quickly log egg production and see trends at a glance.",
  "Manage birds, groups, and locations with an intuitive UI.",
  "Lightweight API and auth scaffolding to get you integrated fast."
];

const HeroCard = () => (
  <Card sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
    <Box
      sx={{
        p: { xs: 3, md: 4 },
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`
      }}
    >
      <Typography variant="overline" sx={{ color: "text.disabled", display: "block", mb: 1 }}>
        Flock management made simple
      </Typography>
      <Typography variant="h3" gutterBottom>
        Manage your flock with FlockGeek
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Log eggs, track birds and groups, and surface recent events — all in one place. Tailor the
        app to your workflow and get back to the flock.
      </Typography>
    </Box>
    <CardContent sx={{ flexGrow: 1 }}>
      <Stack spacing={1.5}>
        {highlights.map((item) => (
          <Stack key={item} direction="row" spacing={1.5} alignItems="flex-start">
            <CheckCircleIcon sx={{ mt: "2px", color: "secondary.main", fontSize: 18 }} />
            <Typography variant="body2" color="text.secondary">
              {item}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </CardContent>
    <CardActions sx={{ px: { xs: 3, md: 4 }, pb: 4 }}>
      <Button
        variant="contained"
        color="primary"
        endIcon={<LaunchIcon />}
        href="/README.md"
      >
        Quick start
      </Button>
    </CardActions>
  </Card>
);

export default HeroCard;
