import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractDocumentText, isExtractableMime } from './extract';
import { chunkText, keywordScore } from './chunk';

describe('knowledge extraction', () => {
  it('extracts txt and markdown without fabricating content', async () => {
    const txt = await extractDocumentText(Buffer.from('Alpha private note'), 'text/plain', 'note.txt');
    const md = await extractDocumentText(Buffer.from('# Title\nBeta private note'), 'text/markdown', 'note.md');
    assert.equal(txt, 'Alpha private note');
    assert.match(md, /Beta private note/);
    assert.equal(isExtractableMime('text/plain'), true);
    assert.equal(isExtractableMime('application/pdf'), true);
    assert.equal(isExtractableMime('image/png'), false);
  });

  it('chunks text and scores keyword overlap', () => {
    const chunks = chunkText('The quarterly budget is 42 million dollars.\nKeep this private.');
    assert.ok(chunks.length >= 1);
    assert.ok(keywordScore('budget dollars', chunks[0]) > 0);
    assert.equal(keywordScore('unrelated topic', chunks[0]), 0);
  });
});
