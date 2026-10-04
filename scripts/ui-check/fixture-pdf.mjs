// Writes a small, dependency-free text PDF for UI checks, so a check never
// needs a real book from the user's library.
import { writeFileSync } from 'node:fs';

const PARAGRAPH =
  'As typical for a declarative query language, you do not need to specify such execution details ' +
  'when writing the query: the query optimizer automatically chooses the strategy that is predicted ' +
  'to be the most efficient, and you can get on with writing the rest of your application.';
const PAGES = 3;
const PARAGRAPHS_PER_PAGE = 5;
const LINE_WIDTH_CHARS = 80;
// A figure sits on this page so Reflow has something other than text to place.
const FIGURE_PAGE = 2;
const FIGURE_SIZE_PT = 200;
const FIGURE_PIXELS = 4;

function wrap(text) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + word.length + 1 > LINE_WIDTH_CHARS) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function pageContent(pageNumber) {
  const lines = [`Chapter ${pageNumber}`, ''];
  for (let i = 0; i < PARAGRAPHS_PER_PAGE; i++) lines.push(...wrap(PARAGRAPH), '');
  const body = lines.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`).join('\n');
  const figure = pageNumber === FIGURE_PAGE ? `\nq ${FIGURE_SIZE_PT} 0 0 ${FIGURE_SIZE_PT} 200 80 cm /Im1 Do Q` : '';
  return `BT /F1 12 Tf 16 TL 60 740 Td\n${body}\nET${figure}`;
}

/** A 4x4 checkerboard as a raw RGB image object, small enough to inline. */
function figureObject() {
  const rows = [];
  for (let y = 0; y < FIGURE_PIXELS; y++) {
    for (let x = 0; x < FIGURE_PIXELS; x++) rows.push((x + y) % 2 === 0 ? '2060C0' : 'F0A020');
  }
  const data = rows.join('') + '>';
  return `<< /Type /XObject /Subtype /Image /Width ${FIGURE_PIXELS} /Height ${FIGURE_PIXELS} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${data.length} >>\nstream\n${data}\nendstream`;
}

/** Builds the PDF bytes: catalog, page tree, one font, one page + stream per page, then the figure image. */
function buildPdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>'];
  const pageIds = Array.from({ length: PAGES }, (_, i) => 4 + i * 2);
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${PAGES} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const figureId = 4 + PAGES * 2;
  for (let p = 0; p < PAGES; p++) {
    const content = pageContent(p + 1);
    const xObjects = p + 1 === FIGURE_PAGE ? ` /XObject << /Im1 ${figureId} 0 R >>` : '';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >>${xObjects} >> /Contents ${pageIds[p] + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects.push(figureObject());
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

/** Writes the fixture PDF to `path`. */
export function writeFixturePdf(path) {
  writeFileSync(path, buildPdf());
}
