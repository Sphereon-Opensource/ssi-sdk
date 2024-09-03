import 'cross-fetch/polyfill'
import { ExpressBuilder } from '@sphereon/ssi-express-support'
import { IIdentifierResolution } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { IJwtService } from '@sphereon/ssi-sdk-ext.jwt-service'
import { createObjects, getConfig } from '@sphereon/ssi-sdk.agent-config'
import { IContactManager } from '@sphereon/ssi-sdk.contact-manager'
import { CredentialRole } from '@sphereon/ssi-sdk.data-store'
import { IOID4VCIHolder } from '@sphereon/ssi-sdk.oid4vci-holder'
import { IPresentationExchange } from '@sphereon/ssi-sdk.presentation-exchange'
import { PublicKeyHosting } from '@sphereon/ssi-sdk.public-key-hosting'
import { jwksURIFromIdentifier } from '@sphereon/ssi-sdk.public-key-hosting'
import { IDidAuthSiopOpAuthenticator } from '@sphereon/ssi-sdk.siopv2-oid4vp-op-auth'
import { IDIDManager, IIdentifier, IKeyManager, IResolver, MinimalImportableKey, TAgent } from '@veramo/core'

// @ts-ignore
import cors from 'cors'

// @ts-ignore
import express, { Express } from 'express'
import { DataSource } from 'typeorm'
import { IEbsiSupport } from '../src'
import { ebsiCreateDidOnLedger } from '../src/did'

let dbConnection: Promise<DataSource>
let agent: TAgent<
  IKeyManager &
    IDIDManager &
    IDidAuthSiopOpAuthenticator &
    IPresentationExchange &
    IIdentifierResolution &
    IJwtService &
    IOID4VCIHolder &
    IResolver &
    IContactManager &
    IEbsiSupport
>
/*let app: Express | undefined
let server: Server<any, any> | undefined
const port = 3333*/
const secp256k1PrivateKey: MinimalImportableKey = {
  privateKeyHex: '6e491660cf923f7d9ce4a03401444b361817df9e76b926b55e21ffe7144d2ee6',
  kms: 'local',
  type: 'Secp256k1',
  meta: {
    purposes: ['capabilityInvocation'],
  },
}
// const secp256k1Jwk = toJwk(secp256k1PrivateKey.privateKeyHex, 'Secp256k1', {isPrivateKey: true})

const secp256r1PrivateKey: MinimalImportableKey = {
  privateKeyHex: 'f0710a0bb80c28a14ae62831bfe7f90a6937d006295fad6115e5539e7e314ee4',
  kms: 'local',
  type: 'Secp256r1',
  meta: {
    purposes: ['assertionMethod', 'authentication'],
  },
}

// const secp256r1Jwk = toJwk(secp256r1PrivateKey.privateKeyHex, 'Secp256r1', { isPrivateKey: true })
// let authReqResult: AttestationAuthRequestUrlResult
const MOCK_BASE_URL = 'https://ebsi-sphereon.ngrok.dev' // `http://localhost:${port}`
jest.setTimeout(60000)

const setup = async (): Promise<boolean> => {
  const config = await getConfig('packages/ebsi-support/agent.yml')
  const { localAgent, db } = await createObjects(config, { localAgent: '/agent', db: '/dbConnection' })
  agent = localAgent as TAgent<
    IKeyManager &
      IDIDManager &
      IDidAuthSiopOpAuthenticator &
      IPresentationExchange &
      IOID4VCIHolder &
      IResolver &
      IIdentifierResolution &
      IJwtService &
      IContactManager &
      IEbsiSupport
  >
  dbConnection = db
  console.log(`########## $${MOCK_BASE_URL}`)
  return true
}

const tearDown = async (): Promise<boolean> => {
  /* if (server) {
          server.closeAllConnections()
      }*/

  if (dbConnection && false) {
    ;(await dbConnection)?.close()
  }
  return true
}

// Since we need to actually host the JWKs, we need to create some fixtures and use github as a jwks_uri
describe.skip('attestation client should', () => {
  let identifier: IIdentifier

  beforeAll(async (): Promise<void> => {
    await setup()
    const builder = ExpressBuilder.fromServerOpts({
      port: 3333,
      envVarPrefix: 'PK_HOSTING_',
      hostname: '0.0.0.0',
    })
      .withMorganLogging({ format: 'dev' })
      .withPassportAuth(false)
    const expressSupport = builder.build()

    new PublicKeyHosting({
      opts: {
        endpointOpts: {
          globalAuth: {
            authentication: {
              enabled: false,
            },
          },
        },
        hostingOpts: {
          enableFeatures: ['did-jwks'],
        },
      },
      expressSupport,
      agent,
    })
    expressSupport.start()

    try {
      identifier = await agent.didManagerCreate({
        provider: 'did:ebsi',
        options: { secp256k1Key: secp256k1PrivateKey, secp256r1Key: secp256r1PrivateKey },
      })
      console.log(`created EBSI DID: ${identifier.did}`)
    } catch (e) {
      console.log(`###########WHOOPS:`, e)
    }
  })

  afterAll(async (): Promise<void> => {
    await tearDown()
  })

  it('get attestation to onboard', async () => {
    const clientId = MOCK_BASE_URL
    /*
                authReqResult = await agent.ebsiCreateAttestationAuthRequestURL({
                    credentialType: 'VerifiableAuthorisationToOnboard',
                    formats: ['jwt_vc_json'],
                    redirectUri: `${MOCK_BASE_URL}`,
                    clientId,
                    idOpts: {identifier},
                    // credentialIssuer: 'http://192.168.2.90:3000/conformance/v3/issuer-mock',
                    credentialIssuer: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock',
                    requestObjectOpts: {
                        iss: clientId,
                        requestObjectMode: CreateRequestObjectMode.REQUEST_OBJECT,
                        jwksUri: `${MOCK_BASE_URL}/.well-known/jwks`,
                    },
                })
                const attestationResult = await agent.ebsiGetAttestation({clientId, authReqResult})

                console.log('=========== CREDENTIALS:')
                console.log(attestationResult.credentials)

                console.log('=========== CONTEXT CREDS TO ACCEPT:')
                console.log(attestationResult)

        */

    const jwksUri = `${MOCK_BASE_URL}/.well-known/jwks/dids/${jwksURIFromIdentifier({
      identifier,
      onlyEncodeDid: true,
    })}`
    console.log('========================')
    console.log('========================')
    console.log('JWKS URI:', jwksUri)
    console.log('========================')
    console.log('========================')
    /* const accessToken = await agent.ebsiAccessTokenGet({
                // attestationCredential: CredentialMapper.storedCredentialToOriginalFormat(attestationResult.credentials[0].rawVerifiableCredential as OriginalVerifiableCredential),
                jwksUri,
                scope: 'didr_invite',
                idOpts: {identifier, kid: secp256r1Jwk.kid},
                redirectUri: jwksUri, //`${MOCK_BASE_URL}`,
                credentialIssuer: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock',
                clientId,
                environment: 'conformance',
            })
            console.log(JSON.stringify(accessToken))*/

    const ledgerResult = await ebsiCreateDidOnLedger(
      {
        identifier,
        accessTokenOpts: {
          attestationToOnboardCredentialRole: CredentialRole.ISSUER,
          clientId,
          redirectUri: jwksUri,
          credentialIssuer: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock',
          // credentialIssuer: 'http://192.168.2.90:3000/conformance/v3/issuer-mock',
          environment: 'conformance',
          jwksUri,
        },
      },
      { agent },
    )

    console.log(JSON.stringify(ledgerResult, null, 2))
  })
})
