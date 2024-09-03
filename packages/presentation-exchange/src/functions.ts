import { IPresentationDefinition } from '@sphereon/pex'
import { Format } from '@sphereon/pex-models'
import {
  isManagedIdentifierDidOpts,
  isManagedIdentifierDidResult,
  isManagedIdentifierX5cResult,
  ManagedIdentifierOptsOrResult,
} from '@sphereon/ssi-sdk-ext.identifier-resolution'
import {
  CredentialMapper,
  Optional,
  OriginalVerifiablePresentation,
  SdJwtDecodedVerifiableCredential,
  W3CVerifiablePresentation,
} from '@sphereon/ssi-types'
import { PresentationPayload, ProofFormat } from '@veramo/core'
import { IPEXPresentationSignCallback, IRequiredContext } from './types/IPresentationExchange'

export async function createPEXPresentationSignCallback(
  args: {
    idOpts: ManagedIdentifierOptsOrResult
    fetchRemoteContexts?: boolean
    skipDidResolution?: boolean
    format?: Format | ProofFormat
    domain?: string
    challenge?: string
  },
  context: IRequiredContext,
): Promise<IPEXPresentationSignCallback> {
  function determineProofFormat(args: {
    format?: Format | 'jwt' | 'lds' | 'EthereumEip712Signature2021'
    presentationDefinition: IPresentationDefinition
  }): string {
    const { format, presentationDefinition } = args

    // All format arguments are optional. So if no format has been given we go for SD-JWT
    const formatOptions = format ?? presentationDefinition.format
    if (!formatOptions) {
      return 'vc+sd-jwt'
    } else if (typeof formatOptions === 'string') {
      // if formatOptions is a singular string we can return that as the format
      return formatOptions
    }

    // here we transform all format options to either lds or jwt. but we also want to support sd-jwt, so we need to specifically check for this one. which is ['vc+sd-jwt']
    const formats = new Set(
      Object.keys(formatOptions).map((form) => (form.includes('ldp') ? 'lds' : form.includes('vc+sd-jwt') ? 'vc+sd-jwt' : 'jwt')),
    )

    // if we only have 1 format type we can return that
    if (formats.size === 1) {
      return formats.values().next().value
    }

    // if we can go for sd-jwt, we go for sd-jwt
    if (formats.has('vc+sd-jwt')) {
      return 'vc+sd-jwt'
    }
    // if it is not sd-jwt we would like to go for jwt
    else if (formats.has('jwt')) {
      return 'jwt'
    }

    // else we go for lds
    return 'lds'
  }

  return async ({
    presentation,
    domain,
    presentationDefinition,
    format,
    challenge,
  }: {
    presentation: Optional<PresentationPayload, 'holder'> | SdJwtDecodedVerifiableCredential
    presentationDefinition: IPresentationDefinition
    format?: Format | ProofFormat
    domain?: string
    challenge?: string
  }): Promise<W3CVerifiablePresentation> => {
    const proofFormat = determineProofFormat({ format, presentationDefinition })
    const { idOpts } = args
    const CLOCK_SKEW = 120
    if (args.skipDidResolution && isManagedIdentifierDidOpts(idOpts)) {
      idOpts.offlineWhenNoDIDRegistered = true
    }

    const resolution = await context.agent.identifierManagedGet(idOpts)

    if ('compactSdJwtVc' in presentation) {
      if (proofFormat !== 'vc+sd-jwt') {
        return Promise.reject(Error(`presentation payload does not match proof format ${proofFormat}`))
      }

      const presentationResult = await context.agent.createSdJwtPresentation({
        presentation: presentation.compactSdJwtVc,
        kb: {
          payload: {
            ...presentation.kbJwt?.payload,
            iat: presentation.kbJwt?.payload?.iat ?? Math.floor(Date.now() / 1000 - CLOCK_SKEW),
            nonce: challenge ?? presentation.kbJwt?.payload?.nonce,
            aud: presentation.kbJwt?.payload?.aud ?? resolution.issuer,
          },
        },
      })

      return CredentialMapper.storedPresentationToOriginalFormat(presentationResult.presentation as OriginalVerifiablePresentation)
    } else {
      if (proofFormat === 'vc+sd-jwt') {
        return Promise.reject(Error(`presentation payload does not match proof format ${proofFormat}`))
      }
      let header
      if (!presentation.holder) {
        presentation.holder = resolution.issuer
      }
      if (proofFormat === 'jwt') {
        header = {
          ...((isManagedIdentifierDidResult(resolution) || isManagedIdentifierX5cResult(resolution)) && resolution.kid && { kid: resolution.kid }),
          ...(isManagedIdentifierX5cResult(resolution) && { jwk: resolution.jwk }),
        }
        if (presentation.verifier || !presentation.aud) {
          presentation.aud = Array.isArray(presentation.verifier) ? presentation.verifier : (presentation.verifier ?? domain ?? args.domain)
          delete presentation.verifier
        }

        if (!presentation.nbf) {
          if (presentation.issuanceDate) {
            const converted = Date.parse(presentation.issuanceDate)
            if (!isNaN(converted)) {
              presentation.nbf = Math.floor(converted / 1000) // no skew here, as an explicit value was given
            }
          } else {
            presentation.nbf = Math.floor(Date.now() / 1000 - CLOCK_SKEW)
          }
        }

        if (!presentation.iat) {
          presentation.iat = presentation.nbf
        }

        if (!presentation.exp) {
          if (presentation.expirationDate) {
            const converted = Date.parse(presentation.expirationDate)
            if (!isNaN(converted)) {
              presentation.exp = Math.floor(converted / 1000) // no skew here as an explicit value w as given
            }
          } else {
            presentation.exp = presentation.nbf + 600 + CLOCK_SKEW
          }
        }

        if (!presentation.vp) {
          presentation.vp = {}
        }
        /*if (!presentation.sub) {
          presentation.sub = id.did
        }*/
        if (!presentation.vp.holder) {
          presentation.vp.holder = presentation.holder
        }
      }

      // we ignore the alg / proof_format for now, as we already have the kid anyway at this point

      // todo: look for jwt_vc_json and remove types and @context

      const vp = await context.agent.createVerifiablePresentation({
        presentation: presentation as PresentationPayload,
        removeOriginalFields: false,
        keyRef: resolution.kmsKeyRef,
        // domain: domain ?? args.domain, // handled above, and did-jwt-vc creates an array even for 1 entry
        challenge: challenge ?? args.challenge,
        fetchRemoteContexts: args.fetchRemoteContexts !== false,
        proofFormat: proofFormat as ProofFormat,
        header,
      })

      // makes sure we extract an actual JWT from the internal representation in case it is a JWT
      return CredentialMapper.storedPresentationToOriginalFormat(vp as OriginalVerifiablePresentation)
    }
  }
}
