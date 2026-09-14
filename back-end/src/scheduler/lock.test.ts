import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isRunning, withLock } from './lock';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withLock — overlapping-run protection (SRS 7.3)', () => {
  it('runs a job that is not already in progress', async () => {
    const outcome = await withLock('test:simple', async () => {});
    assert.equal(outcome, 'ran');
  });

  it('skips a second call for the same key while the first is still running', async () => {
    const key = 'test:overlap';
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const track = async () => {
      concurrentCount += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await sleep(20);
      concurrentCount -= 1;
    };

    const [first, second] = await Promise.all([withLock(key, track), withLock(key, track)]);

    const outcomes = [first, second].sort();
    assert.deepEqual(outcomes, ['ran', 'skipped']);
    assert.equal(maxConcurrent, 1, 'the tracked function must never run concurrently with itself');
  });

  it('releases the lock after the job finishes, so a later call can run', async () => {
    const key = 'test:sequential';
    await withLock(key, async () => {});
    assert.equal(isRunning(key), false);
    const outcome = await withLock(key, async () => {});
    assert.equal(outcome, 'ran');
  });

  it('releases the lock even when the job throws', async () => {
    const key = 'test:throws';
    await assert.rejects(
      withLock(key, async () => {
        throw new Error('boom');
      })
    );
    assert.equal(isRunning(key), false);
    const outcome = await withLock(key, async () => {});
    assert.equal(outcome, 'ran');
  });

  it('different keys never contend with each other', async () => {
    const [a, b] = await Promise.all([
      withLock('test:key-a', () => sleep(10)),
      withLock('test:key-b', () => sleep(10)),
    ]);
    assert.equal(a, 'ran');
    assert.equal(b, 'ran');
  });
});
