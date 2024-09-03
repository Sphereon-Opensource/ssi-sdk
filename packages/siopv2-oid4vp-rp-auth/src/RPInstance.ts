import { AuthorizationRequest, RP, URI } from '@sphereon/did-auth-siop'
import { ICreateAuthRequestArgs, IPEXOptions, IRequiredContext, IRPOptions } from './types/ISIOPv2RP'
import { IPresentationDefinition } from '@sphereon/pex'
import { createRPBuilder, getRequestVersion, getSigningAlgo } from './functions'
import { v4 as uuidv4 } from 'uuid'
import { JwtIssuer } from '@sphereon/oid4vc-common'
import {
  ensureManagedIdentifierResult,
  isManagedIdentifierDidResult,
  isManagedIdentifierX5cResult,
} from '@sphereon/ssi-sdk-ext.identifier-resolution'

export class RPInstance {
  private _rp: RP | undefined
  private readonly _pexOptions: IPEXOptions | undefined
  private readonly _rpOptions: IRPOptions

  public constructor({ rpOpts, pexOpts }: { rpOpts: IRPOptions; pexOpts?: IPEXOptions }) {
    this._rpOptions = rpOpts
    this._pexOptions = pexOpts
  }

  public async get(context: IRequiredContext): Promise<RP> {
    if (!this._rp) {
      const builder = await createRPBuilder({
        rpOpts: this._rpOptions,
        pexOpts: this._pexOptions,
        context,
      })
      this._rp = builder.build()
    }
    return this._rp!
  }

  get rpOptions() {
    return this._rpOptions
  }

  get pexOptions() {
    return this._pexOptions
  }

  public hasDefinition(): boolean {
    return this.definitionId !== undefined
  }

  get definitionId(): string | undefined {
    return this.pexOptions?.definitionId
  }

  public async getPresentationDefinition(context: IRequiredContext): Promise<IPresentationDefinition | undefined> {
    return this.definitionId
      ? await context.agent.pexStoreGetDefinition({
          definitionId: this.definitionId,
          tenantId: this.pexOptions?.tenantId,
        })
      : undefined
  }

  public async createAuthorizationRequestURI(createArgs: Omit<ICreateAuthRequestArgs, 'definitionId'>, context: IRequiredContext): Promise<URI> {
    const { correlationId, claims, requestByReferenceURI, responseURI, responseURIType } = createArgs
    const nonce = createArgs.nonce ?? uuidv4()
    const state = createArgs.state ?? correlationId
    let jwtIssuer: JwtIssuer
    const idOpts = this.rpOptions.identifierOpts.idOpts
    const resolution = await ensureManagedIdentifierResult(idOpts, context)
    if (isManagedIdentifierDidResult(resolution)) {
      jwtIssuer = { didUrl: resolution.identifier.did, method: 'did', alg: getSigningAlgo(resolution.key.type) }
    } else if (isManagedIdentifierX5cResult(resolution)) {
      if (!resolution.issuer) {
        return Promise.reject('missing issuer in idOpts')
      }
      jwtIssuer = {
        issuer: resolution.issuer,
        x5c: resolution.x5c,
        method: 'x5c',
        alg: getSigningAlgo(resolution.key.type),
      }
    } else {
      return Promise.reject(Error(`JWT issuer method ${resolution.method} not yet supported`))
    }

    return await this.get(context).then((rp) =>
      rp.createAuthorizationRequestURI({
        version: getRequestVersion(this.rpOptions),

        correlationId,
        nonce,
        state,
        claims,
        requestByReferenceURI,
        responseURI,
        responseURIType,
        jwtIssuer,
      }),
    )
  }

  public async createAuthorizationRequest(
    createArgs: Omit<ICreateAuthRequestArgs, 'definitionId'>,
    context: IRequiredContext,
  ): Promise<AuthorizationRequest> {
    const { correlationId, claims, requestByReferenceURI, responseURI, responseURIType } = createArgs
    const nonce = createArgs.nonce ?? uuidv4()
    const state = createArgs.state ?? correlationId
    const idOpts = this.rpOptions.identifierOpts.idOpts
    const resolution = await ensureManagedIdentifierResult(idOpts, context)

    let jwtIssuer: JwtIssuer
    if (isManagedIdentifierX5cResult(resolution) && resolution.issuer) {
      jwtIssuer = {
        method: resolution.method,
        alg: getSigningAlgo(resolution.key.type),
        x5c: resolution.x5c,
        issuer: resolution.issuer,
      }
    } else if (isManagedIdentifierDidResult(resolution)) {
      jwtIssuer = {
        method: resolution.method,
        alg: getSigningAlgo(resolution.key.type),
        didUrl: resolution.did,
      }
    } else {
      return Promise.reject(Error('Only did & x5c supported at present'))
    }

    return await this.get(context).then((rp) =>
      rp.createAuthorizationRequest({
        version: getRequestVersion(this.rpOptions),
        correlationId,
        nonce,
        state,
        claims,
        requestByReferenceURI,
        responseURIType,
        responseURI,
        jwtIssuer,
      }),
    )
  }
}
