import { TransactionRequest } from '@ethersproject/abstract-provider'
import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer'
import { IAgentContext, IKeyManager } from '@veramo/core'

export type rpcMethods = 'eth_call' | 'eth_getBalance'

export interface IWeb3Provider {
  isMetaMask?: boolean

  request(args: { method: 'eth_call'; params: any[] }): Promise<any>
  request(args: { method: 'eth_getBalance'; params: string[] }): Promise<string>
  request(args: { method: 'eth_accounts'; params: [] }): Promise<string[]>
  request(args: { method: 'eth_requestAccounts'; params: [] }): Promise<string[]>
  request(args: { method: 'net_version'; params: [] }): Promise<number>
  request(args: { method: 'eth_chainId'; params: [] }): Promise<string>
  request(args: { method: 'personal_sign'; params: string[] }): Promise<string>
  request(args: { method: 'eth_signTypedData' | 'eth_signTypedData_v1'; params: [object[], string] }): Promise<string>
  request(args: { method: 'eth_signTypedData_v3' | 'eth_signTypedData_v4'; params: string[] }): Promise<string>
  request(args: { method: 'eth_sendTransaction'; params: TransactionRequest[] }): Promise<string>
  request(args: { method: rpcMethods | string; params?: any[] }): Promise<any>

  emit(eventName: string, ...args: any[]): void
  on(eventName: string, listener: (eventName: string) => void): void
}

export type IRequiredContext = IAgentContext<IKeyManager>

export interface PendingRequest {
  requestInfo: { method: string; params: any[] }
  reject: (err: { message?: string; code?: number }) => void
  authorize: () => Promise<void>
}

export interface ChainConnection {
  chainId: number
  rpcUrl: string
}

export interface Web3ProviderConfig {
  debug?: boolean
  logger: typeof console.log
}
export interface TypedDataSigner {
  _signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>): Promise<string>
}

export enum Web3Method {
  RequestAccounts = 'eth_requestAccounts',
  Accounts = 'eth_accounts',
  SendTransaction = 'eth_sendTransaction',
  SwitchEthereumChain = 'wallet_switchEthereumChain',
  AddEthereumChain = 'wallet_addEthereumChain',
  SignMessage = 'personal_sign',
  SignTypedData = 'eth_signTypedData',
  SignTypedDataV1 = 'eth_signTypedData_v1',
  SignTypedDataV3 = 'eth_signTypedData_v3',
  SignTypedDataV4 = 'eth_signTypedData_v4',
}

export function without<T>(list: T[], item: T): T[] {
  const idx = list.indexOf(item)
  if (idx >= 0) {
    return list.slice(0, idx).concat(list.slice(idx + 1))
  }
  return list
}
