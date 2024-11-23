import { ResourceResolver } from '@sphereon/ssi-sdk.resource-resolver'
import { createAgent, TAgent } from '@veramo/core'
import { ICryptoService } from '@sphereon/openid-federation-client'
import { IOIDFClient, OIDFClient } from '../../src'

import { mockResponses } from './TrustChainMockResponses'
import { IJwtService, JwtService } from '@sphereon/ssi-sdk-ext.jwt-service'

type ConfiguredAgent = TAgent<IOIDFClient & IJwtService>

const fetchService = {
  async fetchStatement(endpoint: string) {
    const match = mockResponses.find((item) => item[0] === endpoint)
    if (match) {
      return match[1]
    } else {
      throw new Error('Not found: ' + endpoint)
    }
  },
}

const cryptoService: ICryptoService = {
  verify: async (jwt: string, key: any): Promise<boolean> => {
    return true
  },
}

export default (testContext: { getAgent: () => ConfiguredAgent; setup: () => Promise<boolean>; tearDown: () => Promise<boolean> }): void => {
  describe('Credential Store Agent Plugin', (): void => {
    let agent: ConfiguredAgent

    beforeAll(async (): Promise<void> => {
      await testContext.setup()

      agent = createAgent({
        plugins: [
          new JwtService(),
          new OIDFClient({
            fetchServiceCallback: fetchService,
            cryptoServiceCallback: cryptoService,
          }),
          new ResourceResolver(),
        ],
      })
    })

    afterAll(testContext.tearDown)

    it('should build a trust chain 1', async () => {
      const trustChainResolveResponse = await agent.resolveTrustChain({
        entityIdentifier: 'https://spid.wbss.it/Spid/oidc/rp/ipasv_lt',
        trustAnchors: ['https://oidc.registry.servizicie.interno.gov.it'],
      })

      expect(trustChainResolveResponse.error).toBeFalsy()
      expect(trustChainResolveResponse.trustChain?.asJsReadonlyArrayView()).toHaveLength(4)
    })

    it('should build trust chain 2', async () => {
      const trustChainResolveResponse = await agent.resolveTrustChain({
        entityIdentifier: 'https://spid.wbss.it/Spid/oidc/sa',
        trustAnchors: ['https://oidc.registry.servizicie.interno.gov.it'],
      })

      expect(trustChainResolveResponse.error).toBeFalsy()
      expect(trustChainResolveResponse.trustChain?.asJsReadonlyArrayView()).toHaveLength(3)
    })
  })
}
