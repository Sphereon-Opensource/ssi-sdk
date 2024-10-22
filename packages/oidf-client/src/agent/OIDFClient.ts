import {IAgentPlugin} from "@veramo/core";
import {
    CreateJwsCompactArgs,
    IJwsValidationResult,
    JwsCompactResult,
    VerifyJwsArgs,
} from '@sphereon/ssi-sdk-ext.jwt-service'
import {
    IOIDFClient,
    OIDFClientArgs,
    RequiredContext,
    ResolveTrustChainArgs,
    ResolveTrustChainCallbackResult
} from "../types/IOIDFClient";
import * as jose from 'jose'
import {
    com
} from "../../../../../OpenID-Federation/build/js/packages/openid-federation-modules-openid-federation-client";
import {schema} from "../index";
import FederationClient = com.sphereon.oid.fed.client.FederationClient;
import {JWK, JWTVerifyOptions} from "jose";

export const oidfClientMethods: Array<string> = [
    'resolveTrustChain',
    'signJwt',
    'verifyJwt'
]

export class OIDFClient implements IAgentPlugin {
    readonly oidfClient: FederationClient
    readonly schema = schema.IOIDFClient

    constructor(args?: OIDFClientArgs) {
        const { cryptoServiceCallback } = { ...args }
        if (cryptoServiceCallback) {
            this.oidfClient = new FederationClient(null, cryptoServiceCallback)
        } else {
            // FIXME pass in the verification function of the JWSService,
            this.oidfClient = new FederationClient(
                null, {
                    q3t: async (jwt: string, key: any): Promise<boolean> => {
                        // FIXME For some reason the keys is the key object are messed up
                        const jwk: JWK = {
                            kty: key.e3s_1,
                            kid: key.f3s_1,
                            crv: key.g3s_1,
                            x: key.h3s_1,
                            y: key.i3s_1,
                            n: key.j3s_1,
                            e: key.k3s_1,
                            alg: key.l3s_1,
                            use: key.m3s_1,
                            x5u: key.n3s_1,
                            x5c: key.o3s_1,
                            x5t: key.p3s_1,
                            'x5t#S256': key.q3s_1,
                        }

                        const publicKey = await jose.importJWK(jwk)

                        const now = new Date()
                        const past = now.setDate(now.getDate() - 60)

                        const options: JWTVerifyOptions = {
                            currentDate: new Date(past)
                        }

                        const result = await jose.jwtVerify(jwt, publicKey, options)
                        return result !== undefined
                    }
            })
        }
    }

    readonly methods: IOIDFClient = {
        resolveTrustChain: this.resolveTrustChain.bind(this),
        signJwt: this.signJwt.bind(this),
        verifyJwt: this.verifyJwt.bind(this)
    }

    private async resolveTrustChain(args: ResolveTrustChainArgs): Promise<ResolveTrustChainCallbackResult> {
        const { entityIdentifier, trustAnchors } = args
        return await this.oidfClient.resolveTrustChain(entityIdentifier, trustAnchors)
    }

    private async signJwt(args: CreateJwsCompactArgs, context: RequiredContext): Promise<JwsCompactResult> {
        return await context.agent.jwtCreateJwsCompactSignature(args)
    }

    private async verifyJwt(args: VerifyJwsArgs, context: RequiredContext): Promise<IJwsValidationResult> {
        return await context.agent.jwtVerifyJwsSignature(args)
    }
}
