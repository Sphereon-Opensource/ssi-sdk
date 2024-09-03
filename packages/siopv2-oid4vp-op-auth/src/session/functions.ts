import { OP, OPBuilder, PassBy, PresentationSignCallback, ResponseMode, SupportedVersion, VerifyJwtCallback } from '@sphereon/did-auth-siop'
import { CreateJwtCallback, JwtHeader, JwtPayload } from '@sphereon/oid4vc-common'
import { Format } from '@sphereon/pex-models'
import { isManagedIdentifierDidOpts, isManagedIdentifierX5cOpts, ManagedIdentifierOptsOrResult } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { JwsCompactResult } from '@sphereon/ssi-sdk-ext.jwt-service'
import { createPEXPresentationSignCallback } from '@sphereon/ssi-sdk.presentation-exchange'
import { SigningAlgo } from '@sphereon/ssi-sdk.siopv2-oid4vp-common'
import { IVerifyCallbackArgs, IVerifyCredentialResult, VerifyCallback } from '@sphereon/wellknown-dids-client'
import { TKeyType } from '@veramo/core'
import { JWTVerifyOptions } from 'did-jwt'
import { Resolvable } from 'did-resolver'
import { EventEmitter } from 'events'
import { IOPOptions, IRequiredContext } from '../types'
import { JwtIssuer } from '@sphereon/oid4vc-common/lib/jwt/JwtIssuer'

export async function createOID4VPPresentationSignCallback({
  presentationSignCallback,
  idOpts,
  domain,
  fetchRemoteContexts,
  challenge,
  format,
  context,
  skipDidResolution,
}: {
  presentationSignCallback?: PresentationSignCallback
  idOpts: ManagedIdentifierOptsOrResult
  domain?: string
  challenge?: string
  fetchRemoteContexts?: boolean
  skipDidResolution?: boolean
  format?: Format
  context: IRequiredContext
}): Promise<PresentationSignCallback> {
  if (typeof presentationSignCallback === 'function') {
    return presentationSignCallback
  }

  return createPEXPresentationSignCallback(
    {
      idOpts,
      fetchRemoteContexts,
      domain,
      challenge,
      format,
      skipDidResolution,
    },
    context,
  )
}

export async function createOPBuilder({
  opOptions,
  idOpts,
  context,
}: {
  opOptions: IOPOptions
  idOpts?: ManagedIdentifierOptsOrResult
  context: IRequiredContext
}): Promise<OPBuilder> {
  const eventEmitter = opOptions.eventEmitter ?? new EventEmitter()
  const builder = OP.builder()
    .withResponseMode(opOptions.responseMode ?? ResponseMode.DIRECT_POST)
    .withSupportedVersions(
      opOptions.supportedVersions ?? [
        SupportedVersion.SIOPv2_ID1,
        SupportedVersion.JWT_VC_PRESENTATION_PROFILE_v1,
        SupportedVersion.SIOPv2_D11,
        SupportedVersion.SIOPv2_D12_OID4VP_D18,
      ],
    )
    .withExpiresIn(opOptions.expiresIn ?? 300)
    .withEventEmitter(eventEmitter)
    .withRegistration({
      passBy: PassBy.VALUE,
    })

  //const methods = opOptions.supportedDIDMethods ?? (await getAgentDIDMethods(context))
  //const resolver = getResolver({ subjectSyntaxTypesSupported: methods })

  const wellknownDIDVerifyCallback = opOptions.wellknownDIDVerifyCallback
    ? opOptions.wellknownDIDVerifyCallback
    : async (args: IVerifyCallbackArgs): Promise<IVerifyCredentialResult> => {
        const result = await context.agent.verifyCredential({ credential: args.credential, fetchRemoteContexts: true })
        return { verified: result.verified }
      }
  builder.withVerifyJwtCallback(
    opOptions.verifyJwtCallback
      ? opOptions.verifyJwtCallback
      : getVerifyJwtCallback(
          {
            verifyOpts: {
              wellknownDIDVerifyCallback,
              checkLinkedDomain: 'if_present',
            },
          },
          context,
        ),
  )
  if (idOpts) {
    if (opOptions.skipDidResolution && isManagedIdentifierDidOpts(idOpts)) {
      idOpts.offlineWhenNoDIDRegistered = true
    }
    /* FIXME Funke 
    const resolution = await context.agent.identifierManagedGet(idOpts)
   if (!isManagedIdentifierDidOpts(idOpts) || !isManagedIdentifierDidResult(resolution)) {
      /!*last part is only there to get the available properties of a DID result*!/
      // Remove this once we use the newer version
      return Promise.reject(Error(`The current version of SIOP-OID4VP we use only works with DIDs`))
    }
*/
    /*const key = resolution.key
    builder.withSuppliedSignature(
      SuppliedSigner(key, context, getSigningAlgo(key.type) as unknown as KeyAlgo),
      resolution.did,
      resolution.kid,
      getSigningAlgo(key.type),
    )*/
    // builder.withCreateJwtCallback(signCallback(resolution, context))
    const createJwtCallback = createJwtCallbackWithIdOpts(idOpts, context)
    builder.withCreateJwtCallback(createJwtCallback as CreateJwtCallback<any>)
    builder.withPresentationSignCallback(
      await createOID4VPPresentationSignCallback({
        presentationSignCallback: opOptions.presentationSignCallback,
        skipDidResolution: opOptions.skipDidResolution ?? false,
        idOpts,
        context,
      }),
    )
  } else {
    const createJwtCallback = createJwtCallbackWithOpOpts(opOptions, context)
    builder.withCreateJwtCallback(createJwtCallback as CreateJwtCallback<any>)
  }
  return builder
}

export function createJwtCallbackWithIdOpts(
  idOpts: ManagedIdentifierOptsOrResult,
  context: IRequiredContext,
): (jwtIssuer: JwtIssuer, jwt: { header: JwtHeader; payload: JwtPayload }) => Promise<string> {
  return async (jwtIssuer: JwtIssuer, jwt: { header: JwtHeader; payload: JwtPayload }) => {
    if (!(isManagedIdentifierDidOpts(idOpts) || isManagedIdentifierX5cOpts(idOpts))) {
      return Promise.reject(Error(`JWT issuer method ${jwtIssuer.method} not yet supported`))
    }
    const result: JwsCompactResult = await context.agent.jwtCreateJwsCompactSignature({
      // FIXME fix cose-key inference
      // @ts-ignore
      issuer: { identifier: idOpts.identifier, noIdentifierInHeader: false },
      // FIXME fix JWK key_ops
      // @ts-ignore
      protectedHeader: jwt.header,
      payload: jwt.payload,
    })
    return result.jwt
  }
}

export function createJwtCallbackWithOpOpts(
  opOpts: IOPOptions,
  context: IRequiredContext,
): (jwtIssuer: JwtIssuer, jwt: { header: JwtHeader; payload: JwtPayload }) => Promise<string> {
  return async (jwtIssuer: JwtIssuer, jwt: { header: JwtHeader; payload: JwtPayload }) => {
    let identifier: string | Array<string>
    if (jwtIssuer.method == 'did') {
      identifier = jwtIssuer.didUrl
    } else if (jwtIssuer.method == 'x5c') {
      identifier = jwtIssuer.x5c
    } else {
      return Promise.reject(Error(`JWT issuer method ${jwtIssuer.method} not yet supported`))
    }

    const result: JwsCompactResult = await context.agent.jwtCreateJwsCompactSignature({
      // FIXME fix cose-key inference
      // @ts-ignore
      issuer: { identifier: identifier, kmsKeyRef: idOpts.kmsKeyRef, noIdentifierInHeader: false },
      // FIXME fix JWK key_ops
      // @ts-ignore
      protectedHeader: jwt.header,
      payload: jwt.payload,
    })
    return result.jwt
  }
}

function getVerifyJwtCallback(
  _opts: {
    resolver?: Resolvable
    verifyOpts?: JWTVerifyOptions & {
      checkLinkedDomain: 'never' | 'if_present' | 'always'
      wellknownDIDVerifyCallback?: VerifyCallback
    }
  },
  context: IRequiredContext,
): VerifyJwtCallback {
  return async (_jwtVerifier, jwt) => {
    const result = await context.agent.jwtVerifyJwsSignature({ jws: jwt.raw })
    console.log(result.message)
    return !result.error
  }
}

export async function createOP({
  opOptions,
  idOpts,
  context,
}: {
  opOptions: IOPOptions
  idOpts?: ManagedIdentifierOptsOrResult
  context: IRequiredContext
}): Promise<OP> {
  return (await createOPBuilder({ opOptions, idOpts, context })).build()
}

export function getSigningAlgo(type: TKeyType): SigningAlgo {
  switch (type) {
    case 'Ed25519':
      return SigningAlgo.EDDSA
    case 'Secp256k1':
      return SigningAlgo.ES256K
    case 'Secp256r1':
      return SigningAlgo.ES256
    // @ts-ignore
    case 'RSA':
      return SigningAlgo.RS256
    default:
      throw Error('Key type not yet supported')
  }
}
