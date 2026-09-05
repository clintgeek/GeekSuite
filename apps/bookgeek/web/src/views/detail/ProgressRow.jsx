/**
 * ProgressRow — the amber reading-progress slider.
 *
 * Same commit grammar as the old 144px range input: dragging updates the draft
 * and schedules a debounced commit; releasing commits immediately. The number
 * input is gone (the slider plus the debounced commit covers it), so the
 * "Percent read" aria-label lives on the slider.
 */
import React from "react";
import { Box, Slider, Typography } from "@mui/material";
import { bookId } from "./bookFacts";

export default function ProgressRow({
  book,
  progressDraft,
  progressError,
  progressSavingId,
  scheduleProgressCommit,
  setProgressDraft,
  handleUpdateProgress,
}) {
  const id = bookId(book);
  const saving = Boolean(progressSavingId) && progressSavingId === id;
  const value = progressDraft === "" || progressDraft == null ? 0 : Number(progressDraft);
  const pageCount = Number(book.pageCount) || 0;

  return (
    <Box sx={{ px: 2, pt: 1, pb: 2 }}>
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
        Progress
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Slider
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={saving}
          aria-label="Percent read"
          onChange={(event, next) => {
            setProgressDraft(next);
            scheduleProgressCommit(book, next);
          }}
          onChangeCommitted={(event, next) => handleUpdateProgress(book, next)}
          sx={{ flex: 1, color: "progress.main" }}
        />
        <Typography
          sx={{
            fontFamily: '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 14,
            fontVariantNumeric: "tabular-nums",
            color: "text.primary",
            minWidth: 48,
            textAlign: "right",
          }}
        >
          {value}%
        </Typography>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 0.25 }}>
        {pageCount > 0 ? (
          <Typography variant="caption" sx={{ color: "text.muted" }}>
            about p. {Math.round((value / 100) * pageCount)} of {pageCount}
          </Typography>
        ) : null}
        {saving ? (
          <Typography variant="caption" sx={{ color: "text.muted" }}>
            Saving…
          </Typography>
        ) : null}
        {progressError ? (
          <Typography variant="caption" sx={{ color: "error.main" }}>
            {progressError}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
