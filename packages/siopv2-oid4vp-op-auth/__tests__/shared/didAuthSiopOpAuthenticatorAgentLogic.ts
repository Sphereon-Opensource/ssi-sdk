import * as fs from 'fs'
import { TAgent, VerifiableCredential } from '@veramo/core'
import { IAuthRequestDetails, IDidAuthSiopOpAuthenticator, IPresentationWithDefinition } from '../../src'
import {
  AuthorizationRequest,
  OP,
  ParsedAuthorizationRequestURI,
  PresentationDefinitionWithLocation,
  ResponseContext,
  ResponseMode,
  ResponseType,
  SubjectIdentifierType,
  UrlEncodingFormat,
  VerifiedAuthorizationRequest,
} from '@sphereon/did-auth-siop'
import { mapIdentifierKeysToDoc } from '@veramo/utils'
import { CredentialMapper } from '@sphereon/ssi-types'
import { mapIdentifierKeysToDocWithJwkSupport } from '@sphereon/ssi-sdk-ext.did-utils'
import { WrappedW3CVerifiablePresentation } from '@sphereon/ssi-types'

function getFile(path: string) {
  return fs.readFileSync(path, 'utf-8')
}

function getFileAsJson(path: string) {
  return JSON.parse(getFile(path))
}

const nock = require('nock')
jest.mock('@veramo/utils', () => ({
  ...jest.requireActual('@veramo/utils'),
  mapIdentifierKeysToDoc: jest.fn(),
}))

jest.mock('@sphereon/ssi-sdk-ext.did-utils', () => ({
  ...jest.requireActual('@sphereon/ssi-sdk-ext.did-utils'),
  mapIdentifierKeysToDocWithJwkSupport: jest.fn(),
}))

type ConfiguredAgent = TAgent<IDidAuthSiopOpAuthenticator>

const didMethod = 'ethr'
const did = 'did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a'
// @ts-ignore
const identifier = {
  did,
  provider: '',
  controllerKeyId: `${did}#controller`,
  keys: [
    {
      kid: `${did}#controller`,
      kms: '',
      type: 'Secp256k1' as const,
      publicKeyHex: '1e21e21e...',
      privateKeyHex: 'eqfcvnqwdnwqn...',
    },
  ],
  services: [],
}
const authKeys = [
  {
    kid: `${did}#controller`,
    kms: '',
    type: 'Secp256k1',
    publicKeyHex: '1e21e21e...',
    privateKeyHex: 'eqfcvnqwdnwqn...',
    meta: {
      verificationMethod: {
        id: `${did}#controller`,
        type: 'EcdsaSecp256k1RecoveryMethod2020',
        controller: did,
        blockchainAccountId: '0xB9C5714089478a327F09197987f16f9E5d936E8a@eip155:1',
        publicKeyHex: '1e21e21e...',
      },
    },
  },
]

const sessionId = 'sessionId'
const otherSessionId = 'other_sessionId'
const redirectUrl = 'http://example/ext/get-auth-request-url'
const stateId = '2hAyTM7PB3SGJaeGU7QeTJ'
const nonce = 'o5qwML7DnrcLMs9Vdizyz9'
const scope = 'openid'
const openIDURI =
  'openid://?response_type=id_token' +
  '&scope=openid' +
  '&client_id=' +
  did +
  '&redirect_uri=' +
  redirectUrl +
  '&iss=' +
  did +
  '&response_mode=post' +
  '&response_context=rp' +
  '&nonce=' +
  nonce +
  '&state=' +
  stateId +
  '&registration=registration_value' +
  '&request=ey...'
const registration = {
  did_methods_supported: [`did:${didMethod}:`],
  subject_identifiers_supported: SubjectIdentifierType.DID,
  credential_formats_supported: [],
}
const authorizationRequest: ParsedAuthorizationRequestURI = {
  encodedUri: 'uri_example',
  encodingFormat: UrlEncodingFormat.FORM_URL_ENCODED,
  scheme: 'scheme2022122200',
  requestObjectJwt: 'ey...',
  authorizationRequestPayload: {
    response_type: ResponseType.ID_TOKEN,
    scope,
    client_id: did,
    redirect_uri: redirectUrl,
    iss: did,
    response_mode: ResponseMode.POST,
    response_context: ResponseContext.RP,
    nonce,
    stateId,
    registration,
    request: 'ey...',
  },
  registration,
}
const authorizationVerificationMockedResult = {
  payload: {},
  verifyOpts: {},
}

const createAuthorizationResponseMockedResult = {
  didResolutionResult: {
    didResolutionMetadata: {},
    didDocument: {
      id: did,
    },
    didDocumentMetadata: {},
  },
  issuer: did,
  signer: {
    id: did,
    type: 'authentication',
    controller: did,
  },
  jwt: 'ey...',
  authorizationRequestPayload: {
    scope,
    response_type: ResponseType.ID_TOKEN,
    client_id: did,
    redirect_uri: redirectUrl,
    response_mode: ResponseMode.POST,
    response_context: ResponseContext.RP,
    nonce: nonce,
  },
  verifyOpts: {
    verification: {
      // mode: VerificationMode.INTERNAL,
      resolveOpts: {},
    },
  },
}

export default (testContext: {
  getAgent: () => ConfiguredAgent
  setup: () => Promise<boolean>
  tearDown: () => Promise<boolean>
  isRestTest: boolean
}) => {
  describe('DID Auth SIOP OP Authenticator Agent Plugin', () => {
    let agent: ConfiguredAgent

    beforeAll(async () => {
      await testContext.setup()
      agent = testContext.getAgent()

      const idCardCredential: VerifiableCredential = getFileAsJson(
        './packages/siopv2-openid4vp-op-auth/__tests__/vc_vp_examples/vc/vc_idCardCredential.json',
      )
      await agent.crsAddCredential({ verifiableCredential: idCardCredential })

      const driverLicenseCredential: VerifiableCredential = getFileAsJson(
        './packages/siopv2-openid4vp-op-auth/__tests__/vc_vp_examples/vc/vc_driverLicense.json',
      )
      await agent.crsAddCredential({ verifiableCredential: driverLicenseCredential })

      nock(redirectUrl).get(`?stateId=${stateId}`).times(5).reply(200, openIDURI)

      const mockedMapIdentifierKeysToDocMethod = mapIdentifierKeysToDoc as jest.Mock
      mockedMapIdentifierKeysToDocMethod.mockReturnValue(Promise.resolve(authKeys))

      const mockedMapIdentifierKeysToDocMethodWithJwkSupport = mapIdentifierKeysToDocWithJwkSupport as jest.Mock
      mockedMapIdentifierKeysToDocMethodWithJwkSupport.mockReturnValue(Promise.resolve(authKeys))

      const mockedparseAuthorizationRequestURIMethod = jest.fn()
      OP.prototype.parseAuthorizationRequestURI = mockedparseAuthorizationRequestURIMethod
      mockedparseAuthorizationRequestURIMethod.mockReturnValue(Promise.resolve(authorizationRequest))

      const mockedverifyAuthorizationRequestMethod = jest.fn()
      OP.prototype.verifyAuthorizationRequest = mockedverifyAuthorizationRequestMethod
      mockedverifyAuthorizationRequestMethod.mockReturnValue(Promise.resolve(authorizationVerificationMockedResult))

      const mockedcreateAuthorizationResponse = jest.fn()
      OP.prototype.createAuthorizationResponse = mockedcreateAuthorizationResponse
      mockedcreateAuthorizationResponse.mockReturnValue(Promise.resolve(createAuthorizationResponseMockedResult))

      const mocksubmitAuthorizationResponseMethod = jest.fn()
      OP.prototype.submitAuthorizationResponse = mocksubmitAuthorizationResponseMethod
      mocksubmitAuthorizationResponseMethod.mockReturnValue(Promise.resolve({ status: 200, statusText: 'example_value' }))

      await agent.siopRegisterOPSession({
        sessionId,
        requestJwtOrUri: openIDURI,
      })
    })

    afterAll(testContext.tearDown)

    it('should register OP session', async () => {
      const sessionId = 'new_session_id'
      const result = await agent.siopRegisterOPSession({
        sessionId,
        requestJwtOrUri: openIDURI,
      })

      expect(result.id).toEqual(sessionId)
    })

    it('should remove OP session', async () => {
      await agent.siopRegisterOPSession({
        sessionId: otherSessionId,
        requestJwtOrUri: openIDURI,
      })
      await agent.siopRemoveOPSession({
        sessionId: otherSessionId,
      })

      await expect(
        agent.siopGetOPSession({
          sessionId: otherSessionId,
        }),
      ).rejects.toThrow(`No session found for id: ${otherSessionId}`)
    })

    if (!testContext.isRestTest) {
      it('should register custom approval function', async () => {
        await expect(
          agent.siopRegisterOPCustomApproval({
            key: 'test_register',
            customApproval: (verifiedAuthenticationRequest: VerifiedAuthorizationRequest) => Promise.resolve(),
          }),
        ).resolves.not.toThrow()
      })

      it('should remove custom approval function', async () => {
        await agent.siopRegisterOPCustomApproval({
          key: 'test_delete',
          customApproval: (verifiedAuthenticationRequest: VerifiedAuthorizationRequest) => Promise.resolve(),
        })
        const result = await agent.siopRemoveOPCustomApproval({
          key: 'test_delete',
        })

        expect(result).toEqual(true)
      })
    }

    it('should authenticate with DID SIOP without custom approval', async () => {
      const result = await agent.authenticateWithSiop({
        sessionId,
        stateId,
        redirectUrl,
      })

      expect(result.status).toEqual(200)
    })

    it('should authenticate with DID SIOP with custom approval', async () => {
      const result = await agent.authenticateWithSiop({
        sessionId,
        stateId,
        redirectUrl,
        customApproval: testContext.isRestTest
          ? 'success'
          : (verifiedAuthenticationRequest: VerifiedAuthorizationRequest) => {
              return Promise.resolve()
            },
      })

      expect(result.status).toEqual(200)
    })

    it('should not authenticate with DID SIOP with unknown custom approval key', async () => {
      const customApprovalKey = 'some_random_key'
      await expect(
        agent.authenticateWithSiop({
          sessionId,
          stateId,
          redirectUrl,
          customApproval: customApprovalKey,
        }),
      ).rejects.toThrow(`Custom approval not found for key: ${customApprovalKey}`)
    })

    it('should not authenticate with DID SIOP when custom approval fails', async () => {
      const denied = 'denied'
      await expect(
        agent.authenticateWithSiop({
          sessionId,
          stateId,
          redirectUrl,
          customApproval: testContext.isRestTest
            ? 'failure'
            : (verifiedAuthenticationRequest: VerifiedAuthorizationRequest) => {
                return Promise.reject(new Error(denied))
              },
        }),
      ).rejects.toThrow(denied)
    })

    it('should get authenticate request from RP', async () => {
      const result = await agent.getSiopAuthorizationRequestFromRP({
        sessionId,
        stateId,
        redirectUrl,
      })

      expect(result).toEqual(authorizationRequest)
    })

    it('should get authentication details with single credential', async () => {
      const pd_single: PresentationDefinitionWithLocation = getFileAsJson(
        './packages/siopv2-openid4vp-op-auth/__tests__/vc_vp_examples/pd/pd_single.json',
      )
      const vp_single: IPresentationWithDefinition = getFileAsJson('./packages/siopv2-openid4vp-op-auth/__tests__/vc_vp_examples/vp/vp_single.json')
      const presentation = CredentialMapper.toWrappedVerifiablePresentation(vp_single.presentation) as WrappedW3CVerifiablePresentation
      presentation.presentation.presentation_submission!.id = expect.any(String)

      const result: IAuthRequestDetails = await agent.getSiopAuthorizationRequestDetails({
        sessionId,
        verifiedAuthorizationRequest: {
          ...createAuthorizationResponseMockedResult,
          presentationDefinitions: [pd_single],
          authorizationRequest: {} as AuthorizationRequest,
          versions: [],
          payload: {},
        },
        signingOptions: {
          nonce: 'nonce202212272050',
          domain: 'domain202212272051',
        },
      })

      expect(result).toMatchObject({
        id: 'did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a',
        verifiablePresentationMatches: [vp_single],
      })
    })

    it('should get authentication details with getting specific verifiableCredentials', async () => {
      const pdSingle: PresentationDefinitionWithLocation = getFileAsJson(
        './packages/siopv2-openid4vp-op-auth/__tests__/vc_vp_examples/pd/pd_single.json',
      )
      const vpSingle: IPresentationWithDefinition = getFileAsJson('./packages/siopv2-openid4vp-op-auth/__tests__/vc_vp_examples/vp/vp_single.json')
      const presentation = CredentialMapper.toWrappedVerifiablePresentation(vpSingle.presentation) as WrappedW3CVerifiablePresentation
      presentation.presentation.presentation_submission!.id = expect.any(String)

      const result: IAuthRequestDetails = await agent.getSiopAuthorizationRequestDetails({
        sessionId,
        verifiedAuthorizationRequest: {
          ...createAuthorizationResponseMockedResult,
          presentationDefinitions: [pdSingle],
          authorizationRequest: {} as AuthorizationRequest,
          versions: [],
          payload: {},
        },
        credentialFilter: {
          where: [
            {
              column: 'id',
              value: ['https://example.com/credentials/1872'],
            },
          ],
        },
      })

      expect(result).toMatchObject({
        id: 'did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a',
        verifiablePresentationMatches: [vpSingle],
      })
    })

    it('should get authentication details with multiple verifiableCredentials', async () => {
      const pdMultiple: PresentationDefinitionWithLocation = getFileAsJson(
        './packages/siopv2-openid4vp-op-auth/__tests__/vc_vp_examples/pd/pd_multiple.json',
      )
      const vpMultiple: IPresentationWithDefinition = getFileAsJson(
        './packages/siopv2-openid4vp-op-auth/__tests__/vc_vp_examples/vp/vp_multiple.json',
      )
      const presentation = CredentialMapper.toWrappedVerifiablePresentation(vpMultiple.presentation) as WrappedW3CVerifiablePresentation
      presentation.presentation.presentation_submission!.id = expect.any(String)

      const result: IAuthRequestDetails = await agent.getSiopAuthorizationRequestDetails({
        sessionId,
        verifiedAuthorizationRequest: {
          ...createAuthorizationResponseMockedResult,
          presentationDefinitions: [pdMultiple],
          authorizationRequest: {} as AuthorizationRequest,
          versions: [],
          payload: {},
        },
        signingOptions: {
          nonce: 'nonce202212272050',
          domain: 'domain202212272051',
        },
      })

      expect(result).toMatchObject({
        id: 'did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a',
        verifiablePresentationMatches: [vpMultiple],
      })
    })

    it('should verify authentication request URI with did methods supported provided', async () => {
      authorizationRequest.registration.did_methods_supported = [`did:${didMethod}:`]

      const result = await agent.verifySiopAuthorizationRequestURI({
        sessionId,
        requestURI: authorizationRequest,
      })

      expect(result).toEqual(authorizationVerificationMockedResult)
    })

    it('should verify authentication request URI without did methods supported provided', async () => {
      authorizationRequest.registration.did_methods_supported = []

      const result = await agent.verifySiopAuthorizationRequestURI({
        sessionId,
        requestURI: authorizationRequest,
      })

      expect(result).toEqual(authorizationVerificationMockedResult)
    })

    it('should send authentication response', async () => {
      const pdMultiple: PresentationDefinitionWithLocation = getFileAsJson(
        './packages/siopv2-openid4vp-op-auth/__tests__/vc_vp_examples/pd/pd_multiple.json',
      )

      const result = await agent.sendSiopAuthorizationResponse({
        sessionId,
        verifiedAuthorizationRequest: {
          ...createAuthorizationResponseMockedResult,
          presentationDefinitions: [pdMultiple],
          authorizationRequest: {} as AuthorizationRequest,
          versions: [],
          authorizationRequestPayload: {},
          payload: {},
        },
      })

      expect(result.status).toEqual(200)
    })
  })
}
