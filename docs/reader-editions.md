# Arabic and English reader editions

The newsroom interface uses bundled UI strings, independently of the story language. Clicking the language in the home header updates the current page and remembers the choice on that browser. A share link for a particular story edition uses `#lang=ar` or `#lang=en`; the verified original URL stays canonical even on the older Cloudflare Worker.

The article picker loads each possible stored edition once when a published story is opened. After the alternate text has been fetched, switching is local and updates the headline, entire article and language direction together. The optional source version is still readable when another language is missing or the request fails. No request is sent to a translation provider and old machine output is not used by the picker.

## Editorial workflow

1. Choose the original language, enter the headline and text, and save the original as a private draft.
2. Open «النسخة الأخرى من المقال», type or import a UTF-8 text file, and save the version without publishing or approve it with a human review note.
3. Publish the original for both approved versions to become public. For an already published original, the approved edition becomes available as soon as the review succeeds.

The public reader uses the existing `get_public_article_trust` projection, which exposes a reviewed translation only for a currently published story. The reader additionally requires `translation_source=editorial`, and the original continues to use `public_article_reading`. The editor uses existing editor-only translation permissions and the human-review RPC; no new grants or schema changes are required.

An old machine entry can occupy the unique article/language slot. The editor deliberately does not relabel, overwrite or delete it. Supporting manual replacements for these legacy rows requires a separate, audited storage change. Stories without a manually supplied and approved second edition are not translated automatically.

## Release surfaces

- GitHub Pages serves the homepage, shared sections, editor and article enhancement assets. Existing standalone article URLs can use the new edition picker after those assets ship, without changing the Cloudflare route.
- The Cloudflare `wrldline-public` Worker must also be deployed to enable the Arabic/English archive interface. The archive keeps titles and excerpts in their published original language and carries the chosen UI language into the reader; neither the archive nor the feed fetches full translations.
