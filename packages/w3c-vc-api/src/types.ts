import { GenericAuthArgs, ISingleEndpointOpts } from '@sphereon/ssi-express-support'
import {
  IAgentContext,
  ICredentialIssuer,
  ICredentialPlugin,
  ICredentialVerifier,
  IDataStoreORM,
  IDIDManager,
  IKeyManager,
  IResolver,
} from '@veramo/core'
import { ProofFormat } from '@veramo/core'
import { ICredentialStore } from '@sphereon/ssi-sdk.credential-store'

export type IRequiredPlugins = IDataStoreORM &
  IDIDManager &
  IKeyManager &
  ICredentialIssuer &
  ICredentialVerifier &
  ICredentialStore &
  ICredentialPlugin &
  IResolver
export type IRequiredContext = IAgentContext<IRequiredPlugins>

// interface IVCAPISecurityOpts {}

export interface IVCAPIOpts {
  endpointOpts?: IVCAPIEndpointOpts
  // securityOpts?: IVCAPISecurityOpts
  issueCredentialOpts?: IVCAPIIssueOpts
}

export interface IVCAPIEndpointOpts {
  basePath?: string
  globalAuth?: GenericAuthArgs
  issueCredential?: IIssueCredentialEndpointOpts
  getCredentials?: ISingleEndpointOpts
  getCredential?: ISingleEndpointOpts
  deleteCredential?: ISingleEndpointOpts
  verifyCredential?: IVerifyCredentialEndpointOpts
  verifyPresentation?: ISingleEndpointOpts
}

export type vcApiFeatures = 'vc-verify' | 'vc-issue' | 'vc-persist'

export interface IVCAPIIssueOpts {
  enableFeatures?: vcApiFeatures[] // Feature to enable. If not defined or empty, all features will be enabled
  persistIssuedCredentials?: boolean // Whether the issuer persists issued credentials or not. Defaults to VC_PERSISTENCE feature flag being present or not

  /**
   * The desired format for the VerifiablePresentation to be created.
   */
  proofFormat: ProofFormat

  /**
   * Remove payload members during JWT-JSON transformation. Defaults to `true`.
   * See https://www.w3.org/TR/vc-data-model/#jwt-encoding
   */
  removeOriginalFields?: boolean

  /**
   * [Optional] The ID of the key that should sign this credential.
   * If this is not specified, the first matching key will be used.
   */
  keyRef?: string

  /**
   * When dealing with JSON-LD you also MUST provide the proper contexts.
   * Set this to `true` ONLY if you want the `@context` URLs to be fetched in case they are not preloaded.
   * The context definitions SHOULD rather be provided at startup instead of being fetched.
   *
   * Defaults to `false`
   */
  fetchRemoteContexts?: boolean
}

export interface IIssueCredentialEndpointOpts extends ISingleEndpointOpts {
  issueCredentialOpts?: IVCAPIIssueOpts
  persistIssuedCredentials?: boolean
}

export interface IVerifyCredentialEndpointOpts extends ISingleEndpointOpts {
  fetchRemoteContexts?: boolean
}

export interface IIssueOptionsPayload {
  created?: string
  challenge?: string
  domain?: string
  credentialStatus?: {
    type: string
  }
}

export interface ChallengeOptsPayload {
  challenge?: string
  domain?: string
}
