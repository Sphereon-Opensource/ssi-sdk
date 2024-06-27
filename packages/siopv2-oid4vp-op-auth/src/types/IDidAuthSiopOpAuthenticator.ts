import {
  CheckLinkedDomain,
  PresentationDefinitionWithLocation,
  PresentationSignCallback,
  ResolveOpts,
  ResponseMode,
  SupportedVersion,
  URI,
  VerifiablePresentationTypeFormat,
  VerifiedAuthorizationRequest,
  VPTokenLocation,
} from '@sphereon/did-auth-siop'
import { DIDDocument } from '@sphereon/did-uni-client'
import { VerifiablePresentationResult } from '@sphereon/pex'
import { IIdentifierOpts } from '@sphereon/ssi-sdk-ext.did-utils'
import { PresentationSubmission, W3CVerifiableCredential, W3CVerifiablePresentation } from '@sphereon/ssi-types'
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
import { OpSession } from '../session/OpSession'
import { IPDManager } from '@sphereon/ssi-sdk.pd-manager'
import { Siopv2Machine as Siopv2MachineId } from './machine'
import { Party } from '@sphereon/ssi-sdk.data-store'
import {
  AddIdentityArgs,
  CreateConfigArgs,
  CreateConfigResult,
  GetMachineArgs,
  GetSiopRequestArgs,
  RequiredContext,
  RetrieveContactArgs,
  SendResponseArgs,
  Siopv2AuthorizationRequestData, Siopv2AuthorizationResponseData,
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
}

export interface IOpSessionArgs {
  sessionId?: string

  requestJwtOrUri: string | URI
  providedPresentationDefinitions?: Array<PresentationDefinitionWithLocation>
  idOpts?: IIdentifierOpts
  // identifier: IIdentifier
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
  responseSignerOpts: IIdentifierOpts
  // verifiedAuthorizationRequest: VerifiedAuthorizationRequest
  presentationSubmission?: PresentationSubmission
  verifiablePresentations?: W3CVerifiablePresentation[]
}

export enum events {
  DID_SIOP_AUTHENTICATED = 'didSiopAuthenticated',
}

export type IRequiredContext = IAgentContext<
  IDataStoreORM & IResolver & IDIDManager & IKeyManager & ICredentialIssuer & ICredentialVerifier & IPDManager
>

export interface IOPOptions {
  responseMode?: ResponseMode
  supportedVersions?: SupportedVersion[]
  expiresIn?: number
  checkLinkedDomains?: CheckLinkedDomain
  eventEmitter?: EventEmitter
  supportedDIDMethods?: string[]

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
  credentials: W3CVerifiableCredential[]
}

export interface VerifiablePresentationWithDefinition extends VerifiablePresentationResult {
  definition: PresentationDefinitionWithLocation
  verifiableCredentials: W3CVerifiableCredential[]
  identifierOpts: IIdentifierOpts
}
export const DEFAULT_JWT_PROOF_TYPE = 'JwtProof2020'
