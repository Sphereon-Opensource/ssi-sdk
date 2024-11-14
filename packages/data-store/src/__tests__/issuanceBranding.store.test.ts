import { DataSources } from '@sphereon/ssi-sdk.agent-config'
import { DataSource } from 'typeorm'
import { IssuanceBrandingStore } from '../issuanceBranding/IssuanceBrandingStore'
import { DataStoreMigrations } from '../migrations'
import {
  BackgroundAttributesEntity,
  CredentialLocaleBrandingEntity,
  DataStoreIssuanceBrandingEntities,
  IAddCredentialLocaleBrandingArgs,
  IAddIssuerLocaleBrandingArgs,
  IBasicCredentialBranding,
  IBasicCredentialLocaleBranding,
  IBasicIssuerBranding,
  IBasicIssuerLocaleBranding,
  ICredentialBranding,
  ICredentialLocaleBranding,
  IGetCredentialLocaleBrandingArgs,
  IGetIssuerLocaleBrandingArgs,
  IIssuerBranding,
  IIssuerLocaleBranding,
  ILocaleBranding,
  ImageAttributesEntity,
  ImageDimensionsEntity,
  IssuerLocaleBrandingEntity,
  IUpdateCredentialLocaleBrandingArgs,
  IUpdateIssuerLocaleBrandingArgs,
  TextAttributesEntity,
} from '../index'

describe('Issuance branding store tests', (): void => {
  let dbConnection: DataSource
  let issuanceBrandingStore: IssuanceBrandingStore

  beforeEach(async (): Promise<void> => {
    DataSources.singleInstance().defaultDbType = 'sqlite'
    dbConnection = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      //logging: ['info'],
      migrationsRun: false,
      migrations: DataStoreMigrations,
      synchronize: false,
      entities: DataStoreIssuanceBrandingEntities,
    }).initialize()
    await dbConnection.runMigrations()
    expect(await dbConnection.showMigrations()).toBeFalsy()
    issuanceBrandingStore = new IssuanceBrandingStore(dbConnection)
  })

  afterEach(async (): Promise<void> => {
    await (await dbConnection).destroy()
  })

  // Credential tests

  it('should add credential branding', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const result: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)

    expect(result).toBeDefined()
    expect(result?.issuerCorrelationId).toEqual(credentialBranding.issuerCorrelationId)
    expect(result?.vcHash).toEqual(credentialBranding.vcHash)
    expect(result?.localeBranding.length).toEqual(2)
  })

  it('should throw error when adding credential branding with duplicate vc hash', async (): Promise<void> => {
    const credentialBranding1: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const result: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding1)
    expect(result).toBeDefined()

    const credentialBranding2: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    await expect(issuanceBrandingStore.addCredentialBranding(credentialBranding2)).rejects.toThrowError(
      `Credential branding already present for vc with hash: ${credentialBranding2.vcHash}`,
    )
  })

  it('should throw error when adding credential branding with duplicates locales', async (): Promise<void> => {
    const credentialBranding1: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    await expect(issuanceBrandingStore.addCredentialBranding(credentialBranding1)).rejects.toThrowError(
      'Credential branding contains duplicate locales',
    )

    const credentialBranding2: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
        },
        {
          alias: 'credentialTypeAlias',
        },
      ],
    }

    await expect(issuanceBrandingStore.addCredentialBranding(credentialBranding2)).rejects.toThrowError(
      'Credential branding contains duplicate locales',
    )
  })

  it('should get all credential branding', async (): Promise<void> => {
    const credentialBranding1: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash1',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedCredentialBranding1: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding1)
    expect(savedCredentialBranding1).toBeDefined()

    const credentialBranding2: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash2',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedCredentialBranding2: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding2)
    expect(savedCredentialBranding2).toBeDefined()

    const result: Array<ICredentialBranding> = await issuanceBrandingStore.getCredentialBranding()

    expect(result.length).toEqual(2)
  })

  it('should get all credential branding for a certain locale', async (): Promise<void> => {
    const credentialBranding1: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash1',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedCredentialBranding1: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding1)
    expect(savedCredentialBranding1).toBeDefined()

    const credentialBranding2: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash2',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedCredentialBranding2: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding2)
    expect(savedCredentialBranding2).toBeDefined()

    const args = {
      filter: [
        {
          localeBranding: {
            locale: 'en-US',
          },
        },
      ],
    }

    const result: Array<ICredentialBranding> = await issuanceBrandingStore.getCredentialBranding(args)

    expect(result.length).toEqual(2)
  })

  it('should get credential branding with a certain locale', async (): Promise<void> => {
    const credentialBranding1: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash1',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedCredentialBranding1: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding1)
    expect(savedCredentialBranding1).toBeDefined()

    const credentialBranding2: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash2',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedCredentialBranding2: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding2)
    expect(savedCredentialBranding2).toBeDefined()

    const args = {
      filter: [
        {
          vcHash: 'vcHash1',
          localeBranding: {
            locale: 'en-US',
          },
        },
      ],
    }

    const result: Array<ICredentialBranding> = await issuanceBrandingStore.getCredentialBranding(args)

    expect(result.length).toEqual(1)
  })

  it('should get all credential branding with no locale', async (): Promise<void> => {
    const credentialBranding1: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash1',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
        },
      ],
    }

    const savedCredentialBranding1: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding1)
    expect(savedCredentialBranding1).toBeDefined()

    const credentialBranding2: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash2',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedCredentialBranding2: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding2)
    expect(savedCredentialBranding2).toBeDefined()

    const args = {
      filter: [
        {
          localeBranding: {
            locale: undefined,
          },
        },
      ],
    }

    const result: Array<ICredentialBranding> = await issuanceBrandingStore.getCredentialBranding(args)

    expect(result.length).toEqual(1)
  })

  it('should get all credential locale branding with no locale', async (): Promise<void> => {
    const credentialBranding1: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash1',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
        },
      ],
    }

    const savedCredentialBranding1: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding1)
    expect(savedCredentialBranding1).toBeDefined()

    const credentialBranding2: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash2',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedCredentialBranding2: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding2)
    expect(savedCredentialBranding2).toBeDefined()

    const args = {
      filter: [
        {
          locale: undefined,
        },
      ],
    }

    const result: Array<ICredentialLocaleBranding> = await issuanceBrandingStore.getCredentialLocaleBranding(args)

    expect(result.length).toEqual(1)
  })

  it('should get all credential branding for multiple locales', async (): Promise<void> => {
    const credentialBranding1: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash1',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedCredentialBranding1: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding1)
    expect(savedCredentialBranding1).toBeDefined()

    const credentialBranding2: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash2',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedCredentialBranding2: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding2)
    expect(savedCredentialBranding2).toBeDefined()

    const args = {
      filter: [
        {
          localeBranding: {
            locale: 'en-US',
          },
        },
        {
          localeBranding: {
            locale: 'en-GB',
          },
        },
      ],
    }

    const result: Array<ICredentialBranding> = await issuanceBrandingStore.getCredentialBranding(args)

    expect(result.length).toEqual(2)
  })

  it('should return no credential branding with not matching filter', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()

    const args = {
      filter: [
        {
          localeBranding: {
            locale: 'en-US',
          },
        },
      ],
    }

    const result: Array<ICredentialBranding> = await issuanceBrandingStore.getCredentialBranding(args)

    expect(result.length).toEqual(0)
  })

  it('should update credential branding', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()

    const updatedCredentialBranding = {
      id: savedCredentialBranding.id,
      issuerCorrelationId: 'newIssuerCorrelationId',
      vcHash: 'newVcHash',
    }
    const result: ICredentialBranding = await issuanceBrandingStore.updateCredentialBranding({ credentialBranding: updatedCredentialBranding })

    expect(result).toBeDefined()
    expect(result?.localeBranding?.length).toEqual(1)
    expect(result?.vcHash).toEqual(updatedCredentialBranding.vcHash)
    expect(result?.issuerCorrelationId).toEqual(updatedCredentialBranding.issuerCorrelationId)
  })

  it('should throw error when updating credential branding with unknown id', async (): Promise<void> => {
    const credentialBranding = {
      id: 'unknownId',
      issuerCorrelationId: 'newIssuerCorrelationId',
      vcHash: 'newVcHash',
    }

    await expect(issuanceBrandingStore.updateCredentialBranding({ credentialBranding })).rejects.toThrowError(
      `No credential branding found for id: ${credentialBranding.id}`,
    )
  })

  it('should remove credential branding and all children', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
          logo: {
            uri: 'data:image/jpeg;base64,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',
            mediaType: 'image/jpeg',
            alt: 'Sphereon logo',
            dimensions: {
              width: 200,
              height: 200,
            },
          },
          description: 'Sphereon credential branding',
          background: {
            color: '#7C1010',
            image: {
              uri: 'data:image/png;base64,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',
              alt: 'Sphereon background',
              mediaType: 'image/png',
              dimensions: {
                width: 262,
                height: 116,
              },
            },
          },
          text: {
            color: '#000000',
          },
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()
    const branding: Array<ICredentialBranding> = await issuanceBrandingStore.getCredentialBranding()
    expect(branding.length).toEqual(1)

    await issuanceBrandingStore.removeCredentialBranding({ filter: [{ id: savedCredentialBranding.id }] })

    // check background image dimensions
    expect(
      await dbConnection.getRepository(ImageDimensionsEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.background?.image?.dimensions?.id },
      }),
    ).toBeNull()

    // check background image
    expect(
      await dbConnection.getRepository(ImageAttributesEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.background?.image?.id },
      }),
    ).toBeNull()

    // check background
    expect(
      await dbConnection.getRepository(BackgroundAttributesEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.background?.id },
      }),
    ).toBeNull()

    // check logo dimensions
    expect(
      await dbConnection.getRepository(ImageDimensionsEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.logo?.dimensions?.id },
      }),
    ).toBeNull()

    // check logo
    expect(
      await dbConnection.getRepository(ImageAttributesEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.logo?.id },
      }),
    ).toBeNull()

    // check text
    expect(
      await dbConnection.getRepository(TextAttributesEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.text?.id },
      }),
    ).toBeNull()

    // check credential locale branding
    expect(
      await dbConnection.getRepository(CredentialLocaleBrandingEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.id },
      }),
    ).toBeNull()

    const result: Array<ICredentialBranding> = await issuanceBrandingStore.getCredentialBranding()

    expect(result.length).toEqual(0)
  })

  it('should add credential locale branding', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()

    const addCredentialLocaleBrandingArgs: IAddCredentialLocaleBrandingArgs = {
      credentialBrandingId: savedCredentialBranding.id,
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const result: ICredentialBranding = await issuanceBrandingStore.addCredentialLocaleBranding(addCredentialLocaleBrandingArgs)

    expect(result.localeBranding.length).toEqual(2)
  })

  it('should throw error when adding credential locale branding with unknown id', async (): Promise<void> => {
    const addCredentialLocaleBrandingArgs: IAddCredentialLocaleBrandingArgs = {
      credentialBrandingId: 'unknownId',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    await expect(issuanceBrandingStore.addCredentialLocaleBranding(addCredentialLocaleBrandingArgs)).rejects.toThrowError(
      `No credential branding found for id: ${addCredentialLocaleBrandingArgs.credentialBrandingId}`,
    )
  })

  it('should throw error when adding duplicate credential locale branding', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()

    const addCredentialLocaleBrandingArgs: IAddCredentialLocaleBrandingArgs = {
      credentialBrandingId: savedCredentialBranding.id,
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    await expect(issuanceBrandingStore.addCredentialLocaleBranding(addCredentialLocaleBrandingArgs)).rejects.toThrowError(
      `Credential branding already contains locales: ${addCredentialLocaleBrandingArgs.localeBranding.map(
        (localeBranding: IBasicCredentialLocaleBranding) => localeBranding.locale,
      )}`,
    )
  })

  it('should get all credential locale branding for a credential branding', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'credentialCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()

    const result: Array<ICredentialLocaleBranding> = await issuanceBrandingStore.getCredentialLocaleBranding()

    expect(result.length).toEqual(2)
  })

  it('should get credential locale branding for a credential branding', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'credentialCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'blabla',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias2',
          locale: 'en-GB',
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()

    const getCredentialLocaleBrandingArgs: IGetCredentialLocaleBrandingArgs = {
      filter: [
        {
          credentialBranding: {
            id: savedCredentialBranding.id,
          },
          locale: 'en-US',
        },
      ],
    }

    const result: Array<ICredentialLocaleBranding> = await issuanceBrandingStore.getCredentialLocaleBranding(getCredentialLocaleBrandingArgs)

    expect(result.length).toEqual(1)
  })

  it('should update credential locale branding', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'credentialCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()

    const updateCredentialLocaleBrandingArgs: IUpdateCredentialLocaleBrandingArgs = {
      localeBranding: {
        id: savedCredentialBranding.localeBranding[0].id,
        alias: savedCredentialBranding.localeBranding[0].alias,
        locale: 'en-NL',
      },
    }

    const result: ICredentialLocaleBranding = await issuanceBrandingStore.updateCredentialLocaleBranding(updateCredentialLocaleBrandingArgs)

    expect(result).toBeDefined()
  })

  it('should throw error when updating credential branding with duplicate locale', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'credentialCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
        {
          alias: 'credentialTypeAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()

    const locale = 'en-GB'
    const updateCredentialLocaleBrandingArgs: IUpdateCredentialLocaleBrandingArgs = {
      localeBranding: {
        id: savedCredentialBranding.localeBranding[0].id,
        alias: savedCredentialBranding.localeBranding[0].alias,
        locale,
      },
    }

    await expect(issuanceBrandingStore.updateCredentialLocaleBranding(updateCredentialLocaleBrandingArgs)).rejects.toThrowError(
      `Credential branding: ${savedCredentialBranding.id} already contains locale: ${locale}`,
    )
  })

  it('should remove credential locale branding and all children', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
          logo: {
            uri: 'data:image/jpeg;base64,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',
            mediaType: 'image/jpeg',
            alt: 'Sphereon logo',
            dimensions: {
              width: 200,
              height: 200,
            },
          },
          description: 'Sphereon credential branding',
          background: {
            color: '#7C1010',
            image: {
              uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQYAAAB0CAYAAABnqJxCAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAcoUlEQVR4nO2df5BlZXnnP9+u61TXFDXFDuwUoXB2aooAEiBIkHvOyD0ioqjFskbkR1bUVIFsNBvQVeKyiBaLrItbG0MiYmIgIQZhIWCILKIg4G3gnh5YZBERWSQIFEtRSFEu1Ts11dXf/eP8vn27+57bDTPDvh9q6HN/nPc87+/nfZ7nfS8EAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgE/v9Fz6zb52cYEDT+Fi80dOnizuL94qbstVTdXl4XOL+t/qzqu78G4jfv/NXCa5TXNSOKk4uNTxPKs2FAF6SD/j/satkCgbWgI/sQxAugJ8qOqmIAMCrfpOzxKr5Udux8FMg7fDYguExIEraRGomXaRsfitkv/8Luj9kPcYjzF/n/N+xKkQKBtaSTd8bb3rzzV2ftKiGeXbfPjcAJlTqy+6PGlRnSjQKBPZpONZPvOjykQez2lMstqotdXYiBwBrSyf7s6katxp/dnUKxqZlI9hTRA4Gx6OwWM532LDW8YWOxdosiDATWkinlZsJdilV1tj2BmrfF5BrELi/EQGDtmALt8glb+cy7J/WtQlphJGcu2EDgDULHsMsnaufxDXtS36oGMVUZCATeIHR2h/a8p63RMy+KymAtodKzEgi8EZjaHdpzuU7fYxYTlcFRRQzDnja6BQLLkBkfd3V/LK13e0bnkqrYC7tYSezqQgwE1o6OtevDiqQ9r1sp1xAUNIXAG5Ap7F2+PjZm16st7bBdrYHM7uD0DQTWjA5q767sxsmU4FDbxyJ+C7QJ6IBfAX4hsx3p/nTQnxsnPdU3ZNWI4t4U1nQloDAszA76O5rfSzrGxwDHAr8J7J1/9BLwc6H7gYfSQX++XU5H43xjWCFT829NJvtY4J1IWwXrDa+Cn5aZMerPpv2dayHPKKI4wXAQmQyHS9oPWGfYAX4O8xNJfeCZdNBf1bO6cYJgGpgqloTGC7ODmeF62tf2ScDbkDYB8+C7Zwczfznps6M42WQ7Ad6KtBlYD57HehH5Z1j3SjyaDvqv6a7dKO51MEdYRMBbhDYZd4TmbD8P/ETiXuDpdDCzRs9M1oE7RdtztulxRz2v3SgB+RDBe4wOBzYK7zQ8h3lA0g/SQf+V4bQ7YnwffN5RT7N9AdJhwFS1hzpfEhSzp3k5ipMbwJelg5mnl0u32K/hRaODDkD83LUdmUAfODEvmI7xObY/A2ytb2Iod3RWBfZUN+79udA30qGBpS3VbtHcG1FbTkRxgu0zbC4GHZRnkPrAkb96qhv1LkK6fnYNG20+IJ1h+zyko8hjVZzLkZVHXir2vFC/G/UuE/pBmk44QNgdw0+B/Yu3JD0MxLlM08CFNp8C7QVGzmoFsR5oNTBEcQ+bRNJnDO8F1hVtDxlZ9a39C8DjUdz7c9DV6WBtB+Mo6m1E+qTts0BbyqMJipMImvEA88bbu1FyBeKG2VVOVIY/xlxYnIeQHwPwDmA7QBQnR4D/C+gE21PFMQiZfNm3bf86int/hvXlNK0m8qlxNwZGUW+DzXeMrwOOsD1VilcI2ggB9Ebbf2Dz0yhKzo2i3vKZHGHAyzLhaexpYBo8DV6XZ3qL8X2YK4Cto2WpRyh6K+artv9nFPe2RXGycqZXoFyC5cuJKO5N2/4WcB34oPquSw8VtOWtwLXYf52N/KsjihOiODnK9gPAt4CjqddRozxKOTrGxwPfN74xipO9mQRpHthJpjVMg6dt75/Lta/tu21/HrxXof2V/zevtnlUN0o22dwI3G37ZJy1h7LtlRNTWTdTtg+1udL2A1GcHDZRHoeI4mQqipNzDP/L9iXAlnywpfxbetrK9zqYbeBrsX/cjZMoilbRDrOyK/uH8bTEvt0oIZPNszbvKfqq3SiXohVssPm88X1R1DugSHoKrRzrH8VJB/hvkk4W2YwpDf/Nr1n02XrE5RaXLdUZpaVDoqu0q3SjKNkKzMgc0/xcZVqlcZDqdf7vIOCHhjMmHRyMh/ItJHcM35I4sziaoik3Tfmqzz8KvmI1A1U3u/dfg2ckHdl4XvEsmmU4olw/BMxEcbJf2+fPZkuRuaH8boiiZBp8i0RU5X2RHGMPDFGcHCH5AUkfkjSVlWFRlkvmq94mjsjzeGzbPNbpRsl6zLXYfyG0cVEfWFTni+RA4jCZHyGf252w7kU2qNbTBvaS+APMlULTlRw02x0aLrMjEd+Lot4GKLddLz8y2D5b6L1QDYJC84hbbb4r+SmbBaEtxu+T9QHEtItNBZlad7bhcuD5RemX4cWLMl7tZCxVM6+XdJPtAzK5DWjB9kPA/cCzuZfjNyRFwDGgTj6ZFIuNaYlrsjU/t45XDU3JihVEuW3d+ojEceXKIjuR6i7gccNOWQdYnCCzuQyPKlVOnW24ZTJZAPs0pGuwOs3CYh5xL9YtwOO2XwVtkHykrdOBI8oyzy4Ow9zUjXvvGrYPjFEmc0UZ53Ee08iftdlWep2ystkBvIS1E7EB+PU4qXfj5BDgDptNGhLa8Jjg74H/AbxsMy35IFv/CjheolMeOWT2RtwSRcnb0rT/VLs8Zssimxstv18uTvAqol8F5gXLfVlPIf6v4Z8JjjBEgvVF3eTyrDP6qvD6KE7+8wS2nryO8sVylsPfMZwrMZXLthO4F3jI4v8I/jmQAEdQa4OZ+DrM+JJunJzXWWlQiOJeB3Re8Tprx+zA/C727bNpw5DSB/62G/UOEvprwba87p5E/G466C8aFMgLdqnVjPLaLOc9cUz2fmn0uwv4nMSDw0adKOqBdKjtSyU+MKSXrBNc0416b51NZ55ZthCWlKtmXhDH1V7/le0LZ9OZF4fkmUa6SPDvgalqJDRCX4zi5Na2jSNXja8COkPH7D0E/gSwfYTt4LYoTr4CfBS4PFv3F/nwNqHPAl9qI4fETigGXgNaB7qgWDoIHkdcCtwOvJSm/aJtTY+Rx/XAjcCm5kN5EThP4u9HGJbvjOLk68Cx2NdQ2KCy9rTR0jejuPfudDAztn0n1+ouk3h/kVZtjHoGuADp5mHjeH7v/sBngH9L1vaK+6dAl9o8Adw8riz5M3c22nR2+SnBuvzlPcAn0kH/8YYsUW8K8UHQVfngXGvPOge4TM++aR8jrl7qBKcoTjaD/wmYKoyAkr6RDvqfWE7mKO6tB75r0wFOHe4kdZ550z43Cp+AtE/9zMcoTjbb/mUheOWbKIYKfQW4cCVvQxT3poDP2lxWGQzLSr3e1u/NtjC8daPeXyDOyc03pUy5dF80/MfZJTp4vqa83PK5uJGvBaHfTgf9R8eWI06mhO82JEWZ5LLcDjplHK9QN07eC76laEz5xPdrrIPTtP/CuLJEce8Owwn194qZ1HCDpLPSQb+VPaFMO+pdbPGFQoPMy+xpoXeng/6TK93fjXqbgfskDqhpjQj9y3TQH1tL60a9ROJuYKr+vk1f0inpoP/SsvnIDNPHSXzHhecsNwSCX8A6fDZdPo2h9D4EvrHMU36RX98qdGqaLm1oj+LkJOPvFnKo0hzOq81aS3IAaIraWt32z1a6KR3MzGGdLnHicoMCFKp3vWnnONcM1FgpF3//Evy5cVyQ2aygr0j8KVRrrDzN0yQOXSmNIYmpRupGWreBv7TUoACQpn0sLhZ6RVItBU3ZPq6dFLwHlNTKBKEnDKeP7yrmdpm/KlegmUwbwL/fRpba82tlAkj3gz428aAQJ/sifarMYybfDmUD34qDAsBsOvOMpPOG2g/AeSvcWpcDpMuc9wVQ7t3R42QDzIodOh30mU1n7rF1qtC8yvyA0H6Szx9XnoxiIVOVTX79POhjyw0K+f23Cv2gVq6FPO+aKtNf8l4vZMZMF14CJL11HGNZmvZfSsdYq1YW+xGjVMPRQRGC/BTw6Tb+4FxFvxDzVM1QDJnv/eNjJ0RtdKaw9ILNAvjCcVTT2UH/ZcxtQ0ZilPmZx8f8oV0Lac/q6TOzg5mx1u1QlIu+arPgwpeVzWKnR3EytcLtlShFXoq2ksm0AP6j2RUb6LKcaXtD0wHkr4MfapnOP2KedNWGsEnGNbYatslEZflkby4AH59N+2OXN4DEneBv5OnWykznRHFvr+XvbqTUaD9lP7Uvm037L690dzqYAfu6ote5CnY8bKro8Mvk4mnwfGmoyIQ4E/hkN+6t2s2WJVh0kCFJykfW93MY4UvHnRHrpIOZOePLXRuK8gr5QCuvQGkILSQygkdAj4yfiB8or6ps7z/yqyPoxr0NddU9b69PSrp9fBky0rT/JFDOvvn4cJjxpqXvGk29Bm1vTwczbTtwMz1zau0a8LysK9sGCaWD/jziziEp15EFxa2I8OnFyeflBAl3Ye5tJQj5YGwus5kfivjdG/Setuk1k9BOwQ1j3yxtryaoXBMy+4/jrnxR4v6Gy0N0gCtk/TSKky9EcXLUqnzxqlSZER9RuVbI3FvS+BkfTg/dLJhvuG9gM3DACreWlKbQUjaBuLdldN3Tw64kxIqGuFo+jpGYbixkMhkmCpqReKzhXoOO0NhLrGZ5lq6wH0wiS0EUJRskjizzmJX3c+DW3oQM/3S4PQG/Pd6tOq68j2Jh7esmDgqTnpPo18q7aP3vbJUMQ2UvnkQa2zYEPCexMNS/pzt1tXgU6aC/EMXJ+bZ/JGk6G7QLF6cPBC7Guhj5xSjqpcAdlm4TfmrsUb30ZY36bNjkyHYzvu97BM8bnpHZWjzTZkr4IOC58eQdkil7+YtWUohXnEeroWIuWtngU+PQotxKacxxUdS7oyqqyhJF/pzGii03fOWBL4dms2Htd0Pw5lZ5qluwsrR/0u7+IcRmYH3DwCs2Yr5fD5gbuQhVafgsOjFY+5X5K4x+ZstKYkRxb53tA0sZymeqtbZQkA76dOPevTLHF1pIlr5b2buMh7c0tA253gmew+xVL8cOgFbYLJEO+tujOPkwcI3QXuXdpY8DQJsQJwMnC74Kur8b9S4X+oc0XX4mzeMAlvmwfAHmiTYehEV5SfsLUZQ8jYoQ6rINtQjsEYvKALdaZ2Lm6/stWg0JGb9R9JTavVvyf80WXMqrZg8q7YOqvVVdu9pzMh7DPlx7bAv7KGzvVxrUKrE2oCHvxxLmKVTLTXaizuKS1lh53Ci0rqpzUBZD0GZmXiwe+kVZB1Xi+0Vxwrhuaw3X6ZhxIRVeIItJaiSThUqO0SzTQf9mm9+xfDOwAE3DWT3kNw/9TCTdZLijGyfLqunl8mYJa0fDCiKvRlvI0pNr9onGenMsskm4zGueitqp8GKhvqt1gt2Z08VadxR1+8fi94b+1uVopKeJlodlGtIq94BofZ7iyNIZlcfG59Trx+V7QypyZww51oGbLkrYYVjtprw5L6qN8dthpazWX7tlmav59PyiM8rmtxSzaf8J4JQ8WOODEu/LdxBuyDS1+kRVSn085r4oTt6eDvqjVfVC5Rs5PjnXAgt1Ui2stktgNlhDpSqNbzkvNNNao2s754/qlMuu6RazszYQZ2KJedB8tSxTUxvIlxXle42ZdtEao5gVx8vPkOzlMml17Cg7TmUkX8iCqcr10pKRu9U3mu9Bo85WNGLb3kHmYal78aZzW9tq2KvetvOEd4xdbnl9tms2I2jso8noNBrKmOQRjF8DvtaNk2nBUcD7jD8IHCJpqnhQVjnebHNVFCcnjlKRimXpEvpgQwM2HNJG1Rom233I1kKzrjW8kVGZo3A+ihUNb5Ij+IdVwAkq938XpVvUn+Frs4P+p1untAYUYc+lNtWyTY1OlBdK20hhKTCPpoP+eAbDNULwsrMOu5fz8jaexhwAPLaKpH+z6nvlUPV8m7Zd1X2+q7SlAM7TKAfRPIGpItFJmR30d6SD/v3poH+RrMMx77K9vVhaVGqlTwCOHCncEnbHUulw5mDMd64dw6p+QNZbkfcvXJZ51heQHl/2thrFzFvmsRC2lRiuYkOKZViLvmR4vNQY8v8Eh63FrtHJqJdFLtUqpzLBM8BcUVHOymhLt5Wvf/Wk6cw84rHhmna252AisvMynBR1V3PXt3B510o91zzUsszFUBvM/01V0VKrJ037C2nav0fSu4Qerdw7QtnBs9tGClf4SoYzlU+qdbeg0HrbZ0wqo63TBFNNFxhPzA76y0ZnNhOpyTRp6anIj8u8tbrdTgU7m+4ztkEbI+paUosBbco0Memg/4rg0WZZewPohJXvXnPuariGAUkfbhMEVsewVbCtzFdpGPUP26RTlHNxf/uhuNYGyz6WnxK92iXKMHn463WUI2Eugth3qXsK9XzEJ43rfMvzhd04aT1rRHGyUeKPRnzUdvPKCPladoIiTLBYbLWshTSdeYVs92Y90fW2z++ucPbFKKI42TvfrLR2rM18c2P2pygvEFyQHwXQiihOprpRb6KBU+i6IaMMwLEe2h8yNvZFlCdelW++ALqnZULU29GEs9RQevlSYqW0ojghipJzu3FyfIun7SzlrEafkYaeSo0a0Tlc9CFXfclsln1lt8VoHUW9KdtXYm+qNCZDFn12VYt8VSG/TZnaodrYwGRpGF1RD4XNy/tcRJt6Kvz019qe6UbJlnZS5LLkghRl40nKZGTC/C3m1SrcGrCPAV/UZtmUf/ePgZ904+SEbtx68HwEdGd52ElZ5r4yipMlJ7xRdOPkZOCjw3Vnc0Xr08VqaUy8civrzWU7XHETVX6u3BXA5YKbojg5bqUKydWrE10oXXlUo+3Rm1603EincqlRLjmyf2fKXNnNjg1bOQ/SFZJOKxXBSuf9G6NWkXSl0qza3wlGatVCHkf4o8fhNsS9olE2HaHvRHHy3nE6ThT3NoJuEnq/pKMED0Rx74S2h4dkBrl6BKvW5Gf70rT/ouFPG+Wd/fs88PlxVPlsezcXA5eC9pX5nsy/60a9sSeWPIz5c0LzUGuPaCvme+PsuchP2Xq/4NrsoJlafqSnEX82rjwltajhqmwmS6OoQ1D2uxLLZGRv27eAPpkru3vb/r7NpVGcbFzinmnbl9icQM3qb5gDjTa3luPC4kxlE0TN+FjMSFm652APoqj33rzyh2XpRFFyvO378mPmSkNLnuvnbS5sGzDlWgqFXJOM1lWM+mQG4NlBf0HoE5YbM2q26cjfNXwzipMDoxGzYxQn66MoORP0Y9snVQqU98X67zJHTJCjxp6XtVlJAOjLFo+V7QCwPWVzieGHUdQ7tjtiaZHVfy+xudv2F+zS2N4x/Nf87IEWYvCQ4T9BXSMyxkcbftyNkrNHLceiuEc37m22ucJwi+29huIrdtr+eJvNbwWlxlGUzCTtkHpbzNLp5D67pTha0vHQcBeuk/gP4E9GcXK74QFlpzGvB94CnCyxpXyocpca+ka6xI4vFYbHES2p+kiFL+w5xPOgY/K3jgR9z/bTUZykwHN5/vYHjkEcqFzwLHahnN132P7ISlvCl6IQtQrya7sOqGsZk+vc6aD/aBQlZyFfa9dO/c587Gcbfl/m4ShOHjK8rOxswAOByPK+heFqSI6vYcY+F6K8t6H0LFqPT8xs2p/rxr1TJH5ksyk7wLg0bR6HmBE8mdf/82RL5APIPFhbizM46lqds5PD/66NHOmgTxQnlwAHCZ8BqkVdej+kb4K/3I2TVNmmtB3ARuAI4CjJ6ypPbinMAvjTs4OZOycqnMpoWUa+t6G0Tig/TDaXb6Uftb3T9seQrkIqR8LcULg3cAb2Gdlpv/kj8ral4tJg6WHBF5cUruj4S3yGqlOOkeaETzXcLbS1FrW5xbAly2kmS9lX88GpyKjNq4IPz6YzQ8a78SgPewHK44jbriVUDCbFEmASSYq0fAPWFOIqYL2bAUwdo6PBR2PlwTRFeRanKavI2ILMnyA+t1IY+zDNesoyuHYaA8wOZh6P4uTdgltMNvHU2gSYA4EDm3a0+otae0B3CZ+SpjOto2jTQX8+ipOPgV61ObuaucqpYl/MSeWja521OJ27LH+8A/OHkq5uK0d2ez2tSckd3a6WfkbDVtEm+cES12O/Q/jhSkV0Jo5rr527Per7LrLP75F9Ypoud1CHa9Ffzdul7DnV6gdAzwi9A9zPnp0fzpqrVPkKN7+u3ZuV48OSemna/8cxS26EtBnZc/Nnt7YcVnIWeZiUdDBDmvavF7xd8GChFyr3a6tWJir0Rooyy3Ik/CL49xDnT/obDHI9H6trrqNIB/1HDF2Jb2MvUKv3Io/1Oke166xt7gC+JHhf7tWZVI6dwL8Bf0TwQta2qvZZylSXy1Rlk332oNDbZ9OZqyf/XY9CG6/3jXblXvVbav3ETAntI0a68Epm05kHQW8TOl1wj3MDTGGwqGa8mvHDPAachfzudMUTnDTyR28Klas0aNVm5Sy8Wu+0+QjSI24ahCpDVW5QsXjU4izhbjroPzx+0Y2Qy8xLzCHN2ZoDzUHrfQELSHNWfr80R4sQ5FHk+eoiTkXqgxZKY22pmZTxIHlmeFLiAtDBs4OZGyZtpJJ2VPnQHGKO7Dcd1pTZtP8i8GGJWNL1+TPLNqh89oOq/kEvI75OdhDOReka/NBPOugvzKYzf4c5GOl8wxPNPqlqlKDUoOeR7kI6BambDvqrOquCbK9G1g7FnMUcplXe8iFzB2bO5P+kuYm0vSjubQIlwOGY/cl+NGSH7Rcl/QzYjnl83L3qy535CP5lpjmUgcdPZI24SrubnaN4mLJItLcgNtqel/SSzc8F91o8ttyRa29EulGyn8SxxocL7Q+sx95p8RLm55JS4LHX+leaXkuiLJ5lG1lU7b8g2xG6ALwM/BPwIGb7WgwGy9GNewgdkstyMGaT5XVCc+BnQY9i37vSJLm7sJbLwIl55k373KhsK+2IgYFfNjYpmSeMDx46nToQCKwhE4VzrjlaOq5+0U6EVdrpAoHAyqx22+gaUbjMFg8Oddt2+eM4a7FzLxAILMnuoTGUjOjwbmoTq9ywFwgExqDz7Lp9jivOwcu8eXVfq0s/rKifB5hRuu1GXBczfe2e59+88+UnRglRKgtD48Kin88LmkIg8LrQAe5uhB5QdUa5ClwqIsfKAEXln5cRb/l17kHARXRaGelxNTDy167yHZMs1hhyOcqhJotcXM35EYFAYGWKH7W9x/BNgGIvQtVPCz9s7cctShWhjDrLVYXKMqjG+8AKG5UawWMUaRRLh8k2KQUCgckoftT2qc07f/XtXSXEcgdMqLHOqAWxBAKB14yp3UErzzSUJdyV5c7F6ii1QCDw2tLZHSbfyr4w1OnLiMdAIPB6svKP2r4OVJrAKHcllXxBYQgEXhdW/lHb14Nyo+aQJCreqQ5CCWNDIPDa08m9ClPPrttnXW1ve+kSrA65KM4gaHoIqlNjqvfL75fuy2IzNOUe8uy9cg/EkoFWGvJ2hFEhEHjt6eTL+zOAk8qePWT5L+MaRvgMm2cVFp1eiz4rT7qpHSJS+5GSDdhzI+0d1WkrLLncCAQCa0oH+HbZ4ex8clazC7o6Sqs8dagKiaQMOaqFNRTXFN9UTZOoxyxUA8bconhnM4f0bduVROKFoDUEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoFAIBAIBAKBQCAQCAQCgUAgEAgEAoHAa8X/AzpJlj2mUDhvAAAAAElFTkSuQmCC',
              alt: 'Sphereon background',
              mediaType: 'image/png',
              dimensions: {
                width: 262,
                height: 116,
              },
            },
          },
          text: {
            color: '#000000',
          },
        },
      ],
    }

    const savedCredentialBranding: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(savedCredentialBranding).toBeDefined()
    const branding: Array<ICredentialBranding> = await issuanceBrandingStore.getCredentialBranding()
    expect(branding.length).toEqual(1)

    await issuanceBrandingStore.removeCredentialLocaleBranding({ filter: [{ id: savedCredentialBranding.localeBranding[0].id }] })

    // check background image dimensions
    expect(
      await dbConnection.getRepository(ImageDimensionsEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.background?.image?.dimensions?.id },
      }),
    ).toBeNull()

    // check background image
    expect(
      await dbConnection.getRepository(ImageAttributesEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.background?.image?.id },
      }),
    ).toBeNull()

    // check background
    expect(
      await dbConnection.getRepository(BackgroundAttributesEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.background?.id },
      }),
    ).toBeNull()

    // check logo dimensions
    expect(
      await dbConnection.getRepository(ImageDimensionsEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.logo?.dimensions?.id },
      }),
    ).toBeNull()

    // check logo
    expect(
      await dbConnection.getRepository(ImageAttributesEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.logo?.id },
      }),
    ).toBeNull()

    // check text
    expect(
      await dbConnection.getRepository(TextAttributesEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.text?.id },
      }),
    ).toBeNull()

    // check credential locale branding
    expect(
      await dbConnection.getRepository(CredentialLocaleBrandingEntity).findOne({
        where: { id: savedCredentialBranding?.localeBranding[0]?.id },
      }),
    ).toBeNull()

    const result: Array<ICredentialLocaleBranding> = await issuanceBrandingStore.getCredentialLocaleBranding()

    expect(result.length).toEqual(0)
  })

  it('should show no locale in response when adding credential branding with no locale', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
        },
      ],
    }

    const result: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)

    expect(result).toBeDefined()
    expect(result?.localeBranding.length).toEqual(1)
    expect(result?.localeBranding[0].locale).toBeUndefined()
  })

  it('should show no locale in response when adding credential locale branding with no locale', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: 'credentialTypeAlias',
          locale: 'en-US',
        },
      ],
    }

    const fromDb: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)
    expect(fromDb).toBeDefined()

    const credentialLocaleBranding: IBasicCredentialLocaleBranding = {
      alias: 'credentialTypeAlias',
    }

    const result: ICredentialBranding = await issuanceBrandingStore.addCredentialLocaleBranding({
      credentialBrandingId: fromDb.id,
      localeBranding: [credentialLocaleBranding],
    })

    expect(result).toBeDefined()
    expect(result?.localeBranding.length).toEqual(2)
    expect(result?.localeBranding.filter((localeBranding: ICredentialLocaleBranding) => localeBranding.locale === undefined).length).toEqual(1)
  })

  it('should store blank strings as undefined when adding credential locale branding', async (): Promise<void> => {
    const credentialBranding: IBasicCredentialBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      vcHash: 'vcHash',
      localeBranding: [
        {
          alias: '',
          locale: '',
          logo: {
            uri: '',
            dataUri: '',
            mediaType: '',
            alt: '',
          },
          description: '',
          background: {
            color: '',
            image: {
              uri: '',
              mediaType: '',
              dataUri: '',
              alt: '',
            },
          },
          text: {
            color: '',
          },
        },
      ],
    }

    const result: ICredentialBranding = await issuanceBrandingStore.addCredentialBranding(credentialBranding)

    expect(result).toBeDefined()
    expect(result?.localeBranding.length).toEqual(1)
    expect(result?.localeBranding[0].locale).toBeUndefined()
    expect(result?.localeBranding[0].alias).toBeUndefined()
    expect(result?.localeBranding[0].logo!.uri).toBeUndefined()
    expect(result?.localeBranding[0].logo!.dataUri).toBeUndefined()
    expect(result?.localeBranding[0].logo!.mediaType).toBeUndefined()
    expect(result?.localeBranding[0].logo!.alt).toBeUndefined()
    expect(result?.localeBranding[0].description).toBeUndefined()
    expect(result?.localeBranding[0].background!.image!.uri).toBeUndefined()
    expect(result?.localeBranding[0].background!.image!.dataUri).toBeUndefined()
    expect(result?.localeBranding[0].background!.image!.mediaType).toBeUndefined()
    expect(result?.localeBranding[0].background!.image!.alt).toBeUndefined()
    expect(result?.localeBranding[0].text!.color).toBeUndefined()
  })

  // Issuer tests

  it('should add issuer branding', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const result: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)

    expect(result).toBeDefined()
    expect(result?.issuerCorrelationId).toEqual(issuerBranding.issuerCorrelationId)
    expect(result?.localeBranding.length).toEqual(2)
  })

  it.skip('should throw error when adding issuer branding with duplicate issuer correlation id', async (): Promise<void> => {
    // FIXME revert
    const issuerBranding1: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const result: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding1)
    expect(result).toBeDefined()

    const issuerBranding2: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    await expect(issuanceBrandingStore.addIssuerBranding(issuerBranding2)).rejects.toThrowError(
      `Issuer branding already present for issuer with correlation id: ${issuerBranding2.issuerCorrelationId}`,
    )
  })

  it('should throw error when adding issuer branding with duplicates locales', async (): Promise<void> => {
    const issuerBranding1: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    await expect(issuanceBrandingStore.addIssuerBranding(issuerBranding1)).rejects.toThrowError('Issuer branding contains duplicate locales')

    const issuerBranding2: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
        },
        {
          alias: 'issuerAlias',
        },
      ],
    }

    await expect(issuanceBrandingStore.addIssuerBranding(issuerBranding2)).rejects.toThrowError('Issuer branding contains duplicate locales')
  })

  it('should get all issuer branding', async (): Promise<void> => {
    const issuerBranding1: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId1',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedIssuerBranding1: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding1)
    expect(savedIssuerBranding1).toBeDefined()

    const issuerBranding2: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId2',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedIssuerBranding2: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding2)
    expect(savedIssuerBranding2).toBeDefined()

    const result: Array<IIssuerBranding> = await issuanceBrandingStore.getIssuerBranding()

    expect(result.length).toEqual(2)
  })

  it('should get all issuer branding for a certain locale', async (): Promise<void> => {
    const issuerBranding1: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId1',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedIssuerBranding1: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding1)
    expect(savedIssuerBranding1).toBeDefined()

    const issuerBranding2: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId2',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedIssuerBranding2: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding2)
    expect(savedIssuerBranding2).toBeDefined()

    const args = {
      filter: [
        {
          localeBranding: {
            locale: 'en-US',
          },
        },
      ],
    }

    const result: Array<IIssuerBranding> = await issuanceBrandingStore.getIssuerBranding(args)

    expect(result.length).toEqual(2)
  })

  it('should get issuer branding with a certain locale', async (): Promise<void> => {
    const issuerBranding1: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId1',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedIssuerBranding1: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding1)
    expect(savedIssuerBranding1).toBeDefined()

    const issuerBranding2: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId2',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedIssuerBranding2: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding2)
    expect(savedIssuerBranding2).toBeDefined()

    const args = {
      filter: [
        {
          issuerCorrelationId: 'issuerCorrelationId1',
          localeBranding: {
            locale: 'en-US',
          },
        },
      ],
    }

    const result: Array<IIssuerBranding> = await issuanceBrandingStore.getIssuerBranding(args)

    expect(result.length).toEqual(1)
  })

  it('should get all issuer branding with no locale', async (): Promise<void> => {
    const issuerBranding1: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId1',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
        },
      ],
    }

    const savedIssuerBranding1: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding1)
    expect(savedIssuerBranding1).toBeDefined()

    const issuerBranding2: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId2',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedIssuerBranding2: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding2)
    expect(savedIssuerBranding2).toBeDefined()

    const args = {
      filter: [
        {
          localeBranding: {
            locale: undefined,
          },
        },
      ],
    }

    const result: Array<IIssuerBranding> = await issuanceBrandingStore.getIssuerBranding(args)

    expect(result.length).toEqual(1)
  })

  it('should get all issuer locale branding with no locale', async (): Promise<void> => {
    const issuerBranding1: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId1',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
        },
      ],
    }

    const savedIssuerBranding1: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding1)
    expect(savedIssuerBranding1).toBeDefined()

    const issuerBranding2: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId2',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedIssuerBranding2: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding2)
    expect(savedIssuerBranding2).toBeDefined()

    const args = {
      filter: [
        {
          locale: undefined,
        },
      ],
    }

    const result: Array<IIssuerLocaleBranding> = await issuanceBrandingStore.getIssuerLocaleBranding(args)

    expect(result.length).toEqual(1)
  })

  it('should get all issuer branding for multiple locales', async (): Promise<void> => {
    const issuerBranding1: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId1',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedIssuerBranding1: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding1)
    expect(savedIssuerBranding1).toBeDefined()

    const credentialBranding2: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId2',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedIssuerBranding2: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(credentialBranding2)
    expect(savedIssuerBranding2).toBeDefined()

    const args = {
      filter: [
        {
          localeBranding: {
            locale: 'en-US',
          },
        },
        {
          localeBranding: {
            locale: 'en-GB',
          },
        },
      ],
    }

    const result: Array<IIssuerBranding> = await issuanceBrandingStore.getIssuerBranding(args)

    expect(result.length).toEqual(2)
  })

  it('should return no issuer branding with not matching filter', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()

    const args = {
      filter: [
        {
          localeBranding: {
            locale: 'en-US',
          },
        },
      ],
    }

    const result: Array<IIssuerBranding> = await issuanceBrandingStore.getIssuerBranding(args)

    expect(result.length).toEqual(0)
  })

  it('should update issuer branding', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()

    const updatedIssuerBranding = {
      id: savedIssuerBranding.id,
      issuerCorrelationId: 'newIssuerCorrelationId',
    }
    const result: IIssuerBranding = await issuanceBrandingStore.updateIssuerBranding({ issuerBranding: updatedIssuerBranding })

    expect(result).toBeDefined()
    expect(result?.localeBranding?.length).toEqual(1)
    expect(result?.issuerCorrelationId).toEqual(updatedIssuerBranding.issuerCorrelationId)
  })

  it('should throw error when updating issuer branding with unknown id', async (): Promise<void> => {
    const issuerBranding = {
      id: 'unknownId',
      issuerCorrelationId: 'newIssuerCorrelationId',
      vcHash: 'newVcHash',
    }

    await expect(issuanceBrandingStore.updateIssuerBranding({ issuerBranding })).rejects.toThrowError(
      `No issuer branding found for id: ${issuerBranding.id}`,
    )
  })

  it('should remove issuer branding and all children', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
          logo: {
            uri: 'data:image/jpeg;base64,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',
            mediaType: 'image/jpeg',
            alt: 'Sphereon logo',
            dimensions: {
              width: 200,
              height: 200,
            },
          },
          description: 'Sphereon credential branding',
          background: {
            color: '#7C1010',
            image: {
              uri: 'data:image/png;base64,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',
              alt: 'Sphereon background',
              mediaType: 'image/png',
              dimensions: {
                width: 262,
                height: 116,
              },
            },
          },
          text: {
            color: '#000000',
          },
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()
    const branding: Array<IIssuerBranding> = await issuanceBrandingStore.getIssuerBranding()
    expect(branding.length).toEqual(1)

    await issuanceBrandingStore.removeIssuerBranding({ filter: [{ id: savedIssuerBranding.id }] })

    // check background image dimensions
    expect(
      await dbConnection.getRepository(ImageDimensionsEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.background?.image?.dimensions?.id },
      }),
    ).toBeNull()

    // check background image
    expect(
      await dbConnection.getRepository(ImageAttributesEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.background?.image?.id },
      }),
    ).toBeNull()

    // check background
    expect(
      await dbConnection.getRepository(BackgroundAttributesEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.background?.id },
      }),
    ).toBeNull()

    // check logo dimensions
    expect(
      await dbConnection.getRepository(ImageDimensionsEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.logo?.dimensions?.id },
      }),
    ).toBeNull()

    // check logo
    expect(
      await dbConnection.getRepository(ImageAttributesEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.logo?.id },
      }),
    ).toBeNull()

    // check text
    expect(
      await dbConnection.getRepository(TextAttributesEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.text?.id },
      }),
    ).toBeNull()

    // check issuer locale branding
    expect(
      await dbConnection.getRepository(IssuerLocaleBrandingEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.id },
      }),
    ).toBeNull()
  })

  it('should add issuer locale branding', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()

    const addIssuerLocaleBrandingArgs: IAddIssuerLocaleBrandingArgs = {
      issuerBrandingId: savedIssuerBranding.id,
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const result: IIssuerBranding = await issuanceBrandingStore.addIssuerLocaleBranding(addIssuerLocaleBrandingArgs)

    expect(result.localeBranding.length).toEqual(2)
  })

  it('should throw error when adding issuer locale branding with unknown id', async (): Promise<void> => {
    const addIssuerLocaleBrandingArgs: IAddIssuerLocaleBrandingArgs = {
      issuerBrandingId: 'unknownId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    await expect(issuanceBrandingStore.addIssuerLocaleBranding(addIssuerLocaleBrandingArgs)).rejects.toThrowError(
      `No issuer branding found for id: ${addIssuerLocaleBrandingArgs.issuerBrandingId}`,
    )
  })

  it('should throw error when adding duplicate issuer locale branding', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()

    const addIssuerLocaleBrandingArgs: IAddIssuerLocaleBrandingArgs = {
      issuerBrandingId: savedIssuerBranding.id,
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    await expect(issuanceBrandingStore.addIssuerLocaleBranding(addIssuerLocaleBrandingArgs)).rejects.toThrowError(
      `Issuer branding already contains locales: ${addIssuerLocaleBrandingArgs.localeBranding.map(
        (localeBranding: IBasicIssuerLocaleBranding) => localeBranding.locale,
      )}`,
    )
  })

  it('should get all issuer locale branding for a credential branding', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()

    const result: Array<ILocaleBranding> = await issuanceBrandingStore.getIssuerLocaleBranding()

    expect(result.length).toEqual(2)
  })

  it('should get issuer locale branding for a issuer branding', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'credentialCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()

    const getIssuerLocaleBrandingArgs: IGetIssuerLocaleBrandingArgs = {
      filter: [
        {
          issuerBranding: {
            id: savedIssuerBranding.id,
          },
          locale: 'en-US',
        },
      ],
    }

    const result: Array<IIssuerLocaleBranding> = await issuanceBrandingStore.getIssuerLocaleBranding(getIssuerLocaleBrandingArgs)

    expect(result.length).toEqual(1)
  })

  it('should update issuer locale branding', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()

    const updateIssuerLocaleBrandingArgs: IUpdateIssuerLocaleBrandingArgs = {
      localeBranding: {
        id: savedIssuerBranding.localeBranding[0].id,
        alias: savedIssuerBranding.localeBranding[0].alias,
        locale: 'en-NL',
      },
    }

    const result: IIssuerLocaleBranding = await issuanceBrandingStore.updateIssuerLocaleBranding(updateIssuerLocaleBrandingArgs)

    expect(result).toBeDefined()
  })

  it('should throw error when updating issuer branding with duplicate locale', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
        {
          alias: 'issuerAlias',
          locale: 'en-GB',
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()

    const locale = 'en-GB'
    const updateIssuerLocaleBrandingArgs: IUpdateIssuerLocaleBrandingArgs = {
      localeBranding: {
        id: savedIssuerBranding.localeBranding[0].id,
        alias: savedIssuerBranding.localeBranding[0].alias,
        locale,
      },
    }

    await expect(issuanceBrandingStore.updateIssuerLocaleBranding(updateIssuerLocaleBrandingArgs)).rejects.toThrowError(
      `Issuer branding: ${savedIssuerBranding.id} already contains locale: ${locale}`,
    )
  })

  it('should remove issuer locale branding and all children', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
          logo: {
            uri: 'data:image/jpeg;base64,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',
            mediaType: 'image/jpeg',
            alt: 'Sphereon logo',
            dimensions: {
              width: 200,
              height: 200,
            },
          },
          description: 'Sphereon credential branding',
          background: {
            color: '#7C1010',
            image: {
              uri: 'data:image/png;base64,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',
              alt: 'Sphereon background',
              mediaType: 'image/png',
              dimensions: {
                width: 262,
                height: 116,
              },
            },
          },
          text: {
            color: '#000000',
          },
        },
      ],
    }

    const savedIssuerBranding: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(savedIssuerBranding).toBeDefined()
    const branding: Array<IIssuerBranding> = await issuanceBrandingStore.getIssuerBranding()
    expect(branding.length).toEqual(1)

    await issuanceBrandingStore.removeIssuerLocaleBranding({ filter: [{ id: savedIssuerBranding.localeBranding[0].id }] })

    // check background image dimensions
    expect(
      await dbConnection.getRepository(ImageDimensionsEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.background?.image?.dimensions?.id },
      }),
    ).toBeNull()

    // check background image
    expect(
      await dbConnection.getRepository(ImageAttributesEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.background?.image?.id },
      }),
    ).toBeNull()

    // check background
    expect(
      await dbConnection.getRepository(BackgroundAttributesEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.background?.id },
      }),
    ).toBeNull()

    // check logo dimensions
    expect(
      await dbConnection.getRepository(ImageDimensionsEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.logo?.dimensions?.id },
      }),
    ).toBeNull()

    // check logo
    expect(
      await dbConnection.getRepository(ImageAttributesEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.logo?.id },
      }),
    ).toBeNull()

    // check text
    expect(
      await dbConnection.getRepository(TextAttributesEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.text?.id },
      }),
    ).toBeNull()

    // check issuer locale branding
    expect(
      await dbConnection.getRepository(IssuerLocaleBrandingEntity).findOne({
        where: { id: savedIssuerBranding?.localeBranding[0]?.id },
      }),
    ).toBeNull()
  })

  it('should show no locale in response when adding issuer branding with no locale', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
        },
      ],
    }

    const result: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)

    expect(result).toBeDefined()
    expect(result?.localeBranding.length).toEqual(1)
    expect(result?.localeBranding[0].locale).toBeUndefined()
  })

  it('should show no locale in response when adding issuer locale branding with no locale', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: 'issuerAlias',
          locale: 'en-US',
        },
      ],
    }

    const fromDb: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)
    expect(fromDb).toBeDefined()

    const issuerLocaleBranding: IBasicIssuerLocaleBranding = {
      alias: 'issuerAlias',
    }

    const result: IIssuerBranding = await issuanceBrandingStore.addIssuerLocaleBranding({
      issuerBrandingId: fromDb.id,
      localeBranding: [issuerLocaleBranding],
    })

    expect(result).toBeDefined()
    expect(result?.localeBranding.length).toEqual(2)
    expect(result?.localeBranding.filter((localeBranding: ICredentialLocaleBranding) => localeBranding.locale === undefined).length).toEqual(1)
  })

  it('should store blank strings as undefined when adding issuer locale branding', async (): Promise<void> => {
    const issuerBranding: IBasicIssuerBranding = {
      issuerCorrelationId: 'issuerCorrelationId',
      localeBranding: [
        {
          alias: '',
          locale: '',
          logo: {
            uri: '',
            dataUri: '',
            mediaType: '',
            alt: '',
          },
          description: '',
          background: {
            color: '',
            image: {
              uri: '',
              mediaType: '',
              dataUri: '',
              alt: '',
            },
          },
          text: {
            color: '',
          },
        },
      ],
    }

    const result: IIssuerBranding = await issuanceBrandingStore.addIssuerBranding(issuerBranding)

    expect(result).toBeDefined()
    expect(result?.localeBranding.length).toEqual(1)
    expect(result?.localeBranding[0].locale).toBeUndefined()
    expect(result?.localeBranding[0].alias).toBeUndefined()
    expect(result?.localeBranding[0].logo!.uri).toBeUndefined()
    expect(result?.localeBranding[0].logo!.dataUri).toBeUndefined()
    expect(result?.localeBranding[0].logo!.mediaType).toBeUndefined()
    expect(result?.localeBranding[0].logo!.alt).toBeUndefined()
    expect(result?.localeBranding[0].description).toBeUndefined()
    expect(result?.localeBranding[0].background!.image!.uri).toBeUndefined()
    expect(result?.localeBranding[0].background!.image!.dataUri).toBeUndefined()
    expect(result?.localeBranding[0].background!.image!.mediaType).toBeUndefined()
    expect(result?.localeBranding[0].background!.image!.alt).toBeUndefined()
    expect(result?.localeBranding[0].text!.color).toBeUndefined()
  })
})
