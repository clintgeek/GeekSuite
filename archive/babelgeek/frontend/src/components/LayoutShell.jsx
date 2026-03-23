import { Box, Container, Toolbar } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Outlet } from "react-router-dom";
import Footer from "./Footer";
import Navigation from "./Navigation";

const LayoutShell = () => (
  <Box
    sx={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      backgroundColor: "background.default",
      backgroundImage: (theme) =>
        `radial-gradient(circle at top left, ${alpha(theme.palette.primary.main, 0.12)} 0%, transparent 40%),
         radial-gradient(circle at 120% 0%, ${alpha(theme.palette.secondary.main, 0.12)} 0%, transparent 45%)`
    }}
  >
    <Navigation />
    <Toolbar sx={{ minHeight: { xs: 64, md: 80 } }} /> {/* Keeps content below the fixed app bar */}
    <Container component="main" maxWidth="lg" sx={{ flex: 1, py: { xs: 4, md: 6 } }}>
      <Outlet />
    </Container>
    <Footer />
  </Box>
);

export default LayoutShell;
