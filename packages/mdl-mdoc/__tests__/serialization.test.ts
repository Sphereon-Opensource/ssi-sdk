import { com } from '@sphereon/kmp-mdl-mdoc'
import CoseKeyJson = com.sphereon.crypto.cose.CoseKeyJson
import CoseKeyType = com.sphereon.crypto.cose.CoseKeyType
import CoseSignatureAlgorithm = com.sphereon.crypto.cose.CoseSignatureAlgorithm
import ICoseKeyJson = com.sphereon.crypto.cose.ICoseKeyJson
import IOid4VPPresentationDefinition = com.sphereon.mdoc.oid4vp.IOid4VPPresentationDefinition
import Oid4VPPresentationDefinition = com.sphereon.mdoc.oid4vp.Oid4VPPresentationDefinition

describe('Serialization', (): void => {
  beforeAll(async (): Promise<void> => {})

  it('should decode and encode ISO Test Vector', async () => {
    const coseKey = CoseKeyJson.Static.fromDTO({ kty: CoseKeyType.EC2, alg: CoseSignatureAlgorithm.ES256 })
    // const asIKey = coseKey as IKey
    console.log(coseKey.toDto())
    console.log(coseKey.toJsonString())
    console.log(coseKey.toJsonDTO())
    const json: ICoseKeyJson = coseKey.toJsonDTO()
    console.log(json)
    console.log(CoseKeyJson.Static.fromDTO(json).alg)
  })

  it('should decode and encode Presentation Definition', async () => {
    const pdJson: IOid4VPPresentationDefinition = sprindFunkePD
    const pd = Oid4VPPresentationDefinition.Static.fromDTO(pdJson)
    expect(pd.toDTO()).toEqual(pdJson)
  })
})

const sprindFunkePD = {
  id: 'PID-sample-req',
  input_descriptors: [
    {
      id: 'eu.europa.ec.eudi.pid.1',
      format: {
        mso_mdoc: {
          alg: ['ES256', 'ES384', 'ES512', 'EdDSA'],
        },
      },
      constraints: {
        fields: [
          {
            path: ["$['eu.europa.ec.eudi.pid.1']['resident_country']"],
            intent_to_retain: false,
          },
          {
            path: ["$['eu.europa.ec.eudi.pid.1']['age_over_12']"],
            intent_to_retain: false,
          },
          {
            path: ["$['eu.europa.ec.eudi.pid.1']['given_name']"],
            intent_to_retain: true,
          },
          {
            path: ["$['eu.europa.ec.eudi.pid.1']['nationality']"],
            intent_to_retain: true,
          },
          {
            path: ["$['eu.europa.ec.eudi.pid.1']['issuing_country']"],
            intent_to_retain: false,
          },
          {
            path: ["$['eu.europa.ec.eudi.pid.1']['issuance_date']"],
            intent_to_retain: false,
          },
          {
            path: ["$['eu.europa.ec.eudi.pid.1']['birth_date']"],
            intent_to_retain: false,
          },
        ],
        limit_disclosure: 'required',
      },
    },
  ],
}
