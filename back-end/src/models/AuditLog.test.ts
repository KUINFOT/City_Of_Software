import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import test from 'node:test';
import { AuditLogModel } from './AuditLog';

test('an existing audit record cannot be saved again through the application model', async () => {
  const entry = new AuditLogModel({
    actorId: new Types.ObjectId(),
    action: 'tor.approve',
    entityType: 'tor',
    entityId: new Types.ObjectId(),
  });
  entry.isNew = false;

  await assert.rejects(entry.save(), /Audit log entries are immutable/);
});
