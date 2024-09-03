import { toJwk } from '@sphereon/ssi-sdk-ext.key-utils'
import { JWK } from '@sphereon/ssi-types'
import { IIdentifier, IKey } from '@veramo/core'
import { asArray } from '@veramo/utils'
import { JWKS_HOSTING_DID_KEYS_PATH } from './environment'

export const toJWKS = (args: { keys: IKey | IKey[] }): { keys: Array<JWK> } => {
  const providedKeys = asArray(args.keys)
  const keys = providedKeys.map((key) =>
    toJwk(key.publicKeyHex, key.type, {
      key,
      isPrivateKey: false,
      noKidThumbprint: false,
    }),
  )
  return {
    keys,
  }
}

export const jwksURIFromIdentifier = (args: { identifier: IIdentifier; basePath?: string; baseURL?: string; onlyEncodeDid?: boolean }) => {
  const { onlyEncodeDid, identifier, baseURL } = args
  let basePath = args.basePath ?? JWKS_HOSTING_DID_KEYS_PATH
  const did = encodeURIComponent(identifier.did)
  if (onlyEncodeDid) {
    return did
  }
  if (basePath.includes(':did')) {
    basePath = basePath.replace(':did', did)
  } else {
    basePath += basePath.endsWith('/') ? did : `/${did}`
  }
  if (baseURL) {
    return baseURL + baseURL.endsWith('/') ? basePath : `/${basePath}`
  }
  return basePath
}
