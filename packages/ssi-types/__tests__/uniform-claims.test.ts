import * as crypto from 'node:crypto'
import * as fs from 'fs'
import {
  CredentialMapper,
  DocumentFormat,
  ICredential,
  ICredentialSubject,
  IVerifiableCredential,
  JwtDecodedVerifiablePresentation,
  W3CVerifiableCredential,
} from '../src'

function getFile(path: string) {
  return fs.readFileSync(path, 'utf-8').replace(/\r/g, '').replace(/\n/g, '')
}

function getFileAsJson(path: string) {
  return JSON.parse(getFile(path))
}

export const generateDigest = (data: string, algorithm: string): Uint8Array => {
  return new Uint8Array(crypto.createHash('sha256').update(data).digest())
}

describe('Uniform VC claims', () => {
  it('should set expiration date if exp is present in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['exp' as keyof IVerifiableCredential] = (+new Date()).toString()
    const vc = CredentialMapper.toUniformCredential(jwtVc)
    expect(vc.expirationDate).toEqual(new Date(parseInt(jwtVc['exp' as keyof IVerifiableCredential] as string)).toISOString())
  })

  it('should set expiration date if exp is present in JWT vc as number', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]

    jwtVc['exp' as keyof IVerifiableCredential] = new Date().valueOf()
    const vc = CredentialMapper.toUniformCredential(jwtVc)
    expect(vc.expirationDate).toEqual(new Date(jwtVc['exp' as keyof IVerifiableCredential] as string).toISOString())
  })

  it('should throw an error if expiration date and exp are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['exp' as keyof IVerifiableCredential] = (+new Date()).toString()
    ;(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).expirationDate = (+new Date(
      (jwtVc['exp' as keyof IVerifiableCredential] as string) + 2,
    )).toString()
    expect(() => CredentialMapper.toUniformCredential(jwtVc, { maxTimeSkewInMS: 0 })).toThrowError(
      `Inconsistent expiration dates between JWT claim (${new Date(
        parseInt(jwtVc['exp' as keyof IVerifiableCredential] as string),
      ).toISOString()}) and VC value (${(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).expirationDate})`,
    )
  })

  it('should set issuer if iss is present in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    ;(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).issuer
    const vc = CredentialMapper.toUniformCredential(jwtVc)
    expect(vc.issuer).toEqual(jwtVc['iss' as keyof IVerifiableCredential])
  })

  it('should throw an error if issuer and iss are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['iss' as keyof IVerifiableCredential] = 'did:test:456'
    expect(() => CredentialMapper.toUniformCredential(jwtVc)).toThrowError(
      `Inconsistent issuers between JWT claim (${jwtVc['iss' as keyof IVerifiableCredential]}) and VC value (${
        (<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).issuer
      })`,
    )
  })

  it('should set issuance date if nbf is present in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['nbf' as keyof IVerifiableCredential] = (+new Date()).toString()
    ;(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).issuanceDate = new Date(
      parseInt(jwtVc['nbf' as keyof IVerifiableCredential] as string),
    ).toISOString()
    const vc = CredentialMapper.toUniformCredential(jwtVc)
    expect(vc.issuanceDate).toEqual(new Date(parseInt(jwtVc['nbf' as keyof IVerifiableCredential] as string)).toISOString())
  })

  it('should throw an error if issuance date and nbf are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    const nbf = new Date().valueOf()
    jwtVc['nbf' as keyof IVerifiableCredential] = nbf / 1000
    ;(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).issuanceDate = new Date(+new Date() + 2).toISOString()
    expect(() => CredentialMapper.toUniformCredential(jwtVc, { maxTimeSkewInMS: 1 })).toThrowError(
      `Inconsistent issuance dates between JWT claim (${new Date(nbf).toISOString().replace(/\.\d\d\dZ/, 'Z')}) and VC value (${
        (<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).issuanceDate
      })`,
    )
  })

  it('should set credentialSubject.id if sub is present in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['sub' as keyof IVerifiableCredential] = (<ICredentialSubject>(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).credentialSubject).id
    const vc = CredentialMapper.toUniformCredential(jwtVc)
    expect(!Array.isArray(vc.credentialSubject) && vc.credentialSubject.id).toEqual(jwtVc['sub' as keyof IVerifiableCredential])
  })

  it('should throw an error if credentialSubject.id and sub are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['sub' as keyof IVerifiableCredential] = 'did:test:123'
    expect(() => CredentialMapper.toUniformCredential(jwtVc)).toThrowError(
      `Inconsistent credential subject ids between JWT claim (${jwtVc['sub' as keyof IVerifiableCredential]}) and VC value (${
        (<ICredentialSubject>(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).credentialSubject).id
      })`,
    )
  })

  it('should set id if jti is present in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['jti' as keyof IVerifiableCredential] = (<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).id
    const vc = CredentialMapper.toUniformCredential(jwtVc)
    expect(vc.id).toEqual(jwtVc['jti' as keyof IVerifiableCredential])
  })

  it('should throw an error if id and jti are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['jti' as keyof IVerifiableCredential] = 'test'
    expect(() => CredentialMapper.toUniformCredential(jwtVc)).toThrowError(
      `Inconsistent credential ids between JWT claim (${jwtVc['jti' as keyof IVerifiableCredential]}) and VC value (${
        (<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).id
      })`,
    )
  })

  it('should work with jsonLD VC from Diwala', () => {
    const ldpVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vc/vc_edu-plugfest-diwala.json')
    const vc = CredentialMapper.toUniformCredential(ldpVc)
    expect(vc.issuanceDate).toEqual('2022-11-04T12:32:03Z')
  })

  it('should work with jwt VC from Velocity', () => {
    const jwtVc: W3CVerifiableCredential = getFile('packages/ssi-types/__tests__/vc_vp_examples/vc/vc_edu-plugfest-velocity.jwt')
    const vc = CredentialMapper.toUniformCredential(jwtVc)
    expect(vc.issuanceDate).toEqual('2022-11-07T21:29:29Z')
  })

  it('should work with sd jwt VC from Funke', () => {
    const jwtVc: string = getFile('packages/ssi-types/__tests__/vc_vp_examples/vc/sd.jwt')
    const vc = CredentialMapper.toUniformCredential(jwtVc, { hasher: generateDigest })
    console.log(JSON.stringify(vc, null, 2))
    expect(vc.issuanceDate).toEqual('2024-08-16T09:29:44Z')
    expect(vc.expirationDate).toEqual('2024-08-30T09:29:44Z')
  })

  it('should work with issuer signed (mdoc) VC from Funke', () => {
    const issuerSigned: string = getFile('packages/ssi-types/__tests__/vc_vp_examples/vc/funke.issuersigned')
    const vc = CredentialMapper.toUniformCredential(issuerSigned)
    console.log(JSON.stringify(vc, null, 2))
    expect(vc.issuanceDate).toEqual('2024-08-12T09:54:45Z')
    expect(vc.expirationDate).toEqual('2024-08-26T09:54:45Z')
  })

  it('should work with sd jwt VC from Animo', () => {
    const jwtVc: string = getFile('packages/ssi-types/__tests__/vc_vp_examples/vc/animo.sd.jwt')
    const vc = CredentialMapper.toUniformCredential(jwtVc, { hasher: generateDigest })
    console.log(JSON.stringify(vc, null, 2))
    expect(vc.issuanceDate).toEqual('2024-08-26T00:06:09Z')
  })
})

describe('Uniform VP claims', () => {
  it('JWT Encoded VP should populate response', () => {
    const jwtEncodedVp = getFile('./packages/ssi-types/__tests__/vc_vp_examples/vp/vp_universityDegree.jwt')
    const vp = CredentialMapper.toUniformPresentation(jwtEncodedVp)
    // vp should be decoded
    expect(vp.holder).toEqual('did:example:ebfeb1f712ebc6f1c276e12ec21')
    // vc should be decoded for a uniform vp
    const vc = vp.verifiableCredential?.[0] as IVerifiableCredential
    expect(!Array.isArray(vc.credentialSubject) && vc.credentialSubject.degree.type).toEqual('BachelorDegree')
  })

  it('JWT Decoded VP should populate response', () => {
    const jwtEncodedVp = getFile('./packages/ssi-types/__tests__/vc_vp_examples/vp/vp_universityDegree.jwt')
    const jwtDecodedVp = CredentialMapper.toWrappedVerifiablePresentation(jwtEncodedVp).decoded
    const vp = CredentialMapper.toUniformPresentation(jwtDecodedVp as JwtDecodedVerifiablePresentation)
    // vp should be decoded
    expect(vp.holder).toEqual('did:example:ebfeb1f712ebc6f1c276e12ec21')
    // vc should be decoded for a uniform vp
    const vc = vp.verifiableCredential?.[0] as IVerifiableCredential
    expect(!Array.isArray(vc.credentialSubject) && vc.credentialSubject.degree.type).toEqual('BachelorDegree')
  })

  it('JSON-LD VP String should populate response', () => {
    const jsonLdVpAsStr = getFile('./packages/ssi-types/__tests__/vc_vp_examples/vp/vp_subject_is_holder.json')
    const vp = CredentialMapper.toUniformPresentation(jsonLdVpAsStr)
    // vp should be decoded
    expect((vp.verifiableCredential?.[0] as IVerifiableCredential).issuer).toEqual('did:example:123')
  })
  it('JSON-LD VP Object should populate response', () => {
    const jsonLdVp = getFileAsJson('./packages/ssi-types/__tests__/vc_vp_examples/vp/vp_subject_is_holder.json')
    const vp = CredentialMapper.toUniformPresentation(jsonLdVp)
    // vp should be decoded
    expect((vp.verifiableCredential?.[0] as IVerifiableCredential).issuer).toEqual('did:example:123')
  })

  it('Detect Mdoc document type', () => {
    expect(CredentialMapper.detectDocumentType(mdoc)).toEqual(DocumentFormat.MSO_MDOC)
  })
})

const mdoc =
  'omppc3N1ZXJBdXRohEOhASahGCGCWQJ4MIICdDCCAhugAwIBAgIBAjAKBggqhkjOPQQDAjCBiDELMAkGA1UEBhMCREUxDzANBgNVBAcMBkJlcmxpbjEdMBsGA1UECgwUQnVuZGVzZHJ1Y2tlcmVpIEdtYkgxETAPBgNVBAsMCFQgQ1MgSURFMTYwNAYDVQQDDC1TUFJJTkQgRnVua2UgRVVESSBXYWxsZXQgUHJvdG90eXBlIElzc3VpbmcgQ0EwHhcNMjQwNTMxMDgxMzE3WhcNMjUwNzA1MDgxMzE3WjBsMQswCQYDVQQGEwJERTEdMBsGA1UECgwUQnVuZGVzZHJ1Y2tlcmVpIEdtYkgxCjAIBgNVBAsMAUkxMjAwBgNVBAMMKVNQUklORCBGdW5rZSBFVURJIFdhbGxldCBQcm90b3R5cGUgSXNzdWVyMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEOFBq4YMKg4w5fTifsytwBuJf_7E7VhRPXiNm52S3q1ETIgBdXyDK3kVxGxgeHPivLP3uuMvS6iDEc7qMxmvduKOBkDCBjTAdBgNVHQ4EFgQUiPhCkLErDXPLW2_J0WVeghyw-mIwDAYDVR0TAQH_BAIwADAOBgNVHQ8BAf8EBAMCB4AwLQYDVR0RBCYwJIIiZGVtby5waWQtaXNzdWVyLmJ1bmRlc2RydWNrZXJlaS5kZTAfBgNVHSMEGDAWgBTUVhjAiTjoDliEGMl2Yr-ru8WQvjAKBggqhkjOPQQDAgNHADBEAiAbf5TzkcQzhfWoIoyi1VN7d8I9BsFKm1MWluRph2byGQIgKYkdrNf2xXPjVSbjW_U_5S5vAEC5XxcOanusOBroBbVZAn0wggJ5MIICIKADAgECAhQHkT1BVm2ZRhwO0KMoH8fdVC_vaDAKBggqhkjOPQQDAjCBiDELMAkGA1UEBhMCREUxDzANBgNVBAcMBkJlcmxpbjEdMBsGA1UECgwUQnVuZGVzZHJ1Y2tlcmVpIEdtYkgxETAPBgNVBAsMCFQgQ1MgSURFMTYwNAYDVQQDDC1TUFJJTkQgRnVua2UgRVVESSBXYWxsZXQgUHJvdG90eXBlIElzc3VpbmcgQ0EwHhcNMjQwNTMxMDY0ODA5WhcNMzQwNTI5MDY0ODA5WjCBiDELMAkGA1UEBhMCREUxDzANBgNVBAcMBkJlcmxpbjEdMBsGA1UECgwUQnVuZGVzZHJ1Y2tlcmVpIEdtYkgxETAPBgNVBAsMCFQgQ1MgSURFMTYwNAYDVQQDDC1TUFJJTkQgRnVua2UgRVVESSBXYWxsZXQgUHJvdG90eXBlIElzc3VpbmcgQ0EwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARgbN3AUOdzv4qfmJsC8I4zyR7vtVDGp8xzBkvwhogD5YJE5wJ-Zj-CIf3aoyu7mn-TI6K8TREL8ht0w428OhTJo2YwZDAdBgNVHQ4EFgQU1FYYwIk46A5YhBjJdmK_q7vFkL4wHwYDVR0jBBgwFoAU1FYYwIk46A5YhBjJdmK_q7vFkL4wEgYDVR0TAQH_BAgwBgEB_wIBADAOBgNVHQ8BAf8EBAMCAYYwCgYIKoZIzj0EAwIDRwAwRAIgYSbvCRkoe39q1vgx0WddbrKufAxRPa7XfqB22XXRjqECIG5MWq9Vi2HWtvHMI_TFZkeZAr2RXLGfwY99fbsQjPOzWQRD2BhZBD6mZ2RvY1R5cGV3ZXUuZXVyb3BhLmVjLmV1ZGkucGlkLjFndmVyc2lvbmMxLjBsdmFsaWRpdHlJbmZvo2ZzaWduZWTAdDIwMjQtMDgtMjlUMDI6MTQ6MjNaaXZhbGlkRnJvbcB0MjAyNC0wOC0yOVQwMjoxNDoyM1pqdmFsaWRVbnRpbMB0MjAyNC0wOS0xMlQwMjoxNDoyM1psdmFsdWVEaWdlc3RzoXdldS5ldXJvcGEuZWMuZXVkaS5waWQuMbYAWCCcH2aB7PBXKZxFpwwzroUYTp6xYLAKZJQKJeTtJbBNeAFYIBYE3SL3KYPLC4yAnAiPGKSq4t9zd9V5yvN5pnXw9ga2Algg5cv0MEePGAnfQG4xQO_PLOmLTd9WDnWwR8Z8fa-pmnIDWCA3OvCW0Ehns5Xm8omVQpR8CwMExWyeOMuJL1237PWtOQRYIGR-828IGfcf4cK-65rsok_aGKHI6pdmLWnjedRTeMMcBVgg53cKlGKMTI2KhU02CxmIPVnWy71DIUpWPu4XOpx7oXAGWCA3KlBpPaH07j-jKs2WneFsEn7M7tjqNpSvmz-U_aXdZwdYICeGKcMVotdlBlYmhywTf9kdSho8oPuo5E-WWGTj72sHCFggJwBazMxo5d9aBerHSnZ52X5vNS1uZsxy9Gu0o_hx_kMJWCDyq9U13r_qGx5h_St7F_XBqfGrvS2jD_ycCjVbxYmumQpYIFizODHwYYaVWUYM0obdMZrWtOyjUgOwkGZXTHx3kzaIC1gg-9x2Y-C1qVmY5yFOLB76pczhdp1_JM7tA9gpTLl_gfQMWCARdl3HQxoOMNJKOL8A8BuQgI325qMBLkbHhgg4V84QAg1YIL-pVpTsyOH750N2dwOfC733AxIhzXNMpxw1il4bym00Dlgg-dFQRmx4qffR2Ai0m-E5JcZfnR5p6PKBBJ4gmtAe5xYPWCBYMmOQUPNV7iVpnxBNXC4UHs1b87vZMIpfc43jI_jADxBYIIoyS5TZzaYI7yClkcr_4WJeZJs9uzfcK88tm5gD21XUEVggm452ofYtLc79Exf4IWIRq_YxuJwvsS8x9lP9G64DCzISWCB6BdM_qzoUDYi7xwFMxwjBMgTzhG5PcpcDwZjEbPJSaBNYIAm1zBl7fV-OQ1Hm6rtgJqCJIPV6HadasXNcFlmIcsCJFFggaTd_huZguT05pKBWQ-i1jeznHfpLxzD6NVQrqP0WW24VWCCtGRPGIYoSJJTLncPiz6v8VzC3qmPccfIqfTBNEwlLyG1kZXZpY2VLZXlJbmZvoWlkZXZpY2VLZXmkAQIgASFYIJffPwAK1OrOOlI0Be4sUtui2IWGZ4XjURIjNGviGbk-IlggfELl8C7AGHuTGnVkC63i8AvpDoJRucZKv8XyBsMEKP9vZGlnZXN0QWxnb3JpdGhtZ1NIQS0yNTZYQFb426n4KbLO8qLwxdi4HTjQMOA0PUMJZu6k7Y6kttpSaKjzdL9oFhuHsoOu56oUCJfq_SpCi8aqiwNALq5LlgRqbmFtZVNwYWNlc6F3ZXUuZXVyb3BhLmVjLmV1ZGkucGlkLjGW2BhYT6RmcmFuZG9tUPgKlfgeFqbZLNWu844pW6toZGlnZXN0SUQAbGVsZW1lbnRWYWx1ZfVxZWxlbWVudElkZW50aWZpZXJrYWdlX292ZXJfMTjYGFhppGZyYW5kb21QZrhK-qWrl0fxdan5-TlkdWhkaWdlc3RJRAFsZWxlbWVudFZhbHVlwHgYMjAyNC0wOS0xMlQwMjoxNDoyMy45MjFacWVsZW1lbnRJZGVudGlmaWVya2V4cGlyeV9kYXRl2BhYT6RmcmFuZG9tUNUVza8-VYA09SVDWe8rPrRoZGlnZXN0SUQCbGVsZW1lbnRWYWx1ZfVxZWxlbWVudElkZW50aWZpZXJrYWdlX292ZXJfMTbYGFhdpGZyYW5kb21QaCrrBj1GsPfbeEYmpvo3RGhkaWdlc3RJRANsZWxlbWVudFZhbHVlZTUxMTQ3cWVsZW1lbnRJZGVudGlmaWVydHJlc2lkZW50X3Bvc3RhbF9jb2Rl2BhYUaRmcmFuZG9tUGQJVFDecCCYHm3wzlRxiyRoZGlnZXN0SUQEbGVsZW1lbnRWYWx1ZRgocWVsZW1lbnRJZGVudGlmaWVybGFnZV9pbl95ZWFyc9gYWFakZnJhbmRvbVC8y_iNmFhsSdO9APhb-waHaGRpZ2VzdElEBWxlbGVtZW50VmFsdWVlS8OWTE5xZWxlbWVudElkZW50aWZpZXJtcmVzaWRlbnRfY2l0edgYWFSkZnJhbmRvbVDB11qRzPUyxQbooAKf9yoMaGRpZ2VzdElEBmxlbGVtZW50VmFsdWUZB8BxZWxlbWVudElkZW50aWZpZXJuYWdlX2JpcnRoX3llYXLYGFhipGZyYW5kb21Qcq8R22vCdEqtxwy9ZgLk-WhkaWdlc3RJRAdsZWxlbWVudFZhbHVlb0hFSURFU1RSQVNTRSAxN3FlbGVtZW50SWRlbnRpZmllcm9yZXNpZGVudF9zdHJlZXTYGFhPpGZyYW5kb21QpRAJO3jZHItmgwE532jM2mhkaWdlc3RJRAhsZWxlbWVudFZhbHVl9XFlbGVtZW50SWRlbnRpZmllcmthZ2Vfb3Zlcl8yMdgYWFekZnJhbmRvbVDRTxOgSq3L2Qz7teQbNO8saGRpZ2VzdElECWxlbGVtZW50VmFsdWViREVxZWxlbWVudElkZW50aWZpZXJxaXNzdWluZ19hdXRob3JpdHnYGFhYpGZyYW5kb21QSbl2WSIKwlK4sPjzuQrGE2hkaWdlc3RJRApsZWxlbWVudFZhbHVlajE5ODQtMDEtMjZxZWxlbWVudElkZW50aWZpZXJqYmlydGhfZGF0ZdgYWE-kZnJhbmRvbVCQViO2DwKcrZPr3ClMq_kxaGRpZ2VzdElEC2xlbGVtZW50VmFsdWX0cWVsZW1lbnRJZGVudGlmaWVya2FnZV9vdmVyXzY12BhYa6RmcmFuZG9tUOmgO_UnEUv6QnUhfteEYnFoZGlnZXN0SUQMbGVsZW1lbnRWYWx1ZcB4GDIwMjQtMDgtMjlUMDI6MTQ6MjMuOTIxWnFlbGVtZW50SWRlbnRpZmllcm1pc3N1YW5jZV9kYXRl2BhYT6RmcmFuZG9tUBkKHTW0gBRWmwf3CVzPZjloZGlnZXN0SUQNbGVsZW1lbnRWYWx1ZfVxZWxlbWVudElkZW50aWZpZXJrYWdlX292ZXJfMTTYGFhVpGZyYW5kb21QfVvjbZBytJ1OX8sGzLjadmhkaWdlc3RJRA5sZWxlbWVudFZhbHVlZkJFUkxJTnFlbGVtZW50SWRlbnRpZmllcmtiaXJ0aF9wbGFjZdgYWE-kZnJhbmRvbVCeei9t8r4mkSTYt9HyJWHzaGRpZ2VzdElED2xlbGVtZW50VmFsdWX1cWVsZW1lbnRJZGVudGlmaWVya2FnZV9vdmVyXzEy2BhYbKRmcmFuZG9tUMU7D3mmKp29Mt61qclOqxtoZGlnZXN0SUQQbGVsZW1lbnRWYWx1ZaJldmFsdWViREVrY291bnRyeU5hbWVnR2VybWFueXFlbGVtZW50SWRlbnRpZmllcmtuYXRpb25hbGl0edgYWFWkZnJhbmRvbVBSwP_YZSqhykYH_zzrOxqnaGRpZ2VzdElEEWxlbGVtZW50VmFsdWViREVxZWxlbWVudElkZW50aWZpZXJvaXNzdWluZ19jb3VudHJ52BhYWaRmcmFuZG9tUKEGKhQ4rRrTaQ6wqirDzHtoZGlnZXN0SUQSbGVsZW1lbnRWYWx1ZWpNVVNURVJNQU5OcWVsZW1lbnRJZGVudGlmaWVya2ZhbWlseV9uYW1l2BhYW6RmcmFuZG9tUPN5mEXQHg3bnbS480IrU-FoZGlnZXN0SUQTbGVsZW1lbnRWYWx1ZWZHQUJMRVJxZWxlbWVudElkZW50aWZpZXJxZmFtaWx5X25hbWVfYmlydGjYGFhWpGZyYW5kb21QbdFetP-hWu8R6NcJHLGQKWhkaWdlc3RJRBRsZWxlbWVudFZhbHVlYkRFcWVsZW1lbnRJZGVudGlmaWVycHJlc2lkZW50X2NvdW50cnnYGFhTpGZyYW5kb21Qj8TxJ3fouhTL9-nTu0h-6mhkaWdlc3RJRBVsZWxlbWVudFZhbHVlZUVSSUtBcWVsZW1lbnRJZGVudGlmaWVyamdpdmVuX25hbWU'
