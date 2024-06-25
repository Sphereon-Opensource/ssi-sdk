import {CredentialOfferClient, MetadataClient, OpenID4VCIClient} from '@sphereon/oid4vci-client'
import {
    AuthorizationRequestOpts,
    CredentialOfferRequestWithBaseUrl,
    DefaultURISchemes,
    EndpointMetadataResult,
    getTypesFromAuthorizationDetails,
    getTypesFromCredentialOffer,
    getTypesFromObject,
    Jwt,
    NotificationRequest,
    ProofOfPossessionCallbacks,
} from '@sphereon/oid4vci-common'
import {IIdentifierOpts} from '@sphereon/ssi-sdk-ext.did-utils'
import {
    CorrelationIdentifierType,
    CredentialRole,
    IBasicCredentialLocaleBranding,
    Identity,
    IdentityOrigin,
    NonPersistedIdentity,
    Party,
} from '@sphereon/ssi-sdk.data-store'
import {
    CredentialMapper,
    IVerifiableCredential,
    JwtDecodedVerifiableCredential,
    Loggers,
    OriginalVerifiableCredential,
    parseDid,
    SdJwtDecodedVerifiableCredentialPayload,
} from '@sphereon/ssi-types'
import {
    CredentialPayload,
    DIDDocument,
    IAgentPlugin,
    ProofFormat,
    VerifiableCredential,
    W3CVerifiableCredential
} from '@veramo/core'
import {asArray, computeEntryHash} from '@veramo/utils'
import {decodeJWT, JWTHeader} from 'did-jwt'
import {v4 as uuidv4} from 'uuid'
import {OID4VCIMachine} from '../machine/oid4vciMachine'
import {
    AddContactIdentityArgs,
    AssertValidCredentialsArgs,
    createCredentialsToSelectFromArgs,
    CredentialToAccept,
    CredentialToSelectFromResult,
    GetContactArgs,
    GetCredentialArgs,
    GetCredentialsArgs,
    GetIssuerMetadataArgs,
    IOID4VCIHolder,
    IRequiredSignAgentContext,
    IssuanceOpts,
    MappedCredentialToAccept,
    OID4VCIHolderEvent,
    OID4VCIHolderOptions,
    OID4VCIMachine as OID4VCIMachineId,
    OID4VCIMachineInstanceOpts,
    OnContactIdentityCreatedArgs,
    OnCredentialStoredArgs,
    OnIdentifierCreatedArgs,
    PrepareStartArgs,
    RequestType,
    RequiredContext,
    SendNotificationArgs,
    SignatureAlgorithmEnum,
    StartResult,
    StoreCredentialBrandingArgs,
    StoreCredentialsArgs,
    SupportedDidMethodEnum,
} from '../types/IOID4VCIHolder'
import {
    getCredentialBranding,
    getCredentialConfigsSupportedMerged,
    getIdentifier,
    getIssuanceOpts,
    mapCredentialToAccept,
    selectCredentialLocaleBranding,
    signatureAlgorithmFromKey,
    signJWT,
    verifyCredentialToAccept,
} from './OID4VCIHolderService'

/**
 * {@inheritDoc IOID4VCIHolder}
 */

// Exposing the methods here for any REST implementation
export const oid4vciHolderContextMethods: Array<string> = [
    'cmGetContacts',
    'cmGetContact',
    'cmAddContact',
    'cmAddIdentity',
    'ibCredentialLocaleBrandingFrom',
    'ibAddCredentialBranding',
    'dataStoreSaveVerifiableCredential',
    'didManagerFind',
    'didManagerGet',
    'keyManagerSign',
    'verifyCredential',
]

const logger = Loggers.DEFAULT.get('sphereon:oid4vci:holder')

export function signCallback(client: OpenID4VCIClient, idOpts: IIdentifierOpts, context: IRequiredSignAgentContext) {
    return (jwt: Jwt, kid?: string) => {
        let iss = jwt.payload.iss

        if (!kid) {
            kid = jwt.header.kid
        }
        if (!kid) {
            kid = idOpts.kid
        }
        if (kid) {
            // sync back to id opts
            idOpts.kid = kid
        }

        if (!jwt.payload.client_id?.startsWith('http') && client.isEBSI()) {
            iss = jwt.header.kid?.split('#')[0]
        } else if (!iss) {
            iss = jwt.header.kid?.split('#')[0]
        }
        if (!iss) {
            return Promise.reject(Error(`No issuer could be determined from the JWT ${JSON.stringify(jwt)}`))
        }
        const header = {...jwt.header, ...(kid && {kid})} as Partial<JWTHeader>
        const payload = {...jwt.payload, ...(iss && {iss})}
        return signJWT({
            idOpts,
            header,
            payload,
            options: {issuer: iss, expiresIn: jwt.payload.exp, canonicalize: false},
            context,
        })
    }
}

export class OID4VCIHolder implements IAgentPlugin {
    readonly eventTypes: Array<OID4VCIHolderEvent> = [
        OID4VCIHolderEvent.CONTACT_IDENTITY_CREATED,
        OID4VCIHolderEvent.CREDENTIAL_STORED,
        OID4VCIHolderEvent.IDENTIFIER_CREATED,
    ]

    readonly methods: IOID4VCIHolder = {
        oid4vciHolderStart: this.oid4vciHolderStart.bind(this),
        oid4vciHolderGetIssuerMetadata: this.oid4vciHolderGetIssuerMetadata.bind(this),
        oid4vciHolderGetMachineInterpreter: this.oid4vciHolderGetMachineInterpreter.bind(this),
        oid4vciHolderCreateCredentialsToSelectFrom: this.oid4vciHoldercreateCredentialsToSelectFrom.bind(this),
        oid4vciHolderGetContact: this.oid4vciHolderGetContact.bind(this),
        oid4vciHolderGetCredentials: this.oid4vciHolderGetCredentials.bind(this),
        oid4vciHolderGetCredential: this.oid4vciHolderGetCredential.bind(this),
        oid4vciHolderAddContactIdentity: this.oid4vciHolderAddContactIdentity.bind(this),
        oid4vciHolderAssertValidCredentials: this.oid4vciHolderAssertValidCredentials.bind(this),
        oid4vciHolderStoreCredentialBranding: this.oid4vciHolderStoreCredentialBranding.bind(this),
        oid4vciHolderStoreCredentials: this.oid4vciHolderStoreCredentials.bind(this),
        oid4vciHolderSendNotification: this.oid4vciHolderSendNotification.bind(this),
    }

    private readonly vcFormatPreferences: Array<string> = ['jwt_vc_json', 'jwt_vc', 'ldp_vc']
    private readonly jsonldCryptographicSuitePreferences: Array<string> = [
        'Ed25519Signature2018',
        'EcdsaSecp256k1Signature2019',
        'Ed25519Signature2020',
        'JsonWebSignature2020',
        // "JcsEd25519Signature2020"
    ]
    private readonly didMethodPreferences: Array<SupportedDidMethodEnum> = [
        SupportedDidMethodEnum.DID_KEY,
        SupportedDidMethodEnum.DID_JWK,
        SupportedDidMethodEnum.DID_EBSI,
        SupportedDidMethodEnum.DID_ION,
    ]
    private readonly jwtCryptographicSuitePreferences: Array<SignatureAlgorithmEnum> = [
        SignatureAlgorithmEnum.ES256,
        SignatureAlgorithmEnum.ES256K,
        SignatureAlgorithmEnum.EdDSA,
    ]
    private static readonly DEFAULT_MOBILE_REDIRECT_URI = `${DefaultURISchemes.CREDENTIAL_OFFER}://`
    private readonly defaultAuthorizationRequestOpts: AuthorizationRequestOpts = {redirectUri: OID4VCIHolder.DEFAULT_MOBILE_REDIRECT_URI}
    private readonly onContactIdentityCreated?: (args: OnContactIdentityCreatedArgs) => Promise<void>
    private readonly onCredentialStored?: (args: OnCredentialStoredArgs) => Promise<void>
    private readonly onIdentifierCreated?: (args: OnIdentifierCreatedArgs) => Promise<void>

    constructor(options?: OID4VCIHolderOptions) {
        const {
            onContactIdentityCreated,
            onCredentialStored,
            onIdentifierCreated,
            vcFormatPreferences,
            jsonldCryptographicSuitePreferences,
            didMethodPreferences,
            jwtCryptographicSuitePreferences,
            defaultAuthorizationRequestOptions,
        } = options ?? {}

        if (vcFormatPreferences !== undefined && vcFormatPreferences.length > 0) {
            this.vcFormatPreferences = vcFormatPreferences
        }
        if (jsonldCryptographicSuitePreferences !== undefined && jsonldCryptographicSuitePreferences.length > 0) {
            this.jsonldCryptographicSuitePreferences = jsonldCryptographicSuitePreferences
        }
        if (didMethodPreferences !== undefined && didMethodPreferences.length > 0) {
            this.didMethodPreferences = didMethodPreferences
        }
        if (jwtCryptographicSuitePreferences !== undefined && jwtCryptographicSuitePreferences.length > 0) {
            this.jwtCryptographicSuitePreferences = jwtCryptographicSuitePreferences
        }
        if (defaultAuthorizationRequestOptions) {
            this.defaultAuthorizationRequestOpts = defaultAuthorizationRequestOptions
        }
        this.onContactIdentityCreated = onContactIdentityCreated
        this.onCredentialStored = onCredentialStored
        this.onIdentifierCreated = onIdentifierCreated
    }

    public async onEvent(event: any, context: RequiredContext): Promise<void> {
        switch (event.type) {
            case OID4VCIHolderEvent.CONTACT_IDENTITY_CREATED:
                this.onContactIdentityCreated?.(event.data)
                break
            case OID4VCIHolderEvent.CREDENTIAL_STORED:
                this.onCredentialStored?.(event.data)
                break
            case OID4VCIHolderEvent.IDENTIFIER_CREATED:
                this.onIdentifierCreated?.(event.data)
                break
            default:
                return Promise.reject(Error(`Event type ${event.type} not supported`))
        }
    }

    /**
     * FIXME: This method can only be used locally. Creating the interpreter should be local to where the agent is running
     */
    private async oid4vciHolderGetMachineInterpreter(args: OID4VCIMachineInstanceOpts, context: RequiredContext): Promise<OID4VCIMachineId> {
        const authorizationRequestOpts = {...this.defaultAuthorizationRequestOpts, ...args.authorizationRequestOpts}
        const services = {
            start: (args: PrepareStartArgs) =>
                this.oid4vciHolderStart(
                    {
                        ...args,
                        authorizationRequestOpts,
                    },
                    context,
                ),
            createCredentialsToSelectFrom: (args: createCredentialsToSelectFromArgs) => this.oid4vciHoldercreateCredentialsToSelectFrom(args, context),
            getContact: (args: GetContactArgs) => this.oid4vciHolderGetContact(args, context),
            getCredentials: (args: GetCredentialsArgs) => this.oid4vciHolderGetCredentials(args, context),
            addContactIdentity: (args: AddContactIdentityArgs) => this.oid4vciHolderAddContactIdentity(args, context),
            assertValidCredentials: (args: AssertValidCredentialsArgs) => this.oid4vciHolderAssertValidCredentials(args, context),
            storeCredentialBranding: (args: StoreCredentialBrandingArgs) => this.oid4vciHolderStoreCredentialBranding(args, context),
            storeCredentials: (args: StoreCredentialsArgs) => this.oid4vciHolderStoreCredentials(args, context),
            sendNotification: (args: SendNotificationArgs) => this.oid4vciHolderSendNotification(args, context),
        }

        const oid4vciMachineInstanceArgs: OID4VCIMachineInstanceOpts = {
            ...args,
            authorizationRequestOpts,
            services: {
                ...services,
                ...args.services,
            },
        }

        const {interpreter} = await OID4VCIMachine.newInstance(oid4vciMachineInstanceArgs, context)

        return {
            interpreter,
        }
    }

    /**
     * This method is run before the machine starts! So there is no concept of the state machine context or states yet
     *
     * The result of this method can be directly passed into the start method of the state machine
     * @param args
     * @param context
     * @private
     */
    private async oid4vciHolderStart(args: PrepareStartArgs, context: RequiredContext): Promise<StartResult> {
        const {requestData} = args
        if (!requestData) {
            throw Error(`Cannot start the OID4VCI holder flow without request data being provided`)
        }
        const {uri = undefined} = requestData
        if (!uri) {
            return Promise.reject(Error('Missing request URI in context'))
        }

        const authorizationRequestOpts = {...this.defaultAuthorizationRequestOpts, ...args.authorizationRequestOpts} satisfies AuthorizationRequestOpts
        // We filter the details first against our vcformat prefs
        authorizationRequestOpts.authorizationDetails = authorizationRequestOpts?.authorizationDetails
            ? asArray(authorizationRequestOpts.authorizationDetails).filter(
                (detail) => typeof detail === 'string' || this.vcFormatPreferences.includes(detail.format),
            )
            : undefined

        if (!authorizationRequestOpts.redirectUri) {
            authorizationRequestOpts.redirectUri = OID4VCIHolder.DEFAULT_MOBILE_REDIRECT_URI
        }
        if (authorizationRequestOpts.redirectUri.startsWith('http') && !authorizationRequestOpts.clientId) {
            // At least set a default for a web based wallet.
            // TODO: We really need (dynamic) client registration support
            authorizationRequestOpts.clientId = authorizationRequestOpts.redirectUri
        }

        let oid4vciClient: OpenID4VCIClient
        let types: string[][] | undefined = undefined
        let offer: CredentialOfferRequestWithBaseUrl | undefined
        if (requestData.existingClientState) {
            oid4vciClient = await OpenID4VCIClient.fromState({state: requestData.existingClientState})
            offer = oid4vciClient.credentialOffer
        } else {
            offer = requestData.credentialOffer
            if (
                uri.startsWith(RequestType.OPENID_INITIATE_ISSUANCE) ||
                uri.startsWith(RequestType.OPENID_CREDENTIAL_OFFER) ||
                uri.match(/https?:\/\/.*credential_offer(_uri)=?.*/)
            ) {
                if (!offer) {
                    // Let's make sure to convert the URI to offer, as it matches the regexes. Normally this should already have happened at this point though
                    offer = await CredentialOfferClient.fromURI(uri)
                }
            } else {
                if (!!offer) {
                    logger.warning(`Non default URI used for credential offer: ${uri}`)
                }
            }

            if (!offer) {
                // else no offer, meaning we have an issuer URL
                logger.log(`Issuer url received (no credential offer): ${uri}`)
                oid4vciClient = await OpenID4VCIClient.fromCredentialIssuer({
                    credentialIssuer: uri,
                    authorizationRequest: authorizationRequestOpts,
                    clientId: authorizationRequestOpts.clientId,
                    createAuthorizationRequestURL: requestData.createAuthorizationRequestURL ?? true,
                })
            } else {
                logger.log(`Credential offer received: ${uri}`)
                oid4vciClient = await OpenID4VCIClient.fromURI({
                    uri,
                    authorizationRequest: authorizationRequestOpts,
                    clientId: authorizationRequestOpts.clientId,
                    createAuthorizationRequestURL: requestData.createAuthorizationRequestURL ?? true,
                })
            }
        }

        if (offer) {
            types = getTypesFromCredentialOffer(offer.original_credential_offer)
        } else {
            types = asArray(authorizationRequestOpts.authorizationDetails)
                .map((authReqOpts) => getTypesFromAuthorizationDetails(authReqOpts) ?? [])
                .filter((inner) => inner.length > 0)
        }

        const serverMetadata = await oid4vciClient.retrieveServerMetadata()
        const credentialsSupported = await getCredentialConfigsSupportedMerged({
            client: oid4vciClient,
            vcFormatPreferences: this.vcFormatPreferences,
            types,
        })
        const credentialBranding = await getCredentialBranding({credentialsSupported, context})
        const authorizationCodeURL = oid4vciClient.authorizationURL
        if (authorizationCodeURL) {
            logger.log(`authorization code URL ${authorizationCodeURL}`)
        }
        const oid4vciClientState = JSON.parse(await oid4vciClient.exportState())

        return {
            authorizationCodeURL,
            credentialBranding,
            credentialsSupported,
            serverMetadata,
            oid4vciClientState,
        }
    }

    private async oid4vciHoldercreateCredentialsToSelectFrom(
        args: createCredentialsToSelectFromArgs,
        context: RequiredContext,
    ): Promise<Array<CredentialToSelectFromResult>> {
        const {credentialBranding, locale, selectedCredentials /*, openID4VCIClientState*/, credentialsSupported} = args

        // const client = await OpenID4VCIClient.fromState({ state: openID4VCIClientState! }) // TODO see if we need the check openID4VCIClientState defined
        /*const credentialsSupported = await getCredentialConfigsSupportedBySingleTypeOrId({
              client,
              vcFormatPreferences: this.vcFormatPreferences,
            })*/
        logger.info(`Credentials supported ${Object.keys(credentialsSupported).join(', ')}`)

        const credentialSelection: Array<CredentialToSelectFromResult> = await Promise.all(
            Object.entries(credentialsSupported).map(
                async ([id, credentialConfigSupported]): Promise<CredentialToSelectFromResult> => {
                    if (credentialConfigSupported.format === 'vc+sd-jwt') {
                        return Promise.reject(Error('SD-JWT not supported yet'))
                    }

                    // FIXME this allows for duplicate VerifiableCredential, which the user has no idea which ones those are and we also have a branding map with unique keys, so some branding will not match
                    // const defaultCredentialType = 'VerifiableCredential'

                    const credentialTypes = getTypesFromObject(credentialConfigSupported)
                    // const credentialType = id /*?? credentialTypes?.find((type) => type !== defaultCredentialType) ?? defaultCredentialType*/
                    const localeBranding = !credentialBranding
                        ? undefined
                        : credentialBranding?.[id] ??
                        Object.entries(credentialBranding)
                            .find(([type, _brandings]) => {
                                credentialTypes && type in credentialTypes
                            })
                            ?.map(([type, supported]) => supported)
                    const credentialAlias = (
                        await selectCredentialLocaleBranding({
                            locale,
                            localeBranding,
                        })
                    )?.alias

                    return {
                        id: uuidv4(),
                        credentialId: id,
                        credentialTypes: credentialTypes ?? asArray(id),
                        credentialAlias: credentialAlias ?? id,
                        isSelected: false,
                    }
                },
            ),
        )

        // TODO find better place to do this, would be nice if the machine does this?
        if (credentialSelection.length >= 1) {
            credentialSelection.map(sel => selectedCredentials.push(sel.credentialId))
        }
        logger.log(`Credential selection ${JSON.stringify(credentialSelection)}`)

        return credentialSelection
    }

    private async oid4vciHolderGetContact(args: GetContactArgs, context: RequiredContext): Promise<Party | undefined> {
        const {serverMetadata} = args

        if (serverMetadata === undefined) {
            return Promise.reject(Error('Missing serverMetadata in context'))
        }

        const correlationId: string = new URL(serverMetadata.issuer).hostname
        const party = context.agent
            .cmGetContacts({
                filter: [
                    {
                        identities: {
                            identifier: {
                                correlationId,
                            },
                        },
                    },
                ],
            })
            .then((contacts: Array<Party>): Party | undefined => (contacts.length === 1 ? contacts[0] : undefined))
        logger.log(`Party involved: `, party)
        return party
    }

    private async oid4vciHolderGetCredentials(args: GetCredentialsArgs, context: RequiredContext): Promise<Array<MappedCredentialToAccept>> {
        const {verificationCode, openID4VCIClientState, didMethodPreferences = this.didMethodPreferences, issuanceOpt} = args

        if (!openID4VCIClientState) {
            return Promise.reject(Error('Missing openID4VCI client state in context'))
        }

        const client = await OpenID4VCIClient.fromState({state: openID4VCIClientState})
        const credentialsSupported = await getCredentialConfigsSupportedMerged({
            client,
            vcFormatPreferences: this.vcFormatPreferences,
            configurationIds: args.selectedCredentials
        })
        const serverMetadata = await client.retrieveServerMetadata()
        const issuanceOpts = await getIssuanceOpts({
            client,
            credentialsSupported,
            serverMetadata,
            context,
            didMethodPreferences: (Array.isArray(didMethodPreferences) && didMethodPreferences.length > 0) ? didMethodPreferences : this.didMethodPreferences,
            jwtCryptographicSuitePreferences: this.jwtCryptographicSuitePreferences,
            jsonldCryptographicSuitePreferences: this.jsonldCryptographicSuitePreferences,
            ...(issuanceOpt && {forceIssuanceOpt: issuanceOpt})
        })

        const getCredentials = issuanceOpts.map(
            async (issuanceOpt: IssuanceOpts): Promise<MappedCredentialToAccept> =>
                await this.oid4vciHolderGetCredential(
                    {
                        issuanceOpt,
                        pin: verificationCode,
                        client,
                    },
                    context,
                ),
        )

        const allCredentials = await Promise.all(getCredentials)
        logger.log(`Credentials received`, allCredentials)

        return allCredentials
    }

    private async oid4vciHolderGetCredential(args: GetCredentialArgs, context: RequiredContext): Promise<MappedCredentialToAccept> {
        const {issuanceOpt, pin, client} = args

        if (!issuanceOpt) {
            return Promise.reject(Error(`Cannot get credential issuance options`))
        }
        const idOpts = await getIdentifier({issuanceOpt, context})
        const {key, kid} = idOpts
        const alg: SignatureAlgorithmEnum = await signatureAlgorithmFromKey({key})

        const callbacks: ProofOfPossessionCallbacks<DIDDocument> = {
            signCallback: signCallback(client, idOpts, context),
        }

        try {
            // We need to make sure we have acquired the access token
            if (!client.clientId) {
                client.clientId = issuanceOpt.identifier.did
            }
            await client.acquireAccessToken({
                clientId: client.clientId,
                pin,
                authorizationResponse: JSON.parse(await client.exportState()).authorizationCodeResponse,
            })

            // FIXME: This type mapping is wrong. It should use credential_identifier in case the access token response has authorization details
            const types = getTypesFromObject(issuanceOpt)
            const credentialTypes = issuanceOpt.credentialConfigurationId ?? issuanceOpt.id ?? types
            if (!credentialTypes || (Array.isArray(credentialTypes) && credentialTypes.length === 0)) {
                return Promise.reject(Error('cannot determine credential id to request'))
            }
            const credentialResponse = await client.acquireCredentials({
                credentialTypes,
                proofCallbacks: callbacks,
                format: issuanceOpt.format,
                // TODO: We need to update the machine and add notifications support for actual deferred credentials instead of just waiting/retrying
                deferredCredentialAwait: true,
                kid,
                alg,
                jti: uuidv4(),
            })

            const credential = {
                id: issuanceOpt.credentialConfigurationId ?? issuanceOpt.id,
                types: types ?? asArray(credentialTypes),
                issuanceOpt,
                credentialResponse,
            } satisfies CredentialToAccept
            return mapCredentialToAccept({credential})
        } catch (error) {
            return Promise.reject(error)
        }
    }

    private async oid4vciHolderAddContactIdentity(args: AddContactIdentityArgs, context: RequiredContext): Promise<Identity> {
        const {credentialsToAccept, contact} = args

        if (!contact) {
            return Promise.reject(Error('Missing contact in context'))
        }

        if (credentialsToAccept === undefined || credentialsToAccept.length === 0) {
            return Promise.reject(Error('Missing credential offers in context'))
        }

        const correlationId: string = credentialsToAccept[0].correlationId
        const identity: NonPersistedIdentity = {
            alias: correlationId,
            origin: IdentityOrigin.EXTERNAL,
            roles: [CredentialRole.ISSUER],
            identifier: {
                type: CorrelationIdentifierType.DID,
                correlationId,
            },
        }

        await context.agent.emit(OID4VCIHolderEvent.CONTACT_IDENTITY_CREATED, {
            contactId: contact.id,
            identity,
        })
        logger.log(`Contact added ${contact.id}`)

        return context.agent.cmAddIdentity({contactId: contact.id, identity})
    }

    private async oid4vciHolderAssertValidCredentials(args: AssertValidCredentialsArgs, context: RequiredContext): Promise<void> {
        const {credentialsToAccept} = args

        await Promise.all(
            credentialsToAccept.map(
                async (mappedCredential: MappedCredentialToAccept): Promise<void> =>
                    verifyCredentialToAccept({
                        mappedCredential,
                        context,
                    }),
            ),
        )
    }

    private async oid4vciHolderStoreCredentialBranding(args: StoreCredentialBrandingArgs, context: RequiredContext): Promise<void> {
        const {credentialBranding, serverMetadata, selectedCredentials, credentialsToAccept} = args

        if (serverMetadata === undefined) {
            return Promise.reject(Error('Missing serverMetadata in context'))
        } else if (selectedCredentials.length === 0) {
            logger.warning(`No credentials selected for issuer: ${serverMetadata.issuer}`)
            return
        }


        let counter = 0;
        for (const credentialId of selectedCredentials) {
            const localeBranding: Array<IBasicCredentialLocaleBranding> | undefined = credentialBranding?.[credentialId]
            if (localeBranding && localeBranding.length > 0) {
                const credential = credentialsToAccept.find(credAccept => credAccept.credential.id === credentialId ?? JSON.stringify(credAccept.types) === credentialId ?? credentialsToAccept[counter])!
                counter++
                await context.agent.ibAddCredentialBranding({
                    vcHash: computeEntryHash(credential.rawVerifiableCredential),
                    issuerCorrelationId: new URL(serverMetadata.issuer).hostname,
                    localeBranding,
                })
                logger.log(`Credential branding for issuer ${serverMetadata.issuer} and type ${credentialId} stored with locales ${localeBranding.map((b) => b.locale).join(',')}`)
            } else {
                logger.warning(`No credential branding found for issuer: ${serverMetadata.issuer} and type ${credentialId}`)
            }
        }
    }

    private async oid4vciHolderStoreCredentials(args: StoreCredentialsArgs, context: RequiredContext): Promise<void> {
        function trimmed(input?: string) {
            const trim = input?.trim()
            if (trim === '') {
                return undefined
            }
            return trim
        }

        const {
            credentialsToAccept,
            openID4VCIClientState,
            credentialsSupported,
            serverMetadata,
            selectedCredentials
        } = args

        const credentialToAccept = credentialsToAccept[0]

        if (selectedCredentials && selectedCredentials.length > 1) {
            logger.error(`More than 1 credential selected ${selectedCredentials.join(', ')}, but current service only stores 1 credential!`)
        }

        let persist = true
        const verifiableCredential = credentialToAccept.uniformVerifiableCredential as VerifiableCredential

        const notificationId = credentialToAccept.credential.credentialResponse.notification_id
        const subjectIssuance = credentialToAccept.credential_subject_issuance
        const notificationEndpoint = serverMetadata?.credentialIssuerMetadata?.notification_endpoint
        let holderCredential:
            | IVerifiableCredential
            | JwtDecodedVerifiableCredential
            | SdJwtDecodedVerifiableCredentialPayload
            | W3CVerifiableCredential
            | undefined = undefined
        if (!notificationEndpoint) {
            logger.log(`Notifications not supported by issuer ${serverMetadata?.issuer}. Will not provide a notification`)
        } else if (notificationEndpoint && !notificationId) {
            logger.warning(
                `Notification endpoint available in issuer metadata with value ${notificationEndpoint}, but no ${notificationId} provided. Will not send a notification to issuer ${serverMetadata?.issuer}`,
            )
        } else if (notificationEndpoint && notificationId) {
            logger.log(`Notification id ${notificationId} found, will send back a notification to ${notificationEndpoint}`)
            let event = 'credential_accepted'
            if (Array.isArray(subjectIssuance?.notification_events_supported)) {
                event = subjectIssuance.notification_events_supported.includes('credential_accepted_holder_signed')
                    ? 'credential_accepted_holder_signed'
                    : 'credential_deleted_holder_signed'
                logger.log(`Subject issuance/signing will be used, with event`, event)
                const issuerVC = credentialToAccept.credential.credentialResponse.credential as OriginalVerifiableCredential
                const wrappedIssuerVC = CredentialMapper.toWrappedVerifiableCredential(issuerVC)
                console.log(`Wrapped VC: ${wrappedIssuerVC.type}, ${wrappedIssuerVC.format}`)
                // We will use the subject of the VCI Issuer (the holder, as the issuer of the new credential, so the below is not a mistake!)
                let issuer =
                    trimmed(wrappedIssuerVC.decoded.sub) ??
                    trimmed(wrappedIssuerVC.decoded.credentialSubject.id) ??
                    trimmed(verifiableCredential.credentialSubject.id)

                if (!issuer && openID4VCIClientState?.kid?.startsWith('did:')) {
                    issuer = parseDid(openID4VCIClientState?.kid).did
                }
                if (!issuer && openID4VCIClientState?.jwk?.kid?.startsWith('did:')) {
                    issuer = parseDid(openID4VCIClientState!.jwk!.kid!).did
                }
                if (!issuer && openID4VCIClientState?.clientId) {
                    issuer = trimmed(openID4VCIClientState.clientId)
                }
                if (!issuer && openID4VCIClientState?.accessTokenResponse) {
                    const decodedJwt = decodeJWT(openID4VCIClientState.accessTokenResponse.access_token)
                    issuer = decodedJwt.payload.sub
                }
                if (!issuer && credentialToAccept.credential.issuanceOpt.identifier) {
                    issuer = credentialToAccept.credential.issuanceOpt.identifier.did
                }

                if (!issuer) {
                    throw Error(`We could not determine the issuer, which means we cannot sign the credential`)
                }
                logger.log(`Issuer for self-issued credential will be: ${issuer}`)

                const holderCredentialToSign = wrappedIssuerVC.decoded
                let proofFormat: ProofFormat = 'lds'
                if (wrappedIssuerVC.format.includes('jwt')) {
                    holderCredentialToSign.iss = issuer
                    proofFormat = 'jwt'
                }
                if ('issuer' in holderCredentialToSign || !('iss' in holderCredentialToSign)) {
                    holderCredentialToSign.issuer = issuer
                }
                if ('sub' in holderCredentialToSign) {
                    holderCredentialToSign.sub = issuer
                }
                if ('credentialSubject' in holderCredentialToSign && !Array.isArray(holderCredentialToSign.credentialSubject)) {
                    holderCredentialToSign.credentialSubject.id = issuer
                }
                if ('vc' in holderCredentialToSign) {
                    if (holderCredentialToSign.vc.credentialSubject) {
                        holderCredentialToSign.vc.credentialSubject.id = issuer
                    }
                    holderCredentialToSign.vc.issuer = issuer
                    delete holderCredentialToSign.vc.proof
                    delete holderCredentialToSign.vc.issuanceDate
                }
                delete holderCredentialToSign.proof
                delete holderCredentialToSign.issuanceDate
                delete holderCredentialToSign.iat

                logger.log(`Subject issuance/signing will sign credential of type ${proofFormat}:`, holderCredentialToSign)
                const issuedVC = await context.agent.createVerifiableCredential({
                    credential: holderCredentialToSign as CredentialPayload,
                    fetchRemoteContexts: true,
                    save: false,
                    proofFormat,
                })
                if (!issuedVC) {
                    throw Error(`Could not issue holder credential from the wallet`)
                }
                logger.log(`Holder ${issuedVC.issuer} issued new credential with id ${issuedVC.id}`, issuedVC)
                holderCredential = CredentialMapper.storedCredentialToOriginalFormat(issuedVC as IVerifiableCredential)
                persist = event === 'credential_accepted_holder_signed'
            }

            const notificationRequest: NotificationRequest = {
                notification_id: notificationId,
                ...(holderCredential && {credential: holderCredential}),
                event,
            }

            await this.oid4vciHolderSendNotification(
                {
                    openID4VCIClientState,
                    stored: persist,
                    credentialsToAccept,
                    credentialsSupported,
                    notificationRequest,
                    serverMetadata,
                },
                context,
            )
        }
        const persistCredential = holderCredential ? CredentialMapper.storedCredentialToOriginalFormat(holderCredential) : verifiableCredential
        if (!persist && holderCredential) {
            logger.log(`Will not persist credential, since we are signing as a holder and the issuer asked not to persist`)
        } else {
            logger.log(`Persisting credential`, persistCredential)
            // @ts-ignore
            const vcHash = await context.agent.dataStoreSaveVerifiableCredential({verifiableCredential: persistCredential})
            await context.agent.emit(OID4VCIHolderEvent.CREDENTIAL_STORED, {
                vcHash,
                credential: persistCredential,
            })
        }
    }

    private async oid4vciHolderSendNotification(args: SendNotificationArgs, context: RequiredContext): Promise<void> {
        const {serverMetadata, notificationRequest, openID4VCIClientState} = args
        const notificationEndpoint = serverMetadata?.credentialIssuerMetadata?.notification_endpoint
        if (!notificationEndpoint) {
            return
        } else if (!openID4VCIClientState) {
            return Promise.reject(Error('Missing openID4VCI client state in context'))
        } else if (!notificationRequest) {
            return Promise.reject(Error('Missing notification request'))
        }

        logger.log(`Will send notification to ${notificationEndpoint}`, notificationRequest)

        const client = await OpenID4VCIClient.fromState({state: openID4VCIClientState})
        await client.sendNotification({notificationEndpoint}, notificationRequest, openID4VCIClientState?.accessTokenResponse?.access_token)
        logger.log(`Notification to ${notificationEndpoint} has been dispatched`)
    }

    private async oid4vciHolderGetIssuerMetadata(args: GetIssuerMetadataArgs, context: RequiredContext): Promise<EndpointMetadataResult> {
        const {issuer, errorOnNotFound = true} = args
        return MetadataClient.retrieveAllMetadata(issuer, {errorOnNotFound})
    }
}
