import { createAgent } from '@veramo/core'
import { DataStore, DataStoreORM } from '@veramo/data-store'
import { IRequiredPlugins } from '../src'
import { DB_CONNECTION_NAME, sqliteConfig } from './database'
import { DataSources } from '@sphereon/ssi-sdk.agent-config'
import { PDManager } from '@sphereon/ssi-sdk.pd-manager'
import { PDStore } from '@sphereon/ssi-sdk.data-store'

const dbConnection = DataSources.singleInstance().addConfig(DB_CONNECTION_NAME, sqliteConfig).getDbConnection(DB_CONNECTION_NAME)

const agent = createAgent<IRequiredPlugins>({
  plugins: [new DataStore(dbConnection), new DataStoreORM(dbConnection), new PDManager({ store: new PDStore(dbConnection) })],
})

async function addPDs() {}

addPDs()

export default agent
