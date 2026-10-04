import Database from 'better-sqlite3';
import { describe, it } from 'vitest';
import { describeSqlDriverContract } from '@taking-book/core';
import { createSqlDriver } from './sqliteDriver';

describeSqlDriverContract({ describe, it }, async () => createSqlDriver(new Database(':memory:')));
