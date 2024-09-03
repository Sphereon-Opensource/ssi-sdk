import { Hasher, kbHeader, KBOptions, kbPayload, SaltGenerator } from '@sd-jwt/types'
import { SdJwtVcPayload as SdJwtPayload } from '@sd-jwt/sd-jwt-vc'
import { IIdentifierResolution } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { IJwtService } from '@sphereon/ssi-sdk-ext.jwt-service'
import { JoseSignatureAlgorithm } from '@sphereon/ssi-types'
import { DIDDocumentSection, IAgentContext, IDIDManager, IKeyManager, IPluginMethodMap, IResolver } from '@veramo/core'
import { ImDLMdoc } from '@sphereon/ssi-sdk.mdl-mdoc'
import { contextHasPlugin } from '@sphereon/ssi-sdk.agent-config'

export const sdJwtPluginContextMethods: Array<string> = ['createSdJwtVc', 'createSdJwtPresentation', 'verifySdJwtVc', 'verifySdJwtPresentation']

/**
 * My Agent Plugin description.
 *
 * This is the interface that describes what your plugin can do.
 * The methods listed here, will be directly available to the veramo agent where your plugin is going to be used.
 * Depending on the agent configuration, other agent plugins, as well as the application where the agent is used
 * will be able to call these methods.
 *
 * To build a schema for your plugin using standard tools, you must link to this file in your package.json.
 * Example:
 * ```
 * "veramo": {
 *    "pluginInterfaces": {
 *      "IMyAgentPlugin": "./src/types/IMyAgentPlugin.ts"
 *    }
 *  },
 * ```
 *
 * @beta
 */
export interface ISDJwtPlugin extends IPluginMethodMap {
  /**
   * Your plugin method description
   *
   * @param args - Input parameters for this method
   * @param context - The required context where this method can run.
   *   Declaring a context type here lets other developers know which other plugins
   *   need to also be installed for this method to work.
   */
  /**
   * Create a signed SD-JWT credential.
   * @param args - Arguments necessary for the creation of a SD-JWT credential.
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   */
  createSdJwtVc(args: ICreateSdJwtVcArgs, context: IRequiredContext): Promise<ICreateSdJwtVcResult>

  /**
   * Create a signed SD-JWT presentation.
   * @param args - Arguments necessary for the creation of a SD-JWT presentation.
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   */
  createSdJwtPresentation(args: ICreateSdJwtPresentationArgs, context: IRequiredContext): Promise<ICreateSdJwtPresentationResult>

  /**
   * Verify a signed SD-JWT credential.
   * @param args - Arguments necessary for the verification of a SD-JWT credential.
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   */
  verifySdJwtVc(args: IVerifySdJwtVcArgs, context: IRequiredContext): Promise<IVerifySdJwtVcResult>

  /**
   * Verify a signed SD-JWT presentation.
   * @param args - Arguments necessary for the verification of a SD-JWT presentation.
   * @param context - This reserved param is automatically added and handled by the framework, *do not override*
   */
  verifySdJwtPresentation(args: IVerifySdJwtPresentationArgs, context: IRequiredContext): Promise<IVerifySdJwtPresentationResult>
}

export function contextHasSDJwtPlugin(context: IAgentContext<IPluginMethodMap>): context is IAgentContext<ISDJwtPlugin> {
  return contextHasPlugin(context, 'verifySdJwtVc')
}

/**
 * ICreateSdJwtVcArgs
 *
 * @beta
 */

export interface SdJwtVcPayload extends SdJwtPayload {
  x5c?: string[]
}

export interface ICreateSdJwtVcArgs {
  credentialPayload: SdJwtVcPayload

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  disclosureFrame?: IDisclosureFrame
}

/**
 * @beta
 */
export interface IDisclosureFrame {
  _sd?: string[]
  _sd_decoy?: number

  [x: string]: string[] | number | IDisclosureFrame | undefined
}

/**
 * ICreateSdJwtVcResult
 *
 * @beta
 */
export interface ICreateSdJwtVcResult {
  /**
   * the encoded sd-jwt credential
   */
  credential: string
}

/**
 *
 * @beta
 */
export interface ICreateSdJwtPresentationArgs {
  /**
   * Encoded SD-JWT credential
   */
  presentation: string

  /*
   * The keys to use for selective disclosure for presentation
   * if not provided, all keys will be disclosed
   * if empty object, no keys will be disclosed
   */
  presentationFrame?: IPresentationFrame

  /**
   * Allows to override the holder. Normally it will be looked up from the cnf or sub values
   */
  holder?: string

  /**
   * Information to include to add key binding.
   */
  kb?: KBOptions
}

/**
 * @beta
 */
export interface IPresentationFrame {
  [x: string]: boolean | IPresentationFrame
}

/**
 * Created presentation
 * @beta
 */
export interface ICreateSdJwtPresentationResult {
  /**
   * Encoded presentation.
   */
  presentation: string
}

/**
 * @beta
 */
export interface IVerifySdJwtVcArgs {
  credential: string
}

/**
 * @beta
 */
export type IVerifySdJwtVcResult = {
  payload: SdJwtPayload
  header: Record<string, unknown>
  kb?: { header: kbHeader; payload: kbPayload }
}

/**
 * @beta
 */
export interface IVerifySdJwtPresentationArgs {
  presentation: string

  requiredClaimKeys?: string[]

  kb?: boolean
}

/**
 * @beta
 */
export type IVerifySdJwtPresentationResult = {
  payload: unknown //fixme: maybe this can be `SdJwtPayload`
  header: Record<string, unknown> | undefined
  kb?: { header: kbHeader; payload: kbPayload }
}

export type SignKeyArgs = {
  identifier: string
  vmRelationship: DIDDocumentSection
}

export type SignKeyResult = {
  alg: JoseSignatureAlgorithm
  key: {
    kmsKeyRef: string
    x5c?: string[]
    jwkThumbprint?: string
  }
}
/**
 * This context describes the requirements of this plugin.
 * For this plugin to function properly, the agent needs to also have other plugins installed that implement the
 * interfaces declared here.
 * You can also define requirements on a more granular level, for each plugin method or event handler of your plugin.
 *
 * @beta
 */
export type IRequiredContext = IAgentContext<IDIDManager & IIdentifierResolution & IJwtService & IResolver & IKeyManager & ImDLMdoc>

export type SdJwtVerifySignature = (data: string, signature: string, publicKey: JsonWebKey) => Promise<boolean>
export interface SdJWTImplementation {
  saltGenerator?: SaltGenerator
  hasher?: Hasher
  verifySignature?: SdJwtVerifySignature
}

export interface Claims {
  /**
   * Subject of the SD-JWT
   */
  sub?: string
  cnf?: {
    jwk: JsonWebKey
  }

  [key: string]: unknown
}
