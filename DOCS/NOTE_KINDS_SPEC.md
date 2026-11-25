# Note kinds: the notes list, partitioned

Status: built 2026-11-24. Requested by Chef in conversation the same day.

## 1. Intent

NoteGeek's one notes list had become the output of three products: ordinary
notes, GeekDay's daily pages, meeting pages and 1:1s, all in one stream.
Chef: "The notes list is full of the daily notes, meeting notes, and 1:1
notes. I almost wonder if we should somehow partition each of the groups:
notes, dailies, meetings, 1:1s so that they only show when their category is
selected on the left rail/menu."

## 2. Requirements

1. **Notes** (`/notes`) lists only notes that are not a daily page, a meeting
   or a 1:1.
2. **Dailies**, **Meetings** and **1:1s** each have their own entry on the
   tablet rail and in the sidebar, and their own list.
3. **Everything** is the merged stream, as the Notes page was before.
4. Daily pages are still notes (Chef: "daily entries are still notes. I want
   them to be searchable and referenceable from inside NoteGeek. If I mark
   down a conversation I had, I want search to find it."). Search, links,
   related notes and the reference picker are across every kind.
5. Nothing moves in the data. A kind is read off a note's tags.

## 3. Out of scope

- Any change to GeekDay.
- A stored "kind" field, or migrating notes.
- Filtering tag pages, Home's recent rows, Archived or Recently deleted by kind.

## 4. Invariants

- A note carrying a kind's tag is reachable from that kind's list, from
  Everything, from its tag page and from search.
- Tag pages list every note with the tag, whatever its kind.
- Other gateway clients of `notes` / `notesPage` are unaffected: the new
  argument is optional and absent means "narrow nothing".

## 5. As built (Sage's choices, for Chef to confirm)

- **What makes a kind.** Daily: tag `daily` or beneath (GeekDay's tags).
  Meeting: tag `meeting` or beneath. 1:1: the 1:1 tag from Settings (default
  `fd/1on1`) or beneath. A note with two kinds' tags is in both lists and
  out of Notes.
- **Gateway.** `notes` and `notesPage` take `notUnder: [String!]`: leave out
  every note with a tag at or beneath any of these. Paging and counts stay
  correct because the filter is in the query, not the client.
- **Routes.** `/notes`, `/dailies`, `/meetings`, `/everything`. 1:1s is the
  existing 1:1 tag page (the people list), not a new page.
- **Rail (tablet).** Home, Search, New, Notes, Dailies, 1:1s, Meetings, Tags.
  1:1 and Meeting used to START a note from the rail in one tap; they are
  places now, and starting one is the button at the top of its list (one
  more tap). The New sheet still offers both directly.
- **Sidebar (desktop) and the Tags sheet (tablet, phone).** Notes, Dailies,
  Meetings, 1:1s, Everything (with the total count), Archived, Recently
  deleted. The sidebar's "New 1:1" and "New meeting" rows are gone for the
  same reason.
- **Phone.** The bottom bar is unchanged; the other kinds are reached from
  the Notes page's Tags sheet.
- **Dailies and Meetings lists.** Sorted by day written, no type chips
  (every row is a handwritten page), counted as "days" / "meetings".
  Dailies is a dated list, not the date strip floated in conversation.
- **Kind labels on search rows.** Not added: a row already names its tags
  (`daily`, `meeting`, the person), which says the same thing.
- **A tag page's breadcrumb** goes up to Everything, since a tag's notes are
  of every kind.
