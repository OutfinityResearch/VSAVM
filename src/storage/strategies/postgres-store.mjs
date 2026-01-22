/**
 * PostgreSQL Storage Strategy (stub)
 * Placeholder implementation to satisfy DS006 module layout.
 */

import { StorageStrategy } from '../../core/interfaces/storage-strategy.mjs';

export class PostgresStore extends StorageStrategy {
  constructor() {
    super('postgres');
  }
}

export default PostgresStore;
