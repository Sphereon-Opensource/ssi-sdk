import { PresentationDefinitionLocation, PresentationDefinitionWithLocation, SupportedVersion } from '@sphereon/did-auth-siop'
import { CreateRequestObjectMode } from '@sphereon/oid4vci-common'
import { IPEXFilterResult } from '@sphereon/ssi-sdk.presentation-exchange'
import { CredentialMapper, PresentationSubmission } from '@sphereon/ssi-types'
import { IAgentPlugin } from '@veramo/core'
import fetch from 'cross-fetch'
import { CreateEbsiDidOnLedgerResult, CreateEbsiDidParams } from '../did'
import { determineWellknownEndpoint, ebsiCreateDidOnLedger as ebsiCreateDidOnLedgerFunction, ebsiGetIssuerMock } from '../did/functions'
import { ebsiCreateAttestationAuthRequestURL, ebsiGetAttestation } from '../functions'
import {
  ApiOpts,
  EBSIAuthAccessTokenGetArgs,
  EbsiOpenIDMetadata,
  GetAccessTokenResult,
  GetPresentationDefinitionSuccessResponse,
  IRequiredContext,
  schema,
  WellknownOpts,
} from '../index'
import {
  ExceptionResponse,
  GetAccessTokenArgs,
  GetAccessTokenResponse,
  GetOIDProviderJwksResponse,
  GetOIDProviderMetadataResponse,
  GetPresentationDefinitionArgs,
  GetPresentationDefinitionResponse,
  IEbsiSupport,
} from '../types/IEbsiSupport'

import { v4 } from 'uuid'
import { CheckLinkedDomain } from '@sphereon/did-auth-siop-adapter'

export const ebsiSupportMethods: Array<string> = [
  'ebsiCreateDidOnLedger',
  'ebsiWellknownMetadata',
  'ebsiAuthorizationServerJwks',
  'ebsiPresentationDefinitionGet',
  'ebsiAccessTokenGet',
  'ebsiCreateAttestationAuthRequestURL',
  'ebsiGetAttestation',
]

export class EbsiSupport implements IAgentPlugin {
  readonly schema = schema.IEbsiSupport
  readonly methods: IEbsiSupport = {
    ebsiCreateDidOnLedger: this.ebsiCreateDidOnLedger.bind(this),
    ebsiWellknownMetadata: this.ebsiWellknownMetadata.bind(this),
    ebsiAuthorizationServerJwks: this.ebsiAuthorizationServerJwks.bind(this),
    ebsiPresentationDefinitionGet: this.ebsiPresentationDefinitionGet.bind(this),
    ebsiAccessTokenGet: this.ebsiAccessTokenGet.bind(this),
    ebsiCreateAttestationAuthRequestURL: ebsiCreateAttestationAuthRequestURL.bind(this),
    ebsiGetAttestation: ebsiGetAttestation.bind(this),
  }

  private async ebsiCreateDidOnLedger(args: CreateEbsiDidParams, context: IRequiredContext): Promise<CreateEbsiDidOnLedgerResult> {
    return await ebsiCreateDidOnLedgerFunction(args, context)
  }

  private async ebsiWellknownMetadata(args: WellknownOpts): Promise<GetOIDProviderMetadataResponse> {
    const url = determineWellknownEndpoint(args)
    return await (
      await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })
    ).json()
  }

  private async ebsiAuthorizationServerJwks(args: ApiOpts): Promise<GetOIDProviderJwksResponse | ExceptionResponse> {
    const discoveryMetadata: EbsiOpenIDMetadata = await this.ebsiWellknownMetadata({
      ...args,
      type: 'openid-configuration',
    })
    return await (
      await fetch(`${discoveryMetadata.jwks_uri}`, {
        method: 'GET',
        headers: {
          Accept: 'application/jwk-set+json',
        },
      })
    ).json()
  }

  private async ebsiPresentationDefinitionGet(args: GetPresentationDefinitionArgs): Promise<GetPresentationDefinitionResponse> {
    const { scope, apiOpts, openIDMetadata } = args
    const discoveryMetadata: EbsiOpenIDMetadata =
      openIDMetadata ??
      (await this.ebsiWellknownMetadata({
        ...apiOpts,
        type: 'openid-configuration',
        system: apiOpts?.mock ? 'authorisation' : apiOpts?.system,
        version: apiOpts?.version ?? 'v4',
      }))
    return (await (
      await fetch(`${discoveryMetadata.presentation_definition_endpoint}?scope=openid%20${scope}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })
    ).json()) satisfies GetPresentationDefinitionSuccessResponse
  }

  private async ebsiAccessTokenGet(args: EBSIAuthAccessTokenGetArgs, context: IRequiredContext): Promise<GetAccessTokenResult> {
    const { scope, idOpts, jwksUri, clientId, allVerifiableCredentials, redirectUri, environment, skipDidResolution = false } = args
    const identifier = await context.agent.identifierManagedGetByDid(idOpts)
    console.log(`Getting access token for ${identifier.did}, scope ${scope} and clientId=${clientId}, skipDidResolution=${skipDidResolution}...`)
    const openIDMetadata = await this.ebsiWellknownMetadata({
      environment,
      version: 'v4',
      mock: undefined,
      system: 'authorisation',
      type: 'openid-configuration',
    })
    const definitionResponse = await this.ebsiPresentationDefinitionGet({
      ...args,
      openIDMetadata,
      apiOpts: { environment, version: 'v4', type: 'openid-configuration' },
    })
    const hasInputDescriptors = definitionResponse.input_descriptors.length > 0
    console.log(`PD response`, definitionResponse)

    if (!hasInputDescriptors) {
      // Yes EBSI expects VPs without a VC in some situations. This is not according to the PEX spec!
      // They probably should have used SIOP in these cases. We need to go through hoops as our libs do not expect PDs/VPs without VCs :(
      console.warn(`No INPUT descriptor returned for scope ${scope}`)
    }

    let attestationCredential = args.attestationCredential

    if (hasInputDescriptors && !attestationCredential) {
      if (allVerifiableCredentials && allVerifiableCredentials.length > 0) {
        const pexResult = await context.agent.pexDefinitionFilterCredentials({
          presentationDefinition: definitionResponse,
          credentialFilterOpts: { credentialRole: args.credentialRole, verifiableCredentials: allVerifiableCredentials },
        })
        if (pexResult.filteredCredentials.length > 0) {
          const filtered = pexResult.filteredCredentials
            .map((cred) => CredentialMapper.toUniformCredential(cred))
            .filter((cred) => {
              if (!cred.expirationDate) {
                return cred
              } else if (new Date(cred.expirationDate!).getDate() >= Date.now()) {
                return cred
              }
              return undefined
            })
            .filter((cred) => !!cred)
          if (filtered.length > 0) {
            attestationCredential = filtered[0]
          }
        }
      }
      if (!attestationCredential) {
        console.log(`No attestation credential present. Will get one from within access token method!`)
        const credentialIssuer = args.credentialIssuer ?? ebsiGetIssuerMock({ environment })
        const authReqResult = await context.agent.ebsiCreateAttestationAuthRequestURL({
          credentialIssuer,
          idOpts,
          formats: ['jwt_vc'],
          clientId,
          redirectUri,
          requestObjectOpts: {
            iss: clientId,
            requestObjectMode: CreateRequestObjectMode.REQUEST_OBJECT,
            jwksUri,
          },
          credentialType: 'VerifiableAuthorisationToOnboard',
        })
        const attestationResult = await context.agent.ebsiGetAttestation({
          authReqResult,
          clientId,
          opts: { timeout: 30_000 },
        })
        // @ts-ignore
        attestationCredential = attestationResult.credentials[0]!.rawVerifiableCredential! as W3CVerifiableCredential
      }
    }

    const definition = {
      definition: definitionResponse,
      location: PresentationDefinitionLocation.TOPLEVEL_PRESENTATION_DEF,
      version: SupportedVersion.SIOPv2_D11,
    } satisfies PresentationDefinitionWithLocation

    const pexResult = hasInputDescriptors
      ? await context.agent.pexDefinitionFilterCredentials({
          presentationDefinition: definitionResponse,
          credentialFilterOpts: { credentialRole: args.credentialRole, verifiableCredentials: [attestationCredential!] },
        })
      : ({
          // LOL, let's see whether we can trick PEX to create a VP without VCs
          filteredCredentials: [],
          id: definitionResponse.id,
          selectResults: { verifiableCredential: [], areRequiredCredentialsPresent: 'info' },
        } satisfies IPEXFilterResult)
    const opSession = await context.agent.siopRegisterOPSession({
      requestJwtOrUri: '', // Siop assumes we use an auth request, which we don't have in this case
      op: { checkLinkedDomains: CheckLinkedDomain.NEVER },
      providedPresentationDefinitions: [definition],
    })
    const oid4vp = await opSession.getOID4VP({ allIdentifiers: [identifier.did] })
    const vp = await oid4vp.createVerifiablePresentation(
      args.credentialRole,
      { definition, credentials: pexResult.filteredCredentials },
      {
        proofOpts: { domain: openIDMetadata.issuer, nonce: v4(), created: new Date(Date.now() - 120_000).toString() },
        holder: identifier.did,
        idOpts: idOpts,
        skipDidResolution,
        forceNoCredentialsInVP: !hasInputDescriptors,
      },
    )

    const presentationSubmission = hasInputDescriptors
      ? vp.presentationSubmission
      : ({ id: v4(), definition_id: definitionResponse.id, descriptor_map: [] } satisfies PresentationSubmission)

    console.log(`Presentation submission`, presentationSubmission)
    const tokenRequestArgs = {
      grant_type: 'vp_token',
      vp_token: CredentialMapper.toCompactJWT(vp.verifiablePresentation),
      scope,
      presentation_submission: presentationSubmission,
      apiOpts: { environment, version: 'v4' },
      openIDMetadata,
    } satisfies GetAccessTokenArgs

    console.log(`Access token request:\r\n${JSON.stringify(tokenRequestArgs)}`)
    const accessTokenResponse = await this.getAccessToken(tokenRequestArgs)

    console.log(`Access token response:\r\n${JSON.stringify(accessTokenResponse)}`)
    if (!('access_token' in accessTokenResponse)) {
      throw Error(`Error response: ${JSON.stringify(accessTokenResponse)}`)
    }

    return {
      accessTokenResponse,
      // vp,
      scope,
      // definition,
      identifier: identifier,
    }
  }

  private async getAccessToken(args: GetAccessTokenArgs): Promise<GetAccessTokenResponse> {
    const { grant_type = 'vp_token', scope, vp_token, presentation_submission, apiOpts, openIDMetadata } = args
    const discoveryMetadata: EbsiOpenIDMetadata =
      openIDMetadata ??
      (await this.ebsiWellknownMetadata({
        ...apiOpts,
        type: 'openid-configuration',
      }))
    const request = {
      grant_type,
      scope: `openid ${scope}`,
      vp_token,
      presentation_submission: JSON.stringify(presentation_submission),
    }
    return await (
      await fetch(`${discoveryMetadata.token_endpoint}`, {
        method: 'POST',
        headers: {
          ContentType: 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams(request),
      })
    ).json()
  }
}
