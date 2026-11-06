import type { Database } from '@serend/db';

/** Datenbank oder Transaktion: Repositories akzeptieren beides. */
export type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;
