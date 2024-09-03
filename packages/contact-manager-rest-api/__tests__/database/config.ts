import { DataStoreContactEntities } from '@sphereon/ssi-sdk.data-store'
import { SqliteConnectionOptions } from 'typeorm/driver/sqlite/SqliteConnectionOptions'
import { DataStoreContactMigrations } from '@sphereon/ssi-sdk.data-store'
import { Entities as VeramoDataStoreEntities } from '@veramo/data-store'
import { migrations as VeramoDataStoreMigrations } from '@veramo/data-store/build/migrations'

const DB_CONNECTION_NAME = 'default'
const DB_ENCRYPTION_KEY = '29739248cad1bd1a0fc4d9b75cd4d2990de535baf5caadfdf8d8f86664aa830c'

const sqliteConfig: SqliteConnectionOptions = {
  type: 'sqlite',
  database: '__tests__/database/test.sqlite',
  entities: [...DataStoreContactEntities, ...VeramoDataStoreEntities],
  migrations: [...DataStoreContactMigrations, ...VeramoDataStoreMigrations],
  migrationsRun: false, // We run migrations from code to ensure proper ordering with Redux
  synchronize: false, // We do not enable synchronize, as we use migrations from code
  migrationsTransactionMode: 'each', // protect every migration with a separate transaction
  logging: ['info'], // 'all' means to enable all logging
  logger: 'advanced-console',
}

export { sqliteConfig, DB_CONNECTION_NAME, DB_ENCRYPTION_KEY }
