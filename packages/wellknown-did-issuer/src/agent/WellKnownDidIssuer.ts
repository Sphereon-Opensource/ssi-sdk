import { CredentialCorrelationType, CredentialRole, DigitalCredential } from '@sphereon/ssi-sdk.credential-store'
import { CredentialMapper, parseDid } from '@sphereon/ssi-types'
import {
  DomainLinkageCredential,
  IDidConfigurationResource,
  IssuanceCallback,
  ServiceTypesEnum,
  WellKnownDidIssuer as Issuer,
} from '@sphereon/wellknown-dids-client'
import { IAgentPlugin, IIdentifier, VerifiableCredential } from '@veramo/core'
import { OrPromise } from '@veramo/utils'
import { normalizeCredential } from 'did-jwt-vc'
import { Service } from 'did-resolver/lib/resolver'
import { Connection } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { createCredentialEntity, DidConfigurationResourceEntity, didConfigurationResourceFrom } from '../entities/DidConfigurationResourceEntity'
import { schema } from '../index'
import {
  IAddLinkedDomainsServiceArgs,
  IGetDidConfigurationResourceArgs,
  IIssueDidConfigurationResourceArgs,
  IIssueDomainLinkageCredentialArgs,
  IRegisterIssueCredentialArgs,
  IRemoveCredentialIssuanceArgs,
  ISaveDidConfigurationResourceArgs,
  IWellKnownDidIssuer,
  IWellKnownDidIssuerOptionsArgs,
  RequiredContext,
} from '../types/IWellKnownDidIssuer'
import { RegulationType } from '@sphereon/ssi-sdk.data-store'

/**
 * {@inheritDoc IWellKnownDidIssuer}
 */
export class WellKnownDidIssuer implements IAgentPlugin {
  readonly schema = schema.IWellKnownDidVerifier
  readonly methods: IWellKnownDidIssuer = {
    addLinkedDomainsService: this.addLinkedDomainsService.bind(this),
    getDidConfigurationResource: this.getDidConfigurationResource.bind(this),
    issueDidConfigurationResource: this.issueDidConfigurationResource.bind(this),
    issueDomainLinkageCredential: this.issueDomainLinkageCredential.bind(this),
    registerCredentialIssuance: this.registerCredentialIssuance.bind(this),
    removeCredentialIssuance: this.removeCredentialIssuance.bind(this),
    saveDidConfigurationResource: this.saveDidConfigurationResource.bind(this),
  }

  private readonly credentialIssuances: Record<string, IssuanceCallback>
  private readonly didConfigurationResourceRelations = ['linkedDids']

  constructor(
    private dbConnection: OrPromise<Connection>,
    args?: IWellKnownDidIssuerOptionsArgs,
  ) {
    this.credentialIssuances = (args && args.credentialIssuances) || {}
  }

  /** {@inheritDoc IWellKnownDidIssuer.registerSignatureVerification} */
  private async registerCredentialIssuance(args: IRegisterIssueCredentialArgs, context: RequiredContext): Promise<void> {
    if (this.credentialIssuances[args.callbackName] !== undefined) {
      return Promise.reject(new Error(`Credential issuance with callbackName: ${args.callbackName} already present`))
    }

    this.credentialIssuances[args.callbackName] = args.credentialIssuance
  }

  /** {@inheritDoc IWellKnownDidIssuer.removeSignatureVerification} */
  private async removeCredentialIssuance(args: IRemoveCredentialIssuanceArgs, context: RequiredContext): Promise<boolean> {
    return delete this.credentialIssuances[args.callbackName]
  }

  /** {@inheritDoc IWellKnownDidIssuer.issueDidConfigurationResource} */
  private async issueDidConfigurationResource(
    args: IIssueDidConfigurationResourceArgs,
    context: RequiredContext,
  ): Promise<IDidConfigurationResource> {
    if (!args.issuances.every((issuance: IIssueDomainLinkageCredentialArgs) => issuance.origin === args.issuances[0].origin)) {
      return Promise.reject(Error('All verifiableCredentials should be issued for the same origin'))
    }

    // TODO We should combine all origins into one service when we update to Veramo 3.1.6.next-165 or higher, as then we can support multiple origins
    const addServices = args.issuances.map((issuance: IIssueDomainLinkageCredentialArgs) =>
      this.addLinkedDomainsService(
        {
          did: issuance.did,
          origin: issuance.origin,
          serviceId: issuance.serviceId,
        },
        context,
      ),
    )

    return Promise.all(addServices).then(async () =>
      new Issuer()
        .issueDidConfigurationResource({
          issuances: await this.mapIssuances(args.issuances),
          issueCallback:
            typeof args.credentialIssuance === 'string' ? await this.getCredentialIssuance(args.credentialIssuance) : args.credentialIssuance,
        })
        .then(async (didConfigurationResource: IDidConfigurationResource) => {
          if (args.save) {
            // TODO add support for multiple origins when we upgrade Veramo version
            await this.saveDidConfigurationResource({ origin: args.issuances[0].origin, didConfigurationResource }, context)
          }
          return didConfigurationResource
        })
        .catch((error: Error) => Promise.reject(Error(`Unable to issue DID configuration resource. Error: ${error.message}`))),
    )
  }

  /** {@inheritDoc IWellKnownDidIssuer.saveDidConfigurationResource} */
  public async saveDidConfigurationResource(args: ISaveDidConfigurationResourceArgs, context: RequiredContext): Promise<void> {
    const didConfigurationEntity = {
      origin: args.origin,
      context: args.didConfigurationResource['@context'],
      linkedDids: args.didConfigurationResource.linked_dids.map((credential: DomainLinkageCredential) =>
        createCredentialEntity(this.normalizeCredential(credential)),
      ),
    }

    await (await this.dbConnection).getRepository(DidConfigurationResourceEntity).save(didConfigurationEntity, { transaction: true })
  }

  /** {@inheritDoc IWellKnownDidIssuer.getDidConfigurationResource} */
  public async getDidConfigurationResource(args: IGetDidConfigurationResourceArgs, context: RequiredContext): Promise<IDidConfigurationResource> {
    const result = await (await this.dbConnection).getRepository(DidConfigurationResourceEntity).findOne({
      where: { origin: args.origin },
      relations: this.didConfigurationResourceRelations,
    })

    if (!result) {
      return Promise.reject(Error(`No DID configuration resource found for origin: ${args.origin}`))
    }

    return didConfigurationResourceFrom(result)
  }

  /** {@inheritDoc IWellKnownDidIssuer.issueDomainLinkageCredential} */
  public async issueDomainLinkageCredential(args: IIssueDomainLinkageCredentialArgs, context: RequiredContext): Promise<DomainLinkageCredential> {
    const did: string = parseDid(args.did).did

    if (new URL(args.origin).origin !== args.origin) {
      return Promise.reject(Error(`Origin ${args.origin} is not valid`))
    }

    if (new URL(args.origin).protocol !== 'https:') {
      return Promise.reject(Error(`Origin ${args.origin} is not a https URL`))
    }

    if (args.issuanceDate && isNaN(Date.parse(args.issuanceDate))) {
      return Promise.reject(Error(`IssuanceDate ${args.issuanceDate} is not a valid date`))
    }

    if (isNaN(Date.parse(args.expirationDate))) {
      return Promise.reject(Error(`ExpirationDate ${args.expirationDate} is not a valid date`))
    }

    const credentialIssuance: IssuanceCallback =
      typeof args.credentialIssuance === 'string'
        ? await this.getCredentialIssuance(args.credentialIssuance)
        : (args.credentialIssuance as IssuanceCallback)

    return new Issuer()
      .issueDomainLinkageCredential({
        did,
        origin: args.origin,
        issuanceDate: args.issuanceDate,
        expirationDate: args.expirationDate,
        options: args.options,
        issueCallback: credentialIssuance,
      })
      .then(async (credential: DomainLinkageCredential) => {
        if (args.save) {
          await this.saveDomainLinkageCredential(credential, context)
        }
        return credential
      })
      .catch((error: Error) => Promise.reject(Error(`Unable to issue domain linkage credential for DID: ${did}. Error: ${error.message}`)))
  }

  /** {@inheritDoc IWellKnownDidIssuer.addLinkedDomainsService} */
  public async addLinkedDomainsService(args: IAddLinkedDomainsServiceArgs, context: RequiredContext): Promise<void> {
    const did: string = parseDid(args.did).did

    if (new URL(args.origin).origin !== args.origin) {
      return Promise.reject(Error(`Origin ${args.origin} is not valid`))
    }

    if (new URL(args.origin).protocol !== 'https:') {
      return Promise.reject(Error(`Origin ${args.origin} is not a https URL`))
    }

    context.agent
      .didManagerGet({ did })
      .catch(() => Promise.reject(Error('DID cannot be found')))
      .then(async (identifier: IIdentifier) => {
        if (
          !identifier.services ||
          identifier.services.filter(
            // TODO we should also check for the origins in the serviceEndpoint objects when we start supporting multiple origins
            (service: Service) => service.type === ServiceTypesEnum.LINKED_DOMAINS && service.serviceEndpoint === args.origin,
          ).length === 0
        ) {
          await context.agent.didManagerAddService({
            did: identifier.did,
            service: {
              id: args.serviceId || uuidv4(),
              type: ServiceTypesEnum.LINKED_DOMAINS,
              // TODO We should support a serviceEndpoint object here when we update to Veramo 3.1.6.next-165 or higher, as then we can support multiple origins
              serviceEndpoint: args.origin,
            },
          })
        }
      })
      .catch((error: Error) => Promise.reject(Error(`Unable to add LinkedDomains service to DID: ${args.did}. Error: ${error.message}`)))
  }

  private async getCredentialIssuance(callbackName: string): Promise<IssuanceCallback> {
    if (this.credentialIssuances[callbackName] === undefined) {
      return Promise.reject(new Error(`Credential issuance not found for callbackName: ${callbackName}`))
    }

    return this.credentialIssuances[callbackName]
  }

  private async saveDomainLinkageCredential(credential: DomainLinkageCredential, context: RequiredContext): Promise<DigitalCredential> {
    const vc = this.normalizeCredential(credential)
    return context.agent.crsAddCredential({
      credential: {
        rawDocument: JSON.stringify(vc),
        credentialRole: CredentialRole.ISSUER,
        regulationType: RegulationType.NON_REGULATED, // FIXME funke
        kmsKeyRef: 'FIXME', // FIXME funke
        identifierMethod: 'did',
        issuerCorrelationId: CredentialMapper.issuerCorrelationIdFromIssuerType(vc.issuer),
        issuerCorrelationType: CredentialCorrelationType.DID,
        subjectCorrelationId: CredentialMapper.issuerCorrelationIdFromIssuerType(vc.issuer), // FIXME get separate did for subject
        subjectCorrelationType: CredentialCorrelationType.DID,
      },
    })
  }

  private normalizeCredential(credential: DomainLinkageCredential): VerifiableCredential {
    return typeof credential === 'string' ? normalizeCredential(credential) : credential
  }

  private async mapIssuances(issuances: Array<IIssueDomainLinkageCredentialArgs>): Promise<Array<IIssueDomainLinkageCredentialArgs>> {
    const promises = issuances.map(async (issuance: IIssueDomainLinkageCredentialArgs) => {
      return {
        ...issuance,
        issueCallback:
          typeof issuance.credentialIssuance === 'string'
            ? await this.getCredentialIssuance(issuance.credentialIssuance)
            : issuance.credentialIssuance,
      }
    })
    return Promise.all(promises)
  }
}
