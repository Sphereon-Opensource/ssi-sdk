import { IAgentPlugin } from '@veramo/core'
import crypto from 'crypto'
import {
  AddCredentialArgs,
  credentialIdOrHashFilter,
  DeleteCredentialArgs,
  DeleteCredentialsArgs,
  DocumentType,
  GetCredentialArgs,
  GetCredentialsArgs,
  GetCredentialsByClaimsArgs,
  GetCredentialsByIdOrHashArgs,
  ICredentialStore,
  logger,
  OptionalUniqueDigitalCredential,
  schema,
  TClaimsColumns,
  UniqueDigitalCredential,
} from '../index'
import { AbstractDigitalCredentialStore, DigitalCredential, parseRawDocument, UpdateCredentialStateArgs } from '@sphereon/ssi-sdk.data-store'
import { IVerifiableCredential } from '@sphereon/ssi-types'
// Exposing the methods here for any REST implementation
export const credentialStoreMethods: Array<string> = [
  'crsAddCredential',
  'crsUpdateCredentialState',
  'crsGetCredential',
  'crsGetCredentials',
  'crsDeleteCredential',
  'crsDeleteCredentials',
  'crsGetUniqueCredentials',
  'crsGetUniqueCredentialByIdOrHash',
  'crsGetCredentialsByClaims',
  'crsGetCredentialsByClaimsCount',
]

/**
 * {@inheritDoc ICRManager}
 */
export class CredentialStore implements IAgentPlugin {
  readonly schema = schema.ICredentialStore
  readonly methods: ICredentialStore = {
    crsAddCredential: this.crsAddCredential.bind(this),
    crsUpdateCredentialState: this.crsUpdateCredentialState.bind(this),
    crsGetCredential: this.crsGetCredential.bind(this),
    crsGetCredentials: this.crsGetCredentials.bind(this),
    crsGetUniqueCredentialByIdOrHash: this.crsGetUniqueCredentialByIdOrHash.bind(this),
    crsGetUniqueCredentials: this.crsGetUniqueCredentials.bind(this),
    crsDeleteCredential: this.crsDeleteCredential.bind(this),
    crsDeleteCredentials: this.crsDeleteCredentials.bind(this),
    crsGetCredentialsByClaims: this.crsGetCredentialsByClaims.bind(this),
    crsGetCredentialsByClaimsCount: this.crsGetCredentialsByClaimsCount.bind(this),
  }

  private readonly store: AbstractDigitalCredentialStore

  constructor(options: { store: AbstractDigitalCredentialStore }) {
    this.store = options.store
  }

  /** {@inheritDoc ICRManager.crmAddCredential} */
  private async crsAddCredential(args: AddCredentialArgs): Promise<DigitalCredential> {
    return await this.store.addCredential({ ...args.credential, opts: { ...args.opts, hasher: args.opts?.hasher ?? this.generateDigest } })
  }

  /** {@inheritDoc ICRManager.updateCredentialState} */
  private async crsUpdateCredentialState(args: UpdateCredentialStateArgs): Promise<DigitalCredential> {
    return await this.store.updateCredentialState(args)
  }

  /** {@inheritDoc ICRManager.crmGetCredential} */
  private async crsGetCredential(args: GetCredentialArgs): Promise<DigitalCredential> {
    const { id } = args
    const credential = await this.store.getCredential({ id })
    return credential
  }

  /** {@inheritDoc ICRManager.crmGetCredentials} */
  private async crsGetCredentials(args: GetCredentialsArgs): Promise<Array<DigitalCredential>> {
    const { filter } = args
    const credentials = await this.store.getCredentials({ filter })
    return credentials.data
  }

  /** {@inheritDoc ICRManager.crmGetUniqueCredentialByIdOrHash} */
  private async crsGetUniqueCredentialByIdOrHash(args: GetCredentialsByIdOrHashArgs): Promise<OptionalUniqueDigitalCredential> {
    const credentials = await this.crsGetCredentials({ filter: credentialIdOrHashFilter(args.credentialRole, args.idOrHash) })
    if (credentials.length === 0) {
      return undefined
    } else if (credentials.length > 1) {
      logger.warning('Duplicate credentials detected in crsGetUniqueCredentialByIdOrHash', args)
    }
    return this.toUniqueCredentials(credentials)[0]
  }

  /** {@inheritDoc ICRManager.crmGetUniqueCredentials} */
  private async crsGetUniqueCredentials(args: GetCredentialsArgs): Promise<Array<UniqueDigitalCredential>> {
    const credentials = await this.crsGetCredentials(args)
    return this.toUniqueCredentials(credentials)
  }

  /** {@inheritDoc ICRManager.crmDeleteCredential} */
  private async crsDeleteCredential(args: DeleteCredentialArgs): Promise<boolean> {
    return this.store.removeCredential(args)
  }

  /** {@inheritDoc ICRManager.crmDeleteCredentials} */
  private async crsDeleteCredentials(args: DeleteCredentialsArgs): Promise<number> {
    const credentials = await this.crsGetCredentials(args)
    let count = 0
    for (const credential of credentials) {
      const result = await this.store.removeCredential({ id: credential.id })
      if (result) {
        count++
      }
    }
    return count
  }

  /**
   * Returns a list of UniqueDigitalCredentials that match the given filter based on the claims they contain.
   * @param args
   */
  private async crsGetCredentialsByClaims(args: GetCredentialsByClaimsArgs): Promise<Array<UniqueDigitalCredential>> {
    const digitalCredentials = await this.crsGetUniqueCredentials({
      filter: [
        // TODO SDK-25 Implement param for documentType & support VP filtering below
        {
          documentType: DocumentType.VC,
          credentialRole: args.credentialRole,
          tenantId: args.tenantId,
        },
        {
          documentType: DocumentType.C,
          credentialRole: args.credentialRole,
          tenantId: args.tenantId,
        },
      ],
    })

    // This a copy of how Veramo did this. TODO Use GraphQL in the future?
    const claimFilteredCredentials: UniqueDigitalCredential[] = digitalCredentials.filter((uniqueVC) => {
      if (!uniqueVC.uniformVerifiableCredential) {
        return false
      }

      const credential = uniqueVC.uniformVerifiableCredential
      return (
        args.filter.where?.every((whereClause) => {
          const value = this.getValueFromCredential(credential, whereClause.column)

          if (value === undefined) {
            return whereClause.op === 'IsNull'
          }

          switch (whereClause.op) {
            case 'In':
              return whereClause.value?.includes(value)
            case 'Like':
              return typeof value === 'string' && value.includes(whereClause.value?.[0] || '')
            case 'Between':
              return value >= (whereClause.value?.[0] || '') && value <= (whereClause.value?.[1] || '')
            case 'LessThan':
              return value < (whereClause.value?.[0] || '')
            case 'LessThanOrEqual':
              return value <= (whereClause.value?.[0] || '')
            case 'MoreThan':
              return value > (whereClause.value?.[0] || '')
            case 'MoreThanOrEqual':
              return value >= (whereClause.value?.[0] || '')
            case 'Any':
              return Array.isArray(value) && value.some((v) => whereClause.value?.includes(v))
            case 'IsNull':
              return value === null || value === undefined
            case 'Equal':
            default:
              return value === whereClause.value?.[0]
          }
        }) ?? true
      )
    })

    return claimFilteredCredentials
  }

  private getValueFromCredential(credential: IVerifiableCredential, column: TClaimsColumns): any {
    switch (column) {
      case 'context':
        return credential['@context']
      case 'credentialType':
        return credential.type
      case 'type':
        return Array.isArray(credential.credentialSubject) ? credential.credentialSubject[0]?.type : credential.credentialSubject?.type
      case 'value':
        return JSON.stringify(credential.credentialSubject)
      case 'isObj':
        return typeof credential.credentialSubject === 'object'
      case 'id':
        return credential.id
      case 'issuer':
        return typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id
      case 'subject':
        return Array.isArray(credential.credentialSubject) ? credential.credentialSubject[0]?.id : credential.credentialSubject?.id
      case 'expirationDate':
        return credential.expirationDate
      case 'issuanceDate':
        return credential.issuanceDate
      default:
        return undefined
    }
  }

  /**
   * Returns a count of UniqueDigitalCredentials that match the given filter based on the claims they contain.
   * @param args
   */
  private async crsGetCredentialsByClaimsCount(args: GetCredentialsByClaimsArgs): Promise<number> {
    const credentialsByClaims = await this.crsGetCredentialsByClaims(args)
    return credentialsByClaims.length // FIXME ?
  }

  private secureParse<Type>(original: string): Type {
    return parseRawDocument(original) as Type
  }

  private toUniqueCredentials(credentials: Array<DigitalCredential>): Array<UniqueDigitalCredential> {
    return Object.values(
      credentials.reduce(
        (accumulator, credential) => {
          const uniqueCredential: UniqueDigitalCredential = {
            hash: credential.hash,
            digitalCredential: credential,
          }
          switch (credential.documentType) {
            case DocumentType.VC:
              uniqueCredential.originalVerifiableCredential = this.secureParse(credential.rawDocument)
              uniqueCredential.uniformVerifiableCredential = this.secureParse(credential.uniformDocument)
              uniqueCredential.id = uniqueCredential.uniformVerifiableCredential?.id
              break
            case DocumentType.VP:
              uniqueCredential.originalVerifiablePresentation = this.secureParse(credential.rawDocument)
              uniqueCredential.uniformVerifiablePresentation = this.secureParse(credential.uniformDocument)
              uniqueCredential.id = uniqueCredential.uniformVerifiablePresentation?.id
              break
            case DocumentType.P:
              uniqueCredential.originalPresentation = this.secureParse(credential.rawDocument)
              uniqueCredential.id = uniqueCredential.originalPresentation?.id
              break
            case DocumentType.C:
              uniqueCredential.originalCredential = this.secureParse(credential.rawDocument)
              uniqueCredential.id = uniqueCredential.originalCredential?.id
              break
            // TODO CBOR support
          }
          accumulator[credential.hash] = uniqueCredential
          return accumulator
        },
        {} as Record<string, UniqueDigitalCredential>,
      ),
    )
  }

  private generateDigest = (data: string, algorithm: string): Uint8Array => {
    return new Uint8Array(crypto.createHash(algorithm).update(data).digest())
  }
}
