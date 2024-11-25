import {
  AuthorizationServerMetadata,
  CredentialRequest,
  IssuerMetadata,
  Jwt,
  JwtVerifyResult,
  OID4VCICredentialFormat,
} from '@sphereon/oid4vci-common'
import { CredentialDataSupplier, CredentialIssuanceInput, CredentialSignerCallback, VcIssuer, VcIssuerBuilder } from '@sphereon/oid4vci-issuer'
import { getAgentResolver, IDIDOptions } from '@sphereon/ssi-sdk-ext.did-utils'
import { legacyKeyRefsToIdentifierOpts, ManagedIdentifierOptsOrResult } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { contextHasPlugin } from '@sphereon/ssi-sdk.agent-config'
import { IStatusListPlugin } from '@sphereon/ssi-sdk.vc-status-list'
import { CompactSdJwtVc, CredentialMapper, ICredential, W3CVerifiableCredential } from '@sphereon/ssi-types'
import { CredentialPayload, DIDDocument, ProofFormat } from '@veramo/core'
import { bytesToBase64 } from '@veramo/utils'
import { createJWT, decodeJWT, JWTVerifyOptions, verifyJWT } from 'did-jwt'
import { Resolvable } from 'did-resolver'
import { IIssuerOptions, IRequiredContext } from './types/IOID4VCIIssuer'
import { SdJwtVcPayload } from '@sphereon/ssi-sdk.sd-jwt/dist'

export function getJwtVerifyCallback({ verifyOpts }: { verifyOpts?: JWTVerifyOptions }, _context: IRequiredContext) {
  return async (args: { jwt: string; kid?: string }): Promise<JwtVerifyResult<DIDDocument>> => {
    const resolver = getAgentResolver(_context, {
      resolverResolution: true,
      uniresolverResolution: true,
      localResolution: true,
    })
    verifyOpts = { ...verifyOpts, resolver: verifyOpts?.resolver } // Resolver seperately as that is a function
    if (!verifyOpts?.resolver || typeof verifyOpts?.resolver?.resolve !== 'function') {
      verifyOpts.resolver = resolver
    }
    const result = await verifyJWT(args.jwt, verifyOpts)
    if (!result.verified) {
      console.log(`JWT invalid: ${args.jwt}`)
      throw Error('JWT did not verify successfully')
    }
    const jwt = (await decodeJWT(args.jwt)) as Jwt
    const kid = args.kid ?? jwt.header.kid
    if (!kid) {
      throw Error('No kid value found')
    }
    const did = kid.split('#')[0]
    const didResolution = await resolver.resolve(did)
    if (!didResolution || !didResolution.didDocument) {
      throw Error(`Could not resolve did: ${did}, metadata: ${didResolution?.didResolutionMetadata}`)
    }
    const didDocument = didResolution.didDocument
    const alg = jwt.header.alg
    return {
      alg,
      kid,
      did,
      didDocument,
      jwt,
    }
  }
}

export async function getAccessTokenKeyRef(
  opts: {
    /**
     * Uniform identifier options
     */
    idOpts?: ManagedIdentifierOptsOrResult
    /**
     * @deprecated
     */
    iss?: string
    /**
     * @deprecated
     */
    keyRef?: string
    /**
     * @deprecated
     */
    didOpts?: IDIDOptions
  },
  context: IRequiredContext,
) {
  let identifier = legacyKeyRefsToIdentifierOpts(opts)
  return await context.agent.identifierManagedGet(identifier)
}

export async function getAccessTokenSignerCallback(
  opts: {
    /**
     * Uniform identifier options
     */
    idOpts?: ManagedIdentifierOptsOrResult
    /**
     * @deprecated
     */
    iss?: string
    /**
     * @deprecated
     */
    keyRef?: string
    /**
     * @deprecated
     */
    didOpts?: IDIDOptions
  },
  context: IRequiredContext,
) {
  const signer = async (data: string | Uint8Array) => {
    let dataString, encoding: 'base64' | undefined

    const resolution = await legacyKeyRefsToIdentifierOpts(opts)
    const keyRef = resolution.kmsKeyRef
    if (!keyRef) {
      throw Error('Cannot sign access tokens without a key ref')
    }
    if (typeof data === 'string') {
      dataString = data
      encoding = undefined
    } else {
      dataString = bytesToBase64(data)
      encoding = 'base64'
    }
    return context.agent.keyManagerSign({ keyRef, data: dataString, encoding })
  }

  async function accessTokenSignerCallback(jwt: Jwt, kid?: string): Promise<string> {
    const issuer = opts?.iss ?? opts.didOpts?.idOpts?.identifier.toString()
    if (!issuer) {
      throw Error('No issuer configured for access tokens')
    }
    return await createJWT(jwt.payload, { signer, issuer }, { ...jwt.header, typ: 'JWT' })
  }

  return accessTokenSignerCallback
}

export async function getCredentialSignerCallback(
  idOpts: ManagedIdentifierOptsOrResult & {
    crypto?: Crypto
  },
  context: IRequiredContext,
): Promise<CredentialSignerCallback<DIDDocument>> {
  async function issueVCCallback(args: {
    credentialRequest: CredentialRequest
    credential: CredentialIssuanceInput
    jwtVerifyResult: JwtVerifyResult<DIDDocument>
    format?: OID4VCICredentialFormat
  }): Promise<W3CVerifiableCredential | CompactSdJwtVc> {
    const { jwtVerifyResult, format } = args
    const credential = args.credential as ICredential // TODO: SDJWT
    let proofFormat: ProofFormat

    const resolution = await context.agent.identifierManagedGet(idOpts)
    proofFormat = format?.includes('ld') ? 'lds' : 'jwt'
    const issuer = resolution.issuer ?? resolution.kmsKeyRef

    if (CredentialMapper.isSdJwtDecodedCredentialPayload(credential)) {
      const sdJwtPayload = credential as SdJwtVcPayload
      if (sdJwtPayload.iss === undefined) {
        sdJwtPayload.iss = issuer
      }
      if (sdJwtPayload.iat === undefined) {
        sdJwtPayload.iat = Math.floor(new Date().getTime() / 1000)
      }

      let disclosureFrame
      if ('disclosureFrame' in credential) {
        disclosureFrame = credential['disclosureFrame']
        delete credential['disclosureFrame']
      } else {
        disclosureFrame = {
          _sd: credential['_sd'],
        }
      }
      const result = await context.agent.createSdJwtVc({
        credentialPayload: sdJwtPayload,
        disclosureFrame: disclosureFrame,
      })
      return result.credential
    } /*else if (CredentialMapper.isMsoMdocDecodedCredential(credential)) {
      TODO
    }*/ else {
      if (!credential.issuer) {
        credential.issuer = { id: issuer }
      } else if (typeof credential.issuer === 'object' && !credential.issuer.id) {
        credential.issuer.id = issuer
      }
      const subjectIsArray = Array.isArray(credential.credentialSubject)
      let credentialSubjects = Array.isArray(credential.credentialSubject) ? credential.credentialSubject : [credential.credentialSubject]
      credentialSubjects = credentialSubjects.map((subject) => {
        if (!subject.id) {
          subject.id = jwtVerifyResult.did
        }
        return subject
      })
      credential.credentialSubject = subjectIsArray ? credentialSubjects : credentialSubjects[0]

      // TODO: We should extend the plugin capabilities of issuance so we do not have to tuck this into the sign callback
      if (contextHasPlugin<IStatusListPlugin>(context, 'slAddStatusToCredential')) {
        // Add status list if enabled (and when the input has a credentialStatus object (can be empty))
        const credentialStatusVC = await context.agent.slAddStatusToCredential({ credential })
        if (credential.credentialStatus && !credential.credentialStatus.statusListCredential) {
          credential.credentialStatus = credentialStatusVC.credentialStatus
        }
      }

      const result = await context.agent.createVerifiableCredential({
        credential: credential as CredentialPayload,
        proofFormat,
        removeOriginalFields: false,
        fetchRemoteContexts: true,
        domain: typeof credential.issuer === 'object' ? credential.issuer.id : credential.issuer,
        ...(resolution.kid && { header: { kid: resolution.kid } }),
      })
      return (proofFormat === 'jwt' && 'jwt' in result.proof ? result.proof.jwt : result) as W3CVerifiableCredential
    }
    return Promise.reject('VC issuance failed, an incorrect or unsupported credential was supplied')
  }

  return issueVCCallback
}

export async function createVciIssuerBuilder(
  args: {
    issuerOpts: IIssuerOptions
    issuerMetadata: IssuerMetadata
    authorizationServerMetadata: AuthorizationServerMetadata
    resolver?: Resolvable
    credentialDataSupplier?: CredentialDataSupplier
  },
  context: IRequiredContext,
): Promise<VcIssuerBuilder<DIDDocument>> {
  const { issuerOpts, issuerMetadata, authorizationServerMetadata } = args

  const builder = new VcIssuerBuilder<DIDDocument>()
  // @ts-ignore
  const resolver =
    args.resolver ??
    args?.issuerOpts?.didOpts?.resolveOpts?.resolver ??
    args.issuerOpts?.didOpts?.resolveOpts?.jwtVerifyOpts?.resolver ??
    getAgentResolver(context)
  if (!resolver) {
    throw Error('A Resolver is necessary to verify DID JWTs')
  }
  const idOpts = legacyKeyRefsToIdentifierOpts({ didOpts: issuerOpts.didOpts, idOpts: issuerOpts.idOpts })
  const jwtVerifyOpts: JWTVerifyOptions = {
    ...issuerOpts?.didOpts?.resolveOpts?.jwtVerifyOpts,
    ...args?.issuerOpts?.resolveOpts?.jwtVerifyOpts,
    resolver,
    audience: issuerMetadata.credential_issuer as string, // FIXME legacy version had {display: NameAndLocale | NameAndLocale[]} as credential_issuer
  }
  builder.withIssuerMetadata(issuerMetadata)
  builder.withAuthorizationMetadata(authorizationServerMetadata)
  // builder.withUserPinRequired(issuerOpts.userPinRequired ?? false) was removed from implementers draft v1
  builder.withCredentialSignerCallback(await getCredentialSignerCallback(idOpts, context))
  builder.withJWTVerifyCallback(getJwtVerifyCallback({ verifyOpts: jwtVerifyOpts }, context))
  if (args.credentialDataSupplier) {
    builder.withCredentialDataSupplier(args.credentialDataSupplier)
  }
  builder.withInMemoryCNonceState()
  builder.withInMemoryCredentialOfferState()
  builder.withInMemoryCredentialOfferURIState()
  builder.build()

  return builder
}

export async function createVciIssuer(
  {
    issuerOpts,
    issuerMetadata,
    authorizationServerMetadata,
    credentialDataSupplier,
  }: {
    issuerOpts: IIssuerOptions
    issuerMetadata: IssuerMetadata
    authorizationServerMetadata: AuthorizationServerMetadata
    credentialDataSupplier?: CredentialDataSupplier
  },
  context: IRequiredContext,
): Promise<VcIssuer<DIDDocument>> {
  return (await createVciIssuerBuilder({ issuerOpts, issuerMetadata, authorizationServerMetadata, credentialDataSupplier }, context)).build()
}
