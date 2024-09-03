import { SupportedVersion } from '@sphereon/did-auth-siop'
import { IPresentationDefinition, PEX } from '@sphereon/pex'
import { InputDescriptorV1, InputDescriptorV2, PresentationDefinitionV1, PresentationDefinitionV2 } from '@sphereon/pex-models'
import { ManagedIdentifierOptsOrResult } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { verifiableCredentialForRoleFilter } from '@sphereon/ssi-sdk.credential-store'
import { ConnectionType, CredentialRole } from '@sphereon/ssi-sdk.data-store'
import { CredentialMapper, Loggers, PresentationSubmission } from '@sphereon/ssi-types'
import { OID4VP, OpSession } from '../session'
import {
  LOGGER_NAMESPACE,
  RequiredContext,
  SelectableCredential,
  SelectableCredentialsMap,
  SuitableCredentialAgents,
  VerifiableCredentialsWithDefinition,
  VerifiablePresentationWithDefinition,
} from '../types'

export const logger = Loggers.DEFAULT.get(LOGGER_NAMESPACE)

export const siopSendAuthorizationResponse = async (
  connectionType: ConnectionType,
  args: {
    sessionId: string
    verifiableCredentialsWithDefinition?: VerifiableCredentialsWithDefinition[]
    idOpts?: ManagedIdentifierOptsOrResult
  },
  context: RequiredContext,
) => {
  const { agent } = context
  //const agentContext = { ...context, agent: context.agent as DidAgents }
  let { idOpts } = args

  if (connectionType !== ConnectionType.SIOPv2_OpenID4VP) {
    return Promise.reject(Error(`No supported authentication provider for type: ${connectionType}`))
  }
  const session: OpSession = await agent.siopGetOPSession({ sessionId: args.sessionId })
  /* let identifiers: Array<IIdentifier> =
    idOpts && isManagedIdentifierDidOpts(idOpts)
      ? [(await context.agent.identifierManagedGetByDid(idOpts)).identifier]
      : await session.getSupportedIdentifiers()
  if (!identifiers || identifiers.length === 0) {
    throw Error(`No DID methods found in agent that are supported by the relying party`)
  }
  */
  const request = await session.getAuthorizationRequest()
  const aud = await request.authorizationRequest.getMergedProperty<string>('aud')
  logger.debug(`AUD: ${aud}`)
  logger.debug(JSON.stringify(request.authorizationRequest))
  /*
  const clientId = await request.authorizationRequest.getMergedProperty<string>('client_id')
  const redirectUri = await request.authorizationRequest.getMergedProperty<string>('redirect_uri')
  if (clientId?.toLowerCase().includes('.ebsi.eu') || redirectUri?.toLowerCase().includes('.ebsi.eu')) {
    identifiers = identifiers.filter((id) => id.did.toLowerCase().startsWith('did:key:') || id.did.toLowerCase().startsWith('did:ebsi:'))
    if (identifiers.length === 0) {
      logger.log(`No EBSI key present yet. Creating a new one...`)
      const { result: newIdentifier, created } = await getOrCreatePrimaryIdentifier(agentContext, {
        method: SupportedDidMethodEnum.DID_KEY,
        createOpts: { options: { codecName: 'jwk_jcs-pub', type: 'Secp256r1' } },
      })
      logger.log(`EBSI key created: ${newIdentifier.did}`)
      identifiers = [newIdentifier]
      if (created) {
        await agentContext.agent.emit(Siopv2HolderEvent.IDENTIFIER_CREATED, { result: newIdentifier })
      }
    }
  }
  if (aud && aud.startsWith('did:')) {
    // The RP knows our did, so we can use it
    if (!identifiers.some((id) => id.did === aud)) {
      throw Error(`The aud DID ${aud} is not in the supported identifiers ${identifiers.map((id) => id.did)}`)
    }
    identifiers = [identifiers.find((id) => id.did === aud) as IIdentifier]
  }

  // todo: This should be moved to code calling the sendAuthorizationResponse (this) method, as to allow the user to subselect and approve credentials!
  let identifier: IIdentifier = identifiers[0]
*/
  let presentationsAndDefs: VerifiablePresentationWithDefinition[] | undefined
  let presentationSubmission: PresentationSubmission | undefined
  if (await session.hasPresentationDefinitions()) {
    const oid4vp: OID4VP = await session.getOID4VP({})

    const credentialsAndDefinitions = args.verifiableCredentialsWithDefinition
      ? args.verifiableCredentialsWithDefinition
      : await oid4vp.filterCredentialsAgainstAllDefinitions(CredentialRole.HOLDER)
    const domain =
      ((await request.authorizationRequest.getMergedProperty('client_id')) as string) ??
      request.issuer ??
      (request.versions.includes(SupportedVersion.JWT_VC_PRESENTATION_PROFILE_v1)
        ? 'https://self-issued.me/v2/openid-vc'
        : 'https://self-issued.me/v2')
    logger.log(`NONCE: ${session.nonce}, domain: ${domain}`)

    const firstUniqueDC = credentialsAndDefinitions[0].credentials[0]
    // FIXME Funke EBSI needs to be fixed
    if (typeof firstUniqueDC !== 'object' || !('digitalCredential' in firstUniqueDC)) {
      return Promise.reject(Error('SiopMachine only supports UniqueDigitalCredentials for now'))
    }
    const identifier = await session.context.agent.identifierManagedGetByKid({
      identifier: firstUniqueDC.digitalCredential.kmsKeyRef,
      kmsKeyRef: firstUniqueDC.digitalCredential.kmsKeyRef,
    })

    presentationsAndDefs = await oid4vp.createVerifiablePresentations(CredentialRole.HOLDER, credentialsAndDefinitions, {
      idOpts: identifier,
      proofOpts: {
        nonce: session.nonce,
        domain,
      },
    })
    if (!presentationsAndDefs || presentationsAndDefs.length === 0) {
      throw Error('No verifiable presentations could be created')
    } else if (presentationsAndDefs.length > 1) {
      throw Error(`Only one verifiable presentation supported for now. Got ${presentationsAndDefs.length}`)
    }

    idOpts = presentationsAndDefs[0].idOpts
    // identifier = await getIdentifier(idOpts, context)

    /*key = await getKey(identifier, 'authentication', context, idOpts.kid)
        const getIdentifierResponse = await getIdentifierWithKey({
          context,
          keyOpts: {
            identifier,
            kid: idOpts.kid,
            didMethod: parseDid(identifier.did).method as SupportedDidMethodEnum,
            keyType: key.type
          },
        })*/
    presentationSubmission = presentationsAndDefs[0].presentationSubmission
  }
  /*const key = await getKey({
    identifier,
    vmRelationship: 'authentication',
    kmsKeyRef: idOpts?.kmsKeyRef
  }, session.context)
  if (!idOpts) {
    idOpts = { identifier, kmsKeyRef: await determineKid({ key, idOpts: { identifier } }, session.context) }
  }
  const determinedKid = idOpts.kmsKeyRef?.includes('#') ? idOpts.kmsKeyRef : await determineKid({
    key,
    idOpts
  }, session.context)*/

  logger.log(`Definitions and locations:`, JSON.stringify(presentationsAndDefs?.[0]?.verifiablePresentation, null, 2))
  logger.log(`Presentation Submission:`, JSON.stringify(presentationSubmission, null, 2))
  return await session.sendAuthorizationResponse({
    ...(presentationsAndDefs && { verifiablePresentations: presentationsAndDefs?.map((pd) => pd.verifiablePresentation) }),
    ...(presentationSubmission && { presentationSubmission }),
    // todo: Change issuer value in case we do not use identifier. Use key.meta.jwkThumbprint then
    responseSignerOpts: idOpts!,
  })
}

function buildPartialPD(
  inputDescriptor: InputDescriptorV1 | InputDescriptorV2,
  presentationDefinition: PresentationDefinitionV1 | PresentationDefinitionV2,
): IPresentationDefinition {
  return {
    ...presentationDefinition,
    input_descriptors: [inputDescriptor],
  } as IPresentationDefinition
}

export const getSelectableCredentials = async (
  presentationDefinition: IPresentationDefinition,
  context: RequiredContext,
): Promise<SelectableCredentialsMap> => {
  const agentContext = { ...context, agent: context.agent as SuitableCredentialAgents }
  const { agent } = agentContext
  const pex = new PEX()

  const uniqueVerifiableCredentials = await agent.crsGetUniqueCredentials({
    filter: verifiableCredentialForRoleFilter(CredentialRole.HOLDER),
  })
  const credentialBranding = await agent.ibGetCredentialBranding()

  const selectableCredentialsMap: SelectableCredentialsMap = new Map()

  for (const inputDescriptor of presentationDefinition.input_descriptors) {
    const partialPD = buildPartialPD(inputDescriptor, presentationDefinition)
    const originalCredentials = uniqueVerifiableCredentials.map((uniqueVC) => {
      return CredentialMapper.storedCredentialToOriginalFormat(uniqueVC.originalVerifiableCredential!) // ( ! is valid for verifiableCredentialForRoleFilter )
    })
    const selectionResults = pex.selectFrom(partialPD, originalCredentials)

    const selectableCredentials: Array<SelectableCredential> = []
    for (const selectedCredential of selectionResults.verifiableCredential || []) {
      const filteredUniqueVC = uniqueVerifiableCredentials.find((uniqueVC) => {
        const proof = uniqueVC.uniformVerifiableCredential!.proof
        return Array.isArray(proof) ? proof.some((proofItem) => proofItem.jwt === selectedCredential) : proof.jwt === selectedCredential
      })

      if (filteredUniqueVC) {
        const filteredCredentialBrandings = credentialBranding.filter((cb) => cb.vcHash === filteredUniqueVC.hash)
        const issuerPartyIdentity = await agent.cmGetContacts({
          filter: [{ identities: { identifier: { correlationId: filteredUniqueVC.uniformVerifiableCredential!.issuerDid } } }],
        })
        const subjectPartyIdentity = await agent.cmGetContacts({
          filter: [{ identities: { identifier: { correlationId: filteredUniqueVC.uniformVerifiableCredential!.subjectDid } } }],
        })

        selectableCredentials.push({
          credential: filteredUniqueVC,
          credentialBranding: filteredCredentialBrandings[0]?.localeBranding,
          issuerParty: issuerPartyIdentity?.[0],
          subjectParty: subjectPartyIdentity?.[0],
        })
      }
    }
    selectableCredentialsMap.set(inputDescriptor.id, selectableCredentials)
  }
  return selectableCredentialsMap
}

export const translateCorrelationIdToName = async (correlationId: string, context: RequiredContext): Promise<string | undefined> => {
  const { agent } = context

  const contacts = await agent.cmGetContacts({
    filter: [{ identities: { identifier: { correlationId } } }],
  })

  if (contacts.length === 0) {
    return undefined
  }

  return contacts[0].contact.displayName
}
