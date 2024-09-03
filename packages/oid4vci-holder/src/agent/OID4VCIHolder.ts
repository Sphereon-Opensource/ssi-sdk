import { CredentialOfferClient, MetadataClient, OpenID4VCIClient } from '@sphereon/oid4vci-client'
import {
  AuthorizationDetails,
  AuthorizationRequestOpts,
  AuthorizationServerClientOpts,
  AuthorizationServerOpts,
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
import { SupportedDidMethodEnum } from '@sphereon/ssi-sdk-ext.did-utils'
import {
  IIdentifierResolution,
  isManagedIdentifierDidResult,
  isManagedIdentifierJwkResult,
  ManagedIdentifierOptsOrResult,
} from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { IJwtService, JwtHeader } from '@sphereon/ssi-sdk-ext.jwt-service'
import { signatureAlgorithmFromKey } from '@sphereon/ssi-sdk-ext.key-utils'
import {
  CorrelationIdentifierType,
  CredentialCorrelationType,
  CredentialRole,
  FindPartyArgs,
  IBasicCredentialLocaleBranding,
  IBasicIssuerLocaleBranding,
  Identity,
  IdentityOrigin,
  IIssuerBranding,
  NonPersistedIdentity,
  Party,
} from '@sphereon/ssi-sdk.data-store'
import {
  CredentialMapper,
  Hasher,
  IVerifiableCredential,
  JoseSignatureAlgorithm,
  JoseSignatureAlgorithmString,
  JwtDecodedVerifiableCredential,
  Loggers,
  OriginalVerifiableCredential,
  parseDid,
  SdJwtDecodedVerifiableCredentialPayload,
} from '@sphereon/ssi-types'
import {
  CredentialPayload,
  IAgentContext,
  IAgentPlugin,
  IDIDManager,
  IKeyManager,
  IResolver,
  ProofFormat,
  VerifiableCredential,
  W3CVerifiableCredential,
} from '@veramo/core'
import { asArray, computeEntryHash } from '@veramo/utils'
import { decodeJWT } from 'did-jwt'
import { v4 as uuidv4 } from 'uuid'
import { OID4VCIMachine } from '../machine/oid4vciMachine'
import {
  AddContactIdentityArgs,
  AddIssuerBrandingArgs,
  AssertValidCredentialsArgs,
  createCredentialsToSelectFromArgs,
  CredentialToAccept,
  CredentialToSelectFromResult,
  GetContactArgs,
  GetCredentialArgs,
  GetCredentialsArgs,
  GetIssuerMetadataArgs,
  IOID4VCIHolder,
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
  StartResult,
  StoreCredentialBrandingArgs,
  StoreCredentialsArgs,
  VerificationResult,
} from '../types/IOID4VCIHolder'
import {
  getBasicIssuerLocaleBranding,
  getCredentialBranding,
  getCredentialConfigsSupportedMerged,
  getIdentifierOpts,
  getIssuanceOpts,
  mapCredentialToAccept,
  selectCredentialLocaleBranding,
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

export function signCallback(
  identifier: ManagedIdentifierOptsOrResult,
  context: IAgentContext<IKeyManager & IDIDManager & IResolver & IIdentifierResolution & IJwtService>,
  nonce?: string,
) {
  return async (jwt: Jwt, kid?: string) => {
    let resolution = await context.agent.identifierManagedGet(identifier)
    const jwk = jwt.header.jwk ?? (resolution.method === 'jwk' ? resolution.jwk : undefined)
    if (!resolution.issuer && !jwt.payload.iss) {
      return Promise.reject(Error(`No issuer could be determined from the JWT ${JSON.stringify(jwt)} or identifier resolution`))
    }
    const header = jwt.header as JwtHeader
    const payload = jwt.payload
    if (nonce) {
      payload.nonce = nonce
    }
    if (jwk && header.kid) {
      console.log(
        `Deleting kid, as we are using a jwk and the oid4vci spec does not allow both to be present (which is not the case in the JOSE spec)`,
      )
      delete header.kid // The OID4VCI spec does not allow a JWK with kid present although the JWS spec does
    }
    return (
      await context.agent.jwtCreateJwsCompactSignature({
        issuer: { ...resolution, noIssPayloadUpdate: false },
        protectedHeader: header,
        payload,
      })
    ).jwt
  }
}

export class OID4VCIHolder implements IAgentPlugin {
  private readonly hasher?: Hasher
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

  private readonly vcFormatPreferences: Array<string> = ['vc+sd-jwt', 'mso_mdoc', 'jwt_vc_json', 'jwt_vc', 'ldp_vc']
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
  private readonly jwtCryptographicSuitePreferences: Array<JoseSignatureAlgorithm | JoseSignatureAlgorithmString> = [
    JoseSignatureAlgorithm.ES256,
    JoseSignatureAlgorithm.ES256K,
    JoseSignatureAlgorithm.EdDSA,
  ]
  private static readonly DEFAULT_MOBILE_REDIRECT_URI = `${DefaultURISchemes.CREDENTIAL_OFFER}://`
  private readonly defaultAuthorizationRequestOpts: AuthorizationRequestOpts = { redirectUri: OID4VCIHolder.DEFAULT_MOBILE_REDIRECT_URI }
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
      hasher,
    } = options ?? {}

    this.hasher = hasher
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
  private async oid4vciHolderGetMachineInterpreter(opts: OID4VCIMachineInstanceOpts, context: RequiredContext): Promise<OID4VCIMachineId> {
    const authorizationRequestOpts = { ...this.defaultAuthorizationRequestOpts, ...opts.authorizationRequestOpts }
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
      getCredentials: (args: GetCredentialsArgs) =>
        this.oid4vciHolderGetCredentials({ accessTokenOpts: args.accessTokenOpts ?? opts.accessTokenOpts, ...args }, context),
      addContactIdentity: (args: AddContactIdentityArgs) => this.oid4vciHolderAddContactIdentity(args, context),
      addIssuerBranding: (args: AddIssuerBrandingArgs) => this.oid4vciHolderAddIssuerBranding(args, context),
      assertValidCredentials: (args: AssertValidCredentialsArgs) => this.oid4vciHolderAssertValidCredentials(args, context),
      storeCredentialBranding: (args: StoreCredentialBrandingArgs) => this.oid4vciHolderStoreCredentialBranding(args, context),
      storeCredentials: (args: StoreCredentialsArgs) => this.oid4vciHolderStoreCredentials(args, context),
      sendNotification: (args: SendNotificationArgs) => this.oid4vciHolderSendNotification(args, context),
    }

    const oid4vciMachineInstanceArgs: OID4VCIMachineInstanceOpts = {
      ...opts,
      authorizationRequestOpts,
      services: {
        ...services,
        ...opts.services,
      },
    }

    const { interpreter } = await OID4VCIMachine.newInstance(oid4vciMachineInstanceArgs, context)

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
    const { requestData } = args
    if (!requestData) {
      throw Error(`Cannot start the OID4VCI holder flow without request data being provided`)
    }
    const { uri = undefined } = requestData
    if (!uri) {
      return Promise.reject(Error('Missing request URI in context'))
    }

    const authorizationRequestOpts = { ...this.defaultAuthorizationRequestOpts, ...args.authorizationRequestOpts } satisfies AuthorizationRequestOpts
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

    let formats: string[] = this.vcFormatPreferences
    const authFormats = authorizationRequestOpts?.authorizationDetails
      ?.map((detail: AuthorizationDetails) => (typeof detail === 'object' && 'format' in detail && detail.format ? detail.format : undefined))
      .filter((format) => !!format)
      .map((format) => format as string)
    if (authFormats && authFormats.length > 0) {
      formats = Array.from(new Set(authFormats))
    }
    let oid4vciClient: OpenID4VCIClient
    let types: string[][] | undefined = undefined
    let offer: CredentialOfferRequestWithBaseUrl | undefined
    if (requestData.existingClientState) {
      oid4vciClient = await OpenID4VCIClient.fromState({ state: requestData.existingClientState })
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
      vcFormatPreferences: formats,
      types,
    })
    const credentialBranding = await getCredentialBranding({ credentialsSupported, context })
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
    const { credentialBranding, locale, selectedCredentials /*, openID4VCIClientState*/, credentialsSupported } = args

    // const client = await OpenID4VCIClient.fromState({ state: openID4VCIClientState! }) // TODO see if we need the check openID4VCIClientState defined
    /*const credentialsSupported = await getCredentialConfigsSupportedBySingleTypeOrId({
                              client,
                              vcFormatPreferences: this.vcFormatPreferences,
                            })*/
    logger.info(`Credentials supported ${Object.keys(credentialsSupported).join(', ')}`)

    const credentialSelection: Array<CredentialToSelectFromResult> = await Promise.all(
      Object.entries(credentialsSupported).map(async ([id, credentialConfigSupported]): Promise<CredentialToSelectFromResult> => {
        // FIXME this allows for duplicate VerifiableCredential, which the user has no idea which ones those are and we also have a branding map with unique keys, so some branding will not match
        // const defaultCredentialType = 'VerifiableCredential'

        const credentialTypes = getTypesFromObject(credentialConfigSupported)
        // const credentialType = id /*?? credentialTypes?.find((type) => type !== defaultCredentialType) ?? defaultCredentialType*/
        const localeBranding = !credentialBranding
          ? undefined
          : (credentialBranding?.[id] ??
            Object.entries(credentialBranding)
              .find(([type, _brandings]) => {
                credentialTypes && type in credentialTypes
              })
              ?.map(([type, supported]) => supported))
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
      }),
    )

    // TODO find better place to do this, would be nice if the machine does this?
    if (credentialSelection.length >= 1) {
      credentialSelection.map((sel) => selectedCredentials.push(sel.credentialId))
    }
    logger.log(`Credential selection ${JSON.stringify(credentialSelection)}`)

    return credentialSelection
  }

  private async oid4vciHolderGetContact(args: GetContactArgs, context: RequiredContext): Promise<Party | undefined> {
    const { serverMetadata } = args

    if (serverMetadata === undefined) {
      return Promise.reject(Error('Missing serverMetadata in context'))
    }

    const names: Set<string> = new Set(
      serverMetadata.credentialIssuerMetadata?.display
        ?.map((display) => display.name)
        .filter((name) => name != undefined)
        .map((name) => name as string) ?? [],
    )
    const name = names.size > 0 ? Array.from(names)[0] : undefined

    const correlationId: string = new URL(serverMetadata.issuer).hostname

    const filter: FindPartyArgs = [
      {
        identities: {
          identifier: {
            correlationId,
          },
        },
      },
    ]

    if (name) {
      filter.push({
        contact: {
          legalName: name,
        },
      })
      filter.push({
        contact: {
          displayName: name,
        },
      })
    }

    const parties: Array<Party> = await context.agent.cmGetContacts({
      filter,
    })

    if (parties.length > 1) {
      logger.warning(`Get contacts returned more than one result: ${parties.length}, ${parties.map((party) => party.contact.displayName).join(',')}`)
    }
    const party = parties.length >= 1 ? parties[0] : undefined

    logger.log(`Party involved: `, party)
    return party
  }

  private async oid4vciHolderGetCredentials(args: GetCredentialsArgs, context: RequiredContext): Promise<Array<MappedCredentialToAccept>> {
    const { verificationCode, openID4VCIClientState, didMethodPreferences = this.didMethodPreferences, issuanceOpt, accessTokenOpts } = args
    logger.debug(`Getting credentials`, issuanceOpt, accessTokenOpts)

    if (!openID4VCIClientState) {
      return Promise.reject(Error('Missing openID4VCI client state in context'))
    }

    const client = await OpenID4VCIClient.fromState({ state: openID4VCIClientState })
    const credentialsSupported = await getCredentialConfigsSupportedMerged({
      client,
      vcFormatPreferences: this.vcFormatPreferences,
      configurationIds: args.selectedCredentials,
    })
    const serverMetadata = await client.retrieveServerMetadata()
    const issuanceOpts = await getIssuanceOpts({
      client,
      credentialsSupported,
      serverMetadata,
      context,
      didMethodPreferences: Array.isArray(didMethodPreferences) && didMethodPreferences.length > 0 ? didMethodPreferences : this.didMethodPreferences,
      jwtCryptographicSuitePreferences: this.jwtCryptographicSuitePreferences,
      jsonldCryptographicSuitePreferences: this.jsonldCryptographicSuitePreferences,
      ...(issuanceOpt && { forceIssuanceOpt: issuanceOpt }),
    })

    const getCredentials = issuanceOpts.map(
      async (issuanceOpt: IssuanceOpts): Promise<MappedCredentialToAccept> =>
        await this.oid4vciHolderGetCredential(
          {
            issuanceOpt,
            pin: verificationCode,
            client,
            accessTokenOpts,
          },
          context,
        ),
    )

    const allCredentials = await Promise.all(getCredentials)
    logger.log(`Credentials received`, allCredentials)

    return allCredentials
  }

  private async oid4vciHolderGetCredential(args: GetCredentialArgs, context: RequiredContext): Promise<MappedCredentialToAccept> {
    const { issuanceOpt, pin, client, accessTokenOpts } = args
    logger.info(`Getting credential`, issuanceOpt)

    if (!issuanceOpt) {
      return Promise.reject(Error(`Cannot get credential issuance options`))
    }

    const identifier = await getIdentifierOpts({ issuanceOpt, context })
    issuanceOpt.identifier = identifier
    logger.info(`ID opts`, identifier)
    const alg: JoseSignatureAlgorithm | JoseSignatureAlgorithmString = await signatureAlgorithmFromKey({ key: identifier.key })
    // The VCI lib either expects a jwk or a kid
    const jwk = isManagedIdentifierJwkResult(identifier) ? identifier.jwk : undefined

    const callbacks: ProofOfPossessionCallbacks<never> = {
      signCallback: signCallback(identifier, context),
    }

    try {
      // We need to make sure we have acquired the access token
      if (!client.clientId) {
        client.clientId = isManagedIdentifierDidResult(identifier) ? identifier.did : identifier.issuer
      }
      let asOpts: AuthorizationServerOpts | undefined = undefined
      let kid = accessTokenOpts?.clientOpts?.kid ?? identifier.kid
      if (accessTokenOpts?.clientOpts) {
        const clientId = accessTokenOpts.clientOpts.clientId ?? client.clientId ?? identifier.issuer
        if (client.isEBSI() && clientId?.startsWith('http') && kid?.includes('#')) {
          kid = kid.split('#')[1]
        }

        //todo: investigate if the jwk should be used here as well if present
        const clientOpts: AuthorizationServerClientOpts = {
          ...accessTokenOpts.clientOpts,
          clientId,
          kid,
          // @ts-ignore
          alg: accessTokenOpts.clientOpts.alg ?? alg,
          signCallbacks: accessTokenOpts.clientOpts.signCallbacks ?? callbacks,
        }
        asOpts = {
          clientOpts,
        }
      }

      await client.acquireAccessToken({
        clientId: client.clientId,
        pin,
        authorizationResponse: JSON.parse(await client.exportState()).authorizationCodeResponse,
        additionalRequestParams: accessTokenOpts?.additionalRequestParams,
        ...(asOpts && { asOpts }),
      })

      // FIXME: This type mapping is wrong. It should use credential_identifier in case the access token response has authorization details
      const types = getTypesFromObject(issuanceOpt)
      const id: string | undefined = 'id' in issuanceOpt && issuanceOpt.id ? (issuanceOpt.id as string) : undefined
      const credentialTypes = asArray(issuanceOpt.credentialConfigurationId ?? types ?? id)
      if (!credentialTypes || credentialTypes.length === 0) {
        return Promise.reject(Error('cannot determine credential id to request'))
      }
      const credentialResponse = await client.acquireCredentials({
        credentialTypes,
        proofCallbacks: callbacks,
        format: issuanceOpt.format,
        // TODO: We need to update the machine and add notifications support for actual deferred credentials instead of just waiting/retrying
        deferredCredentialAwait: true,
        ...(!jwk && { kid }), // vci client either wants a jwk or kid. If we have used the jwk method do not provide the kid
        jwk,
        alg,
        jti: uuidv4(),
      })

      const credential = {
        id: issuanceOpt.credentialConfigurationId ?? id,
        types: types ?? asArray(credentialTypes),
        issuanceOpt,
        credentialResponse,
      } satisfies CredentialToAccept
      return mapCredentialToAccept({ credentialToAccept: credential, hasher: this.hasher })
    } catch (error) {
      return Promise.reject(error)
    }
  }

  private async oid4vciHolderAddContactIdentity(args: AddContactIdentityArgs, context: RequiredContext): Promise<Identity> {
    const { credentialsToAccept, contact } = args

    if (!contact) {
      return Promise.reject(Error('Missing contact in context'))
    }

    if (credentialsToAccept === undefined || credentialsToAccept.length === 0) {
      return Promise.reject(Error('Missing credential offers in context'))
    }

    let correlationId: string = credentialsToAccept[0].correlationId
    let identifierType = CorrelationIdentifierType.DID
    if (!correlationId.toLowerCase().startsWith('did:')) {
      identifierType = CorrelationIdentifierType.URL
      if (correlationId.startsWith('http')) {
        correlationId = new URL(correlationId).hostname
      }
    }
    const identity: NonPersistedIdentity = {
      alias: credentialsToAccept[0].correlationId,
      origin: IdentityOrigin.EXTERNAL,
      roles: [CredentialRole.ISSUER],
      identifier: {
        type: identifierType,
        correlationId,
      },
    }

    await context.agent.emit(OID4VCIHolderEvent.CONTACT_IDENTITY_CREATED, {
      contactId: contact.id,
      identity,
    })
    logger.log(`Contact added: ${correlationId}`)

    return context.agent.cmAddIdentity({ contactId: contact.id, identity })
  }

  private async oid4vciHolderAddIssuerBranding(args: AddIssuerBrandingArgs, context: RequiredContext): Promise<void> {
    const { serverMetadata, contact } = args
    if (!contact) {
      return logger.warning('Missing contact in context, so cannot get issuer branding')
    }

    if (serverMetadata?.credentialIssuerMetadata?.display) {
      const issuerCorrelationId: string =
        contact.identities
          .filter((identity) => identity.roles.includes(CredentialRole.ISSUER))
          .map((identity) => identity.identifier.correlationId)[0] ?? undefined

      const brandings: IIssuerBranding[] = await context.agent.ibGetIssuerBranding({ filter: [{ issuerCorrelationId }] })
      // todo: Probably wise to look at last updated at and update in case it has been a while
      if (!brandings || brandings.length === 0) {
        const basicIssuerLocaleBrandings: IBasicIssuerLocaleBranding[] = await getBasicIssuerLocaleBranding({
          display: serverMetadata.credentialIssuerMetadata.display,
          context,
        })
        if (basicIssuerLocaleBrandings && basicIssuerLocaleBrandings.length > 0) {
          await context.agent.ibAddIssuerBranding({
            localeBranding: basicIssuerLocaleBrandings,
            issuerCorrelationId,
          })
        }
      }
    }
  }

  private async oid4vciHolderAssertValidCredentials(args: AssertValidCredentialsArgs, context: RequiredContext): Promise<VerificationResult[]> {
    const { credentialsToAccept } = args

    return await Promise.all(
      credentialsToAccept.map((credentialToAccept) =>
        verifyCredentialToAccept({
          mappedCredential: credentialToAccept,
          hasher: this.hasher,
          context,
        }),
      ),
    )
  }

  private async oid4vciHolderStoreCredentialBranding(args: StoreCredentialBrandingArgs, context: RequiredContext): Promise<void> {
    const { credentialBranding, serverMetadata, selectedCredentials, credentialsToAccept } = args

    if (serverMetadata === undefined) {
      return Promise.reject(Error('Missing serverMetadata in context'))
    } else if (selectedCredentials.length === 0) {
      logger.warning(`No credentials selected for issuer: ${serverMetadata.issuer}`)
      return
    }

    let counter = 0
    for (const credentialId of selectedCredentials) {
      const localeBranding: Array<IBasicCredentialLocaleBranding> | undefined = credentialBranding?.[credentialId]
      if (localeBranding && localeBranding.length > 0) {
        const credential = credentialsToAccept.find(
          (credAccept) =>
            credAccept.credentialToAccept.id === credentialId ?? JSON.stringify(credAccept.types) === credentialId ?? credentialsToAccept[counter],
        )!
        counter++
        await context.agent.ibAddCredentialBranding({
          vcHash: computeEntryHash(credential.rawVerifiableCredential as W3CVerifiableCredential),
          issuerCorrelationId: new URL(serverMetadata.issuer).hostname,
          localeBranding,
        })
        logger.log(
          `Credential branding for issuer ${serverMetadata.issuer} and type ${credentialId} stored with locales ${localeBranding.map((b) => b.locale).join(',')}`,
        )
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

    const { credentialsToAccept, openID4VCIClientState, credentialsSupported, serverMetadata, selectedCredentials } = args
    const mappedCredentialToAccept = credentialsToAccept[0]

    if (selectedCredentials && selectedCredentials.length > 1) {
      logger.error(`More than 1 credential selected ${selectedCredentials.join(', ')}, but current service only stores 1 credential!`)
    }

    if (!args.issuanceOpt || !args.issuanceOpt.identifier || !args.issuanceOpt.identifier.kmsKeyRef || !args.issuanceOpt.identifier.method) {
      return Promise.reject(Error('issuanceOpt.identifier and identifier.kmsKeyRef / method must me set'))
    }
    const { kmsKeyRef, method } = args.issuanceOpt.identifier

    let persist = true
    const verifiableCredential = mappedCredentialToAccept.uniformVerifiableCredential as VerifiableCredential

    const notificationId = mappedCredentialToAccept.credentialToAccept.credentialResponse.notification_id
    const subjectIssuance = mappedCredentialToAccept.credential_subject_issuance
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
        // experimental subject issuance, where a new credential is being created
        event = subjectIssuance.notification_events_supported.includes('credential_accepted_holder_signed')
          ? 'credential_accepted_holder_signed'
          : 'credential_deleted_holder_signed'
        logger.log(`Subject issuance/signing will be used, with event`, event)
        const issuerVC = mappedCredentialToAccept.credentialToAccept.credentialResponse.credential as OriginalVerifiableCredential
        const wrappedIssuerVC = CredentialMapper.toWrappedVerifiableCredential(issuerVC, { hasher: this.hasher })
        console.log(`Wrapped VC: ${wrappedIssuerVC.type}, ${wrappedIssuerVC.format}`)
        // We will use the subject of the VCI Issuer (the holder, as the issuer of the new credential, so the below is not a mistake!)

        let issuer =
          // @ts-ignore
          trimmed(wrappedIssuerVC.decoded?.sub) ??
          // @ts-ignore
          trimmed(wrappedIssuerVC.decoded?.credentialSubject.id) ??
          // @ts-ignore
          trimmed(wrappedIssuerVC.credential?.sub) ??
          // @ts-ignore
          trimmed(wrappedIssuerVC.credential?.credentialSubject.id) ??
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
        if (!issuer && mappedCredentialToAccept.credentialToAccept.issuanceOpt.identifier) {
          const resolution = await context.agent.identifierManagedGet(mappedCredentialToAccept.credentialToAccept.issuanceOpt.identifier)
          issuer = resolution.issuer
        }

        if (!issuer) {
          throw Error(`We could not determine the issuer, which means we cannot sign the credential`)
        }
        logger.log(`Issuer for self-issued credential will be: ${issuer}`)

        const holderCredentialToSign = wrappedIssuerVC.decoded
        let proofFormat: ProofFormat = 'lds'
        if (wrappedIssuerVC.format.includes('jwt') && wrappedIssuerVC.format !== 'mso_mdoc') {
          // @ts-ignore
          holderCredentialToSign.iss = issuer
          proofFormat = 'jwt'
        }
        if ('issuer' in holderCredentialToSign && !('iss' in holderCredentialToSign)) {
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

        // @ts-ignore
        delete holderCredentialToSign.proof
        // @ts-ignore
        delete holderCredentialToSign.issuanceDate
        // @ts-ignore
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
        ...(holderCredential && { credential: holderCredential }),
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
    const persistCredential = holderCredential
      ? CredentialMapper.storedCredentialToOriginalFormat(holderCredential)
      : mappedCredentialToAccept.rawVerifiableCredential
    if (!persist && holderCredential) {
      logger.log(`Will not persist credential, since we are signing as a holder and the issuer asked not to persist`)
    } else {
      logger.log(`Persisting credential`, persistCredential)

      const issuer = CredentialMapper.issuerCorrelationIdFromIssuerType(verifiableCredential.issuer)
      const persistedCredential = await context.agent.crsAddCredential({
        credential: {
          rawDocument: JSON.stringify(persistCredential),
          kmsKeyRef: kmsKeyRef,
          identifierMethod: method,
          credentialRole: CredentialRole.HOLDER,
          issuerCorrelationType: issuer?.startsWith('did:') ? CredentialCorrelationType.DID : CredentialCorrelationType.URL,
          issuerCorrelationId: issuer,
          subjectCorrelationType:
            method === 'did' || verifiableCredential.credentialSubject.id?.startsWith('did:')
              ? CredentialCorrelationType.DID
              : CredentialCorrelationType.URL,
          subjectCorrelationId: issuer, // FIXME get separate did for subject
        },
      })
      await context.agent.emit(OID4VCIHolderEvent.CREDENTIAL_STORED, {
        credential: persistedCredential,
        vcHash: persistedCredential.hash,
      } satisfies OnCredentialStoredArgs)
    }
  }

  private async oid4vciHolderSendNotification(args: SendNotificationArgs, context: RequiredContext): Promise<void> {
    const { serverMetadata, notificationRequest, openID4VCIClientState } = args
    const notificationEndpoint = serverMetadata?.credentialIssuerMetadata?.notification_endpoint
    if (!notificationEndpoint) {
      return
    } else if (!openID4VCIClientState) {
      return Promise.reject(Error('Missing openID4VCI client state in context'))
    } else if (!notificationRequest) {
      return Promise.reject(Error('Missing notification request'))
    }

    logger.log(`Will send notification to ${notificationEndpoint}`, notificationRequest)

    const client = await OpenID4VCIClient.fromState({ state: openID4VCIClientState })
    await client.sendNotification({ notificationEndpoint }, notificationRequest, openID4VCIClientState?.accessTokenResponse?.access_token)
    logger.log(`Notification to ${notificationEndpoint} has been dispatched`)
  }

  private async oid4vciHolderGetIssuerMetadata(args: GetIssuerMetadataArgs, context: RequiredContext): Promise<EndpointMetadataResult> {
    const { issuer, errorOnNotFound = true } = args
    return MetadataClient.retrieveAllMetadata(issuer, { errorOnNotFound })
  }
}
