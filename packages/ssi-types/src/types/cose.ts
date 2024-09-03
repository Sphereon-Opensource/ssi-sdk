/**
 * See our mdl-mdoc and crypto library for more information
 * https://github.com/Sphereon-Opensource/mdoc-cbor-crypto-multiplatform
 *
 * Conversion functions are available in above library.
 * Conversion functions are also available for TS in our @sphereon/ssi-sdk-ext.key-utils package
 *
 */
export interface ICoseKeyJson {
  kty: ICoseKeyType
  kid?: string
  alg?: ICoseSignatureAlgorithm
  key_ops?: Array<ICoseKeyOperation>
  baseIV?: string
  crv?: ICoseCurve
  x?: string
  y?: string
  d?: string
  x5chain?: Array<string>

  [k: string]: unknown
}

export enum ICoseKeyType {
  OKP = 1,
  EC2 = 2,
  RSA = 3,
  Symmetric = 4,
  Reserved = 0,
}

export enum ICoseSignatureAlgorithm {
  ES256 = -7,
  ES256K = -47,
  ES384 = -35,
  ES512 = -36,
  EdDSA = -8,
  HS256_64 = 4,
  HS256 = 5,
  HS384 = 6,
  HS512 = 7,
  PS256 = -37,
  PS384 = -38,
  PS512 = -39,
}

export enum ICoseKeyOperation {
  SIGN = 1,
  VERIFY = 2,
  ENCRYPT = 3,
  DECRYPT = 4,
  WRAP_KEY = 5,
  UNWRAP_KEY = 6,
  DERIVE_KEY = 7,
  DERIVE_BITS = 8,
  MAC_CREATE = 9,
  MAC_VERIFY = 10,
}

export enum ICoseCurve {
  P_256 = 1,
  P_384 = 2,
  P_521 = 3,
  X25519 = 4,
  X448 = 5,
  Ed25519 = 6,
  Ed448 = 7,
  secp256k1 = -1,
}
