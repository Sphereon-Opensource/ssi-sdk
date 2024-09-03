import { contextHasPlugin } from '@sphereon/ssi-sdk.agent-config'
import {
  CredentialRole,
  DigitalCredential,
  FindDigitalCredentialArgs,
  NonPersistedDigitalCredential,
  UpdateCredentialStateArgs,
} from '@sphereon/ssi-sdk.data-store'
import {
  Hasher,
  ICredential,
  IPresentation,
  IVerifiableCredential,
  IVerifiablePresentation,
  OriginalVerifiableCredential,
  OriginalVerifiablePresentation,
} from '@sphereon/ssi-types'
import { IAgentContext, IPluginMethodMap } from '@veramo/core'
import { FindClaimsArgs } from './claims'

export type { UpdateCredentialStateArgs } // TODO create a local copy?

export interface ICredentialStore extends IPluginMethodMap {
  /**
   * Add a new credential.
   * @param args
   */
  crsAddCredential(args: AddCredentialArgs): Promise<DigitalCredential>

  /**
   * Update credential the state of an existing credential.
   * @param args
   */
  crsUpdateCredentialState(args: UpdateCredentialStateArgs): Promise<DigitalCredential>

  /**
   * Get a single credentials by primary key
   * @param args
   */
  crsGetCredential(args: GetCredentialArgs): Promise<DigitalCredential>

  /**
   * Find one or more credentials using filters
   * @param args
   */
  crsGetCredentials(args: GetCredentialsArgs): Promise<Array<DigitalCredential>>

  /**
   * Find one or more credentials using filters
   * @param args
   */
  crsGetUniqueCredentials(args: GetCredentialsArgs): Promise<Array<UniqueDigitalCredential>>

  /**
   * Find one credential by id or hash
   * @param args
   */
  crsGetUniqueCredentialByIdOrHash(args: GetCredentialsByIdOrHashArgs): Promise<OptionalUniqueDigitalCredential>

  /**
   * Returns a list of UniqueDigitalCredentials that match the given filter based on the claims they contain.
   * @param args
   */
  crsGetCredentialsByClaims(args: GetCredentialsByClaimsArgs): Promise<Array<UniqueDigitalCredential>>

  /**
   * Returns a count of UniqueDigitalCredentials that match the given filter based on the claims they contain.
   * @param args
   */
  crsGetCredentialsByClaimsCount(args: GetCredentialsByClaimsArgs): Promise<number>

  /**
   * Delete a single credentials by primary key
   * @param args
   */
  crsDeleteCredential(args: DeleteCredentialArgs): Promise<boolean>

  /**
   * Delete multiple credentials records using filters
   * @param args
   */
  crsDeleteCredentials(args: DeleteCredentialsArgs): Promise<number>
}

/**
 *
 * @param context
 * @internal
 */
export function contextHasCredentialStore(context: IAgentContext<IPluginMethodMap>): context is IAgentContext<ICredentialStore> {
  return contextHasPlugin(context, 'crsGetCredential')
}

export type GetCredentialArgs = {
  id: string
}

export type GetCredentialsArgs = {
  filter: FindDigitalCredentialArgs
}

export type GetCredentialsByClaimsArgs = {
  filter: FindClaimsArgs
  credentialRole?: CredentialRole
  tenantId?: string
}

export type GetCredentialsByIdOrHashArgs = {
  credentialRole: CredentialRole
  idOrHash: string
}

export type DeleteCredentialArgs = { id: string } | { hash: string }

export type DeleteCredentialsArgs = GetCredentialsArgs

export type AddDigitalCredential = Omit<
  NonPersistedDigitalCredential,
  'id' | 'documentType' | 'documentFormat' | 'uniformDocument' | 'hash' | 'createdAt' | 'lastUpdatedAt' | 'validFrom' | 'validUntil'
>

export type AddCredentialArgs = {
  credential: AddDigitalCredential
  opts?: { maxTimeSkewInMS?: number; hasher?: Hasher }
}

export interface UniqueDigitalCredential {
  hash: string
  id?: string
  digitalCredential: DigitalCredential

  originalVerifiableCredential?: OriginalVerifiableCredential
  originalVerifiablePresentation?: OriginalVerifiablePresentation
  originalCredential?: ICredential
  originalPresentation?: IPresentation
  uniformVerifiableCredential?: IVerifiableCredential
  uniformVerifiablePresentation?: IVerifiablePresentation
}

export type OptionalUniqueDigitalCredential = UniqueDigitalCredential | undefined

export type RequiredContext = IAgentContext<never>
