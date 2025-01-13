import { UniqueDigitalCredential } from '@sphereon/ssi-sdk.credential-store'
import { DcqlCredential, DcqlSdJwtVcCredential, DcqlW3cVcCredential } from 'dcql'
import { CredentialMapper, Hasher, OriginalVerifiableCredential } from '@sphereon/ssi-types'
import { isUniqueDigitalCredential } from './CredentialUtils'

export function convertToDcqlCredentials(credential: UniqueDigitalCredential | OriginalVerifiableCredential, hasher?: Hasher): DcqlCredential {
  let payload
  if (isUniqueDigitalCredential(credential)) {
    if (!credential.originalVerifiableCredential) {
      throw new Error('originalVerifiableCredential is not defined in UniqueDigitalCredential')
    }
    payload = CredentialMapper.decodeVerifiableCredential(credential.originalVerifiableCredential, hasher)
  } else {
    payload = CredentialMapper.decodeVerifiableCredential(credential as OriginalVerifiableCredential, hasher)
  }

  if (!payload) {
    throw new Error('No payload found')
  }

  if ('decodedPayload' in payload && payload.decodedPayload) {
    payload = payload.decodedPayload
  }

  if ('vct' in payload!) {
    return { vct: payload.vct, claims: payload } satisfies DcqlSdJwtVcCredential
  } else if ('docType' in payload! && 'namespaces' in payload) {
    return { docType: payload.docType, namespaces: payload.namespaces, claims: payload }
  } else {
    return {
      claims: payload,
    } as DcqlW3cVcCredential
  }
}
