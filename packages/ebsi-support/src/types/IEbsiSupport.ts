import { DiscoveryMetadataPayload, JWK } from '@sphereon/did-auth-siop'
import { OID4VCICredentialFormat, RequestObjectOpts } from '@sphereon/oid4vci-common'
import { Format, PresentationDefinitionV2 } from '@sphereon/pex-models'
import { IIdentifierResolution, ManagedIdentifierDidOpts, ManagedIdentifierDidResult } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { IJwtService } from '@sphereon/ssi-sdk-ext.jwt-service'
import { CredentialRole, IBasicCredentialLocaleBranding, Party } from '@sphereon/ssi-sdk.data-store'
import { ErrorDetails, IOID4VCIHolder, MappedCredentialToAccept } from '@sphereon/ssi-sdk.oid4vci-holder'
import { IPresentationExchange } from '@sphereon/ssi-sdk.presentation-exchange'
import { IDidAuthSiopOpAuthenticator } from '@sphereon/ssi-sdk.siopv2-oid4vp-op-auth'
import { PresentationSubmission, W3CVerifiableCredential } from '@sphereon/ssi-types'
import { IAgentContext, IDIDManager, IKeyManager, IPluginMethodMap, IResolver } from '@veramo/core'
import { CreateEbsiDidOnLedgerResult, CreateEbsiDidParams } from '../did'
import { AttestationAuthRequestUrlResult } from '../functions'

/**
 * The OpenID scope
 * @readonly
 * @enum {string}
 */
export type EBSIScope =
  | 'didr_write'
  | 'didr_invite'
  | 'tir_write'
  | 'tir_invite'
  | 'timestamp_write'
  | 'tnt_authorise'
  | 'tnt_create'
  | 'tnt_write'
  | 'did_authn'

export enum TokenType {
  BEARER = 'Bearer',
}

export type EbsiEnvironment = 'pilot' | 'conformance' | 'conformance-test'
export type EbsiApiVersion = 'v3' | 'v4' | 'v5'
export type WellknownType = 'openid-credential-issuer' | 'openid-configuration'
export type EbsiMock = 'issuer-mock' | 'auth-mock'
export type EbsiSystem = 'authorisation' | 'conformance' | 'did-registry'

export type ApiOpts = { environment?: EbsiEnvironment; version: EbsiApiVersion }
export type WellknownOpts = ApiOpts & { type: WellknownType; system?: EbsiSystem | EbsiEnvironment; mock?: EbsiMock }

export interface IEbsiSupport extends IPluginMethodMap {
  ebsiCreateDidOnLedger(args: CreateEbsiDidParams, context: IRequiredContext): Promise<CreateEbsiDidOnLedgerResult>

  ebsiWellknownMetadata(args?: ApiOpts): Promise<GetOIDProviderMetadataResponse>

  ebsiAuthorizationServerJwks(args?: ApiOpts): Promise<GetOIDProviderJwksResponse>

  ebsiPresentationDefinitionGet(args: GetPresentationDefinitionArgs): Promise<GetPresentationDefinitionResponse>

  ebsiAccessTokenGet(args: EBSIAuthAccessTokenGetArgs, context: IRequiredContext): Promise<GetAccessTokenResult>

  ebsiCreateAttestationAuthRequestURL(args: CreateAttestationAuthRequestURLArgs, context: IRequiredContext): Promise<AttestationAuthRequestUrlResult>

  ebsiGetAttestation(args: GetAttestationArgs, context: IRequiredContext): Promise<AttestationResult>
}

// export type ApiOpts = { environment?: EbsiEnvironment; version?: string }

/**
 * @typedef EbsiOpenIDMetadata
 * @type {object}
 * @property {(URL | string)} issuer URL using the https scheme with no query or fragment component that the OP asserts as its Issuer Identifier. MUST be identical to the iss Claim value in ID Tokens issued from this Issuer.
 * @property {(URL | string)} authorization_endpoint URL of the OP's OAuth 2.0 Authorization Endpoint.
 * @property {(URL | string)} token_endpoint URL of the OP's OAuth 2.0 Token Endpoint.
 * @property {(URL | string)} [presentation_definition_endpoint] URL of the OP's presentation definitions endpoint. Non-standard, used in EBSI
 * @property {(URL | string)} jwks_uri URL of the authorization server's JWK Set [JWK] document
 * @property {string[]} scopes_supported JSON array containing a list of the OAuth 2.0 [RFC6749] scope values that this server supports. (SIOP v2)
 * @property {string[]} response_types_supported JSON array containing a list of the OAuth 2.0 "response_type" values that this authorization server supports (SIOP v2)
 * @property {string[]} [response_mode_supported] JSON array containing a list of the OAuth 2.0 response_mode values that this OP supports
 * @property {string[]} [grant_types_supported] JSON array containing a list of the OAuth 2.0 grant type values that this authorization server supports.
 * @property {string[]} subject_types_supported JSON array containing a list of the Subject Identifier types that this OP supports.
 * @property {string[]} id_token_signing_alg_values_supported JSON array containing a list of the JWS signing algorithms (alg values) supported by the OP for the ID Token to encode the Claims in a JWT
 * @property {string[]} [request_object_signing_alg_values_supported] JSON array containing a list of the JWS signing algorithms (alg values) supported by the OP for Request Objects
 * @property {string[]} [request_parameter_supported] Boolean value specifying whether the OP supports use of the request parameter, with true indicating support
 * @property {string[]} [token_endpoint_auth_methods_supported] JSON array containing a list of client authentication methods supported by this token endpoint
 * @property {{ authorization_endpoint: string[] }} [request_authentication_methods_supported] A JSON Object defining the client authentications supported for each endpoint
 * @property {string[]} [vp_formats_supported] An object containing a list of key value pairs, where the key is a string identifying a credential format supported by the AS
 * @property {(URL[] | string[])} [subject_syntax_types_supported]  A JSON array of strings representing URI scheme identifiers and optionally method names of supported Subject Syntax Types
 * @property {string[]} [subject_trust_frameworks_supported] A JSON array of supported trust frameworks.
 * @property {string[]} [id_token_types_supported] A JSON array of strings containing the list of ID Token types supported by the OP
 */
export type EbsiOpenIDMetadata = DiscoveryMetadataPayload & {
  presentation_definition_endpoint?: URL | string
}

/**
 * JSON Web Key Set
 * @typedef GetOIDProviderJwksSuccessResponse
 * @property {JWK[]} keys
 */
export interface GetOIDProviderJwksSuccessResponse {
  keys: JWK[]
}

/**
 * @typedef GetPresentationDefinitionArgs
 * @type {object}
 * @property {EBSIScope} scope
 * @property {ApiOpts} [apiOpts] The environment and version of the API
 */
export interface GetPresentationDefinitionArgs {
  scope: EBSIScope
  apiOpts?: WellknownOpts
  openIDMetadata?: EbsiOpenIDMetadata
}

export type CreateAttestationAuthRequestURLArgs = {
  credentialIssuer: string
  credentialType: string
  idOpts: ManagedIdentifierDidOpts
  requestObjectOpts: RequestObjectOpts
  clientId?: string
  redirectUri?: string
  formats?: Array<Extract<OID4VCICredentialFormat, 'jwt_vc' | 'jwt_vc_json'>>
}

export type GetAttestationArgs = {
  clientId: string
  authReqResult: AttestationAuthRequestUrlResult
  opts?: {
    timeout: number
  }
}

/**
 * Presentation Definition V2
 * @typedef GetPresentationDefinitionSuccessResponse
 * @type {object}
 * @property {string} id A UUID or some other unique ID to identify this Presentation Definition
 * @property {string} [name] A name property is a human-friendly string intended to constitute a distinctive designation of the Presentation Definition.
 * @property {string} [purpose] It describes the purpose for which the Presentation Definition's inputs are being requested.
 * @property {Format} [format] What claim variants Verifiers and Holders support.
 * @property {SubmissionRequirement[]} [submission_requirements] List of requirements for described inputs in input descriptors.
 * @property {InputDescriptor[]} input_descriptors List of descriptions of the required inputs.
 * @property {object} [frame] a JSON LD Framing Document object.
 */
export type GetPresentationDefinitionSuccessResponse = PresentationDefinitionV2 & {
  format?: Pick<Format, 'jwt_vc' | 'jwt_vc_json' | 'jwt_vp' | 'jwt_vp_json'>
}

/**
 * @typedef GetAccessTokenArgs
 * @type {object}
 * @property {string} grant_type MUST be set to "vp_token"
 * @property {string} vp_token  Signed Verifiable Presentation. See also the VP Token schema definition.
 * @property {PresentationSubmission} presentation_submission Descriptor for the vp_token, linked by presentation_definition. See also the Presentation Definition schema.
 * @property {EBSIScope} scope Possible values: [openid didr_write, openid didr_invite, openid tir_write, openid tir_invite, openid timestamp_write, openid tnt_authorise, openid tnt_create, openid tnt_write] OIDC scope
 * @property {ApiOpts} [apiOpts] The environment and the version of the API
 */
export interface GetAccessTokenArgs {
  grant_type?: string
  vp_token: string
  presentation_submission: PresentationSubmission
  scope: EBSIScope
  openIDMetadata?: EbsiOpenIDMetadata
  apiOpts: ApiOpts
}

export type GetAccessTokenResult = {
  identifier: ManagedIdentifierDidResult
  scope: EBSIScope
  // vp: VerifiablePresentationWithDefinition
  // definition: PresentationDefinitionWithLocation
  accessTokenResponse: GetAccessTokenSuccessResponse
}
/**
 * @typedef EBSIAuthAccessTokenGetArgs
 * @type {object}
 * @property {string} attestationCredential Verifiable Credential (Verifiable Authorisation to Onboard) JWT format
 // * @property {ScopeByDefinition} definitionId The presentation definition id
 * @property {string} [domain] The domain of the issuer
 * @property {string} did The did of the VP issuer
 * @property {string} kid kid in the format: did#kid
 * @property {EBSIScope} scope Needed to retrieve the authentication request
 * @property {ApiOpts} [apiOpts] The environment and the version of the API
 */
export interface EBSIAuthAccessTokenGetArgs {
  clientId: string
  credentialRole: CredentialRole
  credentialIssuer?: string
  attestationCredential?: W3CVerifiableCredential
  allVerifiableCredentials?: W3CVerifiableCredential[]
  redirectUri?: string
  jwksUri: string
  // definitionId: ScopeByDefinition
  idOpts: ManagedIdentifierDidOpts
  scope: EBSIScope
  environment: EbsiEnvironment
  skipDidResolution?: boolean
}

/**
 * @typedef GetAccessTokenSuccessResponse
 * @type {object}
 * @property {string} access_token ^(([A-Za-z0-9\-_])+\.)([A-Za-z0-9\-_]+)(\.([A-Za-z0-9\-_]+)?$ The access token issued by the authorization server in JWS format. See also the "Access Token" schema definition
 * @property {TokenType} token_type Possible values: [Bearer]/MUST be Bearer
 * @property {number} [expires_in] Possible values: >= 1. The lifetime in seconds of the access token
 * @property {EBSIScope} scope  Possible values: [openid didr_write, openid didr_invite, openid tir_invite, openid tir_write, openid timestamp_write, openid tnt_authorise, openid tnt_create, openid tnt_write] The scope of the access token
 * @property {string} id_token ^(([A-Za-z0-9\-_])+\.)([A-Za-z0-9\-_]+)(\.([A-Za-z0-9\-_]+)?$ ID Token value associated with the authenticated session. Presents client's identity. ID Token is issued in a JWS format. See also the "ID Token" schema definition.
 * @property {ApiOpts} apiOpts The environment and the version of the API
 */
export interface GetAccessTokenSuccessResponse {
  access_token: string
  token_type: TokenType
  expires_in?: number
  scope: EBSIScope
  id_token: string
  apiOpts: ApiOpts
}

/**
 * @typedef ExceptionResponse
 * @type {object}
 * @property {(URL | string)} [type] An absolute URI that identifies the problem type. When dereferenced, it SHOULD provide human-readable documentation for the problem type.
 * @property {string} [title] A short summary of the problem type.
 * @property {number} [status] Possible values: >= 400 and <= 600.  The HTTP status code generated by the origin server for this occurrence of the problem.
 * @property {string} [detail] A human readable explanation specific to this occurrence of the problem.
 * @property {(URL | string)} [instance] An absolute URI that identifies the specific occurrence of the problem. It may or may not yield further information if dereferenced.
 */
export interface ExceptionResponse {
  type?: URL | string
  title?: string
  status?: number
  detail?: string
  instance?: URL | string
}

export type AttestationResult = {
  contactAlias: string
  contact: Party
  credentialBranding?: Record<string, Array<IBasicCredentialLocaleBranding>> | undefined
  identifier: ManagedIdentifierDidResult
  error: ErrorDetails | undefined
  credentials: Array<MappedCredentialToAccept>
}

export type GetOIDProviderMetadataResponse = EbsiOpenIDMetadata
export type GetOIDProviderJwksResponse = GetOIDProviderJwksSuccessResponse | ExceptionResponse
export type GetPresentationDefinitionResponse = GetPresentationDefinitionSuccessResponse
export type GetAccessTokenResponse = GetAccessTokenSuccessResponse | ExceptionResponse
export type IRequiredContext = IAgentContext<
  IKeyManager &
    IDIDManager &
    IResolver &
    IIdentifierResolution &
    IJwtService &
    IDidAuthSiopOpAuthenticator &
    IPresentationExchange &
    IOID4VCIHolder &
    IEbsiSupport
>
