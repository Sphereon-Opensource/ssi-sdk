/**
 * @public
 */
import { Loggers } from '@sphereon/ssi-types'

export const logger = Loggers.DEFAULT.get('sphereon:public-key-hosting')
export * from './public-key-hosting'
export * from './types'
export * from './functions'
export * from './api-functions'
