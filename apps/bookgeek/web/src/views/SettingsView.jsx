/**
 * BookGeek settings view — the "profile" pane behind the sidebar's Settings.
 *
 * Real MUI page (DOCS/MOBILE_UI_PLAN.md §3.4): Account, Send to device,
 * Default shelf, Shelves, Library maintenance, AI — each a caption-labeled
 * section separated by dividers. Sign-out and "back to library" are gone;
 * the top bar's account menu owns both. State stays in `App`; this
 * component only renders what it is given.
 */
import React from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { loginRedirect } from "@geeksuite/auth";
import { GeekEmptyState } from "@geeksuite/ui";
import { displayNameFrom, initialsFrom, secondaryFrom } from "../utils/userDisplay";

/** Uppercase, letter-spaced section label — the "h3" of this page without
 * borrowing the display serif (identity type is reserved for >=18px). */
function SectionLabel({ children }) {
  return (
    <Typography
      component="h3"
      variant="overline"
      sx={{ display: "block", color: "text.muted", letterSpacing: "0.08em", fontWeight: 600 }}
    >
      {children}
    </Typography>
  );
}

function SpinnerButton({ loading, children, ...props }) {
  return (
    <Button {...props} disabled={props.disabled || loading}>
      {loading ? <CircularProgress size={20} color="inherit" sx={{ mr: children ? 1 : 0 }} /> : null}
      {children}
    </Button>
  );
}

export default function SettingsView({
  aiStatus,
  aiStatusError,
  aiStatusLoading,
  authError,
  authLoading,
  calibreRescanError,
  calibreRescanLoading,
  calibreRescanSummary,
  customShelves,
  defaultShelfPref,
  deviceWordInput,
  goodreadsDedupeError,
  goodreadsDedupeLoading,
  goodreadsDedupeSummary,
  goodreadsFile,
  goodreadsImportError,
  goodreadsImportLoading,
  goodreadsImportSummary,
  handleAddCustomShelf,
  handleCalibreRescan,
  handleCheckAiStatus,
  handleDeleteCustomShelf,
  handleGoodreadsDedupe,
  handleGoodreadsFileChange,
  handleGoodreadsImport,
  handleLogout, // eslint-disable-line no-unused-vars -- top bar's account menu owns sign-out now
  handleSaveDefaultShelf,
  handleSaveProfile,
  kindleEmailInput,
  newShelfLabel,
  prefSaveError,
  prefSaveLoading,
  prefSaveMessage,
  profileError,
  profileLoading,
  profileMessage,
  setActiveView,
  setAuthError,
  setAuthLoading,
  setDefaultShelfPref,
  setDeviceWordInput,
  setKindleEmailInput,
  setNewShelfLabel,
  setShelfFilter, // eslint-disable-line no-unused-vars -- was only used by the removed "back to library" button
  shelfEditError,
  shelfEditLoading,
  shelves,
  user,
}) {
  if (!user) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", px: 2 }}>
        <GeekEmptyState
          title="Sign in to manage your account"
          description="Sign in with your baseGeek account to enable BookGeek features tied to your profile: Kindle send-to-device, shelves, and library preferences."
          action={
            <>
              <Button
                variant="contained"
                disabled={authLoading}
                onClick={() => {
                  setAuthLoading(true);
                  setAuthError(null);
                  loginRedirect("bookgeek", window.location.href, "login");
                }}
              >
                {authLoading ? "Redirecting…" : "Sign in"}
              </Button>
              <Button variant="text" onClick={() => setActiveView("library")}>
                Cancel
              </Button>
            </>
          }
        >
          {authError ? (
            <Alert severity="error" variant="standard" sx={{ mt: 2, textAlign: "left" }}>
              {authError}
            </Alert>
          ) : null}
        </GeekEmptyState>
      </Box>
    );
  }

  const nonAllShelves = shelves.filter((s) => s.id !== "all");

  return (
    <Box sx={{ maxWidth: 720, mx: "auto", px: 2, pb: 4 }}>
      <Stack divider={<Divider sx={{ my: 3 }} />} spacing={3}>
        {/* Account */}
        <Stack spacing={1.5}>
          <SectionLabel>Account</SectionLabel>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar sx={{ width: 44, height: 44, bgcolor: "primary.main", color: "primary.contrastText" }}>
              {initialsFrom(user)}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 500 }} noWrap>
                {displayNameFrom(user)}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }} noWrap>
                {secondaryFrom(user)}
              </Typography>
            </Box>
          </Stack>
        </Stack>

        {/* Send to device */}
        <Box component="form" id="settings-send-to-device-form" onSubmit={handleSaveProfile}>
          <Stack spacing={1.5}>
            <SectionLabel>Send to device</SectionLabel>
            <TextField
              label="Kindle email address"
              type="email"
              placeholder="yourname@kindle.com"
              value={kindleEmailInput}
              onChange={(e) => setKindleEmailInput(e.target.value)}
              fullWidth
            />
            <TextField
              label="Device word"
              placeholder="mustang"
              value={deviceWordInput}
              onChange={(e) => setDeviceWordInput(e.target.value.toLowerCase())}
              helperText="Used on your e-reader at /download-basket to fetch your basket."
              fullWidth
            />
            {profileError ? <FormHelperText error>{profileError}</FormHelperText> : null}
            {profileMessage ? (
              <Alert severity="success" variant="standard">
                {profileMessage}
              </Alert>
            ) : null}
            <Box>
              <SpinnerButton type="submit" variant="contained" loading={profileLoading}>
                Save
              </SpinnerButton>
            </Box>
          </Stack>
        </Box>

        {/* Default shelf */}
        <Stack spacing={1.5}>
          <SectionLabel>Default shelf</SectionLabel>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Choose which shelf loads by default when you open BookGeek.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <FormControl sx={{ minWidth: 220 }}>
              <InputLabel id="default-shelf-label">Default shelf</InputLabel>
              <Select
                labelId="default-shelf-label"
                label="Default shelf"
                value={defaultShelfPref}
                onChange={(e) => setDefaultShelfPref(e.target.value)}
              >
                {shelves.map((shelf) => (
                  <MenuItem key={shelf.id} value={shelf.id}>
                    {shelf.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <SpinnerButton
              variant="contained"
              loading={prefSaveLoading}
              onClick={handleSaveDefaultShelf}
            >
              Save
            </SpinnerButton>
          </Stack>
          {prefSaveError ? <FormHelperText error>{prefSaveError}</FormHelperText> : null}
          {prefSaveMessage ? (
            <Alert severity="success" variant="standard">
              {prefSaveMessage}
            </Alert>
          ) : null}
        </Stack>

        {/* Shelves */}
        <Stack spacing={1.5}>
          <SectionLabel>Shelves</SectionLabel>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Add your own shelves alongside the built-in ones. They show in the sidebar with a
            book icon.
          </Typography>
          {customShelves.length > 0 ? (
            <List disablePadding>
              {customShelves.map((shelf) => (
                <ListItem
                  key={shelf.id}
                  disableGutters
                  sx={{ minHeight: 44, py: 0.5 }}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={`Remove shelf ${shelf.label}`}
                      title="Remove shelf"
                      onClick={() => handleDeleteCustomShelf(shelf.id)}
                      disabled={shelfEditLoading}
                      sx={{ width: 44, height: 44 }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      bgcolor: "shelf.custom",
                      mr: 1.5,
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="body2">{shelf.label}</Typography>
                </ListItem>
              ))}
            </List>
          ) : null}
          <Box component="form" id="settings-add-shelf-form" onSubmit={handleAddCustomShelf}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
              <TextField
                label="New shelf"
                value={newShelfLabel}
                onChange={(e) => setNewShelfLabel(e.target.value)}
                inputProps={{ maxLength: 40 }}
                sx={{ minWidth: 220 }}
              />
              <SpinnerButton
                type="submit"
                variant="contained"
                loading={shelfEditLoading}
                disabled={!newShelfLabel.trim()}
              >
                Add
              </SpinnerButton>
            </Stack>
          </Box>
          {shelfEditError ? <FormHelperText error>{shelfEditError}</FormHelperText> : null}
        </Stack>

        {/* Library maintenance */}
        <Stack spacing={1.5}>
          <SectionLabel>Library maintenance</SectionLabel>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Stack spacing={1} sx={{ height: "100%" }}>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Goodreads import
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Upload your Goodreads library CSV export to import ratings, shelves, and read
                  dates onto your existing books.
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Button variant="outlined" component="label">
                    Choose file…
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      hidden
                      onChange={handleGoodreadsFileChange}
                    />
                  </Button>
                  {goodreadsFile ? (
                    <Typography variant="body2" sx={{ color: "text.secondary" }} noWrap>
                      {goodreadsFile.name}
                    </Typography>
                  ) : null}
                </Stack>
                <Box>
                  <SpinnerButton
                    variant="contained"
                    loading={goodreadsImportLoading}
                    disabled={!goodreadsFile}
                    onClick={handleGoodreadsImport}
                  >
                    Import
                  </SpinnerButton>
                </Box>
                {goodreadsImportError ? (
                  <FormHelperText error>{goodreadsImportError}</FormHelperText>
                ) : null}
                {goodreadsImportSummary ? (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Imported: {goodreadsImportSummary.updated ?? 0} updated,{" "}
                    {goodreadsImportSummary.created ?? 0} created,{" "}
                    {goodreadsImportSummary.matched ?? 0} matched to existing,{" "}
                    {goodreadsImportSummary.skippedNoMatch ?? 0} with no usable data.
                  </Typography>
                ) : null}
              </Stack>
            </Grid>

            <Grid item xs={12} md={4}>
              <Stack spacing={1} sx={{ height: "100%" }}>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Goodreads dedupe
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Merge Goodreads-only records into the matching primary book already in your
                  library.
                </Typography>
                <Box>
                  <SpinnerButton
                    variant="contained"
                    loading={goodreadsDedupeLoading}
                    onClick={handleGoodreadsDedupe}
                  >
                    Merge duplicates
                  </SpinnerButton>
                </Box>
                {goodreadsDedupeError ? (
                  <FormHelperText error>{goodreadsDedupeError}</FormHelperText>
                ) : null}
                {goodreadsDedupeSummary ? (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Merged {goodreadsDedupeSummary.merged ?? 0} of{" "}
                    {goodreadsDedupeSummary.candidates ?? 0} Goodreads-only books; updated{" "}
                    {goodreadsDedupeSummary.updatedPrimary ?? 0} primaries;{" "}
                    {goodreadsDedupeSummary.skippedNoPrimary ?? 0} skipped with no primary match.
                  </Typography>
                ) : null}
              </Stack>
            </Grid>

            <Grid item xs={12} md={4}>
              <Stack spacing={1} sx={{ height: "100%" }}>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  Calibre rescan
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Walks your on-disk BookGeek library and attaches files to existing books,
                  marking them as owned, or creates new records if nothing matches.
                </Typography>
                <Box>
                  <SpinnerButton
                    variant="contained"
                    loading={calibreRescanLoading}
                    onClick={handleCalibreRescan}
                  >
                    Rescan library
                  </SpinnerButton>
                </Box>
                {calibreRescanError ? (
                  <FormHelperText error>{calibreRescanError}</FormHelperText>
                ) : null}
                {calibreRescanSummary ? (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Scanned {calibreRescanSummary.rows ?? 0} entries; attached to{" "}
                    {calibreRescanSummary.attachedExisting ?? 0} existing books; created{" "}
                    {calibreRescanSummary.createdNew ?? 0} new; skipped{" "}
                    {calibreRescanSummary.skippedNoFiles ?? 0} with no files.
                  </Typography>
                ) : null}
              </Stack>
            </Grid>
          </Grid>
        </Stack>

        {/* AI */}
        <Stack spacing={1.5}>
          <SectionLabel>AI</SectionLabel>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <SpinnerButton variant="outlined" loading={aiStatusLoading} onClick={handleCheckAiStatus}>
              Check
            </SpinnerButton>
            {aiStatus ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                AI: <strong>{aiStatus.enabled ? "enabled" : "disabled"}</strong> · key:{" "}
                {aiStatus.apiKeyConfigured ? "configured" : "missing"}
              </Typography>
            ) : null}
          </Stack>
          {aiStatusError ? <FormHelperText error>{aiStatusError}</FormHelperText> : null}
        </Stack>
      </Stack>
    </Box>
  );
}
