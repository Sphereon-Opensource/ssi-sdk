import { IssuerType } from '@veramo/core'
import jwt_decode from 'jwt-decode'
import {
  AsyncHasher,
  decodeMdocDeviceResponse,
  decodeMdocIssuerSigned,
  decodeSdJwtVc,
  decodeSdJwtVcAsync,
  DocumentFormat,
  Hasher,
  ICredential,
  IPresentation,
  IProof,
  IProofPurpose,
  IProofType,
  isWrappedMdocCredential,
  isWrappedMdocPresentation,
  isWrappedSdJwtVerifiableCredential,
  isWrappedSdJwtVerifiablePresentation,
  isWrappedW3CVerifiableCredential,
  isWrappedW3CVerifiablePresentation,
  IVerifiableCredential,
  IVerifiablePresentation,
  JwtDecodedVerifiableCredential,
  JwtDecodedVerifiablePresentation,
  mdocDecodedCredentialToUniformCredential,
  MdocDeviceResponse,
  OriginalType,
  OriginalVerifiableCredential,
  OriginalVerifiablePresentation,
  sdJwtDecodedCredentialToUniformCredential,
  SdJwtDecodedVerifiableCredential,
  SdJwtDecodedVerifiableCredentialPayload,
  UniformVerifiablePresentation,
  W3CVerifiableCredential,
  W3CVerifiablePresentation,
  WrappedMdocCredential,
  WrappedSdJwtVerifiableCredential,
  WrappedVerifiableCredential,
  WrappedVerifiablePresentation,
  WrappedW3CVerifiableCredential,
} from '../types'
import { MdocDocument } from '../types/mso_mdoc'
import { ObjectUtils } from '../utils'

export class CredentialMapper {
  /**
   * Decodes a compact SD-JWT vc to it's decoded variant. This method can be used when the hasher implementation used is Async, and therefore not suitable for usage
   * with the other decode methods.
   */
  static decodeSdJwtVcAsync(compactSdJwtVc: string, hasher: AsyncHasher) {
    return decodeSdJwtVcAsync(compactSdJwtVc, hasher)
  }

  /**
   * Decodes a Verifiable Presentation to a uniform format.
   *
   * When decoding SD-JWT credentials, a hasher implementation must be provided. The hasher implementation must be sync. When using
   * an async hasher implementation, use the decodeSdJwtVcAsync method instead and you can provide the decoded payload to methods
   * instead of the compact SD-JWT.
   *
   * @param hasher Hasher implementation to use for SD-JWT decoding.
   */
  static decodeVerifiablePresentation(
    presentation: OriginalVerifiablePresentation,
    hasher?: Hasher,
  ): JwtDecodedVerifiablePresentation | IVerifiablePresentation | SdJwtDecodedVerifiableCredential | MdocDocument {
    if (CredentialMapper.isJwtEncoded(presentation)) {
      const payload = jwt_decode(presentation as string) as JwtDecodedVerifiablePresentation
      const header = jwt_decode(presentation as string, { header: true }) as Record<string, any>

      payload.vp.proof = {
        type: IProofType.JwtProof2020,
        created: payload.nbf,
        proofPurpose: IProofPurpose.authentication,
        verificationMethod: header['kid'] ?? payload.iss,
        jwt: presentation as string,
      }
      return payload
    } else if (CredentialMapper.isJwtDecodedPresentation(presentation)) {
      return presentation as JwtDecodedVerifiablePresentation
    } else if (CredentialMapper.isSdJwtEncoded(presentation)) {
      if (!hasher) {
        throw new Error('Hasher implementation is required to decode SD-JWT')
      }
      return decodeSdJwtVc(presentation, hasher)
    } else if (CredentialMapper.isSdJwtDecodedCredential(presentation)) {
      return presentation as SdJwtDecodedVerifiableCredential
    } else if (CredentialMapper.isJsonLdAsString(presentation)) {
      return JSON.parse(presentation as string) as IVerifiablePresentation
    } else {
      return presentation as IVerifiablePresentation
    }
  }

  /**
   * Decodes a Verifiable Credential to a uniform format.
   *
   * When decoding SD-JWT credentials, a hasher implementation must be provided. The hasher implementation must be sync. When using
   * an async hasher implementation, use the decodeSdJwtVcAsync method instead and you can provide the decoded payload to methods
   * instead of the compact SD-JWT.
   *
   * @param hasher Hasher implementation to use for SD-JWT decoding
   */
  static decodeVerifiableCredential(
    credential: OriginalVerifiableCredential,
    hasher?: Hasher,
  ): JwtDecodedVerifiableCredential | IVerifiableCredential | SdJwtDecodedVerifiableCredential {
    if (CredentialMapper.isJwtEncoded(credential)) {
      const payload = jwt_decode(credential as string) as JwtDecodedVerifiableCredential
      const header = jwt_decode(credential as string, { header: true }) as Record<string, any>
      payload.vc.proof = {
        type: IProofType.JwtProof2020,
        created: payload.nbf,
        proofPurpose: IProofPurpose.authentication,
        verificationMethod: header['kid'] ?? payload.iss,
        jwt: credential as string,
      }
      return payload
    } else if (CredentialMapper.isJwtDecodedCredential(credential)) {
      return credential
    } else if (CredentialMapper.isJsonLdAsString(credential)) {
      return JSON.parse(credential as string) as IVerifiableCredential
    } else if (CredentialMapper.isSdJwtEncoded(credential)) {
      if (!hasher) {
        throw new Error('Hasher implementation is required to decode SD-JWT')
      }
      return decodeSdJwtVc(credential, hasher)
    } else if (CredentialMapper.isSdJwtDecodedCredential(credential)) {
      return credential
    } else {
      return credential as IVerifiableCredential
    }
  }

  /**
   * Converts a presentation to a wrapped presentation.
   *
   * When decoding SD-JWT credentials, a hasher implementation must be provided. The hasher implementation must be sync. When using
   * an async hasher implementation, use the decodeSdJwtVcAsync method instead and you can provide the decoded payload to methods
   * instead of the compact SD-JWT.
   *
   * @param hasher Hasher implementation to use for SD-JWT decoding
   */
  static toWrappedVerifiablePresentation(
    originalPresentation: OriginalVerifiablePresentation,
    opts?: { maxTimeSkewInMS?: number; hasher?: Hasher },
  ): WrappedVerifiablePresentation {
    // MSO_MDOC
    if (CredentialMapper.isMsoMdocDecodedPresentation(originalPresentation) || CredentialMapper.isMsoMdocOid4VPEncoded(originalPresentation)) {
      let deviceResponse: MdocDeviceResponse
      if (CredentialMapper.isMsoMdocOid4VPEncoded(originalPresentation)) {
        deviceResponse = decodeMdocDeviceResponse(originalPresentation)
      } else {
        deviceResponse = originalPresentation
      }
      return {
        type: CredentialMapper.isMsoMdocDecodedPresentation(originalPresentation) ? OriginalType.MSO_MDOC_DECODED : OriginalType.MSO_MDOC_ENCODED,
        format: 'mso_mdoc',
        original: originalPresentation,
        presentation: deviceResponse,
        decoded: deviceResponse,

        // @ts-ignore
        vcs: (deviceResponse.documents?.map((doc) => CredentialMapper.toWrappedVerifiableCredential(doc, opts) as WrappedMdocCredential) ??
          []) as WrappedMdocCredential[],
      }
    }
    // SD-JWT
    if (CredentialMapper.isSdJwtDecodedCredential(originalPresentation) || CredentialMapper.isSdJwtEncoded(originalPresentation)) {
      let decodedPresentation: SdJwtDecodedVerifiableCredential
      if (CredentialMapper.isSdJwtEncoded(originalPresentation)) {
        if (!opts?.hasher) {
          throw new Error('Hasher implementation is required to decode SD-JWT')
        }
        decodedPresentation = decodeSdJwtVc(originalPresentation, opts.hasher)
      } else {
        decodedPresentation = originalPresentation
      }
      return {
        type: CredentialMapper.isSdJwtDecodedCredential(originalPresentation) ? OriginalType.SD_JWT_VC_DECODED : OriginalType.SD_JWT_VC_ENCODED,
        format: 'vc+sd-jwt',
        original: originalPresentation,
        presentation: decodedPresentation,
        decoded: decodedPresentation.decodedPayload,
        // NOTE: we also include the SD-JWT VC as the VC, as the SD-JWT acts as both the VC and the VP
        vcs: [CredentialMapper.toWrappedVerifiableCredential(originalPresentation, opts) as WrappedSdJwtVerifiableCredential],
      }
    }

    // If the VP is not an encoded/decoded SD-JWT, we assume it will be a W3C VC
    const proof = CredentialMapper.getFirstProof(originalPresentation)
    const original =
      typeof originalPresentation !== 'string' && CredentialMapper.hasJWTProofType(originalPresentation) ? proof?.jwt : originalPresentation
    if (!original) {
      throw Error(
        'Could not determine original presentation, probably it was a converted JWT presentation, that is now missing the JWT value in the proof',
      )
    }
    const decoded = CredentialMapper.decodeVerifiablePresentation(original) as IVerifiablePresentation | JwtDecodedVerifiablePresentation
    const isJwtEncoded: boolean = CredentialMapper.isJwtEncoded(original)
    const isJwtDecoded: boolean = CredentialMapper.isJwtDecodedPresentation(original)

    const type = isJwtEncoded ? OriginalType.JWT_ENCODED : isJwtDecoded ? OriginalType.JWT_DECODED : OriginalType.JSONLD
    const format = isJwtDecoded || isJwtEncoded ? 'jwt_vp' : ('ldp_vp' as const)

    let vp: OriginalVerifiablePresentation
    if (isJwtEncoded || isJwtDecoded) {
      vp = CredentialMapper.jwtDecodedPresentationToUniformPresentation(decoded as JwtDecodedVerifiablePresentation, false, opts)
    } else {
      vp = decoded as IVerifiablePresentation
    }
    if (!vp) {
      throw Error(`VP key not found`)
    }
    const noVCs = !('verifiableCredential' in vp) || !vp.verifiableCredential || vp.verifiableCredential.length === 0
    if (noVCs) {
      console.warn(`Presentation without verifiable credentials. That is rare! `)
      // throw Error(`VP needs to have at least one verifiable credential at this point`)
    }
    const vcs = noVCs
      ? []
      : (CredentialMapper.toWrappedVerifiableCredentials(
          vp.verifiableCredential ?? [] /*.map(value => value.original)*/,
          opts,
        ) as WrappedW3CVerifiableCredential[])

    const presentation = {
      ...vp,
      verifiableCredential: vcs, // We overwrite the verifiableCredentials with wrapped versions, making it an InternalVerifiablePresentation. Note: we keep the singular key name of the vc data model
    } as UniformVerifiablePresentation
    return {
      type,
      format,
      original,
      decoded,
      presentation,
      vcs,
    }
  }

  /**
   * Converts a list of credentials to a list of wrapped credentials.
   *
   * When decoding SD-JWT credentials, a hasher implementation must be provided. The hasher implementation must be sync. When using
   * an async hasher implementation, use the decodeSdJwtVcAsync method instead and you can provide the decoded payload to methods
   * instead of the compact SD-JWT.
   *
   * @param hasher Hasher implementation to use for SD-JWT decoding
   */
  static toWrappedVerifiableCredentials(
    verifiableCredentials: OriginalVerifiableCredential[],
    opts?: { maxTimeSkewInMS?: number; hasher?: Hasher },
  ): WrappedVerifiableCredential[] {
    return verifiableCredentials.map((vc) => CredentialMapper.toWrappedVerifiableCredential(vc, opts))
  }

  /**
   * Converts a credential to a wrapped credential.
   *
   * When decoding SD-JWT credentials, a hasher implementation must be provided. The hasher implementation must be sync. When using
   * an async hasher implementation, use the decodeSdJwtVcAsync method instead and you can provide the decoded payload to methods
   * instead of the compact SD-JWT.
   *
   * @param hasher Hasher implementation to use for SD-JWT decoding
   */
  static toWrappedVerifiableCredential(
    verifiableCredential: OriginalVerifiableCredential,
    opts?: { maxTimeSkewInMS?: number; hasher?: Hasher },
  ): WrappedVerifiableCredential {
    // MSO_MDOC
    if (CredentialMapper.isMsoMdocDecodedCredential(verifiableCredential) || CredentialMapper.isMsoMdocDecodedCredential(verifiableCredential)) {
      let mdoc: MdocDocument
      if (CredentialMapper.isMsoMdocOid4VPEncoded(verifiableCredential)) {
        mdoc = decodeMdocIssuerSigned(verifiableCredential)
      } else {
        mdoc = verifiableCredential
      }
      return {
        type: CredentialMapper.isMsoMdocDecodedCredential(verifiableCredential) ? OriginalType.MSO_MDOC_DECODED : OriginalType.MSO_MDOC_ENCODED,
        format: 'mso_mdoc',
        original: verifiableCredential,
        credential: mdocDecodedCredentialToUniformCredential(mdoc),
        decoded: mdoc,
      }
    }

    // SD-JWT
    if (CredentialMapper.isSdJwtDecodedCredential(verifiableCredential) || CredentialMapper.isSdJwtEncoded(verifiableCredential)) {
      let decodedCredential: SdJwtDecodedVerifiableCredential
      if (CredentialMapper.isSdJwtEncoded(verifiableCredential)) {
        if (!opts?.hasher) {
          throw new Error('Hasher implementation is required to decode SD-JWT')
        }
        decodedCredential = decodeSdJwtVc(verifiableCredential, opts.hasher)
      } else {
        decodedCredential = verifiableCredential
      }

      return {
        type: CredentialMapper.isSdJwtDecodedCredential(verifiableCredential) ? OriginalType.SD_JWT_VC_DECODED : OriginalType.SD_JWT_VC_ENCODED,
        format: 'vc+sd-jwt',
        original: verifiableCredential,
        credential: decodedCredential,
        decoded: decodedCredential.decodedPayload,
      }
    }

    // If the VC is not an encoded/decoded SD-JWT, we assume it will be a W3C VC
    const proof = CredentialMapper.getFirstProof(verifiableCredential)
    const original = CredentialMapper.hasJWTProofType(verifiableCredential) && proof ? (proof.jwt ?? verifiableCredential) : verifiableCredential
    if (!original) {
      throw Error(
        'Could not determine original credential, probably it was a converted JWT credential, that is now missing the JWT value in the proof',
      )
    }
    const decoded = CredentialMapper.decodeVerifiableCredential(original) as JwtDecodedVerifiableCredential | IVerifiableCredential

    const isJwtEncoded = CredentialMapper.isJwtEncoded(original)
    const isJwtDecoded = CredentialMapper.isJwtDecodedCredential(original)
    const type = isJwtEncoded ? OriginalType.JWT_ENCODED : isJwtDecoded ? OriginalType.JWT_DECODED : OriginalType.JSONLD

    const credential =
      isJwtEncoded || isJwtDecoded
        ? CredentialMapper.jwtDecodedCredentialToUniformCredential(decoded as JwtDecodedVerifiableCredential, opts)
        : (decoded as IVerifiableCredential)

    const format = isJwtEncoded || isJwtDecoded ? ('jwt_vc' as const) : ('ldp_vc' as const)
    return {
      original,
      decoded,
      format,
      type,
      credential,
    }
  }

  public static isJwtEncoded(original: OriginalVerifiableCredential | OriginalVerifiablePresentation): original is string {
    return ObjectUtils.isString(original) && original.startsWith('ey') && !original.includes('~')
  }

  public static isSdJwtEncoded(original: OriginalVerifiableCredential | OriginalVerifiablePresentation): original is string {
    return ObjectUtils.isString(original) && original.startsWith('ey') && original.includes('~')
  }

  public static isMsoMdocOid4VPEncoded(original: OriginalVerifiableCredential | OriginalVerifiablePresentation): original is string {
    return ObjectUtils.isString(original) && !original.startsWith('ey') && ObjectUtils.isBase64(original)
  }

  public static isW3cCredential(credential: ICredential | SdJwtDecodedVerifiableCredential): credential is ICredential {
    return typeof credential === 'object' && '@context' in credential && ((credential as ICredential).type?.includes('VerifiableCredential') || false)
  }

  public static isCredential(original: OriginalVerifiableCredential | OriginalVerifiablePresentation): original is OriginalVerifiableCredential {
    try {
      if (CredentialMapper.isJwtEncoded(original)) {
        const vc: IVerifiableCredential = CredentialMapper.toUniformCredential(original)
        return CredentialMapper.isW3cCredential(vc)
      } else if (CredentialMapper.isSdJwtEncoded(original)) {
        return true
      } else if (CredentialMapper.isMsoMdocDecodedCredential(original)) {
        return true
      } else if (CredentialMapper.isMsoMdocOid4VPEncoded(original)) {
        return true
      }
      return (
        CredentialMapper.isW3cCredential(original as ICredential) ||
        CredentialMapper.isSdJwtDecodedCredentialPayload(original as ICredential) ||
        CredentialMapper.isJwtDecodedCredential(original as OriginalVerifiableCredential) ||
        CredentialMapper.isSdJwtDecodedCredential(original as OriginalVerifiableCredential)
      )
    } catch (e) {
      return false
    }
  }

  public static isPresentation(original: OriginalVerifiableCredential | OriginalVerifiablePresentation): original is OriginalVerifiablePresentation {
    try {
      if (CredentialMapper.isJwtEncoded(original)) {
        const vp: IVerifiablePresentation = CredentialMapper.toUniformPresentation(original)
        return CredentialMapper.isW3cPresentation(vp)
      } else if (CredentialMapper.isSdJwtEncoded(original)) {
        return false
        // @ts-expect-error
      } else if (CredentialMapper.isMsoMdocDecodedPresentation(original)) {
        return true
      } else if (CredentialMapper.isMsoMdocOid4VPEncoded(original)) {
        return true
      }
      return (
        CredentialMapper.isW3cPresentation(original as IPresentation) ||
        CredentialMapper.isSdJwtDecodedCredentialPayload(original as ICredential) ||
        CredentialMapper.isJwtDecodedPresentation(original as OriginalVerifiablePresentation) ||
        CredentialMapper.isSdJwtDecodedCredential(original as OriginalVerifiableCredential)
      )
    } catch (e) {
      return false
    }
  }

  public static hasProof(original: OriginalVerifiableCredential | OriginalVerifiablePresentation | string): boolean {
    try {
      if (CredentialMapper.isMsoMdocOid4VPEncoded(original)) {
        return false
        // @ts-ignore
      } else if (CredentialMapper.isMsoMdocDecodedCredential(original) || CredentialMapper.isMsoMdocDecodedPresentation(original)) {
        return true
      } else if (CredentialMapper.isJwtEncoded(original) || CredentialMapper.isJwtDecodedCredential(original as OriginalVerifiableCredential)) {
        return true
      } else if (CredentialMapper.isSdJwtEncoded(original) || CredentialMapper.isSdJwtDecodedCredential(original)) {
        //todo: we might want to revisit this
        return true
      }
      if (typeof original !== 'object') {
        return false
      }
      if ('vc' in (original as JwtDecodedVerifiableCredential) && (original as JwtDecodedVerifiableCredential).vc.proof) {
        return true
      }
      if ('vp' in (original as JwtDecodedVerifiablePresentation) && (original as JwtDecodedVerifiablePresentation).vp.proof) {
        return true
      }
      return !!(original as IVerifiableCredential | IVerifiablePresentation).proof
    } catch (e) {
      return false
    }
  }

  public static isW3cPresentation(
    presentation: UniformVerifiablePresentation | IPresentation | SdJwtDecodedVerifiableCredential,
  ): presentation is IPresentation {
    return (
      typeof presentation === 'object' &&
      '@context' in presentation &&
      ((presentation as IPresentation).type?.includes('VerifiablePresentation') || false)
    )
  }

  public static isSdJwtDecodedCredentialPayload(
    credential: ICredential | SdJwtDecodedVerifiableCredentialPayload,
  ): credential is SdJwtDecodedVerifiableCredentialPayload {
    return typeof credential === 'object' && 'vct' in credential
  }

  public static areOriginalVerifiableCredentialsEqual(firstOriginal: OriginalVerifiableCredential, secondOriginal: OriginalVerifiableCredential) {
    // String (e.g. encoded jwt or SD-JWT)
    if (typeof firstOriginal === 'string' || typeof secondOriginal === 'string') {
      return firstOriginal === secondOriginal
    } else if (CredentialMapper.isMsoMdocDecodedCredential(firstOriginal) || CredentialMapper.isMsoMdocDecodedCredential(secondOriginal)) {
      if (!CredentialMapper.isMsoMdocDecodedCredential(firstOriginal) || !CredentialMapper.isMsoMdocDecodedCredential(secondOriginal)) {
        // We are doing this over here, as the rest of the logic around it would otherwise need to be adjusted substantially
        return false
      }
      return firstOriginal.toJson().toJsonString() === secondOriginal.toJson().toJsonString()
    } else if (CredentialMapper.isSdJwtDecodedCredential(firstOriginal) || CredentialMapper.isSdJwtDecodedCredential(secondOriginal)) {
      return firstOriginal.compactSdJwtVc === secondOriginal.compactSdJwtVc
    } else {
      // JSON-LD or decoded JWT. (should we compare the signatures instead?)
      return JSON.stringify(secondOriginal.proof) === JSON.stringify(firstOriginal.proof)
    }
  }

  private static isJsonLdAsString(original: OriginalVerifiableCredential | OriginalVerifiablePresentation): original is string {
    return ObjectUtils.isString(original) && original.includes('@context')
  }

  public static isSdJwtDecodedCredential(
    original: OriginalVerifiableCredential | OriginalVerifiablePresentation | ICredential | IPresentation,
  ): original is SdJwtDecodedVerifiableCredential {
    return typeof original === 'object' && (<SdJwtDecodedVerifiableCredential>original).compactSdJwtVc !== undefined
  }

  public static isMsoMdocDecodedCredential(
    original: OriginalVerifiableCredential | OriginalVerifiablePresentation | ICredential | IPresentation,
  ): original is MdocDocument {
    return typeof original === 'object' && 'issuerSigned' in original && (<MdocDocument>original).issuerSigned !== undefined
  }

  public static isMsoMdocDecodedPresentation(original: OriginalVerifiablePresentation): original is MdocDeviceResponse {
    return typeof original === 'object' && 'version' in original && (<MdocDeviceResponse>original).version !== undefined
  }

  public static isJwtDecodedCredential(original: OriginalVerifiableCredential): original is JwtDecodedVerifiableCredential {
    return (
      typeof original === 'object' &&
      (<JwtDecodedVerifiableCredential>original).vc !== undefined &&
      (<JwtDecodedVerifiableCredential>original).iss !== undefined
    )
  }

  public static isJwtDecodedPresentation(original: OriginalVerifiablePresentation): original is JwtDecodedVerifiablePresentation {
    return (
      typeof original === 'object' &&
      (<JwtDecodedVerifiablePresentation>original).vp !== undefined &&
      (<JwtDecodedVerifiablePresentation>original).iss !== undefined
    )
  }

  public static isWrappedSdJwtVerifiableCredential = isWrappedSdJwtVerifiableCredential
  public static isWrappedSdJwtVerifiablePresentation = isWrappedSdJwtVerifiablePresentation
  public static isWrappedW3CVerifiableCredential = isWrappedW3CVerifiableCredential
  public static isWrappedW3CVerifiablePresentation = isWrappedW3CVerifiablePresentation
  public static isWrappedMdocCredential = isWrappedMdocCredential
  public static isWrappedMdocPresentation = isWrappedMdocPresentation

  static jwtEncodedPresentationToUniformPresentation(
    jwt: string,
    makeCredentialsUniform: boolean = true,
    opts?: { maxTimeSkewInMS?: number },
  ): IPresentation {
    return CredentialMapper.jwtDecodedPresentationToUniformPresentation(jwt_decode(jwt), makeCredentialsUniform, opts)
  }

  static jwtDecodedPresentationToUniformPresentation(
    decoded: JwtDecodedVerifiablePresentation,
    makeCredentialsUniform: boolean = true,
    opts?: { maxTimeSkewInMS?: number },
  ): IVerifiablePresentation {
    const { iss, aud, jti, vp, ...rest } = decoded

    const presentation: IVerifiablePresentation = {
      ...rest,
      ...vp,
    }
    if (makeCredentialsUniform) {
      if (!vp.verifiableCredential) {
        throw Error('Verifiable Presentation should have a verifiable credential at this point')
      }
      presentation.verifiableCredential = vp.verifiableCredential.map((vc) => CredentialMapper.toUniformCredential(vc, opts))
    }
    if (iss) {
      const holder = presentation.holder
      if (holder) {
        if (holder !== iss) {
          throw new Error(`Inconsistent holders between JWT claim (${iss}) and VC value (${holder})`)
        }
      }
      presentation.holder = iss
    }
    if (aud) {
      const verifier = presentation.verifier
      if (verifier) {
        if (verifier !== aud) {
          throw new Error(`Inconsistent holders between JWT claim (${aud}) and VC value (${verifier})`)
        }
      }
      presentation.verifier = aud
    }
    if (jti) {
      const id = presentation.id
      if (id && id !== jti) {
        throw new Error(`Inconsistent VP ids between JWT claim (${jti}) and VP value (${id})`)
      }
      presentation.id = jti
    }
    return presentation
  }

  static toUniformCredential(
    verifiableCredential: OriginalVerifiableCredential,
    opts?: {
      maxTimeSkewInMS?: number
      hasher?: Hasher
    },
  ): IVerifiableCredential {
    if (CredentialMapper.isMsoMdocDecodedCredential(verifiableCredential)) {
      return mdocDecodedCredentialToUniformCredential(verifiableCredential)
    }
    if (CredentialMapper.isSdJwtDecodedCredential(verifiableCredential)) {
      return sdJwtDecodedCredentialToUniformCredential(verifiableCredential, opts)
    }
    const original =
      typeof verifiableCredential !== 'string' && CredentialMapper.hasJWTProofType(verifiableCredential)
        ? CredentialMapper.getFirstProof(verifiableCredential)?.jwt
        : verifiableCredential
    if (!original) {
      throw Error(
        'Could not determine original credential from passed in credential. Probably because a JWT proof type was present, but now is not available anymore',
      )
    }
    const decoded = CredentialMapper.decodeVerifiableCredential(original, opts?.hasher)

    const isJwtEncoded: boolean = CredentialMapper.isJwtEncoded(original)
    const isJwtDecoded: boolean = CredentialMapper.isJwtDecodedCredential(original)
    const isSdJwtEncoded = CredentialMapper.isSdJwtEncoded(original)
    const isMdocEncoded = CredentialMapper.isMsoMdocOid4VPEncoded(original)

    if (isSdJwtEncoded) {
      return sdJwtDecodedCredentialToUniformCredential(decoded as SdJwtDecodedVerifiableCredential, opts)
    } else if (isMdocEncoded) {
      return mdocDecodedCredentialToUniformCredential(decodeMdocIssuerSigned(original))
    } else if (isJwtDecoded || isJwtEncoded) {
      return CredentialMapper.jwtDecodedCredentialToUniformCredential(decoded as JwtDecodedVerifiableCredential, opts)
    } else {
      return decoded as IVerifiableCredential
    }
  }

  static toUniformPresentation(
    presentation: OriginalVerifiablePresentation,
    opts?: { maxTimeSkewInMS?: number; addContextIfMissing?: boolean },
  ): IVerifiablePresentation {
    if (CredentialMapper.isSdJwtDecodedCredential(presentation)) {
      throw new Error('Converting SD-JWT VC to uniform VP is not supported.')
    } else if (CredentialMapper.isMsoMdocDecodedPresentation(presentation)) {
      throw new Error('Converting MSO_MDOC to uniform VP is not supported yet.')
    }

    const proof = CredentialMapper.getFirstProof(presentation)
    const original = typeof presentation !== 'string' && CredentialMapper.hasJWTProofType(presentation) ? proof?.jwt : presentation
    if (!original) {
      throw Error(
        'Could not determine original presentation, probably it was a converted JWT presentation, that is now missing the JWT value in the proof',
      )
    }
    const decoded = CredentialMapper.decodeVerifiablePresentation(original)
    const isJwtEncoded: boolean = CredentialMapper.isJwtEncoded(original)
    const isJwtDecoded: boolean = CredentialMapper.isJwtDecodedPresentation(original)
    const uniformPresentation =
      isJwtEncoded || isJwtDecoded
        ? CredentialMapper.jwtDecodedPresentationToUniformPresentation(decoded as JwtDecodedVerifiablePresentation, false)
        : (decoded as IVerifiablePresentation)

    // At time of writing Velocity Networks does not conform to specification. Adding bare minimum @context section to stop parsers from crashing and whatnot
    if (opts?.addContextIfMissing && !uniformPresentation['@context']) {
      uniformPresentation['@context'] = ['https://www.w3.org/2018/credentials/v1']
    }

    uniformPresentation.verifiableCredential = uniformPresentation.verifiableCredential?.map((vc) =>
      CredentialMapper.toUniformCredential(vc, opts),
    ) as IVerifiableCredential[] // We cast it because we IPresentation needs a VC. The internal Credential doesn't have the required Proof anymore (that is intended)
    return uniformPresentation
  }

  static jwtEncodedCredentialToUniformCredential(
    jwt: string,
    opts?: {
      maxTimeSkewInMS?: number
    },
  ): IVerifiableCredential {
    return CredentialMapper.jwtDecodedCredentialToUniformCredential(jwt_decode(jwt), opts)
  }

  static jwtDecodedCredentialToUniformCredential(
    decoded: JwtDecodedVerifiableCredential,
    opts?: { maxTimeSkewInMS?: number },
  ): IVerifiableCredential {
    const { exp, nbf, iss, vc, sub, jti, ...rest } = decoded
    const credential: IVerifiableCredential = {
      ...rest,
      ...vc,
    }

    const maxSkewInMS = opts?.maxTimeSkewInMS ?? 1500

    if (exp) {
      const expDate = credential.expirationDate
      const jwtExp = parseInt(exp.toString())
      // fix seconds to millisecond for the date
      const expDateAsStr = jwtExp < 9999999999 ? new Date(jwtExp * 1000).toISOString().replace(/\.000Z/, 'Z') : new Date(jwtExp).toISOString()
      if (expDate && expDate !== expDateAsStr) {
        const diff = Math.abs(new Date(expDateAsStr).getTime() - new Date(expDate).getTime())
        if (!maxSkewInMS || diff > maxSkewInMS) {
          throw new Error(`Inconsistent expiration dates between JWT claim (${expDateAsStr}) and VC value (${expDate})`)
        }
      }
      credential.expirationDate = expDateAsStr
    }

    if (nbf) {
      const issuanceDate = credential.issuanceDate
      const jwtNbf = parseInt(nbf.toString())
      // fix seconds to millisecs for the date
      const nbfDateAsStr = jwtNbf < 9999999999 ? new Date(jwtNbf * 1000).toISOString().replace(/\.000Z/, 'Z') : new Date(jwtNbf).toISOString()
      if (issuanceDate && issuanceDate !== nbfDateAsStr) {
        const diff = Math.abs(new Date(nbfDateAsStr).getTime() - new Date(issuanceDate).getTime())
        if (!maxSkewInMS || diff > maxSkewInMS) {
          throw new Error(`Inconsistent issuance dates between JWT claim (${nbfDateAsStr}) and VC value (${issuanceDate})`)
        }
      }
      credential.issuanceDate = nbfDateAsStr
    }

    if (iss) {
      const issuer = credential.issuer
      if (issuer) {
        if (typeof issuer === 'string') {
          if (issuer !== iss) {
            throw new Error(`Inconsistent issuers between JWT claim (${iss}) and VC value (${issuer})`)
          }
        } else {
          if (!issuer.id && Object.keys(issuer).length > 0) {
            // We have an issuer object with more than 1 property but without an issuer id. Set it,
            // because the default behaviour of did-jwt-vc is to remove the id value when creating JWTs
            issuer.id = iss
          }
          if (issuer.id !== iss) {
            throw new Error(`Inconsistent issuers between JWT claim (${iss}) and VC value (${issuer.id})`)
          }
        }
      } else {
        credential.issuer = iss
      }
    }

    if (sub) {
      const subjects = Array.isArray(credential.credentialSubject) ? credential.credentialSubject : [credential.credentialSubject]
      for (let i = 0; i < subjects.length; i++) {
        const csId = subjects[i].id
        if (csId && csId !== sub) {
          throw new Error(`Inconsistent credential subject ids between JWT claim (${sub}) and VC value (${csId})`)
        }
        Array.isArray(credential.credentialSubject) ? (credential.credentialSubject[i].id = sub) : (credential.credentialSubject.id = sub)
      }
    }
    if (jti) {
      const id = credential.id
      if (id && id !== jti) {
        throw new Error(`Inconsistent credential ids between JWT claim (${jti}) and VC value (${id})`)
      }
      credential.id = jti
    }

    return credential
  }

  static toExternalVerifiableCredential(verifiableCredential: any): IVerifiableCredential {
    let proof
    if (verifiableCredential.proof) {
      if (!verifiableCredential.proof.type) {
        throw new Error('Verifiable credential proof is missing a type')
      }

      if (!verifiableCredential.proof.created) {
        throw new Error('Verifiable credential proof is missing a created date')
      }

      if (!verifiableCredential.proof.proofPurpose) {
        throw new Error('Verifiable credential proof is missing a proof purpose')
      }

      if (!verifiableCredential.proof.verificationMethod) {
        throw new Error('Verifiable credential proof is missing a verification method')
      }
      proof = {
        ...verifiableCredential.proof,
        type: verifiableCredential.proof.type,
        created: verifiableCredential.proof.created,
        proofPurpose: verifiableCredential.proof.proofPurpose,
        verificationMethod: verifiableCredential.proof.verificationMethod,
      }
    }

    return {
      ...verifiableCredential,
      type: verifiableCredential.type
        ? typeof verifiableCredential.type === 'string'
          ? [verifiableCredential.type]
          : verifiableCredential.type
        : ['VerifiableCredential'],
      proof,
    }
  }

  static storedCredentialToOriginalFormat(credential: OriginalVerifiableCredential): W3CVerifiableCredential {
    const type: DocumentFormat = CredentialMapper.detectDocumentType(credential)
    if (typeof credential === 'string') {
      if (type === DocumentFormat.JWT) {
        return CredentialMapper.toCompactJWT(credential)
      } else if (type === DocumentFormat.JSONLD) {
        return JSON.parse(credential)
      } else if (type === DocumentFormat.SD_JWT_VC) {
        return credential
      }
    } else if (type === DocumentFormat.JWT && ObjectUtils.isObject(credential) && 'vc' in credential) {
      return CredentialMapper.toCompactJWT(credential)
    } else if (ObjectUtils.isObject(credential) && 'proof' in credential && credential.proof.type === 'JwtProof2020' && credential.proof.jwt) {
      return credential.proof.jwt
    } else if (
      ObjectUtils.isObject(credential) &&
      'proof' in credential &&
      credential.proof.type === IProofType.SdJwtProof2024 &&
      credential.proof.jwt
    ) {
      return credential.proof.jwt
    } else if (type === DocumentFormat.SD_JWT_VC && this.isSdJwtDecodedCredential(credential)) {
      return credential.compactSdJwtVc
    }
    return credential as W3CVerifiableCredential
  }

  static storedPresentationToOriginalFormat(presentation: OriginalVerifiablePresentation): W3CVerifiablePresentation {
    const type: DocumentFormat = CredentialMapper.detectDocumentType(presentation)
    if (typeof presentation === 'string') {
      if (type === DocumentFormat.JWT) {
        return CredentialMapper.toCompactJWT(presentation)
      } else if (type === DocumentFormat.JSONLD) {
        return JSON.parse(presentation)
      }
    } else if (type === DocumentFormat.JWT && ObjectUtils.isObject(presentation) && 'vp' in presentation) {
      return CredentialMapper.toCompactJWT(presentation)
    } else if (
      ObjectUtils.isObject(presentation) &&
      'proof' in presentation &&
      presentation.proof.type === 'JwtProof2020' &&
      presentation.proof.jwt
    ) {
      return presentation.proof.jwt
    }
    return presentation as W3CVerifiablePresentation
  }

  static toCompactJWT(
    jwtDocument: W3CVerifiableCredential | JwtDecodedVerifiableCredential | W3CVerifiablePresentation | JwtDecodedVerifiablePresentation | string,
  ): string {
    if (!jwtDocument || CredentialMapper.detectDocumentType(jwtDocument) !== DocumentFormat.JWT) {
      throw Error('Cannot convert non JWT credential to JWT')
    }
    if (typeof jwtDocument === 'string') {
      return jwtDocument
    }
    let proof: string | undefined
    if (ObjectUtils.isObject(jwtDocument) && 'vp' in jwtDocument) {
      proof = 'jwt' in jwtDocument.vp.proof ? jwtDocument.vp.proof.jwt : jwtDocument.vp.proof
    } else if (ObjectUtils.isObject(jwtDocument) && 'vc' in jwtDocument) {
      proof = 'jwt' in jwtDocument.vc.proof ? jwtDocument.vc.proof.jwt : jwtDocument.vc.proof
    } else {
      proof = Array.isArray(jwtDocument.proof) ? jwtDocument.proof[0].jwt : jwtDocument.proof.jwt
    }
    if (!proof) {
      throw Error(`Could not get JWT from supplied document`)
    }
    return proof
  }

  static detectDocumentType(
    document:
      | W3CVerifiableCredential
      | W3CVerifiablePresentation
      | JwtDecodedVerifiableCredential
      | JwtDecodedVerifiablePresentation
      | SdJwtDecodedVerifiableCredential
      | MdocDeviceResponse
      | MdocDocument,
  ): DocumentFormat {
    if (this.isMsoMdocOid4VPEncoded(document as any) || this.isMsoMdocDecodedCredential(document as any)) {
      return DocumentFormat.MSO_MDOC
    } else if (this.isMsoMdocDecodedPresentation(document as any) || this.isMsoMdocDecodedPresentation(document as any)) {
      return DocumentFormat.MSO_MDOC
    } else if (this.isJsonLdAsString(document)) {
      return DocumentFormat.JSONLD
    } else if (this.isJwtEncoded(document)) {
      return DocumentFormat.JWT
    } else if (this.isSdJwtEncoded(document) || this.isSdJwtDecodedCredential(document as any)) {
      return DocumentFormat.SD_JWT_VC
    }

    const proofs =
      typeof document !== 'string' &&
      ('vc' in document ? document.vc.proof : 'vp' in document ? document.vp.proof : (<IVerifiableCredential>document).proof)
    const proof: IProof = Array.isArray(proofs) ? proofs[0] : proofs

    if (proof?.jwt) {
      return DocumentFormat.JWT
    } else if (proof?.type === 'EthereumEip712Signature2021') {
      return DocumentFormat.EIP712
    }
    return DocumentFormat.JSONLD
  }

  private static hasJWTProofType(
    document: W3CVerifiableCredential | W3CVerifiablePresentation | JwtDecodedVerifiableCredential | JwtDecodedVerifiablePresentation,
  ): boolean {
    if (typeof document === 'string') {
      return false
    }
    return !!CredentialMapper.getFirstProof(document)?.jwt
  }

  private static getFirstProof(
    document: W3CVerifiableCredential | W3CVerifiablePresentation | JwtDecodedVerifiableCredential | JwtDecodedVerifiablePresentation,
  ): IProof | undefined {
    if (!document || typeof document === 'string') {
      return undefined
    }
    const proofs = 'vc' in document ? document.vc.proof : 'vp' in document ? document.vp.proof : (<IVerifiableCredential>document).proof
    return Array.isArray(proofs) ? proofs[0] : proofs
  }

  static issuerCorrelationIdFromIssuerType(issuer: IssuerType): string {
    if (issuer === undefined) {
      throw new Error('Issuer type us undefined')
    } else if (typeof issuer === 'string') {
      return issuer
    } else if (typeof issuer === 'object') {
      if ('id' in issuer) {
        return issuer.id
      } else {
        throw new Error('Encountered an invalid issuer object: missing id property')
      }
    } else {
      throw new Error('Invalid issuer type')
    }
  }
}
