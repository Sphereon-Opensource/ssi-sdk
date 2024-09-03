import { PresentationDefinitionWithLocation, PresentationExchange } from '@sphereon/did-auth-siop'
import { SelectResults, Status, SubmissionRequirementMatch } from '@sphereon/pex'
import { Format } from '@sphereon/pex-models'
import { ManagedIdentifierOptsOrResult, ManagedIdentifierResult } from '@sphereon/ssi-sdk-ext.identifier-resolution'
import { ProofOptions } from '@sphereon/ssi-sdk.core'
import { UniqueDigitalCredential, verifiableCredentialForRoleFilter } from '@sphereon/ssi-sdk.credential-store'
import { CredentialRole, FindDigitalCredentialArgs } from '@sphereon/ssi-sdk.data-store'
import { CompactJWT, Hasher, OriginalVerifiableCredential } from '@sphereon/ssi-types'
import {
  DEFAULT_JWT_PROOF_TYPE,
  IGetPresentationExchangeArgs,
  IOID4VPArgs,
  VerifiableCredentialsWithDefinition,
  VerifiablePresentationWithDefinition,
} from '../types'
import { createOID4VPPresentationSignCallback } from './functions'
import { OpSession } from './OpSession'

export class OID4VP {
  private readonly session: OpSession
  private readonly allIdentifiers: string[]
  private readonly hasher?: Hasher

  private constructor(args: IOID4VPArgs) {
    const { session, allIdentifiers, hasher } = args

    this.session = session
    this.allIdentifiers = allIdentifiers ?? []
    this.hasher = hasher
  }

  public static async init(session: OpSession, allIdentifiers: string[], hasher?: Hasher): Promise<OID4VP> {
    return new OID4VP({ session, allIdentifiers: allIdentifiers ?? (await session.getSupportedDIDs()), hasher })
  }

  public async getPresentationDefinitions(): Promise<PresentationDefinitionWithLocation[] | undefined> {
    const definitions = await this.session.getPresentationDefinitions()
    if (definitions) {
      PresentationExchange.assertValidPresentationDefinitionWithLocations(definitions)
    }
    return definitions
  }

  private getPresentationExchange(args: IGetPresentationExchangeArgs): PresentationExchange {
    const { verifiableCredentials, allIdentifiers, hasher } = args

    return new PresentationExchange({
      allDIDs: allIdentifiers ?? this.allIdentifiers,
      allVerifiableCredentials: verifiableCredentials,
      hasher: hasher ?? this.hasher,
    })
  }

  public async createVerifiablePresentations(
    credentialRole: CredentialRole,
    credentialsWithDefinitions: VerifiableCredentialsWithDefinition[],
    opts?: {
      forceNoCredentialsInVP?: boolean // Allow to create a VP without credentials, like EBSI is using it. Defaults to false
      restrictToFormats?: Format
      restrictToDIDMethods?: string[]
      proofOpts?: ProofOptions
      idOpts?: ManagedIdentifierOptsOrResult
      skipDidResolution?: boolean
      holderDID?: string
      subjectIsHolder?: boolean
      hasher?: Hasher
      applyFilter?: boolean
    },
  ): Promise<VerifiablePresentationWithDefinition[]> {
    return await Promise.all(credentialsWithDefinitions.map((cred) => this.createVerifiablePresentation(credentialRole, cred, opts)))
  }

  public async createVerifiablePresentation(
    credentialRole: CredentialRole,
    selectedVerifiableCredentials: VerifiableCredentialsWithDefinition,
    opts?: {
      forceNoCredentialsInVP?: boolean // Allow to create a VP without credentials, like EBSI is using it. Defaults to false
      restrictToFormats?: Format
      restrictToDIDMethods?: string[]
      proofOpts?: ProofOptions
      idOpts?: ManagedIdentifierOptsOrResult
      skipDidResolution?: boolean
      holder?: string
      subjectIsHolder?: boolean
      applyFilter?: boolean
      hasher?: Hasher
    },
  ): Promise<VerifiablePresentationWithDefinition> {
    const { subjectIsHolder, holder, forceNoCredentialsInVP = false } = { ...opts }
    if (subjectIsHolder && holder) {
      throw Error('Cannot both have subject is holder and a holderDID value at the same time (programming error)')
    }
    if (forceNoCredentialsInVP) {
      selectedVerifiableCredentials.credentials = []
    } else if (!selectedVerifiableCredentials?.credentials || selectedVerifiableCredentials.credentials.length === 0) {
      throw Error('No verifiable verifiableCredentials provided for presentation definition')
    }

    const proofOptions: ProofOptions = {
      ...opts?.proofOpts,
      challenge: opts?.proofOpts?.nonce ?? opts?.proofOpts?.challenge ?? this.session.nonce,
      domain: opts?.proofOpts?.domain ?? (await this.session.getRedirectUri()),
    }

    let idOpts = opts?.idOpts
    if (!idOpts) {
      if (opts?.subjectIsHolder) {
        if (forceNoCredentialsInVP) {
          return Promise.reject(
            Error(
              `Cannot have subject is holder, when force no credentials is being used, as we could never determine the holder then. Please provide holderDID`,
            ),
          )
        }
        const firstUniqueDC = selectedVerifiableCredentials.credentials[0]
        //        const firstVC = firstUniqueDC.uniformVerifiableCredential!
        if (typeof firstUniqueDC !== 'object' || !('digitalCredential' in firstUniqueDC)) {
          return Promise.reject(Error('If no opts provided, credentials should be of type UniqueDigitalCredential'))
        }
        idOpts = await this.session.context.agent.identifierManagedGetByKid({
          identifier: firstUniqueDC.digitalCredential.kmsKeyRef,
          kmsKeyRef: firstUniqueDC.digitalCredential.kmsKeyRef,
        })

        /*
        const holder = CredentialMapper.isSdJwtDecodedCredential(firstVC)
          ? firstVC.decodedPayload.cnf?.jwk
            ? //TODO SDK-19: convert the JWK to hex and search for the appropriate key and associated DID
              //doesn't apply to did:jwk only, as you can represent any DID key as a JWK. So whenever you encounter a JWK it doesn't mean it had to come from a did:jwk in the system. It just can always be represented as a did:jwk
              `did:jwk:${encodeJoseBlob(firstVC.decodedPayload.cnf?.jwk)}#0`
            : firstVC.decodedPayload.sub
          : Array.isArray(firstVC.credentialSubject)
            ? firstVC.credentialSubject[0].id
            : firstVC.credentialSubject.id
          if (holder) {
              idOpts = {identifier: holder}
          }
*/
      } else if (opts?.holder) {
        idOpts = { identifier: opts.holder }
      }
    }

    // We are making sure to filter, in case the user submitted all verifiableCredentials in the wallet/agent. We also make sure to get original formats back
    const vcs = forceNoCredentialsInVP
      ? selectedVerifiableCredentials
      : opts?.applyFilter
        ? await this.filterCredentials(credentialRole, selectedVerifiableCredentials.definition, {
            restrictToFormats: opts?.restrictToFormats,
            restrictToDIDMethods: opts?.restrictToDIDMethods,
            filterOpts: {
              verifiableCredentials: selectedVerifiableCredentials.credentials,
            },
          })
        : {
            definition: selectedVerifiableCredentials.definition,
            credentials: selectedVerifiableCredentials.credentials,
          }

    if (!idOpts) {
      return Promise.reject(Error(`No identifier options present at this point`))
    }
    const signCallback = await createOID4VPPresentationSignCallback({
      presentationSignCallback: this.session.options.presentationSignCallback,
      idOpts,
      context: this.session.context,
      domain: proofOptions.domain,
      challenge: proofOptions.challenge,
      format: opts?.restrictToFormats ?? selectedVerifiableCredentials.definition.definition.format,
      skipDidResolution: opts?.skipDidResolution ?? false,
    })
    const identifier: ManagedIdentifierResult = await this.session.context.agent.identifierManagedGet(idOpts)
    const verifiableCredentials = vcs.credentials.map((credential) =>
      typeof credential === 'object' && 'digitalCredential' in credential ? credential.originalVerifiableCredential! : credential,
    )
    const presentationResult = await this.getPresentationExchange({
      verifiableCredentials: verifiableCredentials,
      allIdentifiers: this.allIdentifiers,
      hasher: opts?.hasher,
    }).createVerifiablePresentation(vcs.definition.definition, verifiableCredentials, signCallback, {
      proofOptions,
      // fixme: Update to newer siop-vp to not require dids here.
      holderDID: identifier.kid,
    })

    const verifiablePresentation =
      typeof presentationResult.verifiablePresentation !== 'string' &&
      'proof' in presentationResult.verifiablePresentation &&
      'jwt' in presentationResult.verifiablePresentation.proof &&
      presentationResult.verifiablePresentation.proof.jwt
        ? presentationResult.verifiablePresentation.proof.jwt
        : presentationResult.verifiablePresentation

    return {
      ...presentationResult,
      verifiablePresentation,
      verifiableCredentials: verifiableCredentials,
      definition: selectedVerifiableCredentials.definition,
      idOpts: idOpts,
    }
  }

  public async filterCredentialsAgainstAllDefinitions(
    credentialRole: CredentialRole,
    opts?: {
      filterOpts?: {
        verifiableCredentials?: UniqueDigitalCredential[]
        filter?: FindDigitalCredentialArgs
      }
      holderDIDs?: string[]
      restrictToFormats?: Format
      restrictToDIDMethods?: string[]
    },
  ): Promise<VerifiableCredentialsWithDefinition[]> {
    const defs = await this.getPresentationDefinitions()
    const result: VerifiableCredentialsWithDefinition[] = []
    if (defs) {
      for (const definition of defs) {
        result.push(await this.filterCredentials(credentialRole, definition, opts))
      }
    }
    return result
  }

  public async filterCredentials(
    credentialRole: CredentialRole,
    presentationDefinition: PresentationDefinitionWithLocation,
    opts?: {
      filterOpts?: { verifiableCredentials?: (UniqueDigitalCredential | OriginalVerifiableCredential)[]; filter?: FindDigitalCredentialArgs }
      holderDIDs?: string[]
      restrictToFormats?: Format
      restrictToDIDMethods?: string[]
    },
  ): Promise<VerifiableCredentialsWithDefinition> {
    const udcMap = new Map<OriginalVerifiableCredential, UniqueDigitalCredential | OriginalVerifiableCredential>()
    opts?.filterOpts?.verifiableCredentials?.forEach((credential) => {
      if (typeof credential === 'object' && 'digitalCredential' in credential) {
        udcMap.set(credential.originalVerifiableCredential!, credential)
      } else {
        udcMap.set(credential, credential)
      }
    })

    const credentials = (
      await this.filterCredentialsWithSelectionStatus(credentialRole, presentationDefinition, {
        ...opts,
        filterOpts: {
          verifiableCredentials: opts?.filterOpts?.verifiableCredentials?.map((credential) => {
            if (typeof credential === 'object' && 'digitalCredential' in credential) {
              return credential.originalVerifiableCredential!
            } else {
              return credential
            }
          }),
        },
      })
    ).verifiableCredential
    return {
      definition: presentationDefinition,
      credentials: credentials?.map((vc) => udcMap.get(vc)!) ?? [],
    }
  }

  public async filterCredentialsWithSelectionStatus(
    credentialRole: CredentialRole,
    presentationDefinition: PresentationDefinitionWithLocation,
    opts?: {
      filterOpts?: { verifiableCredentials?: OriginalVerifiableCredential[]; filter?: FindDigitalCredentialArgs }
      holderDIDs?: string[]
      restrictToFormats?: Format
      restrictToDIDMethods?: string[]
    },
  ): Promise<SelectResults> {
    const selectionResults: SelectResults = await this.getPresentationExchange({
      verifiableCredentials: await this.getCredentials(credentialRole, opts?.filterOpts),
    }).selectVerifiableCredentialsForSubmission(presentationDefinition.definition, opts)
    if (selectionResults.errors && selectionResults.errors.length > 0) {
      throw Error(JSON.stringify(selectionResults.errors))
    } else if (selectionResults.areRequiredCredentialsPresent === Status.ERROR) {
      throw Error(`Not all required credentials are available to satisfy the relying party's request`)
    }

    const matches: SubmissionRequirementMatch[] | undefined = selectionResults.matches
    if (!matches || matches.length === 0 || !selectionResults.verifiableCredential || selectionResults.verifiableCredential.length === 0) {
      throw Error(JSON.stringify(selectionResults.errors))
    }
    return selectionResults
  }

  private async getCredentials(
    credentialRole: CredentialRole,
    filterOpts?: {
      verifiableCredentials?: OriginalVerifiableCredential[]
      filter?: FindDigitalCredentialArgs
    },
  ): Promise<OriginalVerifiableCredential[]> {
    if (filterOpts?.verifiableCredentials && filterOpts.verifiableCredentials.length > 0) {
      return filterOpts.verifiableCredentials
    }

    const filter = verifiableCredentialForRoleFilter(credentialRole, filterOpts?.filter)
    const uniqueCredentials = await this.session.context.agent.crsGetUniqueCredentials({ filter })
    return uniqueCredentials.map((uniqueVC: UniqueDigitalCredential) => {
      const vc = uniqueVC.uniformVerifiableCredential!
      const proof = Array.isArray(vc.proof) ? vc.proof : [vc.proof]
      const jwtProof = proof.find((p) => p?.type === DEFAULT_JWT_PROOF_TYPE)
      return jwtProof ? (jwtProof.jwt as CompactJWT) : vc
    })
  }
}
