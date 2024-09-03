import { Jwt, SDJwt } from '@sd-jwt/core'
import { SDJwtVcInstance, SdJwtVcPayload } from '@sd-jwt/sd-jwt-vc'
import { DisclosureFrame, JwtPayload, KbVerifier, PresentationFrame, Signer, Verifier } from '@sd-jwt/types'
import { getFirstKeyWithRelation } from '@sphereon/ssi-sdk-ext.did-utils'
import { calculateJwkThumbprint, signatureAlgorithmFromKey } from '@sphereon/ssi-sdk-ext.key-utils'
import { JWK } from '@sphereon/ssi-types'
import { IAgentPlugin } from '@veramo/core'
import { _ExtendedIKey } from '@veramo/utils'
import Debug from 'debug'
import { defaultGenerateDigest, defaultGenerateSalt, defaultVerifySignature } from './defaultCallbacks'

import { SdJwtVerifySignature, SignKeyArgs, SignKeyResult } from './index'
import { sphereonCA } from './trustAnchors'
import {
  Claims,
  ICreateSdJwtPresentationArgs,
  ICreateSdJwtPresentationResult,
  ICreateSdJwtVcArgs,
  ICreateSdJwtVcResult,
  IRequiredContext,
  ISDJwtPlugin,
  IVerifySdJwtPresentationArgs,
  IVerifySdJwtPresentationResult,
  IVerifySdJwtVcArgs,
  IVerifySdJwtVcResult,
  SdJWTImplementation,
} from './types'

const debug = Debug('@sphereon/ssi-sdk.sd-jwt')

/**
 * @beta
 * SD-JWT plugin
 */
export class SDJwtPlugin implements IAgentPlugin {
  private readonly trustAnchorsInPEM: string[]
  private readonly registeredImplementations: SdJWTImplementation
  private _signers: Record<string, Signer>
  private _defaultSigner?: Signer

  constructor(
    registeredImplementations?: SdJWTImplementation & {
      signers?: Record<string, Signer>
      defaultSigner?: Signer
    },
    trustAnchorsInPEM?: string[],
  ) {
    this.trustAnchorsInPEM = trustAnchorsInPEM ?? []
    if (!registeredImplementations) {
      registeredImplementations = {}
    }
    if (typeof registeredImplementations?.hasher !== 'function') {
      registeredImplementations.hasher = defaultGenerateDigest
    }
    if (typeof registeredImplementations?.saltGenerator !== 'function') {
      registeredImplementations.saltGenerator = defaultGenerateSalt
    }
    this.registeredImplementations = registeredImplementations
    this._signers = registeredImplementations?.signers ?? {}
    this._defaultSigner = registeredImplementations?.defaultSigner

    // Verify signature default is used below in the methods if not provided here, as it needs the context of the agent
  }

  // map the methods your plugin is declaring to their implementation
  readonly methods: ISDJwtPlugin = {
    createSdJwtVc: this.createSdJwtVc.bind(this),
    createSdJwtPresentation: this.createSdJwtPresentation.bind(this),
    verifySdJwtVc: this.verifySdJwtVc.bind(this),
    verifySdJwtPresentation: this.verifySdJwtPresentation.bind(this),
  }

  private async getSignerForIdentifier(
    { identifier }: { identifier: string },
    context: IRequiredContext,
  ): Promise<{
    signer: Signer
    alg?: string
    signingKey?: SignKeyResult
  }> {
    if (Object.keys(this._signers).includes(identifier) && typeof this._signers[identifier] === 'function') {
      return { signer: this._signers[identifier] }
    } else if (typeof this._defaultSigner === 'function') {
      return { signer: this._defaultSigner }
    }
    const signingKey = await this.getSignKey({ identifier, vmRelationship: 'assertionMethod' }, context)
    const { key, alg } = signingKey

    const signer: Signer = async (data: string): Promise<string> => {
      return context.agent.keyManagerSign({ keyRef: key.kmsKeyRef, data })
    }
    return { signer, alg, signingKey }
  }

  /**
   * Create a signed SD-JWT credential.
   * @param args - Arguments necessary for the creation of a SD-JWT credential.
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   * @returns A signed SD-JWT credential.
   */
  async createSdJwtVc(args: ICreateSdJwtVcArgs, context: IRequiredContext): Promise<ICreateSdJwtVcResult> {
    const issuer = args.credentialPayload.iss
    if (!issuer) {
      throw new Error('credential.issuer must not be empty')
    }
    const { alg, signer } = await this.getSignerForIdentifier({ identifier: issuer }, context)
    const sdjwt = new SDJwtVcInstance({
      signer,
      hasher: this.registeredImplementations.hasher,
      saltGenerator: this.registeredImplementations.saltGenerator,
      signAlg: alg ?? 'ES256',
      hashAlg: 'SHA-256',
    })

    const credential = await sdjwt.issue(args.credentialPayload, args.disclosureFrame as DisclosureFrame<typeof args.credentialPayload>)
    return { credential }
  }

  /**
   * Get the key to sign the SD-JWT
   * @param args - consists of twp arguments: identifier like a did and other forms of identifiers and vmRelationship which represents the purpose of the key
   * @param context - agent instance
   * @returns the key to sign the SD-JWT
   */
  async getSignKey(args: SignKeyArgs, context: IRequiredContext): Promise<SignKeyResult> {
    // TODO: Integrate new managed identifier resolution into this plugin/file
    const { identifier, vmRelationship } = { ...args }
    if (identifier.startsWith('did:')) {
      const didIdentifier = await context.agent.didManagerGet({
        did: identifier.split('#')[0],
      })
      const key: _ExtendedIKey | undefined = await getFirstKeyWithRelation(
        {
          identifier: didIdentifier,
          vmRelationship: vmRelationship,
        },
        context,
      )
      if (!key) {
        throw new Error(`No key found with the given id: ${identifier}`)
      }
      const alg = await signatureAlgorithmFromKey({ key })
      debug(`Signing key ${key.publicKeyHex} found for identifier ${identifier}`)

      return { alg, key: { ...key, kmsKeyRef: key.kid } }
    } else {
      const key = await context.agent.keyManagerGet({ kid: identifier })
      if (!key) {
        throw new Error(`No key found with the identifier ${identifier}`)
      }
      const alg = await signatureAlgorithmFromKey({ key })
      if (key.meta?.x509 && key.meta.x509.x5c) {
        return { alg, key: { kmsKeyRef: key.kid, x5c: key.meta.x509.x5c as string[] } }
      } else if (key.meta?.jwkThumbprint) {
        return { alg, key: { kmsKeyRef: key.kid, jwkThumbprint: key.meta.jwkThumbprint } }
      } else {
        return { alg, key: { kmsKeyRef: key.kid } }
      }
    }
  }

  /**
   * Create a signed SD-JWT presentation.
   * @param args - Arguments necessary for the creation of a SD-JWT presentation.
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   * @returns A signed SD-JWT presentation.
   */
  async createSdJwtPresentation(args: ICreateSdJwtPresentationArgs, context: IRequiredContext): Promise<ICreateSdJwtPresentationResult> {
    const cred = await SDJwt.fromEncode(args.presentation, this.registeredImplementations.hasher!)
    const claims = await cred.getClaims<Claims>(this.registeredImplementations.hasher!)
    let holder: string
    // we primarly look for a cnf field, if it's not there we look for a sub field. If this is also not given, we throw an error since we can not sign it.
    if (args.holder) {
      holder = args.holder
    } else if (claims.cnf?.jwk) {
      const jwk = claims.cnf.jwk
      holder = calculateJwkThumbprint({ jwk: jwk as JWK })
    } else if (claims.sub) {
      holder = claims.sub as string
    } else {
      throw new Error('invalid_argument: credential does not include a holder reference')
    }
    const { alg, signer } = await this.getSignerForIdentifier({ identifier: holder }, context)

    const sdjwt = new SDJwtVcInstance({
      hasher: this.registeredImplementations.hasher,
      saltGenerator: this.registeredImplementations.saltGenerator,
      kbSigner: signer,
      kbSignAlg: alg ?? 'ES256',
    })
    const credential = await sdjwt.present(args.presentation, args.presentationFrame as PresentationFrame<SdJwtVcPayload>, { kb: args.kb })
    return { presentation: credential }
  }

  /**
   * Verify a signed SD-JWT credential.
   * @param args - Arguments necessary for the verify a SD-JWT credential.
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   * @returns
   */
  async verifySdJwtVc(args: IVerifySdJwtVcArgs, context: IRequiredContext): Promise<IVerifySdJwtVcResult> {
    // callback
    const verifier: Verifier = async (data: string, signature: string) => this.verify(sdjwt, context, data, signature)

    const sdjwt = new SDJwtVcInstance({ verifier, hasher: this.registeredImplementations.hasher })
    const { header = {}, payload, kb } = await sdjwt.verify(args.credential)

    return { header, payload: payload as SdJwtVcPayload, kb }
  }

  /**
   * Verify the key binding of a SD-JWT by validating the signature of the key bound to the SD-JWT
   * @param sdjwt - SD-JWT instance
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   * @param data - signed data
   * @param signature - The signature
   * @param payload - The payload of the SD-JWT
   * @returns
   */
  private verifyKb(sdjwt: SDJwtVcInstance, context: IRequiredContext, data: string, signature: string, payload: JwtPayload): Promise<boolean> {
    if (!payload.cnf) {
      throw Error('other method than cnf is not supported yet')
    }
    const key = payload.cnf.jwk as JsonWebKey
    return this.verifySignatureCallback(context)(data, signature, key)
  }

  /**
   * Validates the signature of a SD-JWT
   * @param sdjwt - SD-JWT instance
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   * @param data - signed data
   * @param signature - The signature
   * @returns
   */
  async verify(sdjwt: SDJwtVcInstance, context: IRequiredContext, data: string, signature: string) {
    const decodedVC = await sdjwt.decode(`${data}.${signature}`)
    const issuer: string = ((decodedVC.jwt as Jwt).payload as Record<string, unknown>).iss as string
    const header = (decodedVC.jwt as Jwt).header as Record<string, any>
    const x5c: string[] | undefined = header?.x5c as string[]
    let jwk: JWK | JsonWebKey | undefined = undefined
    if (issuer.includes('did:')) {
      const didDoc = await context.agent.resolveDid({ didUrl: issuer })
      if (!didDoc) {
        throw new Error('invalid_issuer: issuer did not resolve to a did document')
      }
      //TODO SDK-20: This should be checking for an assertionMethod and not just an verificationMethod with an id
      const didDocumentKey = didDoc.didDocument?.verificationMethod?.find((key) => key.id)
      if (!didDocumentKey) {
        throw new Error('invalid_issuer: issuer did document does not include referenced key')
      }
      //FIXME SDK-21: in case it's another did method, the value of the key can be also encoded as a base64url
      // needs more checks. some DID methods do not expose the keys as publicKeyJwk
      jwk = didDocumentKey.publicKeyJwk as JsonWebKey
    }
    if (x5c) {
      const trustAnchors = new Set<string>([...this.trustAnchorsInPEM])
      if (trustAnchors.size === 0) {
        trustAnchors.add(sphereonCA)
      }
      const certificateValidationResult = await context.agent.x509VerifyCertificateChain({
        chain: x5c,
        trustAnchors: Array.from(trustAnchors),
      })

      if (certificateValidationResult.error || !certificateValidationResult?.certificateChain) {
        throw new Error('Certificate chain validation failed')
      }
      const certInfo = certificateValidationResult.certificateChain[0]
      jwk = certInfo.publicKeyJWK as JWK
    }

    if (!jwk) {
      throw new Error('No valid public key found for signature verification')
    }
    return this.verifySignatureCallback(context)(data, signature, jwk)
  }

  /**
   * Verify a signed SD-JWT presentation.
   * @param args - Arguments necessary for the verify a SD-JWT presentation.
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   * @returns
   */
  async verifySdJwtPresentation(args: IVerifySdJwtPresentationArgs, context: IRequiredContext): Promise<IVerifySdJwtPresentationResult> {
    let sdjwt: SDJwtVcInstance
    const verifier: Verifier = async (data: string, signature: string) => this.verify(sdjwt, context, data, signature)
    const verifierKb: KbVerifier = async (data: string, signature: string, payload: JwtPayload) =>
      this.verifyKb(sdjwt, context, data, signature, payload)
    sdjwt = new SDJwtVcInstance({
      verifier,
      hasher: this.registeredImplementations.hasher,
      kbVerifier: verifierKb,
    })
    const verifiedPayloads = await sdjwt.verify(args.presentation, args.requiredClaimKeys, args.kb)

    return verifiedPayloads
  }

  private verifySignatureCallback(context: IRequiredContext): SdJwtVerifySignature {
    if (typeof this.registeredImplementations.verifySignature === 'function') {
      return this.registeredImplementations.verifySignature
    }
    return defaultVerifySignature(context)
  }
}
