/**
 * BookGeek book detail — the Pocket Pass sheet (DOCS/MOBILE_UI_PLAN.md §3.2).
 *
 * Below `md` this is a full-height `GeekSheet` that slides up and swipes away;
 * at `md`+ the same component renders as a centered dialog with the hero and
 * progress on the left and the metadata on the right. The hand-rolled
 * `fixed inset-0` overlay and its hardcoded slate are gone; every color is a
 * theme token, so light mode is a real mode.
 *
 * The ~40 rows of 11px text-buttons collapsed into a sticky action bar —
 * Read · Send · Shelf · ⋯ — with the rest moved into the More sheet, the shelf
 * sheet, the cover sheet, the download sheet and the edit dialog. Behavior is
 * unchanged: every handler, request and state transition the old overlay
 * performed still happens, and all state still lives in `App.jsx`.
 */
import React, { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  MenuBook as ReadIcon,
  MoreHoriz as MoreIcon,
  Send as SendIcon,
  Bookmarks as ShelfIcon,
} from "@mui/icons-material";
import { GeekDialog, GeekSheet } from "@geeksuite/ui";
import { formatDescriptionForDisplay } from "../utils/bookDisplay";
import { hasEpubFile } from "./detail/bookFacts";
import CoverTools from "./detail/CoverTools";
import DetailHero from "./detail/DetailHero";
import DownloadSheet from "./detail/DownloadSheet";
import EditMetadataDialog from "./detail/EditMetadataDialog";
import MetadataList from "./detail/MetadataList";
import MoreSheet from "./detail/MoreSheet";
import ProgressRow from "./detail/ProgressRow";
import ShelfSheet from "./detail/ShelfSheet";

/** The four sticky-bar buttons share one shape: 44px, 12px label, 16px icon. */
const BAR_BUTTON_SX = {
  minWidth: 0,
  minHeight: 44,
  px: 0.5,
  py: 0.5,
  flexDirection: "column",
  gap: 0.25,
  fontSize: 12,
  lineHeight: 1.2,
  textTransform: "none",
  "& .MuiSvgIcon-root": { fontSize: 16 },
};

export default function BookDetailModal({
  basketBookIds,
  beginEditForSelectedBook,
  cancelEditForSelectedBook,
  closeBookModal,
  convertingFormat,
  coverApplyLoadingId,
  coverDeleteLoading,
  coverSearchError,
  coverSearchLoading,
  coverSearchQuery,
  coverSearchResults,
  coverUploadFile,
  coverUploadLoading,
  deleteConfirmOpen,
  deleteError,
  deleteIncludeFiles,
  deleteLoading,
  downloadOpen,
  editDraft,
  editError,
  editMode,
  editSaving,
  enrichError,
  enrichLoading,
  enrichSummary,
  handleApplyCoverCandidate,
  handleCoverFileChange,
  handleDeleteCoverForSelectedBook,
  handleDeleteSelectedBook,
  handleDownload,
  handleEnrichSelectedBook,
  handleSaveEditForSelectedBook,
  handleSearchCoversForSelectedBook,
  handleSendToKindle,
  handleUpdateProgress,
  handleUpdateShelf,
  handleUploadBookFile,
  handleUploadCoverForSelectedBook,
  handleUploadFileChange,
  progressDraft,
  progressError,
  progressSavingId,
  scheduleProgressCommit,
  selectedBook,
  sendToKindleError,
  sendToKindleLoading,
  sendToKindleStatus,
  setCoverSearchQuery,
  setDeleteConfirmOpen,
  setDeleteError,
  setDeleteIncludeFiles,
  setDownloadOpen,
  setEditDraft,
  setProgressDraft,
  setReaderError,
  setReaderOpen,
  setShowCoverTools,
  shelfSavingId,
  shelves,
  showCoverTools,
  toggleBasket,
  uploadError,
  uploadFile,
  uploadLoading,
  uploadMessage,
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  const [moreOpen, setMoreOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  if (!selectedBook) return null;

  const epubAvailable = hasEpubFile(selectedBook);
  const description = formatDescriptionForDisplay(selectedBook.description);

  const closeDeleteConfirm = () => {
    if (deleteLoading) return;
    setDeleteConfirmOpen(false);
    setDeleteError(null);
    setDeleteIncludeFiles(false);
  };

  const statusLines = [
    sendToKindleError ? { key: "kindle-error", tone: "error.main", text: sendToKindleError } : null,
    sendToKindleStatus
      ? {
        key: "kindle-status",
        tone: "success.main",
        text: `Sending to ${sendToKindleStatus.kindleEmail}`,
      }
      : null,
    enrichError ? { key: "enrich-error", tone: "error.main", text: enrichError } : null,
    enrichSummary ? { key: "enrich-summary", tone: "success.main", text: enrichSummary } : null,
    !epubAvailable
      ? { key: "no-epub", tone: "text.muted", text: "No EPUB yet — attach or convert one from ⋯" }
      : null,
  ].filter(Boolean);

  return (
    <>
      <GeekSheet
        open={Boolean(selectedBook)}
        onClose={closeBookModal}
        snap="full"
        mode="auto"
        maxWidth="md"
       
        headerSx={{ p: 0 }}
        bodySx={{ p: 0, display: "flex", flexDirection: "column" }}
        title={
          <Typography
            variant="h3"
            component="p"
            sx={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
            }}
          >
            {selectedBook.title || "Book details"}
          </Typography>
        }
      >
        <Box
          sx={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" },
            alignItems: "start",
            columnGap: { md: 2 },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <DetailHero
              book={selectedBook}
              shelves={shelves}
              onClose={closeBookModal}
              showClose={isPhone}
            />
            <ProgressRow
              book={selectedBook}
              progressDraft={progressDraft}
              progressError={progressError}
              progressSavingId={progressSavingId}
              scheduleProgressCommit={scheduleProgressCommit}
              setProgressDraft={setProgressDraft}
              handleUpdateProgress={handleUpdateProgress}
            />
          </Box>

          <Box sx={{ minWidth: 0, pt: { md: 3 } }}>
            <MetadataList book={selectedBook} />

            {description ? (
              <Box sx={{ px: 2, pb: 2 }}>
                <Typography
                  variant="caption"
                  component="h3"
                  sx={{
                    display: "block",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                    color: "text.muted",
                    mb: 0.5,
                  }}
                >
                  Description
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: "pre-wrap",
                    color: "text.primary",
                    ...(descriptionExpanded
                      ? {}
                      : {
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }),
                  }}
                >
                  {description}
                </Typography>
                <Button
                  size="small"
                  aria-expanded={descriptionExpanded}
                  onClick={() => setDescriptionExpanded((v) => !v)}
                  sx={{ mt: 0.5, px: 0, textTransform: "none" }}
                >
                  {descriptionExpanded ? "Show less" : "Read more"}
                </Button>
              </Box>
            ) : null}
          </Box>
        </Box>

        <Box
          sx={{
            position: "sticky",
            bottom: 0,
            zIndex: 2,
            bgcolor: alpha(theme.palette.background.paper, 0.94),
            backdropFilter: "blur(10px)",
            borderTop: `1px solid ${theme.palette.divider}`,
            px: 2,
            pt: 1,
            pb: "calc(8px + env(safe-area-inset-bottom))",
          }}
        >
          {statusLines.length > 0 ? (
            <Box sx={{ mb: 0.75 }}>
              {statusLines.map((line) => (
                <Typography
                  key={line.key}
                  variant="caption"
                  sx={{ display: "block", color: line.tone }}
                >
                  {line.text}
                </Typography>
              ))}
            </Box>
          ) : null}

          <Box sx={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr .7fr", gap: 1 }}>
            <Button
              variant="contained"
              color="primary"
              disabled={!epubAvailable}
              onClick={() => {
                setReaderError(null);
                setReaderOpen(true);
              }}
              sx={BAR_BUTTON_SX}
            >
              <ReadIcon />
              Read
            </Button>
            <Button
              variant="outlined"
              disabled={sendToKindleLoading}
              onClick={() => handleSendToKindle(selectedBook)}
              sx={BAR_BUTTON_SX}
            >
              <SendIcon />
              {sendToKindleLoading ? "Sending…" : "Send"}
            </Button>
            <Button variant="outlined" onClick={() => setShelfOpen(true)} sx={BAR_BUTTON_SX}>
              <ShelfIcon />
              Shelf
            </Button>
            <Button
              variant="outlined"
              aria-label="More actions"
              onClick={() => setMoreOpen(true)}
              sx={BAR_BUTTON_SX}
            >
              <MoreIcon />
            </Button>
          </Box>
        </Box>
      </GeekSheet>

      <ShelfSheet
        open={shelfOpen}
        onClose={() => setShelfOpen(false)}
        book={selectedBook}
        shelves={shelves}
        shelfSavingId={shelfSavingId}
        handleUpdateShelf={handleUpdateShelf}
      />

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        book={selectedBook}
        basketBookIds={basketBookIds}
        toggleBasket={toggleBasket}
        beginEditForSelectedBook={beginEditForSelectedBook}
        handleEnrichSelectedBook={handleEnrichSelectedBook}
        enrichLoading={enrichLoading}
        enrichError={enrichError}
        enrichSummary={enrichSummary}
        onChangeCover={() => setShowCoverTools(true)}
        onDownload={() => setDownloadOpen(true)}
        convertingFormat={convertingFormat}
        handleUploadFileChange={handleUploadFileChange}
        handleUploadBookFile={handleUploadBookFile}
        uploadFile={uploadFile}
        uploadLoading={uploadLoading}
        uploadError={uploadError}
        uploadMessage={uploadMessage}
        onDelete={() => {
          setDeleteError(null);
          setDeleteConfirmOpen(true);
        }}
      />

      <CoverTools
        open={Boolean(showCoverTools)}
        onClose={() => setShowCoverTools(false)}
        coverApplyLoadingId={coverApplyLoadingId}
        coverDeleteLoading={coverDeleteLoading}
        coverSearchError={coverSearchError}
        coverSearchLoading={coverSearchLoading}
        coverSearchQuery={coverSearchQuery}
        coverSearchResults={coverSearchResults}
        coverUploadFile={coverUploadFile}
        coverUploadLoading={coverUploadLoading}
        handleApplyCoverCandidate={handleApplyCoverCandidate}
        handleCoverFileChange={handleCoverFileChange}
        handleDeleteCoverForSelectedBook={handleDeleteCoverForSelectedBook}
        handleSearchCoversForSelectedBook={handleSearchCoversForSelectedBook}
        handleUploadCoverForSelectedBook={handleUploadCoverForSelectedBook}
        setCoverSearchQuery={setCoverSearchQuery}
      />

      <DownloadSheet
        open={Boolean(downloadOpen)}
        onClose={() => setDownloadOpen(false)}
        book={selectedBook}
        convertingFormat={convertingFormat}
        handleDownload={handleDownload}
      />

      <EditMetadataDialog
        open={Boolean(editMode)}
        editDraft={editDraft}
        editError={editError}
        editSaving={editSaving}
        setEditDraft={setEditDraft}
        handleSaveEditForSelectedBook={handleSaveEditForSelectedBook}
        cancelEditForSelectedBook={cancelEditForSelectedBook}
      />

      <GeekDialog
        open={Boolean(deleteConfirmOpen)}
        onClose={closeDeleteConfirm}
        title="Delete this book?"
        mode="window"
        maxWidth="xs"
        disableClose={deleteLoading}
        keepSecondaryOnMobile
        primaryAction={
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteSelectedBook}
            disabled={deleteLoading}
          >
            {deleteLoading ? "Deleting…" : "Delete"}
          </Button>
        }
        secondaryAction={
          <Button onClick={closeDeleteConfirm} disabled={deleteLoading}>
            Cancel
          </Button>
        }
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          “{selectedBook.title || "Untitled"}” will be removed from your library. This cannot be
          undone.
        </Typography>
        <FormControlLabel
          sx={{ mt: 1 }}
          control={
            <Checkbox
              checked={Boolean(deleteIncludeFiles)}
              onChange={(e) => setDeleteIncludeFiles(e.target.checked)}
            />
          }
          label={<Typography variant="body2">Also delete files</Typography>}
        />
        {deleteError ? (
          <Typography variant="body2" sx={{ mt: 1, color: "error.main" }}>
            {deleteError}
          </Typography>
        ) : null}
      </GeekDialog>
    </>
  );
}
