import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chatRequestSchema } from './multimodal';

describe('chat request schema', () => {
  it('accepts text-only chat without attachments', () => {
    const parsed = chatRequestSchema.parse({ message: 'Hello OmniAgent' });
    assert.equal(parsed.message, 'Hello OmniAgent');
    assert.equal(parsed.attachmentIds, undefined);
  });

  it('accepts attachment-only chat with an empty message', () => {
    const parsed = chatRequestSchema.parse({
      message: '',
      attachmentIds: ['file_abc'],
    });
    assert.equal(parsed.message, '');
    assert.deepEqual(parsed.attachmentIds, ['file_abc']);
  });

  it('rejects more than eight attachments', () => {
    const result = chatRequestSchema.safeParse({
      message: 'compare these',
      attachmentIds: Array.from({ length: 9 }, (_, i) => `file_${i}`),
    });
    assert.equal(result.success, false);
  });
});
