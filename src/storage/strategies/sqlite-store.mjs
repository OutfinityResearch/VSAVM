/**
 * SQLite Storage Strategy (stub)
 * Placeholder implementation to satisfy DS006 module layout.
 */

import { StorageStrategy } from '../../core/interfaces/storage-strategy.mjs';

export class SqliteStore extends StorageStrategy {
  constructor() {
    super('sqlite');
  }
}

export default SqliteStore;
