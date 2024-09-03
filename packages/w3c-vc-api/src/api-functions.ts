import { checkAuth, ISingleEndpointOpts, sendErrorResponse } from '@sphereon/ssi-express-support'
import { CredentialPayload } from '@veramo/core'
import { ProofFormat } from '@veramo/core'
import { W3CVerifiableCredential } from '@veramo/core/src/types/vc-data-model'
import { Request, Response, Router } from 'express'
import { v4 } from 'uuid'
import { IIssueCredentialEndpointOpts, IRequiredContext, IVCAPIIssueOpts, IVerifyCredentialEndpointOpts } from './types'
import Debug from 'debug'
import { DocumentType, FindDigitalCredentialArgs } from '@sphereon/ssi-sdk.credential-store'
import { CredentialRole } from '@sphereon/ssi-sdk.data-store'
const debug = Debug('sphereon:ssi-sdk:w3c-vc-api')
export function issueCredentialEndpoint(router: Router, context: IRequiredContext, opts?: IIssueCredentialEndpointOpts) {
  if (opts?.enabled === false) {
    console.log(`Issue credential endpoint is disabled`)
    return
  }
  const path = opts?.path ?? '/credentials/issue'

  router.post(path, checkAuth(opts?.endpoint), async (request: Request, response: Response) => {
    try {
      const credential: CredentialPayload = request.body.credential
      const reqOpts = request.body.options ?? {}
      let reqProofFormat: ProofFormat | undefined
      if (reqOpts.proofFormat) {
        if (reqOpts?.proofFormat?.includes('ld')) {
          reqProofFormat = 'lds'
        } else {
          reqProofFormat = 'jwt'
        }
      }
      if (!credential) {
        return sendErrorResponse(response, 400, 'No credential supplied')
      }
      if (!credential.id) {
        credential.id = `urn:uuid:${v4()}`
      }
      const issueOpts: IVCAPIIssueOpts | undefined = opts?.issueCredentialOpts
      const vc = await context.agent.createVerifiableCredential({
        credential,
        save: opts?.persistIssuedCredentials !== false,
        proofFormat: reqProofFormat ?? issueOpts?.proofFormat ?? 'lds',
        fetchRemoteContexts: issueOpts?.fetchRemoteContexts !== false,
      })
      response.statusCode = 201
      return response.send({ verifiableCredential: vc })
    } catch (e) {
      return sendErrorResponse(response, 500, e.message as string, e)
    }
  })
}

export function getCredentialsEndpoint(router: Router, context: IRequiredContext, opts?: ISingleEndpointOpts) {
  if (opts?.enabled === false) {
    console.log(`Get credentials endpoint is disabled`)
    return
  }
  const path = opts?.path ?? '/credentials'
  router.get(path, checkAuth(opts?.endpoint), async (request: Request, response: Response) => {
    try {
      const credentialRole = (request.query.credentialRole as CredentialRole) || CredentialRole.HOLDER
      if (!Object.values(CredentialRole).includes(credentialRole)) {
        return sendErrorResponse(response, 400, `Invalid credentialRole: ${credentialRole}`)
      }

      const documentType = (request.query.documentType as DocumentType) || DocumentType.VC
      if (!Object.values(DocumentType).includes(documentType)) {
        return sendErrorResponse(response, 400, `Invalid documentType: ${documentType}`)
      }

      const filter: FindDigitalCredentialArgs = [
        {
          documentType: documentType,
          credentialRole: credentialRole,
        },
      ]
      const uniqueVCs = await context.agent.crsGetUniqueCredentials({ filter })
      response.statusCode = 202
      return response.send(uniqueVCs.map((uVC) => uVC.uniformVerifiableCredential))
    } catch (e) {
      return sendErrorResponse(response, 500, e.message as string, e)
    }
  })
}

export function getCredentialEndpoint(router: Router, context: IRequiredContext, opts?: ISingleEndpointOpts) {
  if (opts?.enabled === false) {
    console.log(`Get credential endpoint is disabled`)
    return
  }
  const path = opts?.path ?? '/credentials/:id'
  router.get(path, checkAuth(opts?.endpoint), async (request: Request, response: Response) => {
    try {
      const id = request.params.id
      if (!id) {
        return sendErrorResponse(response, 400, 'no id provided')
      }
      const credentialRole = (request.query.credentialRole as CredentialRole) || CredentialRole.HOLDER
      if (!Object.values(CredentialRole).includes(credentialRole)) {
        return sendErrorResponse(response, 400, `Invalid credentialRole: ${credentialRole}`)
      }

      const vcInfo = await context.agent.crsGetUniqueCredentialByIdOrHash({
        credentialRole: credentialRole,
        idOrHash: id,
      })
      if (!vcInfo) {
        return sendErrorResponse(response, 403, `id ${id} not found`)
      }
      response.statusCode = 200
      return response.send(vcInfo.uniformVerifiableCredential)
    } catch (e) {
      return sendErrorResponse(response, 500, e.message as string, e)
    }
  })
}

export function verifyCredentialEndpoint(router: Router, context: IRequiredContext, opts?: IVerifyCredentialEndpointOpts) {
  if (opts?.enabled === false) {
    console.log(`Verify credential endpoint is disabled`)
    return
  }
  router.post(opts?.path ?? '/credentials/verify', checkAuth(opts?.endpoint), async (request: Request, response: Response) => {
    try {
      debug(JSON.stringify(request.body, null, 2))
      const credential: W3CVerifiableCredential = request.body.verifiableCredential
      // const options: IIssueOptionsPayload = request.body.options
      if (!credential) {
        return sendErrorResponse(response, 400, 'No verifiable credential supplied')
      }
      const verifyResult = await context.agent.verifyCredential({
        credential,
        policies: {
          credentialStatus: false, // Do not use built-in. We have our own statusList implementations
        },
        fetchRemoteContexts: opts?.fetchRemoteContexts !== false,
      })

      response.statusCode = 200
      return response.send(verifyResult)
    } catch (e) {
      return sendErrorResponse(response, 500, e.message as string, e)
    }
  })
}

export function deleteCredentialEndpoint(router: Router, context: IRequiredContext, opts?: ISingleEndpointOpts) {
  if (opts?.enabled === false) {
    console.log(`Delete credential endpoint is disabled`)
    return
  }
  router.delete(opts?.path ?? '/credentials/:id', checkAuth(opts?.endpoint), async (request: Request, response: Response) => {
    try {
      const id = request.params.id
      if (!id) {
        return sendErrorResponse(response, 400, 'no id provided')
      }
      const credentialRole = request.query.credentialRole as CredentialRole
      if (credentialRole === undefined) {
        return sendErrorResponse(response, 400, 'credentialRole query parameter is missing')
      }
      if (!Object.values(CredentialRole).includes(credentialRole)) {
        return sendErrorResponse(response, 400, `Invalid credentialRole: ${credentialRole}`)
      }

      const vcInfo = await context.agent.crsGetUniqueCredentialByIdOrHash({
        credentialRole: credentialRole,
        idOrHash: id,
      })
      if (!vcInfo) {
        return sendErrorResponse(response, 404, `id ${id} not found`)
      }
      const success = await context.agent.crsDeleteCredentials({ filter: [{ hash: vcInfo.hash }] })
      if (success === 0) {
        return sendErrorResponse(response, 400, `Could not delete Verifiable Credential with id ${id}`)
      }
      response.statusCode = 200
      return response.send()
    } catch (e) {
      return sendErrorResponse(response, 500, e.message as string, e)
    }
  })
}
