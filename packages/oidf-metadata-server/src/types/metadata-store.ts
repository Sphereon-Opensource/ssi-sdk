import { IPluginMethodMap } from '@veramo/core'
import { IKeyValueStore, IValueData } from '@sphereon/ssi-sdk.kv-store-temp'
import { MetadataType } from '@sphereon/ssi-types'

export type OpenidFederationMetadata = {
  subjectBaseUrl: string
  jwt: string
  enabled: boolean | undefined
}

export type OptionalOpenidFederationMetadata = OpenidFederationMetadata | undefined
export type OpenidFederationValueData = IValueData<OpenidFederationMetadata>
export type OptionalOpenidFederationValueData = IValueData<OpenidFederationMetadata> | undefined

export interface IOIDFMetadataStore extends IPluginMethodMap {
  oidfStoreGetMetadata({ correlationId, storeId, namespace }: FederationMetadataGetArgs): Promise<OptionalOpenidFederationMetadata>

  oidfStoreListMetadata({ storeId, namespace }: FederationMetadataListArgs): Promise<Array<OpenidFederationMetadata>>

  oidfStoreHasMetadata({ correlationId, storeId, namespace }: FederationMetadataExistsArgs): Promise<boolean>

  oidfStorePersistMetadata(args: FederationMetadataPersistArgs): Promise<OptionalOpenidFederationValueData>

  oidfStoreImportMetadatas(args: Array<FederationMetadataPersistArgs>): Promise<void>

  oidfStoreRemoveMetadata({ storeId, correlationId, namespace }: FederationMetadataRemoveArgs): Promise<boolean>

  oidfStoreClearAllMetadata({ storeId }: FederationMetadataClearArgs): Promise<boolean>
}

export interface FederationMetadataStoreOpts {
  defaultStoreId?: string
  defaultNamespace?: string
  openidFederationMetadataStores?: Map<string, IKeyValueStore<OpenidFederationMetadata>> | IKeyValueStore<OpenidFederationMetadata>
}

export interface FederationMetadataPersistArgs {
  metadataType: MetadataType
  correlationId: string
  metadata: OpenidFederationMetadata
  overwriteExisting?: boolean
  validation?: boolean
  ttl?: number
  storeId?: string
  namespace?: string
}

export type FederationMetadataImportArgs = FederationMetadataPersistArgs

export interface FederationMetadataListArgs {
  storeId?: string
  namespace?: string
}

export interface FederationMetadataGetArgs extends FederationMetadataListArgs {
  correlationId: string
}

export type FederationMetadataExistsArgs = FederationMetadataGetArgs
export type FederationMetadataRemoveArgs = FederationMetadataGetArgs

export interface FederationMetadataClearArgs {
  storeId?: string
}
