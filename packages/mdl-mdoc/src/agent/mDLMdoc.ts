import { com } from '@sphereon/kmp-mdl-mdoc'
import { CertificateInfo, getCertificateInfo, pemOrDerToX509Certificate, X509ValidationResult } from '@sphereon/ssi-sdk-ext.x509-utils'
import { IAgentPlugin } from '@veramo/core'
import { MdocOid4vpPresentArgs, MdocOid4VPPresentationAuth, MdocOid4vpRPVerifyArgs, MdocOid4vpRPVerifyResult, schema } from '..'
import { CoseCryptoService, X509CallbackService } from '../functions'
import {
  GetX509CertificateInfoArgs,
  ImDLMdoc,
  IRequiredContext,
  KeyType,
  MdocVerifyIssuerSignedArgs,
  VerifyCertificateChainArgs,
} from '../types/ImDLMdoc'
import CoseSign1Json = com.sphereon.crypto.cose.CoseSign1Json
import ICoseKeyCbor = com.sphereon.crypto.cose.ICoseKeyCbor
import IKeyInfo = com.sphereon.crypto.IKeyInfo
import IVerifySignatureResult = com.sphereon.crypto.IVerifySignatureResult
import decodeFrom = com.sphereon.kmp.decodeFrom
import encodeTo = com.sphereon.kmp.encodeTo
import Encoding = com.sphereon.kmp.Encoding
import DeviceResponseCbor = com.sphereon.mdoc.data.device.DeviceResponseCbor
import DocumentCbor = com.sphereon.mdoc.data.device.DocumentCbor
import IOid4VPPresentationDefinition = com.sphereon.mdoc.oid4vp.IOid4VPPresentationDefinition
import Oid4VPPresentationSubmission = com.sphereon.mdoc.oid4vp.Oid4VPPresentationSubmission
import ValidationsJS = com.sphereon.mdoc.ValidationsJS

export const mdocSupportMethods: Array<string> = [
  'x509VerifyCertificateChain',
  'x509GetCertificateInfo',
  'mdocVerifyIssuerSigned',
  'mdocOid4vpHolderPresent',
  'mdocOid4vpRPVerify',
]

export class MDLMdoc implements IAgentPlugin {
  readonly schema = schema.IMDLMdoc
  readonly methods: ImDLMdoc = {
    x509VerifyCertificateChain: this.x509VerifyCertificateChain.bind(this),
    x509GetCertificateInfo: this.x509GetCertificateInfo.bind(this),
    mdocVerifyIssuerSigned: this.mdocVerifyIssuerSigned.bind(this),
    mdocOid4vpHolderPresent: this.mdocOid4vpHolderPresent.bind(this),
    mdocOid4vpRPVerify: this.mdocOid4vpRPVerify.bind(this),
  }
  private readonly trustAnchors: string[]
  private opts: {
    trustRootWhenNoAnchors?: boolean
    allowSingleNoCAChainElement?: boolean
    blindlyTrustedAnchors?: string[]
  }

  constructor(args?: {
    trustAnchors?: string[]
    opts?: {
      // Trust the supplied root from the chain, when no anchors are being passed in.
      trustRootWhenNoAnchors?: boolean
      // Do not perform a chain validation check if the chain only has a single value. This means only the certificate itself will be validated. No chain checks for CA certs will be performed. Only used when the cert has no issuer
      allowSingleNoCAChainElement?: boolean
      // WARNING: Do not use in production
      // Similar to regular trust anchors, but no validation is performed whatsoever. Do not use in production settings! Can be handy with self generated certificates as we perform many validations, making it hard to test with self-signed certs. Only applied in case a chain with 1 element is passed in to really make sure people do not abuse this option
      blindlyTrustedAnchors?: string[]
    }
  }) {
    this.trustAnchors = args?.trustAnchors ?? []
    this.opts = args?.opts ?? { trustRootWhenNoAnchors: true }
  }

  private async mdocOid4vpHolderPresent(args: MdocOid4vpPresentArgs, _context: IRequiredContext): Promise<MdocOid4VPPresentationAuth> {
    const { mdocHex, presentationDefinition, trustAnchors, verifications } = args
    const mdoc = DocumentCbor.Static.cborDecode(decodeFrom(mdocHex, Encoding.HEX))
    const validations = await ValidationsJS.fromDocumentAsync(mdoc, null, trustAnchors ?? this.trustAnchors, verifications?.allowExpiredDocuments)
    if (validations.error) {
      return Promise.reject(
        Error(
          `Validation for the MSO_MDOC failed. ${validations.verifications
            .filter((ver) => ver.error)
            .map((ver) => `${ver.name}(critical${ver.critical}): ${ver.message}`)
            .join(',')}`,
        ),
      )
    }
    const deviceResponse = mdoc.toSingleDocDeviceResponse(presentationDefinition as IOid4VPPresentationDefinition)
    const vp_token = encodeTo(deviceResponse.cborEncode(), Encoding.BASE64URL)
    const presentation_submission = Oid4VPPresentationSubmission.Static.fromPresentationDefinition(
      presentationDefinition as IOid4VPPresentationDefinition,
    )
    return { vp_token, presentation_submission }
  }

  private async mdocOid4vpRPVerify(args: MdocOid4vpRPVerifyArgs, _context: IRequiredContext): Promise<MdocOid4vpRPVerifyResult> {
    const { vp_token, presentation_submission, trustAnchors } = args
    const deviceResponse = DeviceResponseCbor.Static.cborDecode(decodeFrom(vp_token, Encoding.BASE64URL))
    if (!deviceResponse.documents) {
      return Promise.reject(Error(`No documents found in vp_token`))
    }
    let error = false
    const documents = await Promise.all(
      deviceResponse.documents.map(async (document) => {
        const validations = await ValidationsJS.fromDocumentAsync(document, null, trustAnchors ?? this.trustAnchors)
        if (!validations || validations.error) {
          error = true
        }
        if (presentation_submission.descriptor_map.find((m) => m.id === document.docType.value) === null) {
          error = true
          validations.verifications.push({
            name: 'mdoc',
            error,
            critical: error,
            message: `No descriptor map id with document type ${document.docType.value} present`,
          })
        }
        return { document: document.toJson(), validations }
      }),
    )
    return { error, documents, presentation_submission }
  }

  private async mdocVerifyIssuerSigned(args: MdocVerifyIssuerSignedArgs, context: IRequiredContext): Promise<IVerifySignatureResult<KeyType>> {
    const { input, keyInfo } = args

    // FIXME: The ignore because of json/cbor
    // @ts-ignore
    return await new CoseCryptoService().verify1(CoseSign1Json.Static.fromDTO(input).toCbor(), {
      ...keyInfo,
      key: keyInfo?.key,
    } as IKeyInfo<ICoseKeyCbor>) // fixme: Json to Cbor for key
  }

  private async x509VerifyCertificateChain(args: VerifyCertificateChainArgs, _context: IRequiredContext): Promise<X509ValidationResult> {
    const mergedAnchors: string[] = [...this.trustAnchors, ...(args.trustAnchors ?? [])]
    const trustAnchors = new Set<string>(mergedAnchors)
    return await new X509CallbackService().verifyCertificateChain({
      ...args,
      trustAnchors: Array.from(trustAnchors),
      opts: args?.opts ?? this.opts,
    })
  }

  private async x509GetCertificateInfo(args: GetX509CertificateInfoArgs, context: IRequiredContext): Promise<CertificateInfo[]> {
    const certificates = args.certificates.map((cert) => pemOrDerToX509Certificate(cert))
    return await Promise.all(certificates.map((cert) => getCertificateInfo(cert, args.sanTypeFilter && { sanTypeFilter: args.sanTypeFilter })))
  }
}
