/**
 * MoreSheet — the ⋯ action sheet behind the sticky bar.
 *
 * Every 11px text-button that used to line the old overlay now lives here as a
 * 44px row: edit, enrich, cover, download, attach a file, basket, delete. The
 * handlers are the originals; the delete confirm itself is a `GeekDialog`
 * owned by `BookDetailModal` so it survives this sheet closing.
 */
import React, { useRef } from "react";
import {
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import {
  AutoAwesome as EnrichIcon,
  DeleteOutline as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Image as ImageIcon,
  RemoveShoppingCart as RemoveBasketIcon,
  ShoppingBasket as BasketIcon,
  UploadFile as UploadFileIcon,
} from "@mui/icons-material";
import { GeekSheet } from "@geeksuite/ui";
import { bookId } from "./bookFacts";

function ActionRow({ icon, label, secondary, onClick, disabled, danger }) {
  return (
    <ListItemButton
      onClick={onClick}
      disabled={disabled}
      sx={{ minHeight: 44, borderRadius: 1, color: danger ? "error.main" : "text.primary" }}
    >
      <ListItemIcon sx={{ minWidth: 40, color: danger ? "error.main" : "text.secondary" }}>
        {icon}
      </ListItemIcon>
      <ListItemText
        primary={label}
        secondary={secondary}
        primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
        secondaryTypographyProps={{ variant: "caption", sx: { color: "text.muted" } }}
      />
    </ListItemButton>
  );
}

export default function MoreSheet({
  open,
  onClose,
  book,
  basketBookIds,
  toggleBasket,
  beginEditForSelectedBook,
  handleEnrichSelectedBook,
  enrichLoading,
  enrichError,
  enrichSummary,
  onChangeCover,
  onDownload,
  convertingFormat,
  handleUploadFileChange,
  handleUploadBookFile,
  uploadFile,
  uploadLoading,
  uploadError,
  uploadMessage,
  onDelete,
}) {
  const fileInputRef = useRef(null);
  const id = bookId(book);
  const inBasket = Array.isArray(basketBookIds) && basketBookIds.includes(id);

  return (
    <GeekSheet open={open} onClose={onClose} title="More actions" maxWidth="xs">
      <List disablePadding sx={{ pb: 1 }}>
        <ActionRow
          icon={<EditIcon fontSize="small" />}
          label="Edit metadata"
          onClick={() => {
            beginEditForSelectedBook();
            onClose();
          }}
        />
        <ActionRow
          icon={<EnrichIcon fontSize="small" />}
          label={enrichLoading ? "Enriching metadata…" : "Enrich metadata"}
          secondary={enrichError || enrichSummary || null}
          disabled={enrichLoading}
          onClick={handleEnrichSelectedBook}
        />
        <ActionRow
          icon={<ImageIcon fontSize="small" />}
          label="Change cover"
          onClick={() => {
            onChangeCover();
            onClose();
          }}
        />
        <ActionRow
          icon={<DownloadIcon fontSize="small" />}
          label={convertingFormat ? `Converting ${convertingFormat.toUpperCase()}…` : "Download / Convert"}
          onClick={() => {
            onDownload();
            onClose();
          }}
        />

        <ActionRow
          icon={<UploadFileIcon fontSize="small" />}
          label="Upload book file"
          secondary={uploadFile ? uploadFile.name : "Attach an EPUB, MOBI, AZW3, PDF…"}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept=".epub,.mobi,.azw3,.pdf,.fb2,.rtf,.txt,.html"
          onChange={handleUploadFileChange}
        />
        {uploadFile ? (
          <ActionRow
            icon={<UploadFileIcon fontSize="small" />}
            label={uploadLoading ? "Attaching…" : "Attach file to this book"}
            disabled={uploadLoading}
            onClick={() => handleUploadBookFile(book)}
          />
        ) : null}
        {uploadError ? (
          <Typography variant="caption" sx={{ display: "block", px: 2, color: "error.main" }}>
            {uploadError}
          </Typography>
        ) : null}
        {uploadMessage ? (
          <Typography variant="caption" sx={{ display: "block", px: 2, color: "success.main" }}>
            {uploadMessage}
          </Typography>
        ) : null}

        <ActionRow
          icon={inBasket ? <RemoveBasketIcon fontSize="small" /> : <BasketIcon fontSize="small" />}
          label={inBasket ? "Remove from device basket" : "Add to device basket"}
          onClick={() => toggleBasket(id)}
        />

        <Divider sx={{ my: 1 }} />

        <ActionRow
          danger
          icon={<DeleteIcon fontSize="small" />}
          label="Delete book…"
          onClick={() => {
            onDelete();
            onClose();
          }}
        />
      </List>
    </GeekSheet>
  );
}
