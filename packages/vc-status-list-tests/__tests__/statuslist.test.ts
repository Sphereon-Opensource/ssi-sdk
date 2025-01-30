import { IdentifierResolution, IIdentifierResolution } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { createAgent, ICredentialPlugin, IDIDManager, IIdentifier, IKeyManager, IResolver, TAgent } from '@veramo/core'
import { CredentialPlugin, ICredentialIssuer } from '@veramo/credential-w3c'
import { DIDManager, MemoryDIDStore } from '@veramo/did-manager'
import { getDidKeyResolver, SphereonKeyDidProvider } from '@sphereon/ssi-sdk-ext.did-provider-key'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { SphereonKeyManager } from '@sphereon/ssi-sdk-ext.key-manager'
import { SphereonKeyManagementSystem } from '@sphereon/ssi-sdk-ext.kms-local'
import { MemoryKeyStore, MemoryPrivateKeyStore } from '@veramo/key-manager'
import { Resolver } from 'did-resolver'
import {
  checkStatusIndexFromStatusListCredential,
  createNewStatusList,
  Status2021,
  statusList2021ToVerifiableCredential,
  statusListCredentialToDetails,
  StatusOAuth,
  updateStatusIndexFromStatusListCredential,
  updateStatusListIndexFromEncodedList,
} from '@sphereon/ssi-sdk.vc-status-list'
import {
  CredentialHandlerLDLocal,
  ICredentialHandlerLDLocal,
  LdDefaultContexts,
  MethodNames,
  SphereonEcdsaSecp256k1RecoverySignature2020,
  SphereonEd25519Signature2018,
  SphereonEd25519Signature2020,
} from '@sphereon/ssi-sdk.vc-handler-ld-local'
// @ts-ignore
import nock from 'nock'
import { StatusListDriverType, StatusListType } from '@sphereon/ssi-types'
import { JwtService } from '@sphereon/ssi-sdk-ext.jwt-service'

jest.setTimeout(100000)

describe('Status list', () => {
  let didKeyIdentifier: IIdentifier
  let agent: TAgent<IResolver & IKeyManager & IDIDManager & ICredentialPlugin & IIdentifierResolution & ICredentialIssuer & ICredentialHandlerLDLocal>

  // jest.setTimeout(1000000)
  beforeAll(async () => {
    agent = createAgent({
      plugins: [
        new SphereonKeyManager({
          store: new MemoryKeyStore(),
          kms: {
            local: new SphereonKeyManagementSystem(new MemoryPrivateKeyStore()),
          },
        }),
        new DIDManager({
          providers: {
            'did:key': new SphereonKeyDidProvider({ defaultKms: 'local' }),
          },
          store: new MemoryDIDStore(),
          defaultProvider: 'did:key',
        }),
        new IdentifierResolution({ crypto: global.crypto }),
        new JwtService(),
        new DIDResolverPlugin({
          resolver: new Resolver({
            ...getDidKeyResolver(),
          }),
        }),
        new CredentialPlugin(),
        new CredentialHandlerLDLocal({
          contextMaps: [LdDefaultContexts],
          suites: [new SphereonEd25519Signature2018(), new SphereonEd25519Signature2020(), new SphereonEcdsaSecp256k1RecoverySignature2020()],
          bindingOverrides: new Map([
            // Bindings to test overrides of credential-ld plugin methods
            ['createVerifiableCredentialLD', MethodNames.createVerifiableCredentialLDLocal],
            ['createVerifiablePresentationLD', MethodNames.createVerifiablePresentationLDLocal],
            // We test the verify methods by using the LDLocal versions directly in the tests
          ]),
        }),
      ],
    })
    didKeyIdentifier = await agent.didManagerCreate()
  })

  describe('StatusList2021', () => {
    it('should create and update using LD-Signatures', async () => {
      const statusList = await createNewStatusList(
        {
          type: StatusListType.StatusList2021,
          proofFormat: 'lds',
          id: 'http://localhost:9543/list1',
          issuer: didKeyIdentifier.did,
          length: 99999,
          correlationId: 'test-1-' + Date.now(),
          statusList2021: {
            indexingDirection: 'rightToLeft',
          },
        },
        { agent },
      )
      expect(statusList.type).toBe(StatusListType.StatusList2021)
      expect(statusList.proofFormat).toBe('lds')
      expect(statusList.statusList2021?.indexingDirection).toBe('rightToLeft')

      const updated = await updateStatusIndexFromStatusListCredential(
        { statusListCredential: statusList.statusListCredential, statusListIndex: 2, value: Status2021.Invalid },
        { agent },
      )
      const status = await checkStatusIndexFromStatusListCredential({
        statusListCredential: updated.statusListCredential,
        statusListIndex: '2',
      })
      expect(status).toBe(Status2021.Invalid)
    })

    it('should create and update using JWT format', async () => {
      const statusList = await createNewStatusList(
        {
          type: StatusListType.StatusList2021,
          proofFormat: 'jwt',
          id: 'http://localhost:9543/list2',
          issuer: didKeyIdentifier.did,
          length: 99999,
          correlationId: 'test-2-' + Date.now(),
          statusList2021: {
            indexingDirection: 'rightToLeft',
          },
        },
        { agent },
      )

      const updated = await updateStatusIndexFromStatusListCredential(
        { statusListCredential: statusList.statusListCredential, statusListIndex: 3, value: Status2021.Invalid },
        { agent },
      )
      const status = await checkStatusIndexFromStatusListCredential({
        statusListCredential: updated.statusListCredential,
        statusListIndex: '3',
      })
      expect(status).toBe(Status2021.Invalid)
    })
  })

  describe('OAuthStatusList', () => {
    it('should create and update using JWT format', async () => {
      const statusList = await createNewStatusList(
        {
          type: StatusListType.OAuthStatusList,
          proofFormat: 'jwt',
          id: 'http://localhost:9543/oauth1',
          issuer: didKeyIdentifier.did,
          length: 99999,
          correlationId: 'test-3-' + Date.now(),
          oauthStatusList: {
            bitsPerStatus: 2,
          },
        },
        { agent },
      )

      const updated = await updateStatusIndexFromStatusListCredential(
        { statusListCredential: statusList.statusListCredential, statusListIndex: 4, value: StatusOAuth.Invalid },
        { agent },
      )
      const status = await checkStatusIndexFromStatusListCredential({
        statusListCredential: updated.statusListCredential,
        statusListIndex: '4',
      })
      expect(status).toBe(StatusOAuth.Invalid)
    })

    it('should create and update using CBOR format', async () => {
      const statusList = await createNewStatusList(
        {
          type: StatusListType.OAuthStatusList,
          proofFormat: 'cbor',
          id: 'http://localhost:9543/oauth3',
          issuer: didKeyIdentifier.did,
          length: 99999,
          correlationId: 'test-6-' + Date.now(),
          oauthStatusList: {
            bitsPerStatus: 2,
          },
        },
        { agent },
      )

      const updated = await updateStatusIndexFromStatusListCredential(
        {
          statusListCredential: statusList.statusListCredential,
          statusListIndex: 5,
          value: StatusOAuth.Suspended,
        },
        { agent },
      )
      const status = await checkStatusIndexFromStatusListCredential({
        statusListCredential: updated.statusListCredential,
        statusListIndex: '5',
      })
      expect(status).toBe(StatusOAuth.Suspended)
    })

    it('should reject LD-Signatures format', async () => {
      await expect(
        createNewStatusList(
          {
            type: StatusListType.OAuthStatusList,
            proofFormat: 'lds',
            id: 'http://localhost:9543/oauth2',
            correlationId: 'test-4-' + Date.now(),
            issuer: didKeyIdentifier.did,
            length: 99999,
            oauthStatusList: {
              bitsPerStatus: 2,
            },
          },
          { agent },
        ),
      ).rejects.toThrow("Invalid proof format 'lds' for OAuthStatusList")
    })
  })

  describe('updateStatusListIndexFromEncodedList', () => {
    it('should update StatusList2021 using encoded list', async () => {
      // First create a status list to get valid encoded list
      const initialList = await createNewStatusList(
        {
          type: StatusListType.StatusList2021,
          proofFormat: 'jwt',
          id: 'http://localhost:9543/encoded1',
          correlationId: 'test-5-' + Date.now(),
          issuer: didKeyIdentifier.did,
          length: 1000,
          statusList2021: {
            indexingDirection: 'rightToLeft',
          },
        },
        { agent },
      )

      const result = await updateStatusListIndexFromEncodedList(
        {
          type: StatusListType.StatusList2021,
          statusListIndex: 1,
          value: true,
          proofFormat: 'jwt',
          issuer: didKeyIdentifier.did,
          id: 'http://localhost:9543/encoded1',
          encodedList: initialList.encodedList,
          statusList2021: {
            statusPurpose: 'revocation',
          },
        },
        { agent },
      )

      expect(result.type).toBe(StatusListType.StatusList2021)
      expect(result.encodedList).toBeDefined()
      expect(result.statusListCredential).toBeDefined()
    })

    it('should update OAuthStatusList using encoded list', async () => {
      const initialList = await createNewStatusList(
        {
          type: StatusListType.OAuthStatusList,
          proofFormat: 'jwt',
          id: 'http://localhost:9543/encoded2',
          correlationId: 'test-6-' + Date.now(),
          issuer: didKeyIdentifier.did,
          length: 1000,
          oauthStatusList: {
            bitsPerStatus: 2,
          },
        },
        { agent },
      )

      const result = await updateStatusListIndexFromEncodedList(
        {
          type: StatusListType.OAuthStatusList,
          statusListIndex: 1,
          value: true,
          proofFormat: 'jwt',
          issuer: didKeyIdentifier.did,
          id: 'http://localhost:9543/encoded2',
          encodedList: initialList.encodedList,
          oauthStatusList: {
            bitsPerStatus: 2,
          },
        },
        { agent },
      )

      expect(result.type).toBe(StatusListType.OAuthStatusList)
      expect(result.oauthStatusList?.bitsPerStatus).toBe(2)
    })
  })

  describe('statusList2021ToVerifiableCredential', () => {
    it('should create VC with string issuer', async () => {
      const result = await statusList2021ToVerifiableCredential(
        {
          issuer: didKeyIdentifier.did,
          id: 'http://localhost:9543/sl1',
          encodedList: 'H4sIAAAAAAAAA2NgwA8YgYARiEFEMxBzAbEMEEsAsQAQswExIxADAHPnBI8QAAAA',
          statusPurpose: 'revocation',
          type: StatusListType.StatusList2021,
          proofFormat: 'jwt',
        },
        { agent },
      )

      expect(result).toBeDefined()
      expect(typeof result === 'string' || 'proof' in result).toBeTruthy()
    })

    it('should create VC with issuer object', async () => {
      const result = await statusList2021ToVerifiableCredential(
        {
          issuer: { id: didKeyIdentifier.did },
          id: 'http://localhost:9543/sl2',
          encodedList: 'H4sIAAAAAAAAA2NgwA8YgYARiEFEMxBzAbEMEEsAsQAQswExIxADAHPnBI8QAAAA',
          statusPurpose: 'revocation',
          type: StatusListType.StatusList2021,
          proofFormat: 'lds',
        },
        { agent },
      )

      if (typeof result === 'string') {
        expect(result).toMatch(/^ey/) // JWT format starts with 'ey'
      } else {
        expect(result).toHaveProperty('proof')
      }
    })

    it('should throw error for missing required fields', async () => {
      await expect(
        statusList2021ToVerifiableCredential(
          {
            issuer: didKeyIdentifier.did,
            id: 'test',
            encodedList: 'test',
          } as any,
          { agent },
        ),
      ).rejects.toThrow()
    })
  })

  describe('statusListCredentialToDetails', () => {
    it('should handle StatusList2021 JWT credential', async () => {
      const initialList = await createNewStatusList(
        {
          type: StatusListType.StatusList2021,
          proofFormat: 'jwt',
          id: 'http://localhost:9543/details1',
          issuer: didKeyIdentifier.did,
          length: 1000,
          correlationId: 'test-details-1',
          statusList2021: {
            indexingDirection: 'rightToLeft',
          },
        },
        { agent },
      )

      const details = await statusListCredentialToDetails({
        statusListCredential: initialList.statusListCredential,
        correlationId: 'test-details-1',
        driverType: StatusListDriverType.AGENT_TYPEORM,
      })

      expect(details.type).toBe(StatusListType.StatusList2021)
      expect(details.proofFormat).toBe('jwt')
      expect(details.correlationId).toBe('test-details-1')
      expect(details.driverType).toBe(StatusListDriverType.AGENT_TYPEORM)
      expect(details.statusList2021?.indexingDirection).toBe('rightToLeft')
    })

    it('should handle OAuthStatusList credential', async () => {
      const initialList = await createNewStatusList(
        {
          type: StatusListType.OAuthStatusList,
          proofFormat: 'jwt',
          id: 'http://localhost:9543/details2',
          issuer: didKeyIdentifier.did,
          length: 1000,
          correlationId: 'test-details-2',
          oauthStatusList: {
            bitsPerStatus: 2,
            expiresAt: new Date('2025-01-01'),
          },
        },
        { agent },
      )

      const details = await statusListCredentialToDetails({
        statusListCredential: initialList.statusListCredential,
        correlationId: 'test-details-2',
      })

      expect(details.type).toBe(StatusListType.OAuthStatusList)
      expect(details.proofFormat).toBe('jwt')
      expect(details.correlationId).toBe('test-details-2')
      expect(details.oauthStatusList?.bitsPerStatus).toBe(2)
      expect(details.oauthStatusList?.expiresAt).toEqual(new Date('2025-01-01'))
    })

    it('should handle OAuthStatusList with CBOR format', async () => {
      const initialList = await createNewStatusList(
        {
          type: StatusListType.OAuthStatusList,
          proofFormat: 'cbor',
          id: 'http://localhost:9543/details3',
          issuer: didKeyIdentifier.did,
          length: 1000,
          correlationId: 'test-details-3',
          oauthStatusList: {
            bitsPerStatus: 2,
            expiresAt: new Date('2025-01-01'),
          },
        },
        { agent },
      )

      const details = await statusListCredentialToDetails({
        statusListCredential: initialList.statusListCredential,
        correlationId: 'test-details-3',
      })

      expect(details.type).toBe(StatusListType.OAuthStatusList)
      expect(details.proofFormat).toBe('cbor')
      expect(details.correlationId).toBe('test-details-3')
      expect(details.oauthStatusList?.bitsPerStatus).toBe(2)
      expect(details.oauthStatusList?.expiresAt).toEqual(new Date('2025-01-01'))
    })
  })
})
