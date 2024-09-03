import { FindArgs, TAgent, TCredentialColumns } from '@veramo/core'
import * as fs from 'fs'
import { CredentialCorrelationType, CredentialRole, CredentialStateType, DigitalCredential } from '@sphereon/ssi-sdk.data-store'
import {
  AddDigitalCredential,
  credentialIdOrHashFilter,
  DeleteCredentialsArgs,
  GetCredentialsArgs,
  ICredentialStore,
  UniqueDigitalCredential,
} from '../../src'
import { IVerifiableCredential } from '@sphereon/ssi-types'

type ConfiguredAgent = TAgent<ICredentialStore>

function getFile(path: string) {
  return fs.readFileSync(path, 'utf-8')
}

function getFileAsJson(path: string) {
  return JSON.parse(getFile(path))
}

export default (testContext: { getAgent: () => ConfiguredAgent; setup: () => Promise<boolean>; tearDown: () => Promise<boolean> }): void => {
  describe('Credential Store Agent Plugin', (): void => {
    const exampleVC: IVerifiableCredential = getFileAsJson('./packages/credential-store/__tests__/vc-examples/vc_driverLicense.json')

    const examplePid: string = getFile('./packages/credential-store/__tests__/vc-examples/pid.sd.jwt').replace(/\r/, '').replace(/\n/, '')
    let agent: ConfiguredAgent
    let defaultCredential: DigitalCredential
    let pidSdJwtCredential: DigitalCredential

    beforeAll(async (): Promise<void> => {
      await testContext.setup()
      agent = testContext.getAgent()

      const digitalCredential: AddDigitalCredential = {
        credentialRole: CredentialRole.HOLDER,
        tenantId: 'test-tenant',
        kmsKeyRef: 'testKeyRef',
        identifierMethod: 'did',
        issuerCorrelationId: 'did:example:the-issuer',
        issuerCorrelationType: CredentialCorrelationType.DID,
        rawDocument: JSON.stringify(exampleVC),
      }
      defaultCredential = await agent.crsAddCredential({ credential: digitalCredential })

      const sdJwtAdd: AddDigitalCredential = {
        credentialRole: CredentialRole.HOLDER,
        tenantId: 'test-tenant',
        kmsKeyRef: 'testKeyRef',
        identifierMethod: 'did',
        issuerCorrelationId: 'CN="test"',
        issuerCorrelationType: CredentialCorrelationType.X509_SAN,
        rawDocument: examplePid,
      }
      pidSdJwtCredential = await agent.crsAddCredential({ credential: sdJwtAdd })
    })

    afterAll(testContext.tearDown)

    it('should get credential by id', async (): Promise<void> => {
      const result = await agent.crsGetCredential({ id: defaultCredential.id })
      expect(result.id).toEqual(defaultCredential.id)
    })

    it('should get SDJWT PID credential by id', async (): Promise<void> => {
      const result = await agent.crsGetCredential({ id: pidSdJwtCredential.id })
      expect(result.id).toEqual(pidSdJwtCredential.id)
    })

    it('should throw error when getting credential with unknown id', async (): Promise<void> => {
      const itemId = 'unknownId'
      await expect(agent.crsGetCredential({ id: itemId })).rejects.toThrow(`No credential found for arg: {\"id\":\"${itemId}\"}`)
    })

    it('should get credentials by filter', async (): Promise<void> => {
      const args: GetCredentialsArgs = {
        filter: [
          {
            credentialRole: CredentialRole.HOLDER,
          },
        ],
      }
      const result: Array<DigitalCredential> = await agent.crsGetCredentials(args)

      expect(result.length).toBe(2)
    })

    it('should get credentials by id or hash', async (): Promise<void> => {
      const args1: GetCredentialsArgs = {
        filter: [
          {
            id: defaultCredential.id,
          },
        ],
      }
      const result1: Array<DigitalCredential> = await agent.crsGetCredentials(args1)
      expect(result1.length).toBe(1)

      const args2: GetCredentialsArgs = {
        filter: [
          {
            hash: defaultCredential.hash,
          },
        ],
      }
      const result2: Array<DigitalCredential> = await agent.crsGetCredentials(args2)
      expect(result2.length).toBe(1)

      const args3: GetCredentialsArgs = {
        filter: [
          {
            id: defaultCredential.id,
          },
          {
            hash: defaultCredential.hash,
          },
        ],
      }
      const result3: Array<DigitalCredential> = await agent.crsGetCredentials(args3)
      expect(result3.length).toBe(1)

      const args4: GetCredentialsArgs = {
        filter: [
          {
            id: 'another_id',
          },
          {
            hash: defaultCredential.hash,
          },
        ],
      }
      const result4: Array<DigitalCredential> = await agent.crsGetCredentials(args4)
      expect(result4.length).toBe(1)
    })

    it('should get unique credential by id or hash', async (): Promise<void> => {
      const result: Array<UniqueDigitalCredential> = await agent.crsGetUniqueCredentials({
        filter: credentialIdOrHashFilter(defaultCredential.credentialRole, defaultCredential.hash),
      })
      expect(result.length).toBe(1)
      expect(result[0].hash).toEqual(defaultCredential.hash)
      expect(result[0].digitalCredential.id).toEqual(defaultCredential.id)
      expect(result[0].digitalCredential.hash).toEqual(defaultCredential.hash)
    })

    it('should update credential by id', async (): Promise<void> => {
      const revokeUpdate = {
        id: defaultCredential.id,
        verifiedState: CredentialStateType.REVOKED,
        revokedAt: new Date(),
      }
      const result: DigitalCredential = await agent.crsUpdateCredentialState(revokeUpdate)

      expect(result.verifiedState).toEqual(revokeUpdate.verifiedState)
      // expect(result.revokedAt).toEqual(revokeUpdate.revokedAt) FIXME date deserialization is broken for REST agent
    })

    it('should get credential by claims', async (): Promise<void> => {
      const claimsFilter: FindArgs<TCredentialColumns> = {
        where: [
          {
            column: 'issuanceDate',
            op: 'Equal',
            value: ['2010-01-01T19:23:24Z'],
          },
        ],
      }
      const result = await agent.crsGetCredentialsByClaims({
        credentialRole: defaultCredential.credentialRole,
        filter: claimsFilter,
      })
      expect(result.length).toBe(1)
      expect(result[0].digitalCredential.id).toEqual(defaultCredential.id)
      expect(result[0].id).toEqual('https://example.com/credentials/1873')
    })

    it('should not get credential by invalid claim', async (): Promise<void> => {
      const claimsFilter: FindArgs<TCredentialColumns> = {
        where: [
          {
            column: 'issuanceDate',
            op: 'Equal',
            value: ['someValue'],
          },
        ],
      }
      const result = await agent.crsGetCredentialsByClaims({
        credentialRole: defaultCredential.credentialRole,
        filter: claimsFilter,
      })
      expect(result.length).toBe(0)
    })

    it('should delete credential by id', async (): Promise<void> => {
      const result = await agent.crsDeleteCredential({ id: defaultCredential.id })

      expect(result).toBe(true)
    })

    it('should throw error when deleting credential with unknown id', async (): Promise<void> => {
      const id = 'unknownId'
      const result = await agent.crsDeleteCredential({ id })
      expect(result).toBe(false)
    })

    it('should delete multiple credentials by filter', async (): Promise<void> => {
      const digitalCredential1: AddDigitalCredential = {
        credentialRole: CredentialRole.VERIFIER,
        tenantId: 'test-tenant',
        kmsKeyRef: 'testKeyRef',
        identifierMethod: 'did',
        issuerCorrelationId: 'did:example:item1',
        issuerCorrelationType: CredentialCorrelationType.DID,
        rawDocument: JSON.stringify(exampleVC),
      }
      await agent.crsAddCredential({ credential: digitalCredential1 })

      const exampleVC2: IVerifiableCredential = { ...exampleVC }
      ;(exampleVC2.credentialSubject as any).extraField = 'Extra extra'
      const digitalCredential2: AddDigitalCredential = {
        credentialRole: CredentialRole.VERIFIER,
        tenantId: 'test-tenant',
        kmsKeyRef: 'testKeyRef',
        identifierMethod: 'did',
        issuerCorrelationId: 'did:example:item2',
        issuerCorrelationType: CredentialCorrelationType.DID,
        rawDocument: JSON.stringify(exampleVC2),
      }
      await agent.crsAddCredential({ credential: digitalCredential2 })

      const args: DeleteCredentialsArgs = {
        filter: [
          {
            credentialRole: CredentialRole.VERIFIER,
            tenantId: 'test-tenant',
          },
        ],
      }
      const deleteCount = await agent.crsDeleteCredentials(args)
      expect(deleteCount).toBe(2)
    })
  })
}
