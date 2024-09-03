import * as fs from 'fs'
import {
  AdditionalClaims,
  CredentialMapper,
  ICredential,
  ICredentialSubject,
  IVerifiableCredential,
  IVerifiablePresentation,
  OriginalType,
  WrappedVerifiablePresentation,
  WrappedW3CVerifiableCredential,
  WrappedW3CVerifiablePresentation,
} from '../src'

function getFile(path: string) {
  return fs.readFileSync(path, 'utf-8')
}

function getFileAsJson(path: string) {
  return JSON.parse(getFile(path))
}

describe('Wrapped VC claims', () => {
  it('should set expiration date if exp is present in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['exp' as keyof IVerifiableCredential] = (+new Date()).toString()
    const vc = CredentialMapper.toWrappedVerifiableCredential(jwtVc) as WrappedW3CVerifiableCredential
    expect(vc.credential.expirationDate).toEqual(new Date(parseInt(jwtVc['exp' as keyof IVerifiableCredential] as string)).toISOString())
  })

  it('should set expiration date if exp is present in JWT vc as number', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]

    jwtVc['exp' as keyof IVerifiableCredential] = new Date().valueOf()
    const vc = CredentialMapper.toWrappedVerifiableCredential(jwtVc) as WrappedW3CVerifiableCredential
    expect(vc.credential.expirationDate).toEqual(new Date(jwtVc['exp' as keyof IVerifiableCredential] as string).toISOString())
  })

  it('should throw an error if expiration date and exp are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['exp' as keyof IVerifiableCredential] = (+new Date()).toString()
    ;(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).expirationDate = (+new Date(
      (jwtVc['exp' as keyof IVerifiableCredential] as string) + 2,
    )).toString()
    expect(() => CredentialMapper.toWrappedVerifiableCredential(jwtVc, { maxTimeSkewInMS: 0 })).toThrowError(
      `Inconsistent expiration dates between JWT claim (${new Date(
        parseInt(jwtVc['exp' as keyof IVerifiableCredential] as string),
      ).toISOString()}) and VC value (${(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).expirationDate})`,
    )
  })

  it('should set issuer if iss is present in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    ;(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).issuer
    const vc = CredentialMapper.toWrappedVerifiableCredential(jwtVc) as WrappedW3CVerifiableCredential
    expect(vc.credential.issuer).toEqual(jwtVc['iss' as keyof IVerifiableCredential])
  })

  it('should throw an error if issuer and iss are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['iss' as keyof IVerifiableCredential] = 'did:test:456'
    expect(() => CredentialMapper.toWrappedVerifiableCredential(jwtVc)).toThrowError(
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
    const vc = CredentialMapper.toWrappedVerifiableCredential(jwtVc) as WrappedW3CVerifiableCredential
    expect(vc.credential.issuanceDate).toEqual(new Date(parseInt(jwtVc['nbf' as keyof IVerifiableCredential] as string)).toISOString())
  })

  it('should throw an error if issuance date and nbf are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    const nbf = new Date().valueOf()
    jwtVc['nbf' as keyof IVerifiableCredential] = nbf / 1000
    ;(<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).issuanceDate = new Date(+new Date() + 2).toISOString()
    expect(() => CredentialMapper.toWrappedVerifiableCredential(jwtVc, { maxTimeSkewInMS: 1 }) as WrappedW3CVerifiableCredential).toThrowError(
      `Inconsistent issuance dates between JWT claim (${new Date(nbf).toISOString().replace(/\.\d\d\dZ/, 'Z')}) and VC value (${
        (<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).issuanceDate
      })`,
    )
  })

  it('should set credentialSubject.id if sub is present in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    const subject = <ICredentialSubject>jwtVc.vc.credentialSubject
    jwtVc['sub' as keyof IVerifiableCredential] = subject.id
    const vc = CredentialMapper.toWrappedVerifiableCredential(jwtVc) as WrappedW3CVerifiableCredential
    expect(!Array.isArray(vc.credential.credentialSubject) && vc.credential.credentialSubject.id).toEqual(jwtVc['sub' as keyof IVerifiableCredential])
  })

  it('should throw an error if credentialSubject.id and sub are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['sub' as keyof IVerifiableCredential] = 'did:test:123'
    const subject = <ICredentialSubject>jwtVc.vc.credentialSubject
    expect(() => CredentialMapper.toWrappedVerifiableCredential(jwtVc)).toThrowError(
      `Inconsistent credential subject ids between JWT claim (${jwtVc['sub' as keyof IVerifiableCredential]}) and VC value (${subject.id})`,
    )
  })

  it('should set id if jti is present in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['jti' as keyof IVerifiableCredential] = (<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).id
    const vc = CredentialMapper.toWrappedVerifiableCredential(jwtVc) as WrappedW3CVerifiableCredential
    expect(vc.credential.id).toEqual(jwtVc['jti' as keyof IVerifiableCredential])
  })

  it('should throw an error if id and jti are different in JWT vc', () => {
    const jwtVc: IVerifiableCredential = getFileAsJson('packages/ssi-types/__tests__/vc_vp_examples/vp/vp_general.json').verifiableCredential[0]
    jwtVc['jti' as keyof IVerifiableCredential] = 'test'
    expect(() => CredentialMapper.toWrappedVerifiableCredential(jwtVc)).toThrowError(
      `Inconsistent credential ids between JWT claim (${jwtVc['jti' as keyof IVerifiableCredential]}) and VC value (${
        (<ICredential>jwtVc['vc' as keyof IVerifiableCredential]).id
      })`,
    )
  })
})

describe('Wrapped VP', () => {
  it('Encoded VP should populate response', () => {
    const jwtEncodedVp = getFile('./packages/ssi-types/__tests__/vc_vp_examples/vp/vp_universityDegree.jwt')
    const vp: WrappedVerifiablePresentation = CredentialMapper.toWrappedVerifiablePresentation(jwtEncodedVp) as WrappedW3CVerifiablePresentation
    expect(vp.original).toEqual(jwtEncodedVp)
    expect(vp.decoded.iss).toEqual('did:example:ebfeb1f712ebc6f1c276e12ec21')
    expect(vp.type).toEqual(OriginalType.JWT_ENCODED)
    expect(vp.format).toEqual('jwt_vp')
    expect(vp.presentation.holder).toEqual('did:example:ebfeb1f712ebc6f1c276e12ec21')
    expect((vp.presentation.verifiableCredential[0].credential.credentialSubject as AdditionalClaims).degree.type).toEqual('BachelorDegree')
  })

  /* it('Decoded VP should populate response', () => { FIXME Funke
    const jwtEncodedVp = getFile('./packages/ssi-types/__tests__/vc_vp_examples/vp/vp_universityDegree.jwt')
    const jwtDecodedVp = CredentialMapper.decodeVerifiablePresentation(jwtEncodedVp)
    const vp: WrappedVerifiablePresentation = CredentialMapper.toWrappedVerifiablePresentation(jwtDecodedVp) as WrappedW3CVerifiablePresentation
    expect(vp.decoded).toEqual(jwtDecodedVp)
    expect(vp.decoded.iss).toEqual('did:example:ebfeb1f712ebc6f1c276e12ec21')
    expect(vp.type).toEqual(OriginalType.JWT_ENCODED)
    expect(vp.format).toEqual('jwt_vp')
    expect(vp.presentation.holder).toEqual('did:example:ebfeb1f712ebc6f1c276e12ec21')
    expect((vp.presentation.verifiableCredential[0].credential.credentialSubject as AdditionalClaims).degree.type).toEqual('BachelorDegree')
  })*/

  it('JSON-LD VP String should populate response', () => {
    const jsonLdVpAsStr = getFile('./packages/ssi-types/__tests__/vc_vp_examples/vp/vp_subject_is_holder.json')
    const vp = CredentialMapper.toWrappedVerifiablePresentation(jsonLdVpAsStr) as WrappedW3CVerifiablePresentation
    // vp should be decoded
    expect(vp.original).toEqual(jsonLdVpAsStr)
    expect(((vp.decoded as IVerifiablePresentation).verifiableCredential?.[1] as IVerifiableCredential).issuer).toEqual('did:foo:123')
    expect(vp.type).toEqual(OriginalType.JSONLD)
    expect(vp.format).toEqual('ldp_vp')
    expect(vp.presentation.verifiableCredential[1].credential.issuer).toEqual('did:foo:123')
  })
  it('JSON-LD VP Object should populate response', () => {
    const jsonLdVp = getFileAsJson('./packages/ssi-types/__tests__/vc_vp_examples/vp/vp_subject_is_holder.json')
    const vp = CredentialMapper.toWrappedVerifiablePresentation(jsonLdVp) as WrappedW3CVerifiablePresentation
    // vp should be decoded
    expect(vp.original).toEqual(jsonLdVp)
    expect(((vp.decoded as IVerifiablePresentation).verifiableCredential?.[1] as IVerifiableCredential).issuer).toEqual('did:foo:123')
    expect(vp.type).toEqual(OriginalType.JSONLD)
    expect(vp.format).toEqual('ldp_vp')
    expect(vp.presentation.verifiableCredential[1].credential.issuer).toEqual('did:foo:123')
  })
})
