import {
  PresentationDefinitionWithLocation,
  PresentationExchangeResponseOpts,
  URI,
  Verification,
  // VerificationMode,
  VerifiedAuthorizationRequest,
} from '@sphereon/did-auth-siop'
import { PresentationVerificationResult } from '@sphereon/did-auth-siop'
import { getAgentDIDMethods, getAgentResolver } from '@sphereon/ssi-sdk-ext.did-utils'
import { CompactSdJwtVc, W3CVerifiablePresentation, CredentialMapper, PresentationSubmission, parseDid } from '@sphereon/ssi-types'
import { IIdentifier, IVerifyResult, TKeyType } from '@veramo/core'
import Debug from 'debug'
import { IOPOptions, IOpSessionArgs, IOpSessionGetOID4VPArgs, IOpsSendSiopAuthorizationResponseArgs, IRequiredContext } from '../types'
import { createOP } from './functions'
import { OID4VP } from './OID4VP'
import { ResolveOpts } from '@sphereon/did-auth-siop-adapter'

const debug = Debug(`sphereon:sdk:siop:op-session`)

export class OpSession {
  public readonly ts = new Date().getDate()
  public readonly id: string
  public readonly options: IOPOptions
  public readonly context: IRequiredContext
  private readonly requestJwtOrUri: string | URI
  private verifiedAuthorizationRequest?: VerifiedAuthorizationRequest | undefined
  private _nonce?: string
  private _state?: string
  private readonly _providedPresentationDefinitions?: PresentationDefinitionWithLocation[]

  private constructor(options: Required<IOpSessionArgs>) {
    this.id = options.sessionId
    this.options = options.op
    this.context = options.context
    this.requestJwtOrUri = options.requestJwtOrUri
    this._providedPresentationDefinitions = options.providedPresentationDefinitions
  }

  public static async init(options: Required<IOpSessionArgs>): Promise<OpSession> {
    return new OpSession(options)
  }

  public async getAuthorizationRequest(): Promise<VerifiedAuthorizationRequest> {
    if (!this.verifiedAuthorizationRequest) {
      const op = await createOP({ opOptions: this.options, context: this.context })
      this.verifiedAuthorizationRequest = await op.verifyAuthorizationRequest(this.requestJwtOrUri)
      this._nonce = await this.verifiedAuthorizationRequest.authorizationRequest.getMergedProperty('nonce')
      this._state = await this.verifiedAuthorizationRequest.authorizationRequest.getMergedProperty('state')
      // only used to ensure that we have DID methods supported
      await this.getSupportedDIDMethods()
    }
    return this.verifiedAuthorizationRequest
  }

  public async getAuthorizationRequestURI(): Promise<URI> {
    return await URI.fromAuthorizationRequest((await this.getAuthorizationRequest()).authorizationRequest)
  }

  get nonce() {
    if (!this._nonce) {
      throw Error('No nonce available. Please get authorization request first')
    }
    return this._nonce
  }

  get state() {
    if (!this._state) {
      throw Error('No state available. Please get authorization request first')
    }
    return this._state
  }

  public clear(): OpSession {
    this._nonce = undefined
    this._state = undefined
    this.verifiedAuthorizationRequest = undefined
    return this
  }

  public async getSupportedDIDMethods(didPrefix?: boolean) {
    const agentMethods = this.getAgentDIDMethodsSupported({ didPrefix })
    let rpMethods = await this.getRPDIDMethodsSupported({ didPrefix, agentMethods })

    let intersection: string[]
    if (rpMethods.dids.length === 0 || rpMethods.dids.includes('did')) {
      intersection =
        agentMethods && agentMethods.length > 0
          ? agentMethods
          : (await getAgentDIDMethods(this.context)).map((method) => convertDidMethod(method, didPrefix)) // fallback to the agent in case the agent methods are undefined
    } else if (!agentMethods || agentMethods.length === 0) {
      intersection = rpMethods.dids?.map((method) => convertDidMethod(method, didPrefix))
    } else {
      intersection = agentMethods.filter((value) => rpMethods.dids.includes(value))
    }
    if (intersection.length === 0) {
      throw Error('No matching DID methods between agent and relying party')
    }
    return intersection.map((value) => convertDidMethod(value, didPrefix))
  }

  private getAgentDIDMethodsSupported(opts: { didPrefix?: boolean }) {
    const agentMethods = this.options.supportedDIDMethods?.map((method) => convertDidMethod(method, opts.didPrefix))
    debug(`agent methods: ${JSON.stringify(agentMethods)}`)
    return agentMethods
  }

  private async getRPDIDMethodsSupported(opts: { didPrefix?: boolean; agentMethods?: string[] }) {
    let keyType: TKeyType | undefined
    const agentMethods =
      (opts.agentMethods ?? this.getAgentDIDMethodsSupported(opts))?.map((method) => convertDidMethod(method, opts.didPrefix)) ?? []
    debug(`agent methods supported: ${JSON.stringify(agentMethods)}`)
    const authReq = await this.getAuthorizationRequest()
    const subjectSyntaxTypesSupported = authReq.registrationMetadataPayload?.subject_syntax_types_supported?.map((method) =>
      convertDidMethod(method, opts.didPrefix),
    )
    debug(`subject syntax types supported in rp method supported: ${JSON.stringify(subjectSyntaxTypesSupported)}`)
    const aud = await authReq.authorizationRequest.getMergedProperty<string>('aud')
    let rpMethods: string[] = []
    if (aud && aud.startsWith('did:')) {
      const didMethod = convertDidMethod(parseDid(aud).method, opts.didPrefix)
      debug(`aud did method: ${didMethod}`)

      // The RP knows our DID, so we can use it to determine the supported DID methods
      // If the aud did:method is not in the supported types, there still is something wrong, unless the RP signals to support all did methods
      if (
        subjectSyntaxTypesSupported &&
        subjectSyntaxTypesSupported.length > 0 &&
        !subjectSyntaxTypesSupported.includes('did') &&
        !subjectSyntaxTypesSupported.includes(didMethod)
      ) {
        throw Error(`The aud DID method ${didMethod} is not in the supported types ${subjectSyntaxTypesSupported}`)
      }
      rpMethods = [didMethod]
    } else if (subjectSyntaxTypesSupported) {
      rpMethods = (Array.isArray(subjectSyntaxTypesSupported) ? subjectSyntaxTypesSupported : [subjectSyntaxTypesSupported]).map((method) =>
        convertDidMethod(method, opts.didPrefix),
      )
    }
    const isEBSI =
      rpMethods.length === 0 &&
      (authReq.issuer?.includes('.ebsi.eu') || (await authReq.authorizationRequest.getMergedProperty<string>('client_id'))?.includes('.ebsi.eu'))
    let codecName: string | undefined = undefined
    if (isEBSI && (!aud || !aud.startsWith('http'))) {
      debug(`EBSI detected, adding did:key to supported DID methods for RP`)
      const didKeyMethod = convertDidMethod('did:key', opts.didPrefix)
      if (!agentMethods?.includes(didKeyMethod)) {
        throw Error(`EBSI detected, but agent did not support did:key. Please reconfigure agent`)
      }
      rpMethods = [didKeyMethod]
      keyType = 'Secp256r1'
      codecName = 'jwk_jcs-pub'
    }
    return { dids: rpMethods, codecName, keyType }
  }

  public async getSupportedIdentifiers(opts?: { createInCaseNoDIDFound?: boolean }): Promise<IIdentifier[]> {
    // todo: we also need to check signature algo
    const methods = await this.getSupportedDIDMethods(true)
    debug(`supported DID methods (did: prefix = true): ${JSON.stringify(methods)}`)
    if (methods.length === 0) {
      throw Error(`No DID methods are supported`)
    }
    const identifiers: IIdentifier[] = await this.context.agent
      .didManagerFind()
      .then((ids: IIdentifier[]) => ids.filter((id) => methods.includes(id.provider)))
    if (identifiers.length === 0) {
      debug(`No identifiers available in agent supporting methods ${JSON.stringify(methods)}`)
      if (opts?.createInCaseNoDIDFound !== false) {
        const { codecName, keyType } = await this.getRPDIDMethodsSupported({
          didPrefix: true,
          agentMethods: methods,
        })
        const identifier = await this.context.agent.didManagerCreate({
          provider: methods[0],
          options: { codecName, keyType, type: keyType }, // both keyType and type, because not every did provider has the same param
        })
        debug(`Created a new identifier for the SIOP interaction: ${identifier.did}`)
        identifiers.push(identifier)
      }
    }
    debug(`supported identifiers: ${JSON.stringify(identifiers.map((id) => id.did))}`)
    return identifiers
  }

  public async getSupportedDIDs(): Promise<string[]> {
    return (await this.getSupportedIdentifiers()).map((id) => id.did)
  }

  public async getRedirectUri(): Promise<string> {
    return Promise.resolve(this.verifiedAuthorizationRequest!.responseURI!)
  }

  public async hasPresentationDefinitions(): Promise<boolean> {
    const defs = this._providedPresentationDefinitions ?? (await this.getAuthorizationRequest()).presentationDefinitions
    return defs !== undefined && defs.length > 0
  }

  public async getPresentationDefinitions(): Promise<Array<PresentationDefinitionWithLocation> | undefined> {
    if (!(await this.hasPresentationDefinitions())) {
      throw Error(`No presentation definitions found`)
    }
    return this._providedPresentationDefinitions ?? (await this.getAuthorizationRequest()).presentationDefinitions
  }

  public async getOID4VP(args: IOpSessionGetOID4VPArgs): Promise<OID4VP> {
    return await OID4VP.init(this, args.allIdentifiers ?? [], args.hasher)
  }

  private createPresentationVerificationCallback(context: IRequiredContext) {
    async function presentationVerificationCallback(
      args: W3CVerifiablePresentation | CompactSdJwtVc,
      presentationSubmission: PresentationSubmission,
    ): Promise<PresentationVerificationResult> {
      let result: IVerifyResult
      if (CredentialMapper.isSdJwtEncoded(args)) {
        try {
          const sdJwtResult = await context.agent.verifySdJwtPresentation({ presentation: args })
          result = {
            verified: 'header' in sdJwtResult,
            error: 'header' in sdJwtResult ? undefined : { message: 'could not verify SD JWT presentation' },
          }
        } catch (error: any) {
          result = {
            verified: false,
            error: { message: error.message },
          }
        }
      } else {
        // @ts-ignore
        result = await context.agent.verifyPresentation({ presentation: args })
      }
      return result
    }

    return presentationVerificationCallback
  }

  public async sendAuthorizationResponse(args: IOpsSendSiopAuthorizationResponseArgs): Promise<Response> {
    const resolveOpts: ResolveOpts = this.options.resolveOpts ?? {
      resolver: getAgentResolver(this.context, {
        uniresolverResolution: true,
        localResolution: true,
        resolverResolution: true,
      }),
    }
    if (!resolveOpts.subjectSyntaxTypesSupported || resolveOpts.subjectSyntaxTypesSupported.length === 0) {
      resolveOpts.subjectSyntaxTypesSupported = await this.getSupportedDIDMethods(true)
    }
    //todo: populate with the right verification params. In did-auth-siop we don't have any test that actually passes this parameter
    const verification: Verification = {
      presentationVerificationCallback: this.createPresentationVerificationCallback(this.context),
      // mode: VerificationMode.INTERNAL,
      // checkLinkedDomain: CheckLinkedDomain.IF_PRESENT,
      // resolveOpts,
    }
    const request = await this.getAuthorizationRequest()
    const hasDefinitions = await this.hasPresentationDefinitions()
    if (hasDefinitions) {
      if (
        !request.presentationDefinitions ||
        !args.verifiablePresentations ||
        args.verifiablePresentations.length !== request.presentationDefinitions.length
      ) {
        throw Error(
          `Amount of presentations ${args.verifiablePresentations?.length}, doesn't match expected ${request.presentationDefinitions?.length}`,
        )
      } else if (!args.presentationSubmission) {
        throw Error(`Presentation submission is required when verifiable presentations are required`)
      }
    }

    const verifiablePresentations = args.verifiablePresentations
      ? args.verifiablePresentations.map((vp) => CredentialMapper.storedPresentationToOriginalFormat(vp))
      : []
    const op = await createOP({
      opOptions: {
        ...this.options,
        resolveOpts: { ...this.options.resolveOpts },
        eventEmitter: this.options.eventEmitter,
        presentationSignCallback: this.options.presentationSignCallback,
        wellknownDIDVerifyCallback: this.options.wellknownDIDVerifyCallback,
        supportedVersions: request.versions,
      },
      idOpts: args.responseSignerOpts,
      context: this.context,
    })

    //TODO change this to use the new functionalities by identifier-resolver and get the jwkIssuer for the responseOpts
    let issuer = args.responseSignerOpts.issuer
    const responseOpts = {
      verification,
      issuer,
      ...(args.verifiablePresentations && {
        presentationExchange: {
          verifiablePresentations,
          presentationSubmission: args.presentationSubmission,
        } as PresentationExchangeResponseOpts,
      }),
    }

    const authResponse = await op.createAuthorizationResponse(request, responseOpts)
    const response = await op.submitAuthorizationResponse(authResponse)

    if (response.status >= 400) {
      throw Error(`Error ${response.status}: ${response.statusText || (await response.text())}`)
    } else {
      return response
    }
  }
}

function convertDidMethod(didMethod: string, didPrefix?: boolean): string {
  if (didPrefix === false) {
    return didMethod.startsWith('did:') ? didMethod.toLowerCase().replace('did:', '') : didMethod.toLowerCase()
  }
  return didMethod.startsWith('did:') ? didMethod.toLowerCase() : `did:${didMethod.toLowerCase().replace('did:', '')}`
}
