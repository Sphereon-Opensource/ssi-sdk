import { DataSources } from '@sphereon/ssi-sdk.agent-config'
import { DataSource } from 'typeorm'
import { CredentialRole, DataStoreDigitalCredentialEntities } from '../index'
import { DataStoreDigitalCredentialMigrations } from '../migrations'
import { DigitalCredentialEntity } from '../entities/digitalCredential/DigitalCredentialEntity'
import {
  CredentialCorrelationType,
  CredentialDocumentFormat,
  DocumentType,
  NonPersistedDigitalCredential,
} from '../types/digitalCredential/digitalCredential'
import { computeEntryHash } from '@veramo/utils'
import { AddCredentialArgs } from '../types/digitalCredential/IAbstractDigitalCredentialStore'
import { nonPersistedDigitalCredentialEntityFromAddArgs } from '../utils/digitalCredential/MappingUtils'
import { createHash } from 'crypto'

describe('Database entities tests', (): void => {
  let dbConnection: DataSource

  beforeEach(async (): Promise<void> => {
    DataSources.singleInstance().defaultDbType = 'sqlite'
    dbConnection = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      //logging: 'all',
      migrationsRun: false,
      migrations: DataStoreDigitalCredentialMigrations,
      synchronize: false,
      entities: [...DataStoreDigitalCredentialEntities],
    }).initialize()
    await dbConnection.runMigrations()
    expect(await dbConnection.showMigrations()).toBeFalsy()
  })

  afterEach(async (): Promise<void> => {
    await (await dbConnection).destroy()
  })

  it('should save digital credential to database', async (): Promise<void> => {
    const rawCredential: string =
      'eyJraWQiOiJkaWQ6a2V5Ono2TWtyaGt5M3B1c20yNk1laUZhWFUzbjJuZWtyYW13RlVtZ0dyZUdHa0RWNnpRaiN6Nk1rcmhreTNwdXNtMjZNZWlGYVhVM24ybmVrcmFtd0ZVbWdHcmVHR2tEVjZ6UWoiLCJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vc3BoZXJlb24tb3BlbnNvdXJjZS5naXRodWIuaW8vc3NpLW1vYmlsZS13YWxsZXQvY29udGV4dC9zcGhlcmVvbi13YWxsZXQtaWRlbnRpdHktdjEuanNvbmxkIl0sInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJTcGhlcmVvbldhbGxldElkZW50aXR5Q3JlZGVudGlhbCJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJmaXJzdE5hbWUiOiJTIiwibGFzdE5hbWUiOiJLIiwiZW1haWxBZGRyZXNzIjoic0BrIn19LCJzdWIiOiJ1cm46dXVpZDpkZGE3YmYyNC04ZTdhLTQxZjgtYjY2Yy1hNDhkYmM1YjEwZmEiLCJqdGkiOiJ1cm46dXVpZDpkZGE3YmYyNC04ZTdhLTQxZjgtYjY2Yy1hNDhkYmM1YjEwZmEiLCJuYmYiOjE3MDg0NDA4MDgsImlzcyI6ImRpZDprZXk6ejZNa3Joa3kzcHVzbTI2TWVpRmFYVTNuMm5la3JhbXdGVW1nR3JlR0drRFY2elFqIn0.G0M84XVAxSmzGY-NQuB9NBofNrINSn6lvxW6761Vlq6ypvYgtc2xNdpiRmw8ryVNfnpzrr4Z5cB1RlrC05rJAw'
    const digitalCredential: AddCredentialArgs = {
      rawDocument: rawCredential,
      kmsKeyRef: 'testRef',
      identifierMethod: 'did',
      issuerCorrelationType: CredentialCorrelationType.DID,
      subjectCorrelationType: CredentialCorrelationType.DID,
      issuerCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      subjectCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      credentialRole: CredentialRole.VERIFIER,
      tenantId: 'urn:uuid:nnag4b43-1e7a-98f8-a32c-a48dbc5b10mj',
    }

    const digitalCredentialEntity: NonPersistedDigitalCredential = nonPersistedDigitalCredentialEntityFromAddArgs(digitalCredential)
    const fromDb: DigitalCredentialEntity = await dbConnection.getRepository(DigitalCredentialEntity).save(digitalCredentialEntity)
    expect(fromDb).toBeDefined()
    expect(fromDb?.id).not.toBeNull()
    expect(fromDb?.documentType).toEqual(DocumentType.VC)
    expect(fromDb?.documentFormat).toEqual(CredentialDocumentFormat.JWT)
    expect(fromDb?.rawDocument).toEqual(rawCredential)
    expect(fromDb?.hash).toEqual(computeEntryHash(rawCredential))
    expect(fromDb?.issuerCorrelationType).toEqual(CredentialCorrelationType.DID)
    expect(fromDb?.subjectCorrelationType).toEqual(CredentialCorrelationType.DID)
    expect(fromDb?.issuerCorrelationId).toEqual('did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj')
    expect(fromDb?.subjectCorrelationId).toEqual('did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj')
    expect(fromDb?.tenantId).toEqual('urn:uuid:nnag4b43-1e7a-98f8-a32c-a48dbc5b10mj')
  })

  it('should assign correct values to DigitalCredential: jwt credential 1', () => {
    const digitalCredential: NonPersistedDigitalCredential = nonPersistedDigitalCredentialEntityFromAddArgs({
      rawDocument:
        'eyJraWQiOiJkaWQ6a2V5Ono2TWtyaGt5M3B1c20yNk1laUZhWFUzbjJuZWtyYW13RlVtZ0dyZUdHa0RWNnpRaiN6Nk1rcmhreTNwdXNtMjZNZWlGYVhVM24ybmVrcmFtd0ZVbWdHcmVHR2tEVjZ6UWoiLCJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vc3BoZXJlb24tb3BlbnNvdXJjZS5naXRodWIuaW8vc3NpLW1vYmlsZS13YWxsZXQvY29udGV4dC9zcGhlcmVvbi13YWxsZXQtaWRlbnRpdHktdjEuanNvbmxkIl0sInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJTcGhlcmVvbldhbGxldElkZW50aXR5Q3JlZGVudGlhbCJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJmaXJzdE5hbWUiOiJTIiwibGFzdE5hbWUiOiJLIiwiZW1haWxBZGRyZXNzIjoic0BrIn19LCJzdWIiOiJ1cm46dXVpZDpkZGE3YmYyNC04ZTdhLTQxZjgtYjY2Yy1hNDhkYmM1YjEwZmEiLCJqdGkiOiJ1cm46dXVpZDpkZGE3YmYyNC04ZTdhLTQxZjgtYjY2Yy1hNDhkYmM1YjEwZmEiLCJuYmYiOjE3MDg0NDA4MDgsImlzcyI6ImRpZDprZXk6ejZNa3Joa3kzcHVzbTI2TWVpRmFYVTNuMm5la3JhbXdGVW1nR3JlR0drRFY2elFqIn0.G0M84XVAxSmzGY-NQuB9NBofNrINSn6lvxW6761Vlq6ypvYgtc2xNdpiRmw8ryVNfnpzrr4Z5cB1RlrC05rJAw',
      kmsKeyRef: 'testRef',
      identifierMethod: 'did',
      issuerCorrelationType: CredentialCorrelationType.DID,
      subjectCorrelationType: CredentialCorrelationType.DID,
      issuerCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      subjectCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      credentialRole: CredentialRole.VERIFIER,
      tenantId: 'urn:uuid:nnag4b43-1e7a-98f8-a32c-a48dbc5b10mj',
    })
    expect(digitalCredential.documentType).toEqual(DocumentType.VC)
    expect(digitalCredential.validFrom).toEqual(new Date('2024-02-20T14:53:28.000Z'))
    expect(digitalCredential.documentFormat).toEqual(CredentialDocumentFormat.JWT)
    expect(digitalCredential.validUntil).toEqual(undefined)
  })

  it('should assign correct values to DigitalCredential: jwt credential 2', () => {
    const digitalCredential: NonPersistedDigitalCredential = nonPersistedDigitalCredentialEntityFromAddArgs({
      rawDocument:
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRpZDpleGFtcGxlOmFiZmUxM2Y3MTIxMjA0MzFjMjc2ZTEyZWNhYiNrZXlzLTEifQ.eyJzdWIiOiJkaWQ6ZXhhbXBsZTplYmZlYjFmNzEyZWJjNmYxYzI3NmUxMmVjMjEiLCJqdGkiOiJodHRwOi8vZXhhbXBsZS5lZHUvY3JlZGVudGlhbHMvMzczMiIsImlzcyI6Imh0dHBzOi8vZXhhbXBsZS5jb20va2V5cy9mb28uandrIiwibmJmIjoxNTQxNDkzNzI0LCJpYXQiOjE1NDE0OTM3MjQsImV4cCI6MTU3MzAyOTcyMywibm9uY2UiOiI2NjAhNjM0NUZTZXIiLCJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSIsImh0dHBzOi8vd3d3LnczLm9yZy8yMDE4L2NyZWRlbnRpYWxzL2V4YW1wbGVzL3YxIl0sInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJVbml2ZXJzaXR5RGVncmVlQ3JlZGVudGlhbCJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJkZWdyZWUiOnsidHlwZSI6IkJhY2hlbG9yRGVncmVlIiwibmFtZSI6IjxzcGFuIGxhbmc9J2ZyLUNBJz5CYWNjYWxhdXLDqWF0IGVuIG11c2lxdWVzIG51bcOpcmlxdWVzPC9zcGFuPiJ9fX19.KLJo5GAyBND3LDTn9H7FQokEsUEi8jKwXhGvoN3JtRa51xrNDgXDb0cq1UTYB-rK4Ft9YVmR1NI_ZOF8oGc_7wAp8PHbF2HaWodQIoOBxxT-4WNqAxft7ET6lkH-4S6Ux3rSGAmczMohEEf8eCeN-jC8WekdPl6zKZQj0YPB1rx6X0-xlFBs7cl6Wt8rfBP_tZ9YgVWrQmUWypSioc0MUyiphmyEbLZagTyPlUyflGlEdqrZAv6eSe6RtxJy6M1-lD7a5HTzanYTWBPAUHDZGyGKXdJw-W_x0IWChBzI8t3kpG253fg6V3tPgHeKXE94fz_QpYfg--7kLsyBAfQGbg',
      kmsKeyRef: 'testRef',
      identifierMethod: 'did',
      issuerCorrelationType: CredentialCorrelationType.DID,
      subjectCorrelationType: CredentialCorrelationType.DID,
      issuerCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      subjectCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      credentialRole: CredentialRole.VERIFIER,
      tenantId: 'urn:uuid:nnag4b43-1e7a-98f8-a32c-a48dbc5b10mj',
    })
    expect(digitalCredential.documentType).toEqual(DocumentType.VC)
    expect(digitalCredential.validFrom).toEqual(new Date('2018-11-06T08:42:04.000Z'))
    expect(digitalCredential.documentFormat).toEqual(CredentialDocumentFormat.JWT)
    expect(digitalCredential.validUntil).toEqual(new Date('2019-11-06T08:42:03.000Z'))
  })

  it('should assign correct values to DigitalCredential: signed ldb credential', () => {
    const digitalCredential: NonPersistedDigitalCredential = nonPersistedDigitalCredentialEntityFromAddArgs({
      rawDocument: JSON.stringify({
        id: 'cred:gatc:NjMxNjc0NTA0ZjVmZmYwY2U0Y2M3NTRk',
        type: ['VerifiableCredential', 'emailCredential'],
        '@context': ['https://www.w3.org/2018/credentials/v1', 'https://www.w3.org/2018/credentials/examples/v1'],
        issuer: 'did:gatc:24gsRbsURij3edoveHv81jt9EnhggrnR',
        issuanceDate: '2022-01-07T11:54:12.000Z',
        credentialSubject: {
          email: 'jose@gataca.io',
          id: 'did:gatc:YzQxNjRjM2U4YTUzZGVkNjhmNjAxYzk5',
        },
        credentialStatus: {
          id: 'https://backbone.gataca.io/api/v1/group/otp/status',
          type: 'CredentialStatusList2017',
        },
        credentialSchema: [],
        proof: [
          {
            created: '2022-01-07T11:53:21Z',
            creator: 'did:gatc:24gsRbsURij3edoveHv81jt9EnhggrnR#keys-1',
            domain: 'gataca.io',
            nonce: 'sUzybVzzg1ZXFw-xDqSeMP3-TiZqKOtxszk0K4Ag5X8=',
            proofPurpose: 'assertionMethod',
            signatureValue: 'qGIh5JLxollEek5l1yFUcwmHj2H1ZYn3PR8uTa5bDtIcpW6MKKJDpc5_YQjqHGVUKbre8EMDI7e07lgR1ZJ9Bg',
            type: 'JcsEd25519Signature2020',
            verificationMethod: 'did:gatc:24gsRbsURij3edoveHv81jt9EnhggrnR#keys-1',
          },
        ],
      }),
      kmsKeyRef: 'testRef',
      identifierMethod: 'did',
      issuerCorrelationType: CredentialCorrelationType.DID,
      subjectCorrelationType: CredentialCorrelationType.DID,
      issuerCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      subjectCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      tenantId: 'urn:uuid:nnag4b43-1e7a-98f8-a32c-a48dbc5b10mj',
      credentialRole: CredentialRole.VERIFIER,
    })
    expect(digitalCredential.documentType).toEqual(DocumentType.VC)
    expect(digitalCredential.validFrom).toEqual(new Date('2022-01-07T11:54:12.000Z'))
    expect(digitalCredential.documentFormat).toEqual(CredentialDocumentFormat.JSON_LD)
    expect(digitalCredential.validUntil).toEqual(undefined)
  })

  it('should assign correct values to DigitalCredential: signed ldb presentation', () => {
    const digitalCredential: NonPersistedDigitalCredential = nonPersistedDigitalCredentialEntityFromAddArgs({
      rawDocument: JSON.stringify({
        '@context': ['https://www.w3.org/2018/credentials/v1', 'https://identity.foundation/presentation-exchange/submission/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: [
          {
            iss: 'did:example:123',
            vc: {
              '@context': 'https://eu.com/claims/DriversLicense',
              id: 'https://eu.com/claims/DriversLicense',
              type: ['EUDriversLicense'],
              issuer: 'did:example:123',
              issuanceDate: '2010-01-01T19:73:24Z',
              credentialSubject: {
                id: 'did:example:ebfeb1f712ebc6f1c276e12ec21',
                accounts: [
                  {
                    id: '1234567890',
                    route: 'DE-9876543210',
                  },
                  {
                    id: '2457913570',
                    route: 'DE-0753197542',
                  },
                ],
              },
            },
            proof: {
              type: 'EcdsaSecp256k1VerificationKey2019',
              created: '2017-06-18T21:19:10Z',
              proofPurpose: 'assertionMethod',
              verificationMethod: 'https://example.edu/issuers/keys/1',
              jws: '...',
            },
          },
          {
            '@context': 'https://business-standards.org/schemas/employment-history.json',
            id: 'https://business-standards.org/schemas/employment-history.json',
            type: ['VerifiableCredential', 'GenericEmploymentCredential'],
            issuer: 'did:foo:123',
            issuanceDate: '2010-01-01T19:73:24Z',
            credentialSubject: {
              id: 'did:example:ebfeb1f712ebc6f1c276e12ec21',
              active: true,
            },
            proof: {
              type: 'EcdsaSecp256k1VerificationKey2019',
              created: '2017-06-18T21:19:10Z',
              proofPurpose: 'assertionMethod',
              verificationMethod: 'https://example.edu/issuers/keys/1',
              jws: '...',
            },
          },
          {
            '@context': 'https://www.w3.org/2018/credentials/v1',
            id: 'https://eu.com/claims/DriversLicense',
            type: ['EUDriversLicense'],
            issuer: 'did:foo:123',
            issuanceDate: '2010-01-01T19:73:24Z',
            credentialSubject: {
              id: 'did:example:ebfeb1f712ebc6f1c276e12ec21',
              license: {
                number: '34DGE352',
                dob: '07/13/80',
              },
            },
            proof: {
              type: 'RsaSignature2018',
              created: '2017-06-18T21:19:10Z',
              proofPurpose: 'assertionMethod',
              verificationMethod: 'https://example.edu/issuers/keys/1',
              jws: '...',
            },
          },
        ],
        proof: {
          type: 'RsaSignature2018',
          created: '2018-09-14T21:19:10Z',
          proofPurpose: 'authentication',
          verificationMethod: 'did:example:ebfeb1f712ebc6f1c276e12ec21#keys-1',
          challenge: '1f44d55f-f161-4938-a659-f8026467f126',
          domain: '4jt78h47fh47',
          jws: '...',
        },
      }),
      kmsKeyRef: 'testRef',
      identifierMethod: 'did',
      issuerCorrelationType: CredentialCorrelationType.DID,
      subjectCorrelationType: CredentialCorrelationType.DID,
      issuerCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      subjectCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      credentialRole: CredentialRole.VERIFIER,
      tenantId: 'urn:uuid:nnag4b43-1e7a-98f8-a32c-a48dbc5b10mj',
    })
    expect(digitalCredential.documentType).toEqual(DocumentType.VP)
    expect(digitalCredential.validFrom).toEqual(undefined)
    expect(digitalCredential.documentFormat).toEqual(CredentialDocumentFormat.JSON_LD)
    expect(digitalCredential.validUntil).toEqual(undefined)
  })

  it('should assign correct values to DigitalCredential: signed sd_jwt credential', () => {
    const digitalCredential: NonPersistedDigitalCredential = nonPersistedDigitalCredentialEntityFromAddArgs({
      rawDocument:
        'eyJhbGciOiJFZERTQSIsInR5cCI6InZjK3NkLWp3dCIsImtpZCI6IiN6Nk1rdHF0WE5HOENEVVk5UHJydG9TdEZ6ZUNuaHBNbWd4WUwxZ2lrY1czQnp2TlcifQ.eyJ2Y3QiOiJJZGVudGl0eUNyZWRlbnRpYWwiLCJmYW1pbHlfbmFtZSI6IkRvZSIsInBob25lX251bWJlciI6IisxLTIwMi01NTUtMDEwMSIsImFkZHJlc3MiOnsic3RyZWV0X2FkZHJlc3MiOiIxMjMgTWFpbiBTdCIsImxvY2FsaXR5IjoiQW55dG93biIsIl9zZCI6WyJOSm5tY3QwQnFCTUUxSmZCbEM2alJRVlJ1ZXZwRU9OaVl3N0E3TUh1SnlRIiwib201Wnp0WkhCLUdkMDBMRzIxQ1ZfeE00RmFFTlNvaWFPWG5UQUpOY3pCNCJdfSwiY25mIjp7Imp3ayI6eyJrdHkiOiJPS1AiLCJjcnYiOiJFZDI1NTE5IiwieCI6Im9FTlZzeE9VaUg1NFg4d0pMYVZraWNDUmswMHdCSVE0c1JnYms1NE44TW8ifX0sImlzcyI6ImRpZDprZXk6ejZNa3RxdFhORzhDRFVZOVBycnRvU3RGemVDbmhwTW1neFlMMWdpa2NXM0J6dk5XIiwiaWF0IjoxNjk4MTUxNTMyLCJfc2RfYWxnIjoic2hhLTI1NiIsIl9zZCI6WyIxQ3VyMmsyQTJvSUI1Q3NoU0lmX0FfS2ctbDI2dV9xS3VXUTc5UDBWZGFzIiwiUjF6VFV2T1lIZ2NlcGowakh5cEdIejlFSHR0VktmdDB5c3diYzlFVFBiVSIsImVEcVFwZFRYSlhiV2hmLUVzSTd6dzVYNk92WW1GTi1VWlFRTWVzWHdLUHciLCJwZERrMl9YQUtIbzdnT0Fmd0YxYjdPZENVVlRpdDJrSkhheFNFQ1E5eGZjIiwicHNhdUtVTldFaTA5bnUzQ2w4OXhLWGdtcFdFTlpsNXV5MU4xbnluX2pNayIsInNOX2dlMHBIWEY2cW1zWW5YMUE5U2R3SjhjaDhhRU5reGJPRHNUNzRZd0kiXX0.coOK8NzJmEWz4qx-qRhjo-RK7aejrSkQM9La9Cw3eWmzcja9DXrkBoQZKbIJtNoSzSPLjwK2V71W78z0miZsDQ~WyJzYWx0IiwiaXNfb3Zlcl82NSIsdHJ1ZV0~WyJzYWx0IiwiaXNfb3Zlcl8yMSIsdHJ1ZV0~WyJzYWx0IiwiZW1haWwiLCJqb2huZG9lQGV4YW1wbGUuY29tIl0~WyJzYWx0IiwiY291bnRyeSIsIlVTIl0~WyJzYWx0IiwiZ2l2ZW5fbmFtZSIsIkpvaG4iXQ~eyJhbGciOiJFZERTQSIsInR5cCI6ImtiK2p3dCJ9.eyJpYXQiOjE2OTgxNTE1MzIsIm5vbmNlIjoic2FsdCIsImF1ZCI6ImRpZDprZXk6elVDNzRWRXFxaEVIUWNndjR6YWdTUGtxRkp4dU5XdW9CUEtqSnVIRVRFVWVITG9TcVd0OTJ2aVNzbWFXank4MnkiLCJfc2RfaGFzaCI6Ii1kTUd4OGZhUnpOQm91a2EwU0R6V2JkS3JYckw1TFVmUlNQTHN2Q2xPMFkifQ.TQQLqc4ZzoKjQfAghAzC_4aaU3KCS8YqzxAJtzT124guzkv9XSHtPN8d3z181_v-ca2ATXjTRoRciozitE6wBA',
      kmsKeyRef: 'testRef',
      identifierMethod: 'did',
      issuerCorrelationType: CredentialCorrelationType.DID,
      subjectCorrelationType: CredentialCorrelationType.DID,
      issuerCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      subjectCorrelationId: 'did:key:z6Mkrhky3pusm26MeiFaXU3n2nekramwFUmgGreGGkDV6zQj',
      credentialRole: CredentialRole.VERIFIER,
      tenantId: 'urn:uuid:nnag4b43-1e7a-98f8-a32c-a48dbc5b10mj',
      opts: {
        hasher: (data, algorithm) => createHash(algorithm).update(data).digest(),
      },
    })
    expect(digitalCredential.documentType).toEqual(DocumentType.VC)
    expect(digitalCredential.validFrom).toEqual(new Date('2023-10-24T12:45:32.000Z'))
    expect(digitalCredential.documentFormat).toEqual(CredentialDocumentFormat.SD_JWT)
    expect(digitalCredential.validUntil).toEqual(undefined)
  })
})
