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
 * performed still happens. Its state lives in hooks/useBookDetail.js, mounted
 * per book by the `/book/:id` route (views/BookDetailRoute.jsx).
 */
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Download as DownloadIcon,
  MenuBook as ReadIcon,
  MoreHoriz as MoreIcon,
  Send as SendIcon,
  Bookmarks as ShelfIcon,
} from "@mui/icons-material";
import { GeekDialog, GeekSheet, useToast } from "@geeksuite/ui";
import { formatDescriptionForDisplay } from "../utils/bookDisplay";
import { hasEpubFile } from "./detail/bookFacts";
import { comicDownloadFormat, comicKind } from "../utils/comic";
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

/** The sheet's close as a little signboard (theme `palette.sign`). */
const CLOSE_SIGN_SX = {
  top: "calc(8px + env(safe-area-inset-top))",
  bgcolor: "sign.board",
  color: "sign.ink",
  border: (t) => `1px solid ${t.palette.sign.edge}`,
  boxShadow: "0 2px 4px rgba(20, 12, 4, 0.3)",
  "&:hover": { bgcolor: "sign.edge" },
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
  lastReadEditing = false,
  lastReadSaving = false,
  lastReadError = null,
  setLastReadEditing,
  enrichError,
  enrichLoading,
  enrichSummary,
  handleApplyCoverCandidate,
  handleCoverFileChange,
  handleDeleteCoverForSelectedBook,
  handleDeleteSelectedBook,
  handleDownload,
  // The library assistant's metadata draft (AI idea #4) — the button only
  // appears when `metadataDraftEnabled` says the Settings switch is on.
  handleDraftMetadata,
  handleEnrichSelectedBook,
  handleSaveEditForSelectedBook,
  handleSearchCoversForSelectedBook,
  handleSendToKindle,
  // The reader's Kindle address (profile), named in the confirm before a send.
  kindleEmail = null,
  handleUpdateProgress,
  handleUpdateShelf,
  handleSaveLastRead,
  // Rate from the hero (review 2026-11-18 #6): `rateBook` wrapped with the
  // grid's Undo toast. Absent → the stars stay text.
  onRate,
  handleUploadBookFile,
  handleUploadCoverForSelectedBook,
  handleUploadFileChange,
  metadataDraftEnabled = false,
  metadataDraftError = null,
  metadataDraftLoading = false,
  metadataDraftProvenance = null,
  progressDraft,
  progressError,
  progressSavingId,
  scheduleProgressCommit,
  selectedBook,
  sendToKindleError,
  sendToKindleLoading,
  sendToKindleStatus,
  shelfError,
  downloadError,
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  // An email cannot be unsent, so a send asks first (suite rule, review
  // 2026-11-18 #7) and says where it is going.
  const [kindleConfirmOpen, setKindleConfirmOpen] = useState(false);
  const { notify } = useToast();

  // Enrich is the suite's "long-running job" pattern (TODO_ORDER #15):
  // `enrichLoading` stays inline on the More sheet's row (progress, not a
  // notice); the terminal outcome is a toast instead of the old sticky-bar
  // status line.
  useEffect(() => {
    if (enrichSummary) notify(enrichSummary, { tone: "success" });
  }, [enrichSummary, notify]);
  useEffect(() => {
    if (enrichError) notify(enrichError, { tone: "error" });
  }, [enrichError, notify]);
  // Same shape: a failed shelf move used to be a console.error and nothing
  // the user could see. useBookDetail clears it before each attempt, so a fresh
  // value is always a real transition.
  useEffect(() => {
    if (shelfError) notify(shelfError, { tone: "error" });
  }, [shelfError, notify]);
  // A failed download (usually a failed EPUB→MOBI convert) used to be written
  // into the library-load error, which LibraryView renders as a full-page
  // "Could not load your library" over the whole grid.
  useEffect(() => {
    if (downloadError) notify(downloadError, { tone: "error" });
  }, [downloadError, notify]);

  if (!selectedBook) return null;

  const epubAvailable = hasEpubFile(selectedBook);
  // "Manga" / "Comic" / null. A comic's page swaps Read and Send for one
  // Download button that hands over the stored file (Chef, 2026-11-15:
  // comics are not read in the app or sent to a Kindle).
  const comic = comicKind(selectedBook);
  const comicFormat = comic ? comicDownloadFormat(selectedBook) : null;
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
    // A comic is not read or sent from here: its bar leads with Download.
    comic && !comicFormat
      ? { key: "no-file", tone: "text.muted", text: "No file yet — attach one from ⋯" }
      : null,
    !comic && !epubAvailable
      ? { key: "no-epub", tone: "text.muted", text: "No EPUB yet — attach or convert one from ⋯" }
      : null,
  ].filter(Boolean);

  return (
    <>
      <GeekSheet
        open={Boolean(selectedBook)}
        onClose={closeBookModal}
        // This sheet IS a route (/book/:id): closing it is a history step
        // (BookDetailRoute `close`), so Back already closes it. With the
        // sheet's own Back entry on top, that step only popped the entry and
        // the book could not be closed at all (2026-11-15).
        backToClose={false}
        snap="full"
        mode="auto"
        maxWidth="md"
       
        // The sheet's own close is the only one (the hero's is gone,
        // 2026-11-18). It floats over the hero, so it wears the signboard:
        // a small green board with cream lettering. UI, so never tilted.
        headerSx={{ p: 0, minHeight: 0, zIndex: 3, "& [data-geek-sheet='close']": CLOSE_SIGN_SX }}
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
            <DetailHero book={selectedBook} shelves={shelves} onRate={onRate} />
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
            <MetadataList
              book={selectedBook}
              lastRead={
                handleSaveLastRead
                  ? {
                    editing: lastReadEditing,
                    saving: lastReadSaving,
                    error: lastReadError,
                    onEdit: () => setLastReadEditing(true),
                    onCancel: () => setLastReadEditing(false),
                    onSave: (day) => handleSaveLastRead(selectedBook, day),
                  }
                  : null
              }
            />

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

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: comic ? "1.6fr 1fr .7fr" : "1.6fr 1fr 1fr .7fr",
              gap: 1,
            }}
          >
            {comic ? (
              <Button
                variant="contained"
                color="primary"
                disabled={!comicFormat}
                onClick={() => handleDownload(selectedBook, comicFormat, { direct: true })}
                sx={BAR_BUTTON_SX}
              >
                <DownloadIcon />
                {comicFormat ? `Download ${comicFormat.toUpperCase()}` : "Download"}
              </Button>
            ) : (
              <>
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
                  aria-haspopup="dialog"
                  onClick={() => setKindleConfirmOpen(true)}
                  sx={BAR_BUTTON_SX}
                >
                  <SendIcon />
                  {sendToKindleLoading ? "Sending…" : "To Kindle"}
                </Button>
              </>
            )}
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
        metadataDraftEnabled={metadataDraftEnabled}
        metadataDraftLoading={metadataDraftLoading}
        metadataDraftError={metadataDraftError}
        metadataDraftProvenance={metadataDraftProvenance}
        handleDraftMetadata={handleDraftMetadata}
      />

      <GeekDialog
        open={kindleConfirmOpen}
        onClose={() => setKindleConfirmOpen(false)}
        title="Send to your Kindle?"
        mode="window"
        maxWidth="xs"
        keepSecondaryOnMobile
        primaryAction={
          <Button
            variant="contained"
            color="primary"
            disabled={!kindleEmail}
            onClick={() => {
              setKindleConfirmOpen(false);
              handleSendToKindle(selectedBook);
            }}
          >
            Send
          </Button>
        }
        secondaryAction={<Button onClick={() => setKindleConfirmOpen(false)}>Cancel</Button>}
      >
        {kindleEmail ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            “{selectedBook.title || "Untitled"}” will be emailed to{" "}
            <Box component="strong" sx={{ color: "text.primary", wordBreak: "break-all" }}>
              {kindleEmail}
            </Box>
            . An email can’t be taken back once it is sent.
          </Typography>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            There is no Kindle address on your account yet. Add it in Settings, then send from here.
          </Typography>
        )}
      </GeekDialog>

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
          “{selectedBook.title || "Untitled"}” moves to Recently deleted, for everyone in the house.
          You can restore it from Settings for 30 days — with everyone’s shelf, rating and
          progress — then it is deleted for good.
        </Typography>
        <FormControlLabel
          sx={{ mt: 1 }}
          control={
            <Checkbox
              checked={Boolean(deleteIncludeFiles)}
              onChange={(e) => setDeleteIncludeFiles(e.target.checked)}
            />
          }
          label={<Typography variant="body2">Also delete its files when it is deleted for good</Typography>}
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
