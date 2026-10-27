# Oak Accessibility Checklist (WCAG 2.2 AA)

Run before signing off interface code or a review of it. AA is the floor; apply Oak's 7:1 contrast where the brand
applies. Tick only what you've actually verified — if you can't confirm an item, treat it as failed.

## Every interface

- [ ] Meaningful images/charts have concise alt text; decorative ones marked decorative
- [ ] Real headings in order (no skipped levels, no bold-as-heading); logical reading order
- [ ] Real lists and data tables (header cells set), not faked with styling/spacing
- [ ] Information never conveyed by colour alone (paired with text/shape/label)
- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 large text/UI/graphics); **7:1 where Oak brand applies**
- [ ] Link text makes sense out of context (no bare URLs or "click here")
- [ ] Document/page language set; real selectable text (no text baked into images)
- [ ] Usable at 200% zoom; reflows to one column at 320px; zoom not disabled

## Web and interactive (including quizzes)

- [ ] Fully keyboard operable; visible focus; no keyboard trap; focus never obscured (2.4.11)
- [ ] Pointer targets ≥ 24×24 px (2.5.8); dragging has a tap alternative (2.5.7)
- [ ] Inputs have labels; errors identified in text with a fix suggested
- [ ] Correct/incorrect shown by text/icon, not colour alone
- [ ] No redundant re-entry (3.3.7); no cognitive-puzzle login (3.3.8)
- [ ] Status messages announced without moving focus (4.1.3)

## Media

- [ ] Video players show synchronised captions; audio-only media links to a transcript
- [ ] Nothing flashes more than 3×/second; no autoplay with sound; moving content can be paused
- [ ] Reduced-motion preference respected

## Sign-off

- [ ] Keyboard-only pass completed (web/interactive)
- [ ] Contrast checked with a tool, not by eye
- [ ] Automated checker run, such as axe; zoomed to 400% as well as 200%
- [ ] Residual limitations the format can't meet are noted explicitly
