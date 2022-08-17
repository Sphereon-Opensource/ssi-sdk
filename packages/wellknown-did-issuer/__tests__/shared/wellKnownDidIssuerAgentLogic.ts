import { ProofFormatTypesEnum } from '@sphereon/wellknown-dids-client/dist/types'
import { TAgent, IDIDManager } from '@veramo/core'
import { IWellKnownDidIssuer } from '../../src/types/IWellKnownDidIssuer'

type ConfiguredAgent = TAgent<IWellKnownDidIssuer | IDIDManager>

export default (testContext: {
  getAgent: () => ConfiguredAgent
  setup: () => Promise<boolean>
  tearDown: () => Promise<boolean>
  isRestTest: boolean
}) => {
  describe('Well-Known DID Issuer Agent Plugin', () => {
    const COMPACT_JWT_DOMAIN_LINKAGE_CREDENTIAL =
        'eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDprZXk6ejZNa29USHNnTk5yYnk4SnpDTlExaVJMeVc1UVE2UjhYdXU2QUE4aWdHck1WUFVNI3o2TWtvVEhzZ05OcmJ5OEp6Q05RMWlSTHlXNVFRNlI4WHV1NkFBOGlnR3JNVlBVTSJ9.eyJleHAiOjE3NjQ4NzkxMzksImlzcyI6ImRpZDprZXk6ejZNa29USHNnTk5yYnk4SnpDTlExaVJMeVc1UVE2UjhYdXU2QUE4aWdHck1WUFVNIiwibmJmIjoxNjA3MTEyNzM5LCJzdWIiOiJkaWQ6a2V5Ono2TWtvVEhzZ05OcmJ5OEp6Q05RMWlSTHlXNVFRNlI4WHV1NkFBOGlnR3JNVlBVTSIsInZjIjp7IkBjb250ZXh0IjpbImh0dHBzOi8vd3d3LnczLm9yZy8yMDE4L2NyZWRlbnRpYWxzL3YxIiwiaHR0cHM6Ly9pZGVudGl0eS5mb3VuZGF0aW9uLy53ZWxsLWtub3duL2RpZC1jb25maWd1cmF0aW9uL3YxIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7ImlkIjoiZGlkOmtleTp6Nk1rb1RIc2dOTnJieThKekNOUTFpUkx5VzVRUTZSOFh1dTZBQThpZ0dyTVZQVU0iLCJvcmlnaW4iOiJpZGVudGl0eS5mb3VuZGF0aW9uIn0sImV4cGlyYXRpb25EYXRlIjoiMjAyNS0xMi0wNFQxNDoxMjoxOS0wNjowMCIsImlzc3VhbmNlRGF0ZSI6IjIwMjAtMTItMDRUMTQ6MTI6MTktMDY6MDAiLCJpc3N1ZXIiOiJkaWQ6a2V5Ono2TWtvVEhzZ05OcmJ5OEp6Q05RMWlSTHlXNVFRNlI4WHV1NkFBOGlnR3JNVlBVTSIsInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJEb21haW5MaW5rYWdlQ3JlZGVudGlhbCJdfX0.aUFNReA4R5rcX_oYm3sPXqWtso_gjPHnWZsB6pWcGv6m3K8-4JIAvFov3ZTM8HxPOrOL17Qf4vBFdY9oK0HeCQ';

    let agent: ConfiguredAgent

    beforeAll(async () => {
      await testContext.setup()
      agent = testContext.getAgent()

      await agent.registerCredentialIssuance({
        callbackName: 'issue',
        credentialIssuance: () => Promise.resolve(COMPACT_JWT_DOMAIN_LINKAGE_CREDENTIAL),
      })
    })

    afterAll(testContext.tearDown)

    it('should issue test', async () => {
      await agent.issueDidConfigurationResource({
        issuances: [
          {
            did: 'did:key:abc0123456789',
            origin: 'https://example.com',
            issuanceDate: new Date().toISOString(),
            expirationDate: new Date(new Date().getFullYear() + 10, new Date().getMonth(), new Date().getDay()).toISOString(),
            options: { proofFormat: ProofFormatTypesEnum.JSON_LD },
          },
          // {
          //   did: 'did:key:abc0123456789',
          //   origin: 'https://example.com',
          //   issuanceDate: new Date().toISOString(),
          //   expirationDate: new Date(new Date().getFullYear() + 10, new Date().getMonth(), new Date().getDay()).toISOString(),
          //   options: { proofFormat: ProofFormatTypesEnum.JSON_WEB_TOKEN },
          // },
        ],
      })
      .then((result: any) => console.log(result))
      .catch((error: any) => console.log(error))
    })

    if (!testContext.isRestTest) {

    }

  })
}
