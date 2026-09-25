# GameGeek — what the data means (the taste model)

*Written 2026-09-25 from Chef's own definitions. This is ground truth for any future
recommendation system: a recommender reads shelves and ratings **as defined here**, never as
their generic dictionary meaning.*

## Shelves, in Chef's words

| Shelf | Means | It is NOT |
|---|---|---|
| **Playing** | "Installed on the laptop, ready to go." | "Currently mid-playthrough". It's a readiness state: what's available to pick up tonight. |
| **Finished** | "I got everything I wanted out of it and/or actually completed the game. Any restart would be a fresh start and not continuing." | Necessarily 100% or credits-rolled. A satisfied exit also counts. |
| **On hold** | "I've played it and haven't admitted that I abandoned it yet." | A pause with intent to return. Treat it as soft-abandoned. |
| **Abandoned** | "Abandoned is abandoned." | A verdict on quality by itself. The rating carries the verdict. |
| Backlog | "Own it, haven't started it." *(provisional — Chef accepted the suggestion 2026-09-25; edit freely)* | |
| Wishlist | "Don't own it yet, want it." *(provisional — Chef accepted the suggestion 2026-09-25; edit freely)* | |

## Ratings, in Chef's words

| Stars | Means | Signal for a recommender |
|---|---|---|
| ★★★★★ | "I love this game, you should play this game like 10 times, do you have 2 hours to talk about it?" | Strong positive. Games like this are the target. |
| ★★★★ | "I really liked this game, I wouldn't hate playing again, but probably would rather play something new." | Positive. Recommend *similar but new*, never a replay. |
| ★★★ | "I didn't hate it, not my type of game but done well, it had some good moments, you should play it if you're into that sort of game." | **Quality was fine, the fit was wrong.** Negative on its *type* (genres, tags), not on craft. |
| ★★ | "I didn't like it but probably put more hours into it than I should have." | Negative, **but compulsive**: it hooked him while he disliked it. A "hooks without satisfying" signal. Don't treat it as simple dislike. |
| ★ | "I freaking hated this game, you should never play it, it's awful, do you have an hour to discuss how awful this game is?" | Strong negative. Avoid its type and its closest neighbours. |

## How the two combine

- A rating is the verdict and a shelf is the state, and they're independent. An
  **Abandoned 3★** means "well made, wrong for me, and I stopped". An **Abandoned 4★** is
  rarer and interesting: he liked it and stopped anyway, probably for length or timing.
- **On hold** counts as a soft abandon. A recommender shouldn't nudge back to on-hold games
  as if they were in progress.
- **Playing** is a pool, not a history. "What should I play tonight?" draws from Playing
  first, because those games are installed and ready.
- **Finished + 4★** means "more like this, but new". **Finished + 5★** means "more like this;
  a replay is welcome".
- **Unrated** is unknown, never neutral.

## Consequences for the app (proposed, not built)

1. The shelf picker and the star rating show these definitions, so entering data stays
   consistent with this model.
2. Import: Playnite's `isInstalled` is exactly "installed, ready to go", so installed games
   could map to **Playing**. See the open question.
3. Hours are not a signal (Chef has Playnite's tracking off). Nothing here uses them.
