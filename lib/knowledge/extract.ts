const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
]);

export const KNOWLEDGE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isExtractableMime(mime: string): boolean {
  return KNOWLEDGE_MIME_TYPES.has(mime);
}

async function extractPdf(bytes: Buffer): Promise<string> {
  try {
    const mod = (await import('pdf-parse')) as Record<string, unknown>;
    const candidate = (mod.default || mod.PDFParse || mod) as unknown;

    if (typeof candidate === 'function') {
      const maybeCtor = candidate as { prototype?: { getText?: unknown } };
      if (maybeCtor.prototype && typeof maybeCtor.prototype.getText === 'function') {
        const Parser = candidate as new (opts: { data: Buffer }) => { getText: () => Promise<{ text?: string }> };
        const parser = new Parser({ data: bytes });
        const result = await parser.getText();
        return String(result?.text || '').trim();
      }
      const parse = candidate as (buf: Buffer) => Promise<{ text?: string }>;
      const result = await parse(bytes);
      return String(result?.text || '').trim();
    }

    throw new Error('pdf-parse export was not a usable parser');
  } catch (err) {
    throw new Error(`PDF extraction is unavailable: ${(err as Error).message}`);
  }
}

async function extractDocx(bytes: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: bytes });
    return String(result?.value || '').trim();
  } catch (err) {
    throw new Error(`DOCX extraction is unavailable: ${(err as Error).message}`);
  }
}

export async function extractDocumentText(bytes: Buffer, mimeType: string, filename?: string): Promise<string> {
  const mime = (mimeType || '').toLowerCase();
  const name = (filename || '').toLowerCase();

  if (TEXT_TYPES.has(mime) || name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.json')) {
    return bytes.toString('utf8').replace(/\u0000/g, '').trim();
  }
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdf(bytes);
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return extractDocx(bytes);
  }
  throw new Error(`Unsupported document type: ${mimeType || filename || 'unknown'}`);
}
