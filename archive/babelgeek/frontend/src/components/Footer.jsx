import { Box, Container, Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

const Footer = () => (
  <Box
    component="footer"
    sx={{
      borderTop: (theme) => `1px solid ${theme.palette.divider}`,
      backgroundColor: "background.paper",
      mt: 8
    }}
  >
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 2, md: 4 }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
      >
        <Stack spacing={0.5}>
          <Typography variant="body2" color="text.secondary">
            © {new Date().getFullYear()} fussyMonkey.dev
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Crafted with consistent spacing, accessible contrast, and enterprise-ready patterns.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Link component={RouterLink} to="/" underline="hover" color="inherit">
            Home
          </Link>
          <Link
            href="https://github.com/clintgeek/geeksuite-style"
            underline="hover"
            color="inherit"
            target="_blank"
            rel="noopener"
          >
            Design System
          </Link>
        </Stack>
      </Stack>
    </Container>
  </Box>
);

export default Footer;
