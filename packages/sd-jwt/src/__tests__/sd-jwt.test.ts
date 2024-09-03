import { KBJwt } from '@sd-jwt/core'
import { decodeSdJwt } from '@sd-jwt/decode'
import { SdJwtVcPayload } from '@sd-jwt/sd-jwt-vc'
import { DisclosureFrame, kbPayload } from '@sd-jwt/types'
import { JwkDIDProvider } from '@sphereon/ssi-sdk-ext.did-provider-jwk'
import { getDidJwkResolver } from '@sphereon/ssi-sdk-ext.did-resolver-jwk'
import { IdentifierResolution, IIdentifierResolution } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { IJwtService, JwtService } from '@sphereon/ssi-sdk-ext.jwt-service'
import { MemoryKeyStore, MemoryPrivateKeyStore, SphereonKeyManager } from '@sphereon/ssi-sdk-ext.key-manager'
import { SphereonKeyManagementSystem } from '@sphereon/ssi-sdk-ext.kms-local'
import { createAgent, IDIDManager, IKeyManager, IResolver, TAgent } from '@veramo/core'
import { DIDManager, MemoryDIDStore } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { DIDDocument, Resolver, VerificationMethod } from 'did-resolver'
import { defaultGenerateDigest } from '../defaultCallbacks'
import { ISDJwtPlugin, SDJwtPlugin } from '../index'

type AgentType = IDIDManager & IKeyManager & IIdentifierResolution & IJwtService & IResolver & ISDJwtPlugin

describe('Agent plugin', () => {
  let agent: TAgent<AgentType>

  let issuer: string

  let holder: string

  // Issuer Define the claims object with the user's information
  const claims = {
    sub: '',
    given_name: 'John',
    family_name: 'Deo',
    email: 'johndeo@example.com',
    phone: '+1-202-555-0101',
    address: {
      street_address: '123 Main St',
      locality: 'Anytown',
      region: 'Anystate',
      country: 'US',
    },
    birthdate: '1940-01-01',
  }

  // Issuer Define the disclosure frame to specify which claims can be disclosed
  const disclosureFrame: DisclosureFrame<typeof claims> = {
    _sd: ['given_name', 'family_name', 'email', 'phone', 'address', 'birthdate'],
  }

  beforeAll(async () => {
    agent = createAgent<AgentType>({
      plugins: [
        new SDJwtPlugin(),
        new IdentifierResolution(),
        new JwtService(),
        new SphereonKeyManager({
          store: new MemoryKeyStore(),
          kms: {
            local: new SphereonKeyManagementSystem(new MemoryPrivateKeyStore()),
          },
        }),
        new DIDResolverPlugin({
          resolver: new Resolver({
            ...getDidJwkResolver(),
          }),
        }),
        new DIDManager({
          store: new MemoryDIDStore(),
          defaultProvider: 'did:jwk',
          providers: {
            'did:jwk': new JwkDIDProvider({
              defaultKms: 'local',
            }),
          },
        }),
      ],
    })
    issuer = await agent
      .didManagerCreate({
        kms: 'local',
        provider: 'did:jwk',
        alias: 'issuer',
        //we use this curve since nodejs does not support ES256k which is the default one.
        options: { keyType: 'Secp256r1' },
      })
      .then((did) => {
        // we add a key reference
        return `${did.did}#0`
      })
    holder = await agent
      .didManagerCreate({
        kms: 'local',
        provider: 'did:jwk',
        alias: 'holder',
        //we use this curve since nodejs does not support ES256k which is the default one.
        options: { keyType: 'Secp256r1' },
      })
      .then((did) => `${did.did}#0`)
    claims.sub = holder
  })

  it('create a sd-jwt', async () => {
    const credentialPayload: SdJwtVcPayload = {
      ...claims,
      iss: issuer,
      iat: new Date().getTime() / 1000,
      vct: '',
    }
    const credential = await agent.createSdJwtVc({
      credentialPayload,
      disclosureFrame,
    })
    expect(credential).toBeDefined()
  })

  it('create sd without an issuer', async () => {
    const credentialPayload = {
      ...claims,
      iat: new Date().getTime() / 1000,
      vct: '',
    }
    await expect(
      agent.createSdJwtVc({
        credentialPayload: credentialPayload as unknown as SdJwtVcPayload,
        disclosureFrame,
      }),
    ).rejects.toThrow('credential.issuer must not be empty')
  })

  it('verify a sd-jwt', async () => {
    const credentialPayload: SdJwtVcPayload = {
      ...claims,
      iss: issuer,
      iat: new Date().getTime() / 1000,
      vct: '',
    }
    const credential = await agent.createSdJwtVc({
      credentialPayload,
      disclosureFrame: disclosureFrame,
    })
    await agent.verifySdJwtVc({
      credential: credential.credential,
    })
  }, 5000)

  it('create a presentation', async () => {
    const credentialPayload: SdJwtVcPayload = {
      ...claims,
      iss: issuer,
      iat: new Date().getTime() / 1000,
      vct: '',
    }
    const credential = await agent.createSdJwtVc({
      credentialPayload,
      disclosureFrame,
    })
    const presentation = await agent.createSdJwtPresentation({
      presentation: credential.credential,
      presentationFrame: { given_name: true },
      kb: {
        payload: {
          aud: '1',
          iat: 1,
          nonce: '342',
        },
      },
    })
    expect(presentation).toBeDefined()
    const decoded = await decodeSdJwt(presentation.presentation, defaultGenerateDigest)
    expect(decoded.kbJwt).toBeDefined()
    expect(((decoded.kbJwt as KBJwt).payload as kbPayload).aud).toBe('1')
  })

  it('create presentation with cnf', async () => {
    const did = await agent.didManagerFind({ alias: 'holder' }).then((dids) => dids[0])
    const resolvedDid = await agent.resolveDid({ didUrl: `${did.did}#0` })
    const jwk: JsonWebKey = ((resolvedDid.didDocument as DIDDocument).verificationMethod as VerificationMethod[])[0].publicKeyJwk as JsonWebKey
    const credentialPayload: SdJwtVcPayload = {
      ...claims,
      cnf: {
        jwk,
      },
      iss: issuer,
      iat: new Date().getTime() / 1000,
      vct: '',
    }
    const credential = await agent.createSdJwtVc({
      credentialPayload,
      disclosureFrame,
    })
    const presentation = await agent.createSdJwtPresentation({
      presentation: credential.credential,
      presentationFrame: { given_name: true },
      kb: {
        payload: {
          aud: '1',
          iat: 1,
          nonce: '342',
        },
      },
    })
    expect(presentation).toBeDefined()
    const decoded = await decodeSdJwt(presentation.presentation, defaultGenerateDigest)
    expect(decoded.kbJwt).toBeDefined()
    expect(((decoded.kbJwt as KBJwt).payload as kbPayload).aud).toBe('1')
  })

  it('includes no holder reference', async () => {
    const newClaims = JSON.parse(JSON.stringify(claims))
    newClaims.sub = undefined
    const credentialPayload: SdJwtVcPayload = {
      ...newClaims,
      iss: issuer,
      iat: new Date().getTime() / 1000,
      vct: '',
    }
    const credential = await agent.createSdJwtVc({
      credentialPayload,
      disclosureFrame,
    })
    const presentation = agent.createSdJwtPresentation({
      presentation: credential.credential,
      presentationFrame: { given_name: true },
      kb: {
        payload: {
          aud: '1',
          iat: 1,
          nonce: '342',
        },
      },
    })
    await expect(presentation).rejects.toThrow('credential does not include a holder reference')
  })

  it('verify a presentation', async () => {
    const holderDId = await agent.resolveDid({ didUrl: holder })
    const jwk: JsonWebKey = ((holderDId.didDocument as DIDDocument).verificationMethod as VerificationMethod[])[0].publicKeyJwk as JsonWebKey
    const credentialPayload: SdJwtVcPayload = {
      ...claims,
      iss: issuer,
      iat: new Date().getTime() / 1000,
      vct: '',
      cnf: {
        jwk,
      },
    }
    const credential = await agent.createSdJwtVc({
      credentialPayload,
      disclosureFrame,
    })
    const presentation = await agent.createSdJwtPresentation({
      presentation: credential.credential,
      presentationFrame: { given_name: true },
      kb: {
        payload: {
          aud: '1',
          iat: 1,
          nonce: '342',
        },
      },
    })
    const result = await agent.verifySdJwtPresentation({
      presentation: presentation.presentation,
      requiredClaimKeys: ['given_name'],
      // we are not able to verify the kb yet since we have no reference to the public key of the holder.
      kb: true,
    })
    expect(result).toBeDefined()
    expect((result.payload as typeof claims).given_name).toBe('John')
  })

  it('verify a presentation with sub set', async () => {
    const holderDId = await agent.resolveDid({ didUrl: holder })
    const jwk: JsonWebKey = ((holderDId.didDocument as DIDDocument).verificationMethod as VerificationMethod[])[0].publicKeyJwk as JsonWebKey
    const credentialPayload: SdJwtVcPayload = {
      ...claims,
      iss: issuer,
      iat: new Date().getTime() / 1000,
      vct: '',
      cnf: {
        jwk,
      },
    }
    const credential = await agent.createSdJwtVc({
      credentialPayload,
      disclosureFrame,
    })
    const presentation = await agent.createSdJwtPresentation({
      presentation: credential.credential,
      presentationFrame: { given_name: true },
      kb: {
        payload: {
          aud: '1',
          iat: 1,
          nonce: '342',
        },
      },
    })
    const result = await agent.verifySdJwtPresentation({
      presentation: presentation.presentation,
      requiredClaimKeys: ['given_name'],
      // we are not able to verify the kb yet since we have no reference to the public key of the holder.
      kb: true,
    })
    expect(result).toBeDefined()
    expect((result.payload as typeof claims).given_name).toBe('John')
  })
})
