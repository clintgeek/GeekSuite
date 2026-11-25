import React from 'react';
import ConflictDialog from '../../components/notes/ConflictDialog';
import SendTasksDialog from '../../components/editors/SendTasksDialog';
import ComposeDialog from '../../components/editors/ComposeDialog';
import TranscribeDialog from '../../components/editors/TranscribeDialog';
import FoldInSheet from '../../components/foldin/FoldInSheet';
import NoteHistoryDialog from '../../components/notes/NoteHistoryDialog';
import { NOTE_TYPES } from '../../components/notes';

/** The note editor's dialogs. Each is mounted only while open, as before. */
export default function EditorDialogs({
  savedNoteId, title, noteType, notify,
  setTitle, setContent, setNoteType, setDirty, setSaveError, setLastSavedAt,
  historyOpen, setHistoryOpen,
  compose, setCompose, saveFromSketch, handleComposeSaveAsNew, handleComposeReplace,
  foldInOpen, setFoldInOpen, flushBeforeFoldIn, showServerNote,
  transcribe, setTranscribe, closeTranscribe, handleTranscribe,
  handleTranscriptCompose, handleTranscriptKeepPlain,
  sendTasks, setSendTasks, handleSendTasks, closeSendTasks, openSendTasks, handleSendCorrections,
  conflict, conflictBusy, handleKeepMine, handleUseTheirs, handleKeepBoth,
}) {
  return (
    <>
      {/* Mounted only while open: the dialog's own Apollo hooks have no reason
          to run on every editor mount, and the list query is network-only. */}
      {historyOpen && savedNoteId ? (
        <NoteHistoryDialog
          open={historyOpen}
          noteId={savedNoteId}
          onClose={() => setHistoryOpen(false)}
          onRestored={(note) => {
            // Put the restored text on screen without a reload, and mark it
            // clean: the server has already written it.
            if (!note) return;
            setTitle(note.title || '');
            setContent(note.content || '');
            setNoteType(note.type || NOTE_TYPES.TEXT);
            setDirty(false);
            setSaveError(null);
            setLastSavedAt(new Date());
            notify('Restored. The version you replaced is still in History.', { tone: 'success' });
          }}
        />
      ) : null}

      {compose && compose.origin === 'sketch' ? (
        // From a sketch's transcript: a new note only, never "Replace this
        // note" (the sketch is the original). Discard goes back to the
        // transcript rather than losing it.
        <ComposeDialog
          open={compose.open}
          loading={compose.loading}
          markdown={compose.markdown}
          stats={compose.stats}
          error={compose.error}
          model={compose.model}
          discardLabel="Back to transcript"
          onClose={() => {
            setCompose(null);
            setTranscribe((t) => (t ? { ...t, open: true } : t));
          }}
          onSaveAsNew={() => saveFromSketch(compose.markdown, { composed: true })}
        />
      ) : null}

      {compose && compose.origin !== 'sketch' ? (
        <ComposeDialog
          open={compose.open}
          loading={compose.loading}
          markdown={compose.markdown}
          stats={compose.stats}
          error={compose.error}
          model={compose.model}
          onClose={() => setCompose(null)}
          onSaveAsNew={() => handleComposeSaveAsNew(compose.markdown)}
          onReplace={() => handleComposeReplace(compose.markdown)}
        />
      ) : null}

      {foldInOpen && savedNoteId ? (
        <FoldInSheet
          open
          note={{ id: savedNoteId, title, type: noteType }}
          prepare={flushBeforeFoldIn}
          onClose={() => setFoldInOpen(false)}
          onApplied={({ note }) => showServerNote(note)}
          onUndone={showServerNote}
        />
      ) : null}

      {transcribe ? (
        <TranscribeDialog
          open={transcribe.open}
          stage={transcribe.stage}
          step={transcribe.step}
          text={transcribe.text}
          onTextChange={(text) => setTranscribe((t) => ({ ...t, text }))}
          error={transcribe.error}
          model={transcribe.model}
          imageUrl={transcribe.imageUrl}
          saving={transcribe.saving}
          onClose={closeTranscribe}
          onRetry={() => handleTranscribe({ forceRead: Boolean(transcribe.reused) })}
          onCompose={handleTranscriptCompose}
          onKeepPlain={handleTranscriptKeepPlain}
          reused={transcribe.reused}
          onTranscribeAgain={transcribe.reused ? () => handleTranscribe({ forceRead: true }) : null}
        />
      ) : null}

      {sendTasks ? (
        <SendTasksDialog
          open={sendTasks.open}
          stage={sendTasks.stage}
          rows={sendTasks.rows}
          error={sendTasks.error}
          sending={sendTasks.sending}
          result={sendTasks.result}
          onToggle={(key, on) => setSendTasks((t) => ({ ...t, rows: t.rows.map((r) => (r.key === key ? { ...r, on } : r)) }))}
          onTextChange={(key, text) => setSendTasks((t) => ({ ...t, rows: t.rows.map((r) => (r.key === key ? { ...r, text } : r)) }))}
          onSend={handleSendTasks}
          onClose={closeSendTasks}
          onRetry={openSendTasks}
          writtenAt={sendTasks.writtenAt}
          onCorrections={handleSendCorrections}
        />
      ) : null}

      <ConflictDialog
        open={Boolean(conflict)}
        serverNote={conflict?.serverNote}
        busy={conflictBusy}
        onKeepMine={handleKeepMine}
        onUseTheirs={handleUseTheirs}
        onKeepBoth={handleKeepBoth}
      />
    </>
  );
}
