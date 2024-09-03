import { com } from '@sphereon/kmp-mdl-mdoc'
import { LOG } from '@sphereon/oid4vci-client'
import {
  CredentialConfigurationSupported,
  CredentialOfferFormatV1_0_11,
  CredentialResponse,
  CredentialsSupportedDisplay,
  getSupportedCredentials,
  getTypesFromCredentialSupported,
  getTypesFromObject,
  MetadataDisplay,
  OpenId4VCIVersion,
} from '@sphereon/oid4vci-common'
import { KeyUse } from '@sphereon/ssi-sdk-ext.did-resolver-jwk'
import { getOrCreatePrimaryIdentifier, KeyManagementSystemEnum, SupportedDidMethodEnum } from '@sphereon/ssi-sdk-ext.did-utils'
import {
  isIIdentifier,
  isManagedIdentifierDidResult,
  isManagedIdentifierResult,
  ManagedIdentifierMethod,
  ManagedIdentifierResult,
  managedIdentifierToJwk,
} from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { keyTypeFromCryptographicSuite } from '@sphereon/ssi-sdk-ext.key-utils'
import { IBasicCredentialLocaleBranding, IBasicIssuerLocaleBranding } from '@sphereon/ssi-sdk.data-store'

import { IVerifySdJwtVcResult } from '@sphereon/ssi-sdk.sd-jwt'
import {
  CredentialMapper,
  ICoseKeyJson,
  IVerifiableCredential,
  IVerifyResult,
  JoseSignatureAlgorithm,
  JoseSignatureAlgorithmString,
  OriginalVerifiableCredential,
  sdJwtDecodedCredentialToUniformCredential,
  SdJwtDecodedVerifiableCredential,
  W3CVerifiableCredential,
  WrappedVerifiableCredential,
} from '@sphereon/ssi-types'
import { IVerifyCredentialArgs, W3CVerifiableCredential as VeramoW3CVerifiableCredential } from '@veramo/core'
import { asArray } from '@veramo/utils'
import { translate } from '../localization/Localization'
import {
  CredentialVerificationError,
  DidAgents,
  GetCredentialBrandingArgs,
  GetCredentialConfigsSupportedArgs,
  GetCredentialConfigsSupportedBySingleTypeOrIdArgs,
  GetIdentifierArgs,
  GetIssuanceCryptoSuiteArgs,
  GetIssuanceDidMethodArgs,
  GetIssuanceOptsArgs,
  GetIssuerBrandingArgs,
  GetPreferredCredentialFormatsArgs,
  IssuanceOpts,
  MapCredentialToAcceptArgs,
  MappedCredentialToAccept,
  OID4VCIHolderEvent,
  RequiredContext,
  SelectAppLocaleBrandingArgs,
  VerificationResult,
  VerificationSubResult,
  VerifyCredentialArgs,
  VerifyCredentialToAcceptArgs,
  VerifyMdocArgs,
  VerifySDJWTCredentialArgs,
} from '../types/IOID4VCIHolder'
import { credentialLocaleBrandingFrom, issuerLocaleBrandingFrom } from './OIDC4VCIBrandingMapper'
import IVerifySignatureResult = com.sphereon.crypto.IVerifySignatureResult
import decodeFrom = com.sphereon.kmp.decodeFrom
import IssuerSignedCbor = com.sphereon.mdoc.data.device.IssuerSignedCbor

export const DID_PREFIX = 'did'

export const getCredentialBranding = async (args: GetCredentialBrandingArgs): Promise<Record<string, Array<IBasicCredentialLocaleBranding>>> => {
  const { credentialsSupported, context } = args
  const credentialBranding: Record<string, Array<IBasicCredentialLocaleBranding>> = {}
  await Promise.all(
    Object.entries(credentialsSupported).map(async ([configId, credentialsConfigSupported]) => {
      const localeBranding: Array<IBasicCredentialLocaleBranding> = await Promise.all(
        (credentialsConfigSupported.display ?? []).map(
          async (display: CredentialsSupportedDisplay): Promise<IBasicCredentialLocaleBranding> =>
            await context.agent.ibCredentialLocaleBrandingFrom({ localeBranding: await credentialLocaleBrandingFrom(display) }),
        ),
      )

      const defaultCredentialType = 'VerifiableCredential'
      const configSupportedTypes = getTypesFromCredentialSupported(credentialsConfigSupported)
      const credentialTypes: Array<string> = configSupportedTypes.length === 0 ? asArray(defaultCredentialType) : configSupportedTypes

      const filteredCredentialTypes = credentialTypes.filter((type: string): boolean => type !== defaultCredentialType)
      credentialBranding[filteredCredentialTypes[0]] = localeBranding // TODO for now taking the first type
    }),
  )

  return credentialBranding
}

export const getBasicIssuerLocaleBranding = async (args: GetIssuerBrandingArgs): Promise<Array<IBasicIssuerLocaleBranding>> => {
  const { display, context } = args
  return await Promise.all(
    display.map(async (displayItem: MetadataDisplay): Promise<IBasicIssuerLocaleBranding> => {
      const branding = await issuerLocaleBrandingFrom(displayItem)
      return context.agent.ibIssuerLocaleBrandingFrom({ localeBranding: branding })
    }),
  )
}

export const getCredentialConfigsBasedOnFormatPref = async (
  args: GetPreferredCredentialFormatsArgs,
): Promise<Record<string, CredentialConfigurationSupported>> => {
  const { vcFormatPreferences, credentials } = args
  const prefConfigs = {} as Record<string, CredentialConfigurationSupported>
  Object.entries(credentials).forEach(([key, config]) => {
    const result = !config.format || vcFormatPreferences.map((pref) => pref.toLowerCase()).includes(config.format.toLowerCase())
    if (result) {
      prefConfigs[key] = config
    }
  })

  return prefConfigs
}

export const selectCredentialLocaleBranding = async (
  args: SelectAppLocaleBrandingArgs,
): Promise<IBasicCredentialLocaleBranding | IBasicIssuerLocaleBranding | undefined> => {
  const { locale, localeBranding } = args

  return localeBranding?.find(
    (branding: IBasicCredentialLocaleBranding | IBasicIssuerLocaleBranding) =>
      locale ? branding.locale?.startsWith(locale) || branding.locale === undefined : branding.locale === undefined, // TODO refactor as we have duplicate code
  )
}

export const verifyCredentialToAccept = async (args: VerifyCredentialToAcceptArgs): Promise<VerificationResult> => {
  const { mappedCredential, hasher, context } = args

  const credential = mappedCredential.credentialToAccept.credentialResponse.credential as OriginalVerifiableCredential
  if (!credential) {
    return Promise.reject(Error('No credential found in credential response'))
  }

  const wrappedVC = CredentialMapper.toWrappedVerifiableCredential(credential, { hasher })
  if (
    wrappedVC.decoded?.iss?.includes('did:ebsi:') ||
    (typeof wrappedVC.decoded?.vc?.issuer === 'string'
      ? wrappedVC.decoded?.vc?.issuer?.includes('did:ebsi:')
      : wrappedVC.decoded?.vc?.issuer?.existingInstanceId?.includes('did:ebsi:'))
  ) {
    // TODO: Skipping VC validation for EBSI conformance issued credential, as their Issuer is not present in the ledger (sigh)
    if (JSON.stringify(wrappedVC.decoded).includes('vc:ebsi:conformance')) {
      return { source: wrappedVC, error: undefined, result: true, subResults: [] } satisfies VerificationResult
    }
  }

  const verificationResult: VerificationResult = await verifyCredential(
    {
      credential,
      hasher,
      // TODO WAL-675 we might want to allow these types of options as part of the context, now we have state machines. Allows us to pre-determine whether these policies apply and whether remote context should be fetched
      fetchRemoteContexts: true,
      policies: {
        credentialStatus: false,
        expirationDate: false,
        issuanceDate: false,
      },
    },
    context,
  )

  if (!verificationResult.result || verificationResult.error) {
    return Promise.reject(Error(verificationResult.error ?? translate('oid4vci_machine_credential_verification_failed_message')))
  }
  return verificationResult
}

export const verifyCredential = async (args: VerifyCredentialArgs, context: RequiredContext): Promise<VerificationResult> => {
  const { credential, hasher } = args

  if (CredentialMapper.isMsoMdocOid4VPEncoded(credential)) {
    return await verifyMdoc({ credential }, context)
  } else if (CredentialMapper.isSdJwtEncoded(credential)) {
    return await verifySDJWTCredential({ credential, hasher }, context)
  } else {
    return await verifyW3CCredential({ ...args, credential: credential as VeramoW3CVerifiableCredential }, context)
  }
}

export const verifyMdoc = async (args: VerifyMdocArgs, context: RequiredContext): Promise<VerificationResult> => {
  const { credential } = args

  const issuerSigned = IssuerSignedCbor.Static.cborDecode(decodeFrom(credential, com.sphereon.kmp.Encoding.BASE64URL))

  const verification = await context.agent.mdocVerifyIssuerSigned({ input: issuerSigned.toJson().issuerAuth }).catch((error: Error) => {
    return {
      name: 'mdoc',
      critical: true,
      error: true,
      message: error.message ?? 'SD-JWT VC could not be verified',
    } satisfies IVerifySignatureResult<ICoseKeyJson>
  })

  return {
    source: CredentialMapper.toWrappedVerifiableCredential(credential as OriginalVerifiableCredential),
    result: !verification.error ?? true,
    subResults: [],
    ...(verification.error && {
      error: verification.message ?? `Could not verify mdoc from issuer`,
    }),
  }
}

export const verifyW3CCredential = async (args: IVerifyCredentialArgs, context: RequiredContext): Promise<VerificationResult> => {
  // We also allow/add boolean, because 4.x Veramo returns a boolean for JWTs. 5.X will return better results
  const { credential, policies } = args

  const result: IVerifyResult | boolean = (await context.agent.verifyCredential(args)) as IVerifyResult | boolean

  if (typeof result === 'boolean') {
    return {
      // FIXME the source is never used, need to start using this as the source of truth
      source: CredentialMapper.toWrappedVerifiableCredential(args.credential as OriginalVerifiableCredential),
      result,
      ...(!result && {
        error: 'Invalid JWT VC',
        errorDetails: `JWT VC was not valid with policies: ${JSON.stringify(policies)}`,
      }),
      subResults: [],
    }
  } else {
    // TODO look at what this is doing and make it simple and readable
    let error: string | undefined
    let errorDetails: string | undefined
    const subResults: Array<VerificationSubResult> = []
    if (result.error) {
      error = result.error?.message ?? ''
      errorDetails = result.error?.details?.code ?? ''
      errorDetails = (errorDetails !== '' ? `${errorDetails}, ` : '') + (result.error?.details?.url ?? '')
      if (result.error?.errors) {
        error = (error !== '' ? `${error}, ` : '') + result.error?.errors?.map((error) => error.message ?? error.name).join(', ')
        errorDetails =
          (errorDetails !== '' ? `${errorDetails}, ` : '') +
          result.error?.errors?.map((error) => (error?.details?.code ? `${error.details.code}, ` : '') + (error?.details?.url ?? '')).join(', ')
      }
    }

    return {
      source: CredentialMapper.toWrappedVerifiableCredential(credential as OriginalVerifiableCredential),
      result: result.verified,
      subResults,
      error,
      errorDetails,
    }
  }
}

export const verifySDJWTCredential = async (args: VerifySDJWTCredentialArgs, context: RequiredContext): Promise<VerificationResult> => {
  const { credential, hasher } = args

  const verification: IVerifySdJwtVcResult | CredentialVerificationError = await context.agent
    .verifySdJwtVc({ credential })
    .catch((error: Error): CredentialVerificationError => {
      return {
        error: 'Invalid SD-JWT VC',
        errorDetails: error.message ?? 'SD-JWT VC could not be verified',
      }
    })

  const result = 'header' in verification && 'payload' in verification
  return {
    source: CredentialMapper.toWrappedVerifiableCredential(credential as OriginalVerifiableCredential, { hasher }),
    result,
    subResults: [],
    ...(!result && { ...verification }),
  }
}

export const mapCredentialToAccept = async (args: MapCredentialToAcceptArgs): Promise<MappedCredentialToAccept> => {
  const { credentialToAccept, hasher } = args

  const credentialResponse: CredentialResponse = credentialToAccept.credentialResponse
  const verifiableCredential: W3CVerifiableCredential | undefined = credentialResponse.credential
  if (!verifiableCredential) {
    return Promise.reject(Error('No credential found in credential response'))
  }

  const wrappedVerifiableCredential: WrappedVerifiableCredential = CredentialMapper.toWrappedVerifiableCredential(
    verifiableCredential as OriginalVerifiableCredential,
    { hasher },
  )
  const uniformVerifiableCredential: IVerifiableCredential = CredentialMapper.isSdJwtDecodedCredential(wrappedVerifiableCredential.credential)
    ? await sdJwtDecodedCredentialToUniformCredential(<SdJwtDecodedVerifiableCredential>wrappedVerifiableCredential.credential)
    : <IVerifiableCredential>wrappedVerifiableCredential.credential

  const correlationId: string =
    typeof uniformVerifiableCredential.issuer === 'string'
      ? uniformVerifiableCredential.issuer
      : CredentialMapper.isSdJwtDecodedCredential(uniformVerifiableCredential)
        ? uniformVerifiableCredential.decodedPayload.iss
        : uniformVerifiableCredential.issuer.id

  return {
    correlationId,
    credentialToAccept,
    types: credentialToAccept.types,
    rawVerifiableCredential: verifiableCredential,
    uniformVerifiableCredential,
    ...(credentialResponse.credential_subject_issuance && { credential_subject_issuance: credentialResponse.credential_subject_issuance }),
  }
}

export const getIdentifierOpts = async (args: GetIdentifierArgs): Promise<ManagedIdentifierResult> => {
  const { issuanceOpt, context } = args
  const { identifier: identifierArg } = issuanceOpt
  if (identifierArg && isManagedIdentifierResult(identifierArg)) {
    return identifierArg
  }
  const { supportedPreferredDidMethod, supportedBindingMethods, keyType = 'Secp256r1', kms = KeyManagementSystemEnum.LOCAL } = issuanceOpt
  let identifier: ManagedIdentifierResult

  if (identifierArg) {
    if (isIIdentifier(identifierArg.identifier)) {
      identifier = await context.agent.identifierManagedGet(identifierArg)
    } else if (!identifierArg.method && issuanceOpt.supportedBindingMethods.includes('jwk')) {
      identifier = await managedIdentifierToJwk(identifierArg, context)
    } else if (identifierArg.method && !supportedBindingMethods.includes(identifierArg.method)) {
      throw Error(`Supplied identifier method ${identifierArg.method} not supported by the issuer: ${supportedBindingMethods.join(',')}`)
    } else {
      identifier = await context.agent.identifierManagedGet(identifierArg)
    }
  }
  const agentContext = { ...context, agent: context.agent as DidAgents }

  if (
    (!identifierArg || isIIdentifier(identifierArg.identifier)) &&
    supportedPreferredDidMethod &&
    (!supportedBindingMethods || supportedBindingMethods.length === 0 || supportedBindingMethods.filter((method) => method.startsWith('did')))
  ) {
    // previous code for managing DIDs only
    const { result, created } = await getOrCreatePrimaryIdentifier(agentContext, {
      method: supportedPreferredDidMethod,
      createOpts: {
        options: {
          type: issuanceOpt.keyType,
          use: KeyUse.Signature,
          codecName: issuanceOpt.codecName,
        },
      },
    })
    if (created) {
      await agentContext.agent.emit(OID4VCIHolderEvent.IDENTIFIER_CREATED, { result })
    }
    identifier = await context.agent.identifierManagedGetByDid({
      identifier: result,
      keyType,
      offlineWhenNoDIDRegistered: result.did.startsWith('did:ebsi:'),
    })
  } else if (supportedBindingMethods.includes('jwk')) {
    // todo: we probably should do something similar as with DIDs for re-use/new keys
    const key = await context.agent.keyManagerCreate({ type: keyType, kms })
    // TODO. Create/move this to identifier service await agentContext.agent.emit(OID4VCIHolderEvent.IDENTIFIER_CREATED, { key })
    identifier = await managedIdentifierToJwk({ method: 'key', identifier: key, kmsKeyRef: key.kid }, context)
    // } else if (supportedBindingMethods.includes('cose_key')) {
    //   // COSE HERE
    //   throw Error(`Holder currently does not support binding method: ${supportedBindingMethods.join(',')}`)
  } else {
    throw Error(`Holder currently does not support binding method: ${supportedBindingMethods.join(',')}`)
  }
  args.issuanceOpt.identifier = identifier
  return identifier
}

export const getCredentialConfigsSupportedMerged = async (
  args: GetCredentialConfigsSupportedArgs,
): Promise<Record<string, CredentialConfigurationSupported>> => {
  let result = {} as Record<string, CredentialConfigurationSupported>
  ;(await getCredentialConfigsSupported(args)).forEach((supported: Record<string, CredentialConfigurationSupported>) => {
    result = { ...result, ...supported }
  })
  return result
}

export const getCredentialConfigsSupported = async (
  args: GetCredentialConfigsSupportedArgs,
): Promise<Array<Record<string, CredentialConfigurationSupported>>> => {
  const { types, configurationIds } = args
  if (Array.isArray(types) && types.length > 0) {
    return Promise.all(types.map((type) => getCredentialConfigsSupportedBySingleTypeOrId({ ...args, types: type })))
  } else if (Array.isArray(configurationIds) && configurationIds.length > 0) {
    return Promise.all(
      configurationIds.map((configurationId) =>
        getCredentialConfigsSupportedBySingleTypeOrId({
          ...args,
          configurationId,
          types: undefined,
        }),
      ),
    )
  }
  const configs = await getCredentialConfigsSupportedBySingleTypeOrId({
    ...args,
    types: undefined,
    configurationId: undefined,
  })
  return configs && Object.keys(configs).length > 0 ? [configs] : []
}
/**
 * Please note that this method only returns configs supported for a single set of credential types or a single config id.
 * If an offer contains multiple formats/types in an array or multiple config ids, you will have to call this method for all of them
 * @param args
 */
export const getCredentialConfigsSupportedBySingleTypeOrId = async (
  args: GetCredentialConfigsSupportedBySingleTypeOrIdArgs,
): Promise<Record<string, CredentialConfigurationSupported>> => {
  const { client, vcFormatPreferences, configurationId } = args
  let { format = undefined, types = undefined } = args

  function createIdFromTypes(supported: CredentialConfigurationSupported) {
    const format = supported.format
    const type: string = getTypesFromObject(supported)?.join() ?? ''
    const id = `${type}:${format}`
    return id
  }

  if (configurationId) {
    const allSupported = client.getCredentialsSupported(false)
    return Object.fromEntries(
      Object.entries(allSupported).filter(
        ([id, supported]) => id === configurationId || supported.id === configurationId || createIdFromTypes(supported) === configurationId,
      ),
    )
  }

  if (!types && !client.credentialOffer) {
    return Promise.reject(Error('openID4VCIClient has no credentialOffer and no types where provided'))
    /*} else if (!format && !client.credentialOffer) {
    return Promise.reject(Error('openID4VCIClient has no credentialOffer and no formats where provided'))*/
  }
  // We should always have a credential offer at this point given the above
  if (!Array.isArray(format) && client.credentialOffer) {
    if (
      client.version() > OpenId4VCIVersion.VER_1_0_09 &&
      typeof client.credentialOffer.credential_offer === 'object' &&
      'credentials' in client.credentialOffer.credential_offer
    ) {
      format = client.credentialOffer.credential_offer.credentials
        .filter((cred: CredentialOfferFormatV1_0_11 | string) => typeof cred !== 'string')
        .map((cred: CredentialOfferFormatV1_0_11 | string) => (cred as CredentialOfferFormatV1_0_11).format)
      if (format?.length === 0) {
        format = undefined // Otherwise we would match nothing
      }
    }
  }

  const offerSupported = getSupportedCredentials({
    types: types ? [types] : client.getCredentialOfferTypes(),
    format,
    version: client.version(),
    issuerMetadata: client.endpointMetadata.credentialIssuerMetadata,
  })
  let allSupported: Record<string, CredentialConfigurationSupported>

  if (!Array.isArray(offerSupported)) {
    allSupported = offerSupported
  } else {
    allSupported = {} satisfies Record<string, CredentialConfigurationSupported>
    offerSupported.forEach((supported) => {
      if (supported.id) {
        allSupported[supported.id as string] = supported
        return
      }
      const id = createIdFromTypes(supported)
      allSupported[id] = supported
    })
  }

  let credentialConfigsSupported = await getCredentialConfigsBasedOnFormatPref({
    credentials: allSupported,
    vcFormatPreferences,
  })
  if (!credentialConfigsSupported || Object.keys(credentialConfigsSupported).length === 0) {
    LOG.warning(`No matching supported credential found for ${client.getIssuer()}`)
  }

  if (client.credentialOffer === undefined) {
    return credentialConfigsSupported
  }
  // Filter configurations based on the credential offer IDs
  const credentialOffer = client.credentialOffer.credential_offer

  let credentialsToOffer: Record<string, CredentialConfigurationSupported>
  if ('credential_configuration_ids' in credentialOffer) {
    credentialsToOffer = Object.fromEntries(
      Object.entries(credentialConfigsSupported).filter(([configId, config]) => credentialOffer.credential_configuration_ids.includes(configId)),
    )
    if (Object.keys(credentialsToOffer).length === 0) {
      throw new Error(`No matching supported credential configs found for offer ${credentialOffer.credential_configuration_ids.join(', ')}`)
    }
  } else {
    credentialsToOffer = credentialConfigsSupported
  }
  if (Object.keys(credentialsToOffer).length === 0) {
    // Same check as above, but more generic error message, as it can also apply to below draft 13
    throw new Error(`No matching supported credential configs found for offer`)
  }

  return credentialsToOffer
}

export const getIssuanceOpts = async (args: GetIssuanceOptsArgs): Promise<Array<IssuanceOpts>> => {
  const {
    client,
    credentialsSupported,
    // serverMetadata,
    context,
    didMethodPreferences,
    jwtCryptographicSuitePreferences,
    jsonldCryptographicSuitePreferences,
    forceIssuanceOpt,
  } = args

  if (credentialsSupported === undefined || Object.keys(credentialsSupported).length === 0) {
    return Promise.reject(Error('No credentials supported'))
  }

  const getIssuanceOpts: Array<Promise<IssuanceOpts>> = Object.values(credentialsSupported).map(async (credentialSupported) => {
    /*if (!serverMetadata?.credentialIssuerMetadata) {
      return await getDefaultIssuanceOpts({ credentialSupported, opts: { client }, context })
    }*/

    const cryptographicSuite: string = await getIssuanceCryptoSuite({
      credentialSupported,
      client,
      jwtCryptographicSuitePreferences,
      jsonldCryptographicSuitePreferences,
    })
    const { didMethod, methods } = await getIssuanceMethod({
      credentialSupported,
      client,
      didMethodPreferences,
    })
    if (methods.length == 0) {
      console.log(`Could not determine supported cryptographic_binding_methods_supported, will use DIDs`)
      methods.push('did')
    }
    const issuanceOpt = forceIssuanceOpt
      ? { ...credentialSupported, ...forceIssuanceOpt }
      : ({
          ...credentialSupported,
          supportedPreferredDidMethod: didMethod,
          supportedBindingMethods: methods,
          format: credentialSupported.format,
          keyType: client.isEBSI() ? 'Secp256r1' : keyTypeFromCryptographicSuite({ suite: cryptographicSuite }),
          ...(client.isEBSI() && { codecName: 'EBSI' }),
        } satisfies IssuanceOpts)
    const identifier = await getIdentifierOpts({ issuanceOpt, context })
    if (!client.clientId && isManagedIdentifierDidResult(identifier)) {
      // FIXME: We really should fetch server metadata. Have user select required credentials. Take the first cred to determine a kid when no clientId is present and set that.
      //  Needs a preference service for crypto, keys, dids, and clientId, with ecosystem support
      client.clientId = identifier.issuer ?? identifier.did
    }
    return { ...issuanceOpt, identifier }
  })

  return await Promise.all(getIssuanceOpts)
}

export const getIssuanceMethod = async (
  opts: GetIssuanceDidMethodArgs,
): Promise<{
  methods: ManagedIdentifierMethod[]
  didMethod?: SupportedDidMethodEnum
}> => {
  const { client, credentialSupported, didMethodPreferences } = opts
  const { format, cryptographic_binding_methods_supported } = credentialSupported
  let methods: ManagedIdentifierMethod[] = [] // we use the external identifier method, as we should be supporting all values in the server metadata anyway
  if (cryptographic_binding_methods_supported && Array.isArray(cryptographic_binding_methods_supported)) {
    methods = cryptographic_binding_methods_supported as ManagedIdentifierMethod[]
    const didMethods: SupportedDidMethodEnum | undefined = didMethodPreferences.find((method: SupportedDidMethodEnum) =>
      cryptographic_binding_methods_supported.includes(`did:${method.toLowerCase() /*.replace('did:', '')*/}`),
    )
    if (didMethods) {
      return { methods, didMethod: didMethods }
    } else if (cryptographic_binding_methods_supported.includes('did')) {
      return { methods, didMethod: format ? didMethodPreferences[1] : didMethodPreferences[0] }
    } else if (methods.length > 0) {
      return { methods }
    }
    console.warn(
      `We should have been able to determine cryptographic_binding_methods_supported, will fall back to legacy behaviour. This is likely a bug`,
    )
  }

  if (client.isEBSI()) {
    return { methods: ['did'], didMethod: SupportedDidMethodEnum.DID_KEY }
  }

  // legacy fallback
  methods = ['did']
  if (!format || (format.includes('jwt') && !format?.includes('jwt_vc_json_ld'))) {
    return { methods, didMethod: format ? didMethodPreferences[1] : didMethodPreferences[0] }
  } else {
    // JsonLD
    return { methods, didMethod: didMethodPreferences[0] }
  }
}

export const getIssuanceCryptoSuite = async (opts: GetIssuanceCryptoSuiteArgs): Promise<string> => {
  const { client, credentialSupported, jwtCryptographicSuitePreferences, jsonldCryptographicSuitePreferences } = opts

  let signing_algs_supported: Array<string>
  if ('proof_types_supported' in credentialSupported && credentialSupported.proof_types_supported) {
    if ('jwt' in credentialSupported.proof_types_supported && credentialSupported.proof_types_supported.jwt) {
      signing_algs_supported = credentialSupported.proof_types_supported.jwt.proof_signing_alg_values_supported
    } else if ('ldp_vp' in credentialSupported.proof_types_supported && credentialSupported.proof_types_supported.ldp_vp) {
      signing_algs_supported = credentialSupported.proof_types_supported.ldp_vp.proof_signing_alg_values_supported
    } else if ('cwt' in credentialSupported.proof_types_supported && credentialSupported.proof_types_supported.cwt) {
      signing_algs_supported = credentialSupported.proof_types_supported.cwt.proof_signing_alg_values_supported
      console.error('cwt proof type not supported. Likely that errors will occur after this point')
    } else {
      return Promise.reject(Error(`Unsupported proof_types_supported`))
    }
  } else {
    signing_algs_supported = asArray(
      // @ts-ignore // legacy
      credentialSupported.credential_signing_alg_values_supported ?? credentialSupported.proof_signing_alg_values_supported ?? [],
    )
  }

  // TODO: Return array, so the wallet/user could choose
  switch (credentialSupported.format) {
    // @ts-ignore legacy value
    case 'jwt':
    case 'jwt_vc_json':
    case 'jwt_vc':
    case 'vc+sd-jwt':
    case 'mso_mdoc': {
      const supportedPreferences: Array<JoseSignatureAlgorithm | JoseSignatureAlgorithmString> = jwtCryptographicSuitePreferences.filter(
        (suite: JoseSignatureAlgorithm | JoseSignatureAlgorithmString) => signing_algs_supported.includes(suite),
      )

      if (supportedPreferences.length > 0) {
        return supportedPreferences[0]
      } else if (client.isEBSI()) {
        return JoseSignatureAlgorithm.ES256
      }

      // if we cannot find supported cryptographic suites, we just try with the first preference
      const fallback = jwtCryptographicSuitePreferences[0]
      console.log(`Warn: We could not determine the crypto suites from the server metadata, and will fallback to a default: ${fallback}`)
      return fallback
    }
    // @ts-ignore
    case 'ldp':
    // @ts-ignore
    case 'jwt_vc_json_ld':
    case 'ldp_vc': {
      const supportedPreferences: Array<string> = jsonldCryptographicSuitePreferences.filter((suite: string) =>
        signing_algs_supported.includes(suite),
      )
      if (supportedPreferences.length > 0) {
        return supportedPreferences[0]
      }

      // if we cannot find supported cryptographic suites, we just try with the first preference
      const fallback = jsonldCryptographicSuitePreferences[0]
      console.log(`Warn: We could not determine the crypto suites from the server metadata, and will fallback to a default: ${fallback}`)
      return fallback
    }
    default:
      return Promise.reject(Error(`Credential format '${credentialSupported.format}' not supported`))
  }
}
