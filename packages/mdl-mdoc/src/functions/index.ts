import { com, Nullable } from '@sphereon/kmp-mdl-mdoc'
import {
  CertificateInfo,
  derToPEM,
  getSubjectDN,
  pemOrDerToX509Certificate,
  validateX509CertificateChain,
  X509ValidationResult,
} from '@sphereon/ssi-sdk-ext.x509-utils'
import * as crypto from 'crypto'
import { Certificate, CryptoEngine, setEngine } from 'pkijs'
import { VerifyCertificateChainArgs } from '../types/ImDLMdoc'
import CoseKeyJson = com.sphereon.crypto.cose.CoseKeyJson
import CoseSign1Cbor = com.sphereon.crypto.cose.CoseSign1Cbor
import CoseSign1InputCbor = com.sphereon.crypto.cose.CoseSign1InputCbor
import ICoseKeyCbor = com.sphereon.crypto.cose.ICoseKeyCbor
import CryptoServiceJS = com.sphereon.crypto.CryptoServiceJS
import ICoseCryptoCallbackJS = com.sphereon.crypto.ICoseCryptoCallbackJS
import IKey = com.sphereon.crypto.IKey
import IKeyInfo = com.sphereon.crypto.IKeyInfo
import IVerifySignatureResult = com.sphereon.crypto.IVerifySignatureResult
import IX509ServiceJS = com.sphereon.crypto.IX509ServiceJS
import IX509VerificationResult = com.sphereon.crypto.IX509VerificationResult
import Jwk = com.sphereon.crypto.jose.Jwk
import X509VerificationProfile = com.sphereon.crypto.X509VerificationProfile
import decodeFrom = com.sphereon.kmp.decodeFrom
import Encoding = com.sphereon.kmp.Encoding

export class CoseCryptoService implements ICoseCryptoCallbackJS {
  async sign1<CborType>(input: CoseSign1InputCbor, keyInfo?: IKeyInfo<ICoseKeyCbor>): Promise<CoseSign1Cbor<CborType>> {
    throw new Error('Method not implemented.')
  }

  async verify1<CborType>(input: CoseSign1Cbor<CborType>, keyInfo?: IKeyInfo<ICoseKeyCbor>): Promise<IVerifySignatureResult<ICoseKeyCbor>> {
    async function getCertAndKey(x5c: Nullable<Array<string>>): Promise<{
      issuerCert: Certificate
      issuerPublicKey: CryptoKey
    }> {
      if (!x5c || x5c.length === 0) {
        // We should not be able to get here anyway, as the MLD-mdoc library already validated at this point. But let's make sure
        return Promise.reject(new Error(`No x5chain was present in the CoseSign headers!`))
      }
      // TODO: According to the IETF spec there should be a x5t in case the x5chain is in the protected headers. In the Funke this does not seem to be done/used!
      issuerCert = pemOrDerToX509Certificate(x5c[0])
      issuerPublicKey = await issuerCert.getPublicKey()
      return { issuerCert, issuerPublicKey }
    }

    if (keyInfo?.key?.d) {
      throw Error('Do not use private keys to verify!')
    } else if (!input.payload?.value) {
      return Promise.reject(Error('Signature validation without payload not supported'))
    }
    const sign1Json = input.toJson() // Let's make it a bit easier on ourselves, instead of working with CBOR
    const coseAlg = sign1Json.protectedHeader.alg
    if (!coseAlg) {
      return Promise.reject(Error('No alg protected header present'))
    }

    let issuerPublicKey: CryptoKey
    let issuerCert: Certificate | undefined
    let kid = keyInfo?.kid ?? sign1Json.protectedHeader.kid ?? sign1Json.unprotectedHeader?.kid
    // Please note this method does not perform chain validation. The MDL-MSO_MDOC library already performed this before this step
    const x5c =
      keyInfo?.key?.x5chain?.value?.asJsArrayView()?.map((x509) => x509.encodeTo(Encoding.BASE64)) ??
      sign1Json.protectedHeader?.x5chain ??
      sign1Json.unprotectedHeader?.x5chain
    if (!keyInfo || !keyInfo?.key || keyInfo?.key?.x5chain) {
      const certAndKey = await getCertAndKey(x5c)
      issuerPublicKey = certAndKey.issuerPublicKey
      issuerCert = certAndKey.issuerCert
    } else {
      if (!keyInfo?.key) {
        return Promise.reject(Error(`Either a x5c needs to be in the headers, or you need to provide a key for verification`))
      }
      const key = keyInfo.key

      // todo: Workaround as the Agent only works with cosekey json objects and we do not support conversion of these from Json to cbor yet
      const jwk = typeof key.x === 'string' ? Jwk.Static.fromCoseKeyJson(keyInfo.key as unknown as CoseKeyJson) : Jwk.Static.fromCoseKey(keyInfo.key)
      if (kid === null) {
        kid = jwk.kid
      }
      let keyAlg = jwk.kty ?? 'ECDSA'
      const crv: string = jwk.crv?.value ?? 'P-256'
      issuerPublicKey = await crypto.subtle.importKey(
        'jwk',
        {
          kty: jwk.kty.value,
          crv,
          ...(jwk.x5c && { x5c: jwk.x5c }),
          ...(jwk.x && { x: jwk.x }),
          ...(jwk.y && { y: jwk.y }),
        } satisfies JsonWebKey,
        {
          name: keyAlg.value === 'EC' ? 'ECDSA' : keyAlg.value,
          namedCurve: crv,
        },
        true,
        ['verify'],
      )
    }

    const exportedJwk = await crypto.subtle.exportKey('jwk', issuerPublicKey)
    const crv = exportedJwk.crv
    const coseKey = Jwk.Static.fromJson(exportedJwk).jwkToCoseKeyJson()
    const recalculatedToBeSigned = input.toBeSignedJson(coseKey, coseAlg)
    const valid = await crypto.subtle.verify(
      {
        ...issuerPublicKey.algorithm,
        hash: crv?.includes('-') ? `SHA-${crv.split('-')[1]}` : 'SHA-256', // todo: this needs to be more robust
      },
      issuerPublicKey,
      decodeFrom(sign1Json.signature, Encoding.BASE64URL),
      decodeFrom(recalculatedToBeSigned.hexValue, Encoding.HEX),
    )

    return {
      name: 'mdoc',
      critical: true,
      error: !valid,
      message: `Signature of '${issuerCert ? getSubjectDN(issuerCert).DN : kid}' was ${valid ? '' : 'in'}valid`,
      keyInfo: keyInfo ?? ({ kid, key: coseKey.toCbor() } satisfies IKeyInfo<ICoseKeyCbor>),
    } satisfies IVerifySignatureResult<ICoseKeyCbor>
  }
}

/**
 * This class can be used for X509 validations.
 * Either have an instance per trustedCerts and verification invocation or use a single instance and provide the trusted certs in the method argument
 *
 * The class is also registered with the low-level mDL/mdoc Kotlin Multiplatform library
 * Next to the specific function for the library it exports a more powerful version of the same verification method as well
 */
export class X509CallbackService implements IX509ServiceJS {
  private _trustedCerts?: Array<string>

  constructor(trustedCerts?: Array<string>) {
    this.setTrustedCerts(trustedCerts)
  }

  /**
   * A more powerful version of the method below. Allows to verify at a specific time and returns more information
   * @param chain
   * @param trustAnchors
   * @param verificationTime
   */
  async verifyCertificateChain({
    chain,
    trustAnchors = this.getTrustedCerts(),
    verificationTime,
    opts,
  }: VerifyCertificateChainArgs): Promise<X509ValidationResult> {
    return await validateX509CertificateChain({
      chain,
      trustAnchors,
      verificationTime,
      opts,
    })
  }

  /**
   * This method is the implementation used within the mDL/Mdoc library
   */
  async verifyCertificateChainJS<KeyType extends IKey>(
    chainDER: Nullable<Int8Array[]>,
    chainPEM: Nullable<string[]>,
    trustedCerts: Nullable<string[]>,
    verificationProfile?: X509VerificationProfile | undefined,
  ): Promise<IX509VerificationResult<KeyType>> {
    let chain: Array<string | Uint8Array> = []
    if (chainDER && chainDER.length > 0) {
      chain = chainDER.map((der) => Uint8Array.from(der))
    }
    if (chainPEM && chainPEM.length > 0) {
      chain = (chain ?? []).concat(chainPEM)
    }
    const result = await validateX509CertificateChain({
      chain: chain, // The function will handle an empty array
      trustAnchors: trustedCerts ?? this.getTrustedCerts(),
      opts: { trustRootWhenNoAnchors: true },
    })

    const cert: CertificateInfo | undefined = result.certificateChain ? result.certificateChain[result.certificateChain.length - 1] : undefined

    return {
      publicKey: cert?.publicKeyJWK as KeyType, // fixme
      publicKeyAlgorithm: cert?.publicKeyJWK?.alg,
      name: 'x.509',
      critical: result.critical,
      message: result.message,
      error: result.error,
    } satisfies IX509VerificationResult<KeyType>
  }

  setTrustedCerts = (trustedCertsInPEM?: Array<string>) => {
    this._trustedCerts = trustedCertsInPEM?.map((cert) => {
      if (cert.includes('CERTIFICATE')) {
        // PEM
        return cert
      }
      return derToPEM(cert)
    })
  }

  getTrustedCerts = () => this._trustedCerts
}

const defaultCryptoEngine = () => {
  if (typeof self !== 'undefined') {
    if ('crypto' in self) {
      let engineName = 'webcrypto'
      if ('webkitSubtle' in self.crypto) {
        engineName = 'safari'
      }
      // @ts-ignore
      setEngine(engineName, new CryptoEngine({ name: engineName, crypto: crypto }))
    }
  } else if (typeof crypto !== 'undefined' && 'webcrypto' in crypto) {
    const name = 'NodeJS ^15'
    const nodeCrypto = crypto.webcrypto
    // @ts-ignore
    setEngine(name, new CryptoEngine({ name, crypto: nodeCrypto }))
  } else {
    // @ts-ignore
    if (typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined') {
      const name = 'crypto'
      setEngine(name, new CryptoEngine({ name, crypto: crypto }))
    }
  }
}

defaultCryptoEngine()

// We register the services with the mDL/mdoc library
CryptoServiceJS.X509.register(new X509CallbackService())
CryptoServiceJS.COSE.register(new CoseCryptoService())
