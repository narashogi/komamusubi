"use strict";

const KomaShare = Object.freeze({
  url(href, puzzle = null) {
    const url = new URL(href);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.search = "";
    url.hash = "";
    if (puzzle) url.searchParams.set("puzzle", String(puzzle));
    return url.href;
  },
});
