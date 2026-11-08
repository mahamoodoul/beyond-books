# Demo textbook excerpts

Source PDFs for the demo courses that `scripts/seed_demo.py` creates. Each one is uploaded to its
course as a source document, and the chapters point at the matching pages.

| File | Pages | Used by |
|---|---|---|
| `concepts-biology-ch16-body-systems.pdf` | 50 (title and licence pages, then Chapter 16, book pp. 409–456) | Human Body Systems |
| `concepts-biology-ch03-cell-structure.pdf` | 36 (title and licence pages, then Chapter 3, book pp. 71–104) | Cells: The Building Blocks of Life |

## Attribution and licence

Excerpts from **Concepts of Biology** by Samantha Fowler, Rebecca Roush and James Wise,
published by OpenStax, Rice University. © Rice University. Licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Download the full book
for free at <https://openstax.org/details/books/concepts-biology>.

Changes: only the listed pages are kept (the book's own title and licence pages come first), the
bookmarks are replaced, and images are downsampled to keep the files small. The text and
figures are otherwise unchanged. These excerpts are shared under the same CC BY-NC-SA 4.0
licence.

**Non-commercial use only.** They are for development and demos. Do not use them in a paid
product or a commercial deployment unless OpenStax gives permission. For commercial use,
replace them with CC BY material, such as an older OpenStax edition that was published under
CC BY.

## Rebuilding

The excerpts were cut from
`https://assets.openstax.org/oscms-prodcms/media/documents/Concepts-Biology_-_WEB.pdf` (186 MB,
613 pages; the upload limit is 50 MB) with PyMuPDF: `insert_pdf` for pages 3–4 plus the chapter
range, then `rewrite_images(dpi_threshold=160, dpi_target=120, quality=72)`.
