import { CredentialCorrelationType, CredentialRole, CredentialStateType, DigitalCredential, RegulationType } from './digitalCredential'
import { Hasher } from '@sphereon/ssi-types'
import { FindOptionsOrder } from 'typeorm'
import { DigitalCredentialEntity } from '../../entities/digitalCredential/DigitalCredentialEntity'

export type GetCredentialArgs = { id: string } | { hash: string }

export type FindDigitalCredentialArgs = Array<Partial<DigitalCredential>>

export type GetCredentialsArgs = {
  filter?: FindDigitalCredentialArgs
  offset?: number
  limit?: number
  order?: string | FindOptionsOrder<DigitalCredentialEntity>
}

export type GetCredentialsResponse = {
  data: Array<DigitalCredential>
  total: number
}

export type AddCredentialArgs = {
  rawDocument: string
  kmsKeyRef: string
  identifierMethod: string
  regulationType?: RegulationType
  parentId?: string
  issuerCorrelationType: CredentialCorrelationType
  subjectCorrelationType?: CredentialCorrelationType
  issuerCorrelationId: string
  subjectCorrelationId?: string
  credentialRole: CredentialRole
  tenantId?: string
  state?: CredentialStateType
  verifiedAt?: Date
  revokedAt?: Date
  opts?: { maxTimeSkewInMS?: number; hasher?: Hasher }
}

export type UpdateCredentialStateArgs = GetCredentialArgs & { verifiedState: CredentialStateType; verifiedAt?: Date; revokedAt?: Date }

export type RemoveCredentialArgs = GetCredentialArgs
