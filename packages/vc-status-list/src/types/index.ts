import { IIdentifierResolution } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import {
  CompactJWT,
  ICredential,
  ICredentialStatus,
  IIssuer,
  IVerifiableCredential,
  OriginalVerifiableCredential,
  OrPromise,
  StatusListCredentialIdMode,
  StatusListDriverType,
  StatusListIndexingDirection,
  StatusPurpose2021,
} from '@sphereon/ssi-types'
import {
  CredentialPayload,
  IAgentContext,
  ICredentialIssuer,
  ICredentialPlugin,
  ICredentialVerifier,
  IPluginMethodMap,
  ProofFormat,
} from '@veramo/core'
import { DataSource } from 'typeorm'
import { BitsPerStatus } from '@sd-jwt/jwt-status-list/dist'

export enum StatusListType {
  StatusList2021 = 'StatusList2021',
  OAuthStatusList = 'OAuthStatusList',
}

export type StatusOAuth = 'active' | 'suspended' | 'revoked' | string

export type StatusList2021Args = {
  encodedList: string
  indexingDirection: StatusListIndexingDirection
  statusPurpose?: StatusPurpose2021
  // todo: validFrom and validUntil
}

export type OAuthStatusListArgs = {
  statusPurpose: StatusOAuth
  expiresAt?: string
}

export type BaseCreateNewStatusListArgs = {
  type: StatusListType
  id: string
  issuer: string | IIssuer
  correlationId?: string
  length?: number
  bitsPerStatus?: BitsPerStatus
  proofFormat?: ProofFormat
  keyRef?: string
  statusList2021?: StatusList2021Args
  oauthStatusList?: OAuthStatusListArgs
}

export type UpdateStatusList2021Args = {
  statusPurpose: StatusPurpose2021
}

export type UpdateOAuthStatusListArgs = {
  bitsPerStatus: BitsPerStatus
  statusPurpose: StatusOAuth
  expiresAt?: string
}

export interface UpdateStatusListFromEncodedListArgs {
  type?: StatusListType
  statusListIndex: number | string
  value: boolean
  proofFormat?: ProofFormat
  keyRef?: string
  correlationId?: string
  encodedList: string
  issuer: string | IIssuer
  id: string
  statusList2021?: UpdateStatusList2021Args
  oauthStatusList?: UpdateOAuthStatusListArgs
}

export interface UpdateStatusListFromStatusListCredentialArgs {
  statusListCredential: OriginalVerifiableCredential | CompactJWT
  keyRef?: string
  statusListIndex: number | string
  value: boolean
}

export interface StatusListDetails {
  encodedList: string
  length: number
  type: StatusListType
  proofFormat: ProofFormat
  statusPurpose?: StatusPurpose2021 | StatusOAuth
  id: string
  issuer: string | IIssuer
  indexingDirection: StatusListIndexingDirection
  statusListCredential: OriginalVerifiableCredential
  // These cannot be deduced from the VC, so they are present when callers pass in these values as params
  correlationId?: string
  driverType?: StatusListDriverType
  credentialIdMode?: StatusListCredentialIdMode
}

export interface StatusListResult extends StatusListDetails {
  statusListCredential: OriginalVerifiableCredential
}

export interface StatusList2021EntryCredentialStatus extends ICredentialStatus {
  type: 'StatusList2021Entry'
  statusPurpose: StatusPurpose2021
  statusListIndex: string
  statusListCredential: string
}

export interface StatusList2021ToVerifiableCredentialArgs {
  issuer: string | IIssuer
  id: string
  type?: StatusListType
  proofFormat?: ProofFormat
  keyRef?: string
  encodedList: string
  statusPurpose: StatusPurpose2021
}

/**
 * The interface definition for a plugin that can add statuslist info to a credential
 *
 * @remarks Please see {@link https://www.w3.org/TR/vc-data-model | W3C Verifiable Credentials data model}
 *
 * @beta This API is likely to change without a BREAKING CHANGE notice
 */
export interface IStatusListPlugin extends IPluginMethodMap {
  /**
   * Create a new status list
   *
   * @param args Status list information like type and size
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   *
   * @returns - The details of the newly created status list
   */
  slCreateStatusList(args: CreateNewStatusListArgs, context: IRequiredContext): Promise<StatusListDetails>

  /**
   * Ensures status list info like index and list id is added to a credential
   *
   * @param args - Arguments necessary to add the statuslist info.
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   *
   * @returns - a promise that resolves to the credential now with status support
   *
   * @beta This API is likely to change without a BREAKING CHANGE notice
   */
  slAddStatusToCredential(args: IAddStatusToCredentialArgs, context: IRequiredContext): Promise<CredentialWithStatusSupport>

  /**
   * Get the status list using the configured driver for the SL. Normally a correlationId or id should suffice. Optionally accepts a dbName/datasource
   * @param args
   * @param context
   */
  slGetStatusList(args: GetStatusListArgs, context: IRequiredContext): Promise<StatusListDetails>
}

export type CreateNewStatusListFuncArgs = BaseCreateNewStatusListArgs

export type CreateNewStatusListArgs = BaseCreateNewStatusListArgs & {
  dataSource?: OrPromise<DataSource>
  dbName?: string
  isDefault?: boolean
}

export type IAddStatusToCredentialArgs = Omit<IIssueCredentialStatusOpts, 'dataSource'> & {
  credential: CredentialWithStatusSupport
}

export interface IIssueCredentialStatusOpts {
  dataSource?: DataSource
  credentialId?: string // An id to use for the credential. Normally should be set as the crdential.id value
  statusListId?: string // Explicit status list to use. Determines the id from the credentialStatus object in the VC itself or uses the default otherwise
  statusListIndex?: number | string
  statusEntryCorrelationId?: string // An id to use for correlation. Can be the credential id, but also a business identifier. Will only be used for lookups/management
  value?: string
}

export type GetStatusListArgs = {
  id?: string
  correlationId?: string
  dataSource?: OrPromise<DataSource>
  dbName?: string
}

export type CredentialWithStatusSupport = ICredential | CredentialPayload | IVerifiableCredential

export type IRequiredPlugins = ICredentialPlugin & IIdentifierResolution
export type IRequiredContext = IAgentContext<ICredentialIssuer & ICredentialVerifier & IIdentifierResolution>
