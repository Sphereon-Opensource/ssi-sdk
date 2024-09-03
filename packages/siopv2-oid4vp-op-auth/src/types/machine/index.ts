import { VerifiedAuthorizationRequest } from '@sphereon/did-auth-siop'
import { ManagedIdentifierOptsOrResult } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { DidAuthConfig, Party } from '@sphereon/ssi-sdk.data-store'
import { BaseActionObject, Interpreter, ResolveTypegenMeta, ServiceMap, State, StateMachine, TypegenDisabled } from 'xstate'
import { ErrorDetails } from '../error'
import { SelectableCredentialsMap, Siopv2AuthorizationRequestData, Siopv2AuthorizationResponseData } from '../siop-service'
import { UniqueDigitalCredential } from '@sphereon/ssi-sdk.credential-store'

export type Siopv2MachineContext = {
  url: string
  idOpts?: ManagedIdentifierOptsOrResult
  didAuthConfig?: Omit<DidAuthConfig, 'identifier'>
  authorizationRequestData?: Siopv2AuthorizationRequestData
  authorizationResponseData?: Siopv2AuthorizationResponseData
  verifiedAuthorizationRequest?: VerifiedAuthorizationRequest
  contact?: Party
  hasContactConsent: boolean
  contactAlias: string
  selectableCredentialsMap?: SelectableCredentialsMap
  selectedCredentials: Array<UniqueDigitalCredential>
  error?: ErrorDetails
}

export enum Siopv2MachineStates {
  createConfig = 'createConfig',
  getSiopRequest = 'getSiopRequest',
  getSelectableCredentials = 'getSelectableCredentials',
  retrieveContact = 'retrieveContact',
  transitionFromSetup = 'transitionFromSetup',
  addContact = 'addContact',
  addContactIdentity = 'addContactIdentity',
  selectCredentials = 'selectCredentials',
  sendResponse = 'sendResponse',
  handleError = 'handleError',
  aborted = 'aborted',
  declined = 'declined',
  error = 'error',
  done = 'done',
}

export enum Siopv2MachineAddContactStates {
  idle = 'idle',
  executing = 'executing',
  next = 'next',
}

export type Siopv2MachineInterpreter = Interpreter<
  Siopv2MachineContext,
  any,
  Siopv2MachineEventTypes,
  { value: any; context: Siopv2MachineContext },
  any
>

export type Siopv2MachineState = State<
  Siopv2MachineContext,
  Siopv2MachineEventTypes,
  any,
  {
    value: any
    context: Siopv2MachineContext
  },
  any
>

export type Siopv2StateMachine = StateMachine<
  Siopv2MachineContext,
  any,
  Siopv2MachineEventTypes,
  { value: any; context: Siopv2MachineContext },
  BaseActionObject,
  ServiceMap,
  ResolveTypegenMeta<TypegenDisabled, Siopv2MachineEventTypes, BaseActionObject, ServiceMap>
>

export type CreateSiopv2MachineOpts = {
  url: string | URL
  idOpts?: ManagedIdentifierOptsOrResult
  machineId?: string
}

export type Siopv2MachineInstanceOpts = {
  services?: any
  guards?: any
  subscription?: () => void
  requireCustomNavigationHook?: boolean
  stateNavigationListener?: (siopv2Machine: Siopv2MachineInterpreter, state: Siopv2MachineState, navigation?: any) => Promise<void>
} & CreateSiopv2MachineOpts

export enum Siopv2MachineEvents {
  NEXT = 'NEXT',
  PREVIOUS = 'PREVIOUS',
  DECLINE = 'DECLINE',
  SET_CONTACT_ALIAS = 'SET_CONTACT_ALIAS',
  SET_CONTACT_CONSENT = 'SET_CONTACT_CONSENT',
  CREATE_CONTACT = 'CREATE_CONTACT',
  SET_SELECTED_CREDENTIALS = 'SET_SELECTED_CREDENTIALS',
}

export enum Siopv2MachineGuards {
  hasNoContactGuard = 'Siopv2HasNoContactGuard',
  createContactGuard = 'Siopv2CreateContactGuard',
  hasContactGuard = 'Siopv2HasContactGuard',
  hasAuthorizationRequestGuard = 'Siopv2HasAuthorizationRequestGuard',
  hasSelectableCredentialsAndContactGuard = 'Siopv2HasSelectableCredentialsAndContactGuard',
  hasSelectedRequiredCredentialsGuard = 'Siopv2HasSelectedRequiredCredentialsGuard',
  siopOnlyGuard = 'Siopv2IsSiopOnlyGuard',
  siopWithOID4VPGuard = 'Siopv2IsSiopWithOID4VPGuard',
}

export enum Siopv2MachineServices {
  getSiopRequest = 'getSiopRequest',
  getSelectableCredentials = 'getSelectableCredentials',
  retrieveContact = 'retrieveContact',
  addContactIdentity = 'addContactIdentity',
  sendResponse = 'sendResponse',
  createConfig = 'createConfig',
}

export type Siopv2MachineEventTypes =
  | NextEvent
  | PreviousEvent
  | DeclineEvent
  | CreateContactEvent
  | ContactConsentEvent
  | ContactAliasEvent
  | SelectCredentialsEvent

export type NextEvent = { type: Siopv2MachineEvents.NEXT }
export type PreviousEvent = { type: Siopv2MachineEvents.PREVIOUS }
export type DeclineEvent = { type: Siopv2MachineEvents.DECLINE }
export type ContactConsentEvent = { type: Siopv2MachineEvents.SET_CONTACT_CONSENT; data: boolean }
export type ContactAliasEvent = { type: Siopv2MachineEvents.SET_CONTACT_ALIAS; data: string }
export type CreateContactEvent = { type: Siopv2MachineEvents.CREATE_CONTACT; data: Party }
export type SelectCredentialsEvent = {
  type: Siopv2MachineEvents.SET_SELECTED_CREDENTIALS
  data: Array<UniqueDigitalCredential>
}

export type Siopv2Machine = {
  interpreter: Siopv2MachineInterpreter
}
