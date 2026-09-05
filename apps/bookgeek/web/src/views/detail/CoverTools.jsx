/**
 * CoverTools — the ✎ cover panel, now a sheet reached from More.
 *
 * Same three jobs as the old inline panel: upload a file, search Open Library
 * for candidates and apply one, or remove the current cover. Handlers are
 * unchanged; only the surface and the target sizes are new.
 */
import React from "react";
import { Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { GeekSheet } from "@geeksuite/ui";
import { alpha } from "@mui/material/styles";

export default function CoverTools({
  open,
  onClose,
  coverApplyLoadingId,
  coverDeleteLoading,
  coverSearchError,
  coverSearchLoading,
  coverSearchQuery,
  coverSearchResults,
  coverUploadFile,
  coverUploadLoading,
  handleApplyCoverCandidate,
  handleCoverFileChange,
  handleDeleteCoverForSelectedBook,
  handleSearchCoversForSelectedBook,
  handleUploadCoverForSelectedBook,
  setCoverSearchQuery,
}) {
  const candidates = Array.isArray(coverSearchResults) ? coverSearchResults.slice(0, 9) : [];

  return (
    <GeekSheet open={open} onClose={onClose} title="Change cover" maxWidth="sm">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 2 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <Button variant="outlined" component="label">
            Choose image
            <input type="file" accept="image/*" hidden onChange={handleCoverFileChange} />
          </Button>
          <Button
            variant="contained"
            onClick={handleUploadCoverForSelectedBook}
            disabled={coverUploadLoading || !coverUploadFile}
          >
            {coverUploadLoading ? "Uploading…" : "Upload cover"}
          </Button>
          <Button color="error" onClick={handleDeleteCoverForSelectedBook} disabled={coverDeleteLoading}>
            {coverDeleteLoading ? "Removing…" : "Remove"}
          </Button>
        </Box>
        {coverUploadFile ? (
          <Typography variant="caption" sx={{ color: "text.muted" }}>
            {coverUploadFile.name}
          </Typography>
        ) : null}

        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField
            fullWidth
            size="small"
            label="Search covers"
            value={coverSearchQuery}
            onChange={(e) => setCoverSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearchCoversForSelectedBook();
              }
            }}
          />
          <Button
            variant="outlined"
            onClick={handleSearchCoversForSelectedBook}
            disabled={coverSearchLoading}
            sx={{ flexShrink: 0 }}
          >
            {coverSearchLoading ? "Searching…" : "Search"}
          </Button>
        </Box>

        {coverSearchError ? (
          <Typography variant="caption" sx={{ color: "error.main" }}>
            {coverSearchError}
          </Typography>
        ) : null}

        {candidates.length > 0 ? (
          <Box>
            <Typography variant="caption" sx={{ color: "text.muted", display: "block", mb: 1 }}>
              Choose a cover
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "repeat(3, 1fr)", sm: "repeat(4, 1fr)" },
                gap: 1,
              }}
            >
              {candidates.map((candidate) => {
                const key =
                  typeof candidate.id === "string"
                    ? candidate.id
                    : `cover-${String(candidate.coverId ?? "")}`;
                const isApplying = coverApplyLoadingId === key;
                return (
                  <Box
                    key={key}
                    component="button"
                    type="button"
                    onClick={() => handleApplyCoverCandidate(candidate)}
                    disabled={Boolean(coverApplyLoadingId)}
                    sx={{
                      position: "relative",
                      p: 0,
                      cursor: "pointer",
                      overflow: "hidden",
                      borderRadius: 1,
                      border: (t) => `1px solid ${t.palette.divider}`,
                      bgcolor: "background.default",
                      minHeight: 44,
                    }}
                  >
                    <Box
                      component="img"
                      src={candidate.thumbUrl}
                      alt={candidate.title || "Cover option"}
                      sx={{ display: "block", width: "100%", height: 112, objectFit: "cover" }}
                    />
                    {isApplying ? (
                      <Box
                        sx={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor: (t) => alpha(t.palette.common.black, 0.6),
                          color: "common.white",
                        }}
                      >
                        <CircularProgress size={20} color="inherit" />
                      </Box>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          </Box>
        ) : null}
      </Box>
    </GeekSheet>
  );
}
