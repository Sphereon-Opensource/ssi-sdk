import { decodeUriAsJson } from '@sphereon/did-auth-siop'
import { getIssuerName } from '@sphereon/oid4vci-common'
import {
  ConnectionType,
  CorrelationIdentifierType,
  CredentialRole,
  IdentityOrigin,
  NonPersistedParty,
  Party,
  PartyOrigin,
  PartyTypeType,
} from '@sphereon/ssi-sdk.data-store'
import { OID4VCIMachine, OID4VCIMachineEvents, OID4VCIMachineInterpreter, OID4VCIMachineState } from '@sphereon/ssi-sdk.oid4vci-holder'
import { Siopv2MachineInterpreter, Siopv2MachineState, Siopv2OID4VPLinkHandler } from '@sphereon/ssi-sdk.siopv2-oid4vp-op-auth'
import fetch from 'cross-fetch'
import { logger } from '../index'
import { IRequiredContext } from '../types/IEbsiSupport'
import { AttestationAuthRequestUrlResult } from './Attestation'

export const addContactCallback = (context: IRequiredContext) => {
  return async (oid4vciMachine: OID4VCIMachineInterpreter, state: OID4VCIMachineState) => {
    const { serverMetadata, hasContactConsent, contactAlias } = state.context

    if (!serverMetadata) {
      return Promise.reject(Error('Missing serverMetadata in context'))
    }

    const issuerUrl: URL = new URL(serverMetadata.issuer)
    const correlationId: string = `${issuerUrl.protocol}//${issuerUrl.hostname}`
    let issuerName: string = getIssuerName(correlationId, serverMetadata.credentialIssuerMetadata)

    const party: NonPersistedParty = {
      contact: {
        displayName: issuerName,
        legalName: issuerName,
      },
      // FIXME maybe its nicer if we can also just use the id only
      // TODO using the predefined party type from the contact migrations here
      // TODO this is not used as the screen itself adds one, look at the params of the screen, this is not being passed in
      partyType: {
        id: '3875c12e-fdaa-4ef6-a340-c936e054b627',
        origin: PartyOrigin.EXTERNAL,
        type: PartyTypeType.ORGANIZATION,
        name: 'Sphereon_default_type',
        tenantId: '95e09cfc-c974-4174-86aa-7bf1d5251fb4',
      },
      uri: correlationId,
      identities: [
        {
          alias: correlationId,
          roles: [CredentialRole.ISSUER],
          origin: IdentityOrigin.EXTERNAL,
          identifier: {
            type: CorrelationIdentifierType.URL,
            correlationId: issuerUrl.hostname,
          },
          // TODO WAL-476 add support for correct connection
          connection: {
            type: ConnectionType.OPENID_CONNECT,
            config: {
              clientId: '138d7bf8-c930-4c6e-b928-97d3a4928b01',
              clientSecret: '03b3955f-d020-4f2a-8a27-4e452d4e27a0',
              scopes: ['auth'],
              issuer: 'https://example.com/app-test',
              redirectUrl: 'app:/callback',
              dangerouslyAllowInsecureHttpRequests: true,
              clientAuthMethod: 'post' as const,
            },
          },
        },
      ],
    }

    const onCreate = async ({
      party,
      issuerUrl,
      issuerName,
      correlationId,
    }: {
      party: NonPersistedParty
      issuerUrl: string
      issuerName: string
      correlationId: string
    }): Promise<void> => {
      const displayName = party.contact.displayName ?? issuerName
      const contacts: Array<Party> = await context.agent.cmGetContacts({
        filter: [
          {
            contact: {
              // Searching on legalName as displayName is not unique, and we only support organizations for now
              legalName: displayName,
            },
          },
        ],
      })
      if (contacts.length === 0 || !contacts[0]?.contact) {
        const contact = await context.agent.cmAddContact({
          ...party,
          displayName,
          legalName: displayName,
          contactType: {
            type: PartyTypeType.ORGANIZATION,
            name: displayName,
            origin: PartyOrigin.EXTERNAL,
            tenantId: party.tenantId ?? '1',
          },
        })
        oid4vciMachine.send({
          type: OID4VCIMachineEvents.CREATE_CONTACT,
          data: contact,
        })
      }
    }

    const onConsentChange = async (hasConsent: boolean): Promise<void> => {
      oid4vciMachine.send({
        type: OID4VCIMachineEvents.SET_CONTACT_CONSENT,
        data: hasConsent,
      })
    }

    const onAliasChange = async (alias: string): Promise<void> => {
      oid4vciMachine.send({
        type: OID4VCIMachineEvents.SET_CONTACT_ALIAS,
        data: alias,
      })
    }

    if (!issuerName) {
      issuerName = `EBSI unknown (${issuerUrl})`
    } else if (issuerName.startsWith('http')) {
      issuerName = `EBSI ${issuerName.replace(/https?:\/\//, '')}`
    }
    if (!contactAlias) {
      return await onAliasChange(issuerName)
    }
    issuerName = contactAlias
    if (!hasContactConsent) {
      return await onConsentChange(true)
    }
    await onCreate({ party, issuerName, issuerUrl: issuerUrl.toString(), correlationId })
  }
}

export const handleErrorCallback = (context: IRequiredContext) => {
  return async (oid4vciMachine: OID4VCIMachineInterpreter | Siopv2MachineInterpreter, state: OID4VCIMachineState | Siopv2MachineState) => {
    console.error(`error callback event: ${state.event}`, state.context.error)
    logger.trace(state.event)
  }
}

export const selectCredentialsCallback = (context: IRequiredContext) => {
  return async (oid4vciMachine: OID4VCIMachineInterpreter, state: OID4VCIMachineState) => {
    const { contact, credentialToSelectFrom, selectedCredentials } = state.context

    if (selectedCredentials && selectedCredentials.length > 0) {
      logger.info(`selected: ${selectedCredentials.join(', ')}`)
      oid4vciMachine.send({
        type: OID4VCIMachineEvents.NEXT,
      })
      return
    } else if (!contact) {
      return Promise.reject(Error('Missing contact in context'))
    }

    const onSelectType = async (selectedCredentials: Array<string>): Promise<void> => {
      console.log(`Selected credentials: ${selectedCredentials.join(', ')}`)
      oid4vciMachine.send({
        type: OID4VCIMachineEvents.SET_SELECTED_CREDENTIALS,
        data: selectedCredentials,
      })
    }

    await onSelectType(credentialToSelectFrom.map((sel) => sel.credentialId))
  }
}

export const authorizationCodeUrlCallback = (
  {
    authReqResult,
    vpLinkHandler,
  }: {
    authReqResult: AttestationAuthRequestUrlResult
    vpLinkHandler: Siopv2OID4VPLinkHandler
  },
  context: IRequiredContext,
) => {
  return async (oid4vciMachine: OID4VCIMachineInterpreter, state: OID4VCIMachineState) => {
    const url = state.context.authorizationCodeURL
    console.log('navigateAuthorizationCodeURL: ', url)
    if (!url) {
      return Promise.reject(Error('Missing authorization URL in context'))
    }
    const onOpenAuthorizationUrl = async (url: string): Promise<void> => {
      console.log('onOpenAuthorizationUrl being invoked: ', url)
      oid4vciMachine.send({
        type: OID4VCIMachineEvents.INVOKED_AUTHORIZATION_CODE_REQUEST,
        data: url,
      })
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status < 301 || response.status > 302) {
        throw Error(`When doing a headless auth, we expect to be redirected on getting the authz URL`)
      }
      const openidUri = response.headers.get('location')
      if (!openidUri || !openidUri.startsWith('openid://')) {
        let error: string | undefined = undefined
        if (openidUri) {
          if (openidUri.includes('error')) {
            error = 'Authorization server error: '
            const decoded = decodeUriAsJson(openidUri)
            if ('error' in decoded && decoded.error) {
              error += decoded.error + ', '
            }
            if ('error_description' in decoded && decoded.error_description) {
              error += decoded.error_description
            }
          }
        }
        throw Error(
          error ??
            `Expected a openid:// URI to be returned from EBSI in headless mode. Returned: ${openidUri}, ${JSON.stringify(await response.text())}`,
        )
      }

      console.log(`onOpenAuthorizationUrl after openUrl: ${url}`)
      const kid = authReqResult.authKey.meta?.jwkThumbprint
        ? `${authReqResult.identifier.did}#${authReqResult.authKey.meta.jwkThumbprint}`
        : authReqResult.identifier.kid
      await vpLinkHandler.handle(openidUri, { idOpts: { ...authReqResult.identifier, kmsKeyRef: kid } })
    }
    await onOpenAuthorizationUrl(url)
  }
}

export const reviewCredentialsCallback = (context: IRequiredContext) => {
  return async (oid4vciMachine: OID4VCIMachineInterpreter, state: OID4VCIMachineState) => {
    console.log(`# REVIEW CREDENTIALS:`)
    console.log(JSON.stringify(state.context.credentialsToAccept, null, 2))
    oid4vciMachine.send({
      type: OID4VCIMachineEvents.NEXT,
    })
  }
}

export const siopDoneCallback = ({ oid4vciMachine }: { oid4vciMachine: OID4VCIMachine }, context: IRequiredContext) => {
  return async (oid4vpMachine: Siopv2MachineInterpreter, state: Siopv2MachineState) => {
    // console.log('SIOP result:')
    // console.log(JSON.stringify(state.context, null , 2))
    if (!state.context.authorizationResponseData?.queryParams?.code) {
      throw Error(`No code was returned from the authorization step`)
    }
    oid4vciMachine.interpreter.send({
      type: OID4VCIMachineEvents.PROVIDE_AUTHORIZATION_CODE_RESPONSE,
      data: state.context.authorizationResponseData.url!,
    })
    console.log(`SIOP DONE!`)
  }
}
