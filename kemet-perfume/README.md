# KEMET — perfume website

Static site (no build step). Open `index.html` in a browser, or serve the folder with any static host.

- `js/data.js` — WhatsApp number, the `perfumes` list and all Arabic/English text.
  Every perfume slot is `null` for now and renders as a "coming soon" card; fill in a slot
  (`name`, `family`, `description`, `notes`, `size`, `price`, `image`) and the card fills in by itself.
- `assets/` — temporary images (open box, bottle on amber water, light and dark logos).
- Arabic (RTL) is the default; the header button switches to English.
