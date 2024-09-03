/**
 * Create some interface below to do a the mapping of the KMP library.
 * For now we are using the library directly, and thus do not need them,
 * but it would be nice if we can remove the imports and just have some interfaces here we can then use, like done
 * for sd-jwts
 */

import { com } from '@sphereon/kmp-mdl-mdoc'
import { IProofPurpose, IProofType } from './did'
import { OriginalType, WrappedVerifiableCredential, WrappedVerifiablePresentation } from './vc'
import { IVerifiableCredential } from './w3c-vc'
import decodeFrom = com.sphereon.kmp.decodeFrom
import encodeTo = com.sphereon.kmp.encodeTo
import Encoding = com.sphereon.kmp.Encoding
import DeviceResponseCbor = com.sphereon.mdoc.data.device.DeviceResponseCbor
import DocumentJson = com.sphereon.mdoc.data.device.DocumentJson
import IssuerSignedCbor = com.sphereon.mdoc.data.device.IssuerSignedCbor
import IssuerSignedItemJson = com.sphereon.mdoc.data.device.IssuerSignedItemJson

/**
 * Represents a selective disclosure JWT vc in compact form.
 */
export type MdocOid4vpIssuerSigned = string
export type MdocOid4vpMdocVpToken = string
export type MdocIssuerSigned = com.sphereon.mdoc.data.device.IssuerSignedCbor
export type MdocDocument = com.sphereon.mdoc.data.device.DocumentCbor
export type MdocDocumentJson = com.sphereon.mdoc.data.device.DocumentJson
export type MdocDeviceResponse = com.sphereon.mdoc.data.device.DeviceResponseCbor

export interface WrappedMdocCredential {
  /**
   * Original IssuerSigned to Mdoc that we've received. Can be either the encoded or decoded variant.
   */
  original: MdocDocument | MdocOid4vpIssuerSigned
  /**
   * Decoded version of the Mdoc payload. We add the record to make sure existing implementations remain happy
   */
  decoded: MdocDocument & { [key: string]: any }
  /**
   * Type of this credential.
   */
  type: OriginalType.MSO_MDOC_DECODED | OriginalType.MSO_MDOC_ENCODED
  /**
   * The claim format, typically used during exchange transport protocols
   */
  format: 'mso_mdoc'
  /**
   * Internal stable representation of a Credential
   */
  credential: IVerifiableCredential
}

export interface WrappedMdocPresentation {
  /**
   * Original VP that we've received. Can be either the encoded or decoded variant.
   */
  original: MdocDeviceResponse | MdocOid4vpMdocVpToken
  /**
   * Decoded version of the SD-JWT payload. This is the decoded payload, rather than the whole SD-JWT.
   */
  decoded: MdocDeviceResponse
  /**
   * Type of this Presentation.
   */
  type: OriginalType.MSO_MDOC_ENCODED | OriginalType.MSO_MDOC_DECODED
  /**
   * The claim format, typically used during exchange transport protocols
   */
  format: 'mso_mdoc'
  /**
   * Internal stable representation of a Presentation
   */
  presentation: MdocDeviceResponse
  /**
   * Wrapped Mdocs belonging to the Presentation. .
   */
  vcs: [WrappedMdocCredential]
}

export function isWrappedMdocCredential(vc: WrappedVerifiableCredential): vc is WrappedMdocCredential {
  return vc.format === 'mso_mdoc'
}

export function isWrappedMdocPresentation(vp: WrappedVerifiablePresentation): vp is WrappedMdocPresentation {
  return vp.format === 'mso_mdoc'
}

/**
 * Decode an Mdoc from its issuerSigned OID4VP Base64URL (string) to an object containing the disclosures,
 * signed payload, decoded payload
 *
 */
export function decodeMdocIssuerSigned(oid4vpIssuerSigned: MdocOid4vpIssuerSigned): MdocDocument {
  // Issuer signed according to 18013-7 in base64url
  const issuerSigned: MdocIssuerSigned = IssuerSignedCbor.Static.cborDecode(decodeFrom(oid4vpIssuerSigned, Encoding.BASE64URL))
  // Create an mdoc from it. // Validations need to be performed by the caller after this!
  const holderMdoc: MdocDocument = issuerSigned.toDocument()
  return holderMdoc
}

/**
 * Decode an Mdoc from its vp_token OID4VP Base64URL (string) to an object containing the disclosures,
 * signed payload, decoded payload
 *
 */
export function decodeMdocDeviceResponse(vpToken: MdocOid4vpMdocVpToken): MdocDeviceResponse {
  const deviceResponse = DeviceResponseCbor.Static.cborDecode(decodeFrom(vpToken, Encoding.BASE64URL))
  return deviceResponse
}

// TODO naive implementation of mapping a mdoc onto a IVerifiableCredential. Needs some fixes and further implementation and needs to be moved out of ssi-types
export const mdocDecodedCredentialToUniformCredential = (decoded: MdocDocument, opts?: { maxTimeSkewInMS?: number }): IVerifiableCredential => {
  const mdoc = decoded.toJson()
  const json = mdoc.toJsonDTO<DocumentJson>()
  const type = 'Personal Identification Data'
  const MSO = mdoc.MSO
  if (!MSO || !json.issuerSigned?.nameSpaces) {
    throw Error(`Cannot access Mobile Security Object or Issuer Signed items from the Mdoc`)
  }
  const nameSpaces = json.issuerSigned.nameSpaces as unknown as Record<string, IssuerSignedItemJson[]>
  if (!('eu.europa.ec.eudi.pid.1' in nameSpaces)) {
    throw Error(`Only PID supported at present`)
  }
  const items = nameSpaces['eu.europa.ec.eudi.pid.1']
  if (!items || items.length === 0) {
    throw Error(`No issuer signed items were found`)
  }
  type DisclosuresAccumulator = {
    [key: string]: any
  }

  const credentialSubject = items.reduce((acc: DisclosuresAccumulator, item: IssuerSignedItemJson) => {
    if (Array.isArray(item.value)) {
      acc[item.key] = item.value.map((val) => val.value).join(', ')
    } else {
      acc[item.key] = item.value.value
    }
    return acc
  }, {})
  const validFrom = MSO.validityInfo.validFrom
  const validUntil = MSO.validityInfo.validUntil
  const docType = MSO.docType
  const expirationDate = validUntil
  let issuanceDateStr = validFrom

  const issuanceDate = issuanceDateStr
  if (!issuanceDate) {
    throw Error(`JWT issuance date is required but was not present`)
  }

  const credential: Omit<IVerifiableCredential, 'issuer' | 'issuanceDate'> = {
    type: [docType], // Mdoc not a W3C VC, so no VerifiableCredential
    '@context': [], // Mdoc has no JSON-LD by default. Certainly not the VC DM1 default context for JSON-LD
    credentialSubject: {
      type,
      ...credentialSubject,
    },
    issuanceDate,
    expirationDate,
    proof: {
      type: IProofType.MdocProof2024,
      created: issuanceDate,
      proofPurpose: IProofPurpose.authentication,
      verificationMethod: json.issuerSigned.issuerAuth.payload,
      mso_mdoc: encodeTo(decoded.cborEncode(), Encoding.BASE64URL),
    },
  }

  return credential as IVerifiableCredential
}
