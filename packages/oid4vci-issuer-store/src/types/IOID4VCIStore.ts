import { IssuerMetadata, CredentialIssuerMetadataOpts } from '@sphereon/oid4vci-common'
import { IDIDOptions, ResolveOpts } from '@sphereon/ssi-sdk-ext.did-utils'
import { ManagedIdentifierOptsOrResult } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { IKeyValueStore, IValueData } from '@sphereon/ssi-sdk.kv-store-temp'
import { IPluginMethodMap } from '@veramo/core'

export interface IOID4VCIStore extends IPluginMethodMap {
  oid4vciStoreDefaultMetadata(): Promise<IKeyValueStore<IssuerMetadata>>
  oid4vciStoreDefaultIssuerOptions(): Promise<IKeyValueStore<IIssuerOptions>>
  oid4vciStoreDefaultStoreId(): Promise<string>
  oid4vciStoreDefaultNamespace(): Promise<string>

  oid4vciStoreGetIssuerOpts({ correlationId, storeId, namespace }: Ioid4vciStoreGetArgs): Promise<IIssuerOptions | undefined>
  oid4vciStoreHasIssuerOpts({ correlationId, storeId, namespace }: Ioid4vciStoreExistsArgs): Promise<boolean>
  oid4vciStorePersistIssuerOpts(args: IIssuerOptsPersistArgs): Promise<IValueData<IIssuerOptions>>
  oid4vciStoreRemoveIssuerOpts({ storeId, correlationId, namespace }: Ioid4vciStoreRemoveArgs): Promise<boolean>
  oid4vciStoreClearAllIssuerOpts({ storeId }: Ioid4vciStoreClearArgs): Promise<boolean>

  oid4vciStoreGetMetadata({ correlationId, storeId, namespace }: Ioid4vciStoreGetArgs): Promise<IssuerMetadata | undefined>
  oid4vciStoreHasMetadata({ correlationId, storeId, namespace }: Ioid4vciStoreExistsArgs): Promise<boolean>
  oid4vciStorePersistMetadata(args: IMetadataPersistArgs): Promise<IValueData<IssuerMetadata>>
  oid4vciStoreRemoveMetadata({ storeId, correlationId, namespace }: Ioid4vciStoreRemoveArgs): Promise<boolean>
  oid4vciStoreClearAllMetadata({ storeId }: Ioid4vciStoreClearArgs): Promise<boolean>
}

export interface IOID4VCIStoreOpts {
  defaultStore?: string
  defaultNamespace?: string
  metadataStores?: Map<string, IKeyValueStore<IssuerMetadata>> | IKeyValueStore<IssuerMetadata>
  issuerOptsStores?: Map<string, IKeyValueStore<IIssuerOptions>> | IKeyValueStore<IIssuerOptions>
  importMetadatas?: IMetadataImportArgs[]
  importIssuerOpts?: IIssuerOptsImportArgs[]
  defaultOpts?: IIssuerDefaultOpts
  instanceOpts?: IIssuerInstanceOptions[]
}

export interface IIssuerDefaultOpts extends IIssuerOptions {}

export interface IIssuerInstanceOptions extends IMetadataOptions {
  issuerOpts?: IIssuerOptions
  metadata?: CredentialIssuerMetadataOpts
}

export interface IIssuerOptions {
  idOpts?: ManagedIdentifierOptsOrResult
  resolveOpts?: ResolveOpts
  /**
   * @deprecated use idOpts which is more capable and supports x5c and jwks next to dids
   */
  didOpts?: IDIDOptions
  userPinRequired?: boolean
  cNonceExpiresIn?: number
}

export interface IMetadataOptions {
  credentialIssuer: string //The Credential Issuer's identifier.
  storeId?: string
  storeNamespace?: string
}

export interface Ioid4vciStoreGetArgs {
  correlationId: string
  storeId?: string
  namespace?: string
}

export type Ioid4vciStoreExistsArgs = Ioid4vciStoreGetArgs
// export type Ioid4vciStoreClearArgs = Ioid4vciStoreGetArgs
export type Ioid4vciStoreRemoveArgs = Ioid4vciStoreGetArgs

export type IMetadataImportArgs = IMetadataPersistArgs
export type IIssuerOptsImportArgs = IIssuerOptsPersistArgs

export interface IMetadataPersistArgs extends Ioid4vciStorePersistArgs {
  metadata: IssuerMetadata | CredentialIssuerMetadataOpts // The actual metadata
}

export interface IIssuerOptsPersistArgs extends Ioid4vciStorePersistArgs {
  issuerOpts: IIssuerOptions
}
export interface Ioid4vciStorePersistArgs {
  correlationId: string // The credential Issuer to store the metadata for
  overwriteExisting?: boolean // Whether to overwrite any existing metadata for a credential issuer. Defaults to true
  validation?: boolean // Whether to check the metadata. Defaults to true
  ttl?: number // How long should the metadata be stored in seconds. By default, it will be indefinite
  storeId?: string // The store id to use. Allows you to use multiple different stores next to each-other
  namespace?: string // The namespace (prefix) to use whilst storing the metadata. Allows you to partition metadata objects
}

export interface Ioid4vciStoreClearArgs {
  storeId?: string
  // namespace?: string
}
