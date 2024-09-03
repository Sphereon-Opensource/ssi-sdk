import { CredentialsSupportedDisplay } from '@sphereon/oid4vci-common'
import { IBasicCredentialLocaleBranding, IBasicIssuerLocaleBranding } from '@sphereon/ssi-sdk.data-store'
import { MetadataDisplay } from '@sphereon/oid4vci-common'

// FIXME should we not move this to the branding plugin?
export const credentialLocaleBrandingFrom = async (credentialDisplay: CredentialsSupportedDisplay): Promise<IBasicCredentialLocaleBranding> => {
  return {
    ...(credentialDisplay.name && {
      alias: credentialDisplay.name,
    }),
    ...(credentialDisplay.locale && {
      locale: credentialDisplay.locale,
    }),
    ...(credentialDisplay.logo && {
      logo: {
        ...((credentialDisplay.logo.url || <string>credentialDisplay.logo.uri) && {
          uri: credentialDisplay.logo?.url ?? <string>credentialDisplay.logo.uri,
        }),
        ...(credentialDisplay.logo.alt_text && {
          alt: credentialDisplay.logo?.alt_text,
        }),
      },
    }),
    ...(credentialDisplay.description && {
      description: credentialDisplay.description,
    }),

    ...(credentialDisplay.text_color && {
      text: {
        color: credentialDisplay.text_color,
      },
    }),
    ...((credentialDisplay.background_image || credentialDisplay.background_color) && {
      background: {
        ...(credentialDisplay.background_image && {
          image: {
            ...((credentialDisplay.background_image.url || <string>credentialDisplay.background_image.uri) && {
              uri: credentialDisplay.background_image?.url ?? <string>credentialDisplay.background_image.uri,
            }),
            ...(credentialDisplay.background_image.alt_text && {
              alt: credentialDisplay.background_image?.alt_text,
            }),
          },
        }),
        ...(credentialDisplay.background_color && {
          color: credentialDisplay.background_color,
        }),
      },
    }),
  }
}

export const issuerLocaleBrandingFrom = async (issuerDisplay: MetadataDisplay): Promise<IBasicIssuerLocaleBranding> => {
  return {
    ...(issuerDisplay.name && {
      alias: issuerDisplay.name,
    }),
    ...(issuerDisplay.locale && {
      locale: issuerDisplay.locale,
    }),
    ...(issuerDisplay.logo && {
      logo: {
        ...((issuerDisplay.logo.url || <string>issuerDisplay.logo.uri) && {
          uri: issuerDisplay.logo?.url ?? <string>issuerDisplay.logo.uri,
        }),
        ...(issuerDisplay.logo.alt_text && {
          alt: issuerDisplay.logo?.alt_text,
        }),
      },
    }),
    ...(issuerDisplay.description && {
      description: issuerDisplay.description,
    }),

    ...(issuerDisplay.text_color && {
      text: {
        color: issuerDisplay.text_color,
      },
    }),
  }
}
