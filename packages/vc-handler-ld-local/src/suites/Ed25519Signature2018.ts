import { encodeJoseBlob } from '@veramo/utils'
import { CredentialPayload, DIDDocument, IAgentContext, IKey, TKeyType, VerifiableCredential } from '@veramo/core'
import suiteContext2018 from 'ed25519-signature-2018-context'
import { Ed25519Signature2018 } from '@transmute/ed25519-signature-2018'
import * as u8a from 'uint8arrays'
import { RequiredAgentMethods, SphereonLdSignature } from '../ld-suites'
import { Ed25519KeyPair } from '@transmute/ed25519-key-pair'

export class SphereonEd25519Signature2018 extends SphereonLdSignature {
  constructor() {
    super()
    // Ensure it is loaded
    suiteContext2018?.constants
  }

  getSupportedVerificationType(): string {
    return 'Ed25519VerificationKey2018'
  }

  getSupportedVeramoKeyType(): TKeyType {
    return 'Ed25519'
  }

  getContext(): string {
    return 'https://w3id.org/security/suites/ed25519-2018/v1'
  }

  getSuiteForSigning(key: IKey, issuerDid: string, verificationMethodId: string, context: IAgentContext<RequiredAgentMethods>): any {
    const controller = issuerDid

    // DID Key ID
    let id = verificationMethodId

    const signer = {
      // returns a JWS detached
      sign: async (args: { data: Uint8Array }): Promise<string> => {
        const header = {
          alg: 'EdDSA',
          b64: false,
          crit: ['b64'],
        }
        const headerString = encodeJoseBlob(header)
        const messageBuffer = u8a.concat([u8a.fromString(`${headerString}.`, 'utf-8'), args.data])
        const messageString = u8a.toString(messageBuffer, 'base64')
        const signature = await context.agent.keyManagerSign({
          keyRef: key.kid,
          algorithm: 'EdDSA',
          data: messageString,
          encoding: 'base64',
        })
        return `${headerString}..${signature}`
        // return u8a.fromString(`${headerString}..${signature}`)
      },
    }

    const options = {
      id: id,
      controller: controller,
      publicKey: u8a.fromString(key.publicKeyHex),
      signer: () => signer,
      type: this.getSupportedVerificationType(),
    }

    // For now we always go through this route given the multibase key has an invalid header
    const verificationKey = new Ed25519KeyPair(options)
    // overwrite the signer since we're not passing the private key and transmute doesn't support that behavior
    verificationKey.signer = () => signer as any
    // verificationKey.type = this.getSupportedVerificationType()

    return new Ed25519Signature2018({key: verificationKey, signer: signer })
  }

  preVerificationCredModification(credential: VerifiableCredential): void {}
  getSuiteForVerification(): any {
    return new Ed25519Signature2018()
  }

  preSigningCredModification(credential: CredentialPayload): void {
    console.log(credential)
    // nothing to do here
  }

  preDidResolutionModification(didUrl: string, didDoc: DIDDocument): void {
    // nothing to do here
  }
}
