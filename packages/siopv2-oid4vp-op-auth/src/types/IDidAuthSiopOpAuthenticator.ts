import {
  PresentationDefinitionWithLocation,
  PresentationSignCallback,
  ResponseMode,
  SupportedVersion,
  URI,
  VerifiablePresentationTypeFormat,
  VerifiedAuthorizationRequest,
  VerifyJwtCallback,
  VPTokenLocation,
} from '@sphereon/did-auth-siop'
import { CheckLinkedDomain, ResolveOpts } from '@sphereon/did-auth-siop-adapter'
import { DIDDocument } from '@sphereon/did-uni-client'
import { VerifiablePresentationResult } from '@sphereon/pex'
import { IIdentifierResolution, ManagedIdentifierOptsOrResult } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { IJwtService } from '@sphereon/ssi-sdk-ext.jwt-service'
import { ICredentialStore, UniqueDigitalCredential } from '@sphereon/ssi-sdk.credential-store'
import { Party } from '@sphereon/ssi-sdk.data-store'
import { IPDManager } from '@sphereon/ssi-sdk.pd-manager'
import { ISDJwtPlugin } from '@sphereon/ssi-sdk.sd-jwt'
import { Hasher, OriginalVerifiableCredential, PresentationSubmission, W3CVerifiablePresentation } from '@sphereon/ssi-types'
import { VerifyCallback } from '@sphereon/wellknown-dids-client'
import {
  IAgentContext,
  ICredentialIssuer,
  ICredentialVerifier,
  IDataStoreORM,
  IDIDManager,
  IKeyManager,
  IPluginMethodMap,
  IResolver,
} from '@veramo/core'
import { EventEmitter } from 'events'
import { OpSession } from '../session'
import { Siopv2Machine as Siopv2MachineId } from './machine'
import {
  AddIdentityArgs,
  CreateConfigArgs,
  CreateConfigResult,
  GetMachineArgs,
  GetSelectableCredentialsArgs,
  GetSiopRequestArgs,
  RequiredContext,
  RetrieveContactArgs,
  SelectableCredentialsMap,
  SendResponseArgs,
  Siopv2AuthorizationRequestData,
  Siopv2AuthorizationResponseData,
} from './siop-service'

export const LOGGER_NAMESPACE = 'sphereon:siopv2-oid4vp:op-auth'

export interface IDidAuthSiopOpAuthenticator extends IPluginMethodMap {
  siopGetOPSession(args: IGetSiopSessionArgs, context: IRequiredContext): Promise<OpSession>

  siopRegisterOPSession(args: Omit<IOpSessionArgs, 'context'>, context: IRequiredContext): Promise<OpSession>

  siopRemoveOPSession(args: IRemoveSiopSessionArgs, context: IRequiredContext): Promise<boolean>

  siopRegisterOPCustomApproval(args: IRegisterCustomApprovalForSiopArgs, context: IRequiredContext): Promise<void>

  siopRemoveOPCustomApproval(args: IRemoveCustomApprovalForSiopArgs, context: IRequiredContext): Promise<boolean>

  siopGetMachineInterpreter(args: GetMachineArgs, context: RequiredContext): Promise<Siopv2MachineId>

  siopCreateConfig(args: CreateConfigArgs): Promise<CreateConfigResult>

  siopGetSiopRequest(args: GetSiopRequestArgs, context: RequiredContext): Promise<Siopv2AuthorizationRequestData>

  siopRetrieveContact(args: RetrieveContactArgs, context: RequiredContext): Promise<Party | undefined>

  siopAddIdentity(args: AddIdentityArgs, context: RequiredContext): Promise<void>

  siopSendResponse(args: SendResponseArgs, context: RequiredContext): Promise<Siopv2AuthorizationResponseData>

  siopGetSelectableCredentials(args: GetSelectableCredentialsArgs, context: RequiredContext): Promise<SelectableCredentialsMap>
}

export interface IOpSessionArgs {
  sessionId?: string
  requestJwtOrUri: string | URI
  providedPresentationDefinitions?: Array<PresentationDefinitionWithLocation>
  identifierOptions?: ManagedIdentifierOptsOrResult
  context: IRequiredContext
  op?: IOPOptions
}

export interface IAuthRequestDetails {
  rpDIDDocument?: DIDDocument
  id: string
  verifiablePresentationMatches: IPresentationWithDefinition[]
  alsoKnownAs?: string[]
}

export interface IPresentationWithDefinition {
  location: VPTokenLocation
  definition: PresentationDefinitionWithLocation
  format: VerifiablePresentationTypeFormat
  presentation: W3CVerifiablePresentation
}

export interface IGetSiopSessionArgs {
  sessionId: string
}

export interface IRemoveSiopSessionArgs {
  sessionId: string
}

export interface IRegisterCustomApprovalForSiopArgs {
  key: string
  customApproval: (verifiedAuthorizationRequest: VerifiedAuthorizationRequest, sessionId: string) => Promise<void>
}

export interface IRemoveCustomApprovalForSiopArgs {
  key: string
}

export interface IOpsSendSiopAuthorizationResponseArgs {
  responseSignerOpts: ManagedIdentifierOptsOrResult
  // verifiedAuthorizationRequest: VerifiedAuthorizationRequest
  presentationSubmission?: PresentationSubmission
  verifiablePresentations?: W3CVerifiablePresentation[]
}

export enum events {
  DID_SIOP_AUTHENTICATED = 'didSiopAuthenticated',
}

export type IRequiredContext = IAgentContext<
  IDataStoreORM &
    IResolver &
    IDIDManager &
    IKeyManager &
    IIdentifierResolution &
    ICredentialIssuer &
    ICredentialVerifier &
    ICredentialStore &
    IPDManager &
    ISDJwtPlugin &
    IJwtService
>

export interface IOPOptions {
  responseMode?: ResponseMode
  supportedVersions?: SupportedVersion[]
  expiresIn?: number
  checkLinkedDomains?: CheckLinkedDomain
  skipDidResolution?: boolean
  eventEmitter?: EventEmitter
  supportedDIDMethods?: string[]

  verifyJwtCallback?: VerifyJwtCallback
  wellknownDIDVerifyCallback?: VerifyCallback

  presentationSignCallback?: PresentationSignCallback

  resolveOpts?: ResolveOpts
}

/*
export interface IIdentifierOpts {
  identifier: IIdentifier
  verificationMethodSection?: DIDDocumentSection
  kid?: string
}*/

export interface VerifiableCredentialsWithDefinition {
  definition: PresentationDefinitionWithLocation
  credentials: (UniqueDigitalCredential | OriginalVerifiableCredential)[]
}

export interface VerifiablePresentationWithDefinition extends VerifiablePresentationResult {
  definition: PresentationDefinitionWithLocation
  verifiableCredentials: OriginalVerifiableCredential[]
  idOpts: ManagedIdentifierOptsOrResult
}

export interface IOpSessionGetOID4VPArgs {
  allIdentifiers?: string[]
  hasher?: Hasher
}

export interface IOID4VPArgs {
  session: OpSession
  allIdentifiers?: string[]
  hasher?: Hasher
}

export interface IGetPresentationExchangeArgs {
  verifiableCredentials: OriginalVerifiableCredential[]
  allIdentifiers?: string[]
  hasher?: Hasher
}

export const DEFAULT_JWT_PROOF_TYPE = 'JwtProof2020'
