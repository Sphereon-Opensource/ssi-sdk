import {
  AuthorizationRequestState,
  AuthorizationResponsePayload,
  AuthorizationResponseState,
  decodeUriAsJson,
  VerifiedAuthorizationResponse,
} from '@sphereon/did-auth-siop'
import { AuthorizationResponseStateStatus } from '@sphereon/did-auth-siop'
import { getAgentResolver } from '@sphereon/ssi-sdk-ext.did-utils'
import { AdditionalClaims, CredentialMapper, Hasher, ICredentialSubject, IVerifiableCredential } from '@sphereon/ssi-types'
import { OriginalVerifiablePresentation } from '@sphereon/ssi-types/dist'
import { IAgentPlugin } from '@veramo/core'
import {
  AuthorizationResponseStateWithVerifiedData,
  IAuthorizationRequestPayloads,
  ICreateAuthRequestArgs,
  IGetAuthRequestStateArgs,
  IGetAuthResponseStateArgs,
  ImportDefinitionsArgs,
  IPEXInstanceOptions,
  IRequiredContext,
  IRPDefaultOpts,
  IRPOptions,
  ISiopRPInstanceArgs,
  ISiopv2RPOpts,
  IUpdateRequestStateArgs,
  IVerifyAuthResponseStateArgs,
  schema,
  VerifiedDataMode,
} from '../index'
import { RPInstance } from '../RPInstance'

import { ISIOPv2RP } from '../types/ISIOPv2RP'
import { createHash } from 'crypto'

export class SIOPv2RP implements IAgentPlugin {
  private readonly opts: ISiopv2RPOpts
  private static readonly _DEFAULT_OPTS_KEY = '_default'
  private readonly instances: Map<string, RPInstance> = new Map()
  readonly schema = schema.IDidAuthSiopOpAuthenticator

  readonly methods: ISIOPv2RP = {
    siopCreateAuthRequestURI: this.createAuthorizationRequestURI.bind(this),
    siopCreateAuthRequestPayloads: this.createAuthorizationRequestPayloads.bind(this),
    siopGetAuthRequestState: this.siopGetRequestState.bind(this),
    siopGetAuthResponseState: this.siopGetResponseState.bind(this),
    siopUpdateAuthRequestState: this.siopUpdateRequestState.bind(this),
    siopDeleteAuthState: this.siopDeleteState.bind(this),
    siopVerifyAuthResponse: this.siopVerifyAuthResponse.bind(this),
    siopImportDefinitions: this.siopImportDefinitions.bind(this),
  }

  constructor(opts: ISiopv2RPOpts) {
    this.opts = opts
  }

  public setDefaultOpts(rpDefaultOpts: IRPDefaultOpts, context: IRequiredContext) {
    // We allow setting default options later, because in some cases you might want to query the agent for defaults. This cannot happen when the agent is being build (this is when the constructor is being called)
    this.opts.defaultOpts = rpDefaultOpts
    // We however do require the agent to be responsible for resolution, otherwise people might encounter strange errors, that are very hard to track down
    if (
      !this.opts.defaultOpts.identifierOpts.resolveOpts?.resolver ||
      typeof this.opts.defaultOpts.identifierOpts.resolveOpts.resolver.resolve !== 'function'
    ) {
      this.opts.defaultOpts.identifierOpts.resolveOpts = {
        ...this.opts.defaultOpts.identifierOpts.resolveOpts,
        resolver: getAgentResolver(context, { uniresolverResolution: true, resolverResolution: true, localResolution: true }),
      }
    }
  }

  private async createAuthorizationRequestURI(createArgs: ICreateAuthRequestArgs, context: IRequiredContext): Promise<string> {
    return await this.getRPInstance({ definitionId: createArgs.definitionId }, context)
      .then((rp) => rp.createAuthorizationRequestURI(createArgs, context))
      .then((URI) => URI.encodedUri)
  }

  private async createAuthorizationRequestPayloads(
    createArgs: ICreateAuthRequestArgs,
    context: IRequiredContext,
  ): Promise<IAuthorizationRequestPayloads> {
    return await this.getRPInstance({ definitionId: createArgs.definitionId }, context)
      .then((rp) => rp.createAuthorizationRequest(createArgs, context))
      .then(async (request) => {
        const authRequest: IAuthorizationRequestPayloads = {
          authorizationRequest: request.payload,
          requestObject: await request.requestObjectJwt(),
          requestObjectDecoded: await request.requestObject?.getPayload(),
        }
        return authRequest
      })
  }

  private async siopGetRequestState(args: IGetAuthRequestStateArgs, context: IRequiredContext): Promise<AuthorizationRequestState | undefined> {
    return await this.getRPInstance({ definitionId: args.definitionId }, context).then((rp) =>
      rp.get(context).then((rp) => rp.sessionManager.getRequestStateByCorrelationId(args.correlationId, args.errorOnNotFound)),
    )
  }

  private async siopGetResponseState(
    args: IGetAuthResponseStateArgs,
    context: IRequiredContext,
  ): Promise<AuthorizationResponseStateWithVerifiedData | undefined> {
    const rpInstance: RPInstance = await this.getRPInstance({ definitionId: args.definitionId }, context)
    const authorizationResponseState: AuthorizationResponseState | undefined = await rpInstance
      .get(context)
      .then((rp) => rp.sessionManager.getResponseStateByCorrelationId(args.correlationId, args.errorOnNotFound))
    if (authorizationResponseState === undefined) {
      return undefined
    }

    const responseState = authorizationResponseState as AuthorizationResponseStateWithVerifiedData
    if (
      responseState.status === AuthorizationResponseStateStatus.VERIFIED &&
      args.includeVerifiedData &&
      args.includeVerifiedData !== VerifiedDataMode.NONE
    ) {
      let hasher: Hasher | undefined
      if (
        CredentialMapper.isSdJwtEncoded(responseState.response.payload.vp_token as OriginalVerifiablePresentation) &&
        (!rpInstance.rpOptions.credentialOpts?.hasher || typeof rpInstance.rpOptions.credentialOpts?.hasher !== 'function')
      ) {
        hasher = (data, algorithm) => createHash(algorithm).update(data).digest()
      }
      // todo this should also include mdl-mdoc
      const presentationDecoded = CredentialMapper.decodeVerifiablePresentation(
        responseState.response.payload.vp_token as OriginalVerifiablePresentation,
        //todo: later we want to conditionally pass in options for mdl-mdoc here
        hasher,
      )
      const presentation = CredentialMapper.toUniformPresentation(presentationDecoded as OriginalVerifiablePresentation)
      switch (args.includeVerifiedData) {
        case VerifiedDataMode.VERIFIED_PRESENTATION:
          responseState.response.payload.verifiedData = presentation
          break
        case VerifiedDataMode.CREDENTIAL_SUBJECT_FLATTENED:
          const allClaims: AdditionalClaims = {}
          presentation.verifiableCredential?.forEach((credential) => {
            const vc = credential as IVerifiableCredential
            const credentialSubject = vc.credentialSubject as ICredentialSubject & AdditionalClaims
            if (!('id' in allClaims)) {
              allClaims['id'] = credentialSubject.id
            }

            Object.entries(credentialSubject).forEach(([key, value]) => {
              if (!(key in allClaims)) {
                allClaims[key] = value
              }
            })
          })
          responseState.verifiedData = allClaims
      }
    }
    return responseState
  }

  private async siopUpdateRequestState(args: IUpdateRequestStateArgs, context: IRequiredContext): Promise<AuthorizationRequestState> {
    if (args.state !== 'sent') {
      throw Error(`Only 'sent' status is supported for this method at this point`)
    }
    return await this.getRPInstance({ definitionId: args.definitionId }, context)
      // todo: In the SIOP library we need to update the signal method to be more like this method
      .then((rp) =>
        rp.get(context).then(async (rp) => {
          await rp.signalAuthRequestRetrieved({
            correlationId: args.correlationId,
            error: args.error ? new Error(args.error) : undefined,
          })
          return (await rp.sessionManager.getRequestStateByCorrelationId(args.correlationId, true)) as AuthorizationRequestState
        }),
      )
  }

  private async siopDeleteState(args: IGetAuthResponseStateArgs, context: IRequiredContext): Promise<boolean> {
    return await this.getRPInstance({ definitionId: args.definitionId }, context)
      .then((rp) => rp.get(context).then((rp) => rp.sessionManager.deleteStateForCorrelationId(args.correlationId)))
      .then(() => true)
  }

  private async siopVerifyAuthResponse(args: IVerifyAuthResponseStateArgs, context: IRequiredContext): Promise<VerifiedAuthorizationResponse> {
    if (!args.authorizationResponse) {
      throw Error('No SIOPv2 Authorization Response received')
    }
    const authResponse =
      typeof args.authorizationResponse === 'string'
        ? (decodeUriAsJson(args.authorizationResponse) as AuthorizationResponsePayload)
        : args.authorizationResponse
    return await this.getRPInstance({ definitionId: args.definitionId }, context).then((rp) =>
      rp.get(context).then((rp) =>
        rp.verifyAuthorizationResponse(authResponse, {
          correlationId: args.correlationId,
          presentationDefinitions: args.presentationDefinitions,
          audience: args.audience,
        }),
      ),
    )
  }

  private async siopImportDefinitions(args: ImportDefinitionsArgs, context: IRequiredContext): Promise<void> {
    const { definitions, tenantId, version, versionControlMode } = args
    await Promise.all(
      definitions.map(async (definition) => {
        await context.agent.pexValidateDefinition({ definition: definition })

        console.log(`persisting definition ${definition.id} / ${definition.name} with versionControlMode ${versionControlMode}`)
        return context.agent.pdmPersistDefinition({
          definitionItem: {
            tenantId: tenantId,
            version: version,
            definitionPayload: definition,
          },
          opts: { versionControlMode: versionControlMode },
        })
      }),
    )
  }

  async getRPInstance(args: ISiopRPInstanceArgs, context: IRequiredContext): Promise<RPInstance> {
    const definitionId = args.definitionId
    const instanceId = definitionId ?? SIOPv2RP._DEFAULT_OPTS_KEY
    if (!this.instances.has(instanceId)) {
      const instanceOpts = this.getInstanceOpts(definitionId)
      const rpOpts = await this.getRPOptions(context, { definitionId })
      if (!rpOpts.identifierOpts.resolveOpts?.resolver || typeof rpOpts.identifierOpts.resolveOpts.resolver.resolve !== 'function') {
        if (!rpOpts.identifierOpts?.resolveOpts) {
          rpOpts.identifierOpts = { ...rpOpts.identifierOpts }
          rpOpts.identifierOpts.resolveOpts = { ...rpOpts.identifierOpts.resolveOpts }
        }
        console.log('Using agent DID resolver for RP instance with definition id ' + args.definitionId)
        rpOpts.identifierOpts.resolveOpts.resolver = getAgentResolver(context, {
          uniresolverResolution: true,
          localResolution: true,
          resolverResolution: true,
        })
      }
      this.instances.set(instanceId, new RPInstance({ rpOpts, pexOpts: instanceOpts }))
    }
    return this.instances.get(instanceId)!
  }

  async getRPOptions(context: IRequiredContext, opts: { definitionId?: string }): Promise<IRPOptions> {
    const definitionId = opts.definitionId
    const options = this.getInstanceOpts(definitionId)?.rpOpts ?? this.opts.defaultOpts
    if (!options) {
      throw Error(`Could not get specific nor default options for definition ${definitionId}`)
    }
    if (this.opts.defaultOpts) {
      if (!options.identifierOpts) {
        options.identifierOpts = this.opts.defaultOpts?.identifierOpts
      } else {
        if (!options.identifierOpts.idOpts) {
          options.identifierOpts.idOpts = this.opts.defaultOpts.identifierOpts.idOpts
        }
        if (!options.identifierOpts.supportedDIDMethods) {
          options.identifierOpts.supportedDIDMethods = this.opts.defaultOpts.identifierOpts.supportedDIDMethods
        }
        if (!options.supportedVersions) {
          options.supportedVersions = this.opts.defaultOpts.supportedVersions
        }
      }
      if (!options.identifierOpts.resolveOpts || typeof options.identifierOpts.resolveOpts.resolver?.resolve !== 'function') {
        options.identifierOpts.resolveOpts = {
          ...this.opts.defaultOpts.identifierOpts.resolveOpts,
          resolver:
            this.opts.defaultOpts.identifierOpts?.resolveOpts?.resolver ??
            getAgentResolver(context, { localResolution: true, resolverResolution: true, uniresolverResolution: true }),
        }
      }
    }

    return options
  }

  getInstanceOpts(definitionId?: string): IPEXInstanceOptions | undefined {
    if (!this.opts.instanceOpts) return undefined

    const instanceOpt = definitionId ? this.opts.instanceOpts.find((i) => i.definitionId === definitionId) : undefined

    return instanceOpt ?? this.getDefaultOptions(definitionId)
  }

  private getDefaultOptions(definitionId: string | undefined) {
    if (!this.opts.instanceOpts) return undefined

    const defaultOptions = this.opts.instanceOpts.find((i) => i.definitionId === 'default')
    if (defaultOptions) {
      const clonedOptions = { ...defaultOptions }
      if (definitionId !== undefined) {
        clonedOptions.definitionId = definitionId
      }
      return clonedOptions
    }

    return undefined
  }
}
