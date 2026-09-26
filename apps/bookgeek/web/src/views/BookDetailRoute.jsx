/**
 * `/book/:id` — the detail sheet as a child route over the mounted library.
 *
 *   - Deep-linkable: a pasted `/book/<id>` loads the book from the gateway
 *     (a card tap is answered from the row the library already holds).
 *   - The browser's Back closes it, and so does the sheet's own close: when
 *     the library opened it (`state.fromLibrary`) closing is a history step
 *     back, so Back afterwards does not reopen it; from a deep link it
 *     replaces itself with the library.
 *   - An id that is not a book (deleted, mistyped) goes back to the library.
 *
 * Keyed by id, so each book gets fresh per-book state (hooks/useBookDetail.js).
 */
import React, { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { libraryPath } from "../components/navConfig";
import { useBookDetail } from "../hooks/useBookDetail";
import { useBookGeek } from "../hooks/useBookGeek";
import BookDetailModal from "./BookDetailModal";
import ReaderModal from "./ReaderModal";

function BookDetail({ bookId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { basket, shelves, settings } = useBookGeek();
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (location.state?.fromLibrary) navigate(-1);
    else navigate(libraryPath(location.search), { replace: true });
  }, [navigate, location.state, location.search]);

  const detail = useBookDetail({
    bookId,
    onClose: close,
    onDeleted: (deletedId) => {
      basket.dropFromBasket(deletedId);
      close();
    },
  });
  const { selectedBook, bookLoading, bookError, reader } = detail;

  // Not a book (any more): back to the library rather than an empty sheet.
  useEffect(() => {
    if (closingRef.current || bookLoading) return;
    if (!selectedBook || bookError) {
      closingRef.current = true;
      navigate(libraryPath(location.search), { replace: true });
    }
  }, [selectedBook, bookLoading, bookError, navigate, location.search]);

  if (!selectedBook) return null;

  return (
    <>
      <BookDetailModal
        {...detail}
        basketBookIds={basket.basketBookIds}
        toggleBasket={basket.toggleBasket}
        shelves={shelves}
        metadataDraftEnabled={settings.libraryAssistantPref}
      />
      {reader.readerOpen ? (
        <ReaderModal
          readerContainerRef={reader.readerContainerRef}
          readerError={reader.readerError}
          readerRenditionRef={reader.readerRenditionRef}
          readerTheme={reader.readerTheme}
          selectedBook={selectedBook}
          setReaderError={reader.setReaderError}
          setReaderOpen={reader.setReaderOpen}
          setReaderTheme={reader.setReaderTheme}
        />
      ) : null}
    </>
  );
}

export default function BookDetailRoute() {
  const { id } = useParams();
  return <BookDetail key={id} bookId={id} />;
}
