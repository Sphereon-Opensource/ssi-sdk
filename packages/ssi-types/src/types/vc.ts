import {
  MdocDeviceResponse,
  MdocDocument,
  MdocOid4vpIssuerSigned,
  MdocOid4vpMdocVpToken,
  WrappedMdocCredential,
  WrappedMdocPresentation,
} from './mso_mdoc'
import { SdJwtDecodedVerifiableCredential, WrappedSdJwtVerifiableCredential, WrappedSdJwtVerifiablePresentation } from './sd-jwt-vc'
import {
  JwtDecodedVerifiableCredential,
  JwtDecodedVerifiablePresentation,
  W3CVerifiableCredential,
  W3CVerifiablePresentation,
  WrappedW3CVerifiableCredential,
  WrappedW3CVerifiablePresentation,
} from './w3c-vc'

export type WrappedVerifiableCredential = WrappedW3CVerifiableCredential | WrappedSdJwtVerifiableCredential | WrappedMdocCredential

export type WrappedVerifiablePresentation = WrappedW3CVerifiablePresentation | WrappedSdJwtVerifiablePresentation | WrappedMdocPresentation

export enum OriginalType {
  // W3C
  JSONLD = 'json-ld',
  JWT_ENCODED = 'jwt-encoded',
  JWT_DECODED = 'jwt-decoded',

  // SD-JWT
  SD_JWT_VC_ENCODED = 'sd-jwt-vc-encoded',
  SD_JWT_VC_DECODED = 'sd-jwt-vc-decoded',

  // MSO MDOCS
  MSO_MDOC_ENCODED = 'mso_mdoc-encoded',
  MSO_MDOC_DECODED = 'mso_mdoc-decoded',
}

export type CredentialFormat =
  // W3C
  | 'jwt_vc'
  | 'ldp_vc'
  // SD-JWT
  | 'vc+sd-jwt'
  // Remaining
  | 'jwt'
  | 'ldp'
  | 'mso_mdoc'
  | string

export type PresentationFormat =
  // W3C
  | 'jwt_vp'
  | 'ldp_vp'
  // SD-JWT
  | 'vc+sd-jwt'
  // Remaining
  | 'jwt'
  | 'ldp'
  | 'mso_mdoc'
  | string

export type ClaimFormat = CredentialFormat | PresentationFormat

export type OriginalVerifiableCredential =
  | W3CVerifiableCredential
  | JwtDecodedVerifiableCredential
  | SdJwtDecodedVerifiableCredential
  | MdocOid4vpIssuerSigned
  | MdocDocument
export type OriginalVerifiablePresentation =
  | W3CVerifiablePresentation
  | JwtDecodedVerifiablePresentation
  | SdJwtDecodedVerifiableCredential
  | MdocOid4vpMdocVpToken
  | MdocDeviceResponse
export type Original = OriginalVerifiablePresentation | OriginalVerifiableCredential

export const enum DocumentFormat {
  // W3C
  JWT,
  JSONLD,
  // SD-JWT
  SD_JWT_VC,
  // Remaining
  EIP712,
  MSO_MDOC,
}
