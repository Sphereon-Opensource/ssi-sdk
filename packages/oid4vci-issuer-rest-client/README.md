<!--suppress HtmlDeprecatedAttribute -->
<h1 align="center">
  <br>
  <a href="https://www.sphereon.com"><img src="https://sphereon.com/content/themes/sphereon/assets/img/logo.svg" alt="Sphereon" width="400"></a>
  <br>OID4VCI Issuer REST Client
  <br>
</h1>

---

**Warning: This package still is in very early development. Breaking changes without notice will happen at this point!**

---

# ssi-sdk.oid4vci-issuer-rest-client

A SSI-SDK plugin with types/interfaces and utility functions for calling rest endpoints of OID4VCI

## Available functions

- vciClientCreateOfferUri

### Adding the plugin to an agent:

```typescript
import { OID4VCIRestClient } from '@sphereon/ssi-sdk.oid4vci-issuer-rest-client'

const agent = createAgent<IOID4VCIRestClient>({
  plugins: [
    new OID4VCIRestClient({
      baseUrl: 'my-issuer-base-url',
    }),
  ],
})
```

### Getting a credential offering uri:

```typescript
const request: IVCIClientCreateOfferUriRequestArgs = {
  baseUrl: 'https://ssi-backend.sphereon.com',
  grants: {
    'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
      'pre-authorized_code': '1234',
      user_pin_required: false,
    },
  },
  credentials: ['dbc2023'],
}

const result: IVCIClientCreateOfferUriResponse = await agent.vciClientCreateOfferUri(request)
```

### Use the VDX external identity API to retrieve custom user attributes to issue credentials

```typescript
import { IAgentContext } from '@veramo/core'
import { IOID4VCIClientCreateOfferUriResponse } from '@sphereon/ssi-sdk.oid4vci-issuer-rest-client'
import fetch from 'cross-fetch';
import jwtDecode from 'jwt-decode';

const getUserCustomAttributesFromVDX = async (baseUrl: string, realmId: string, userId: string): Promise<Record<string, any> | undefined> => {
    const url = `${baseUrl}/${realmId}/users/${userId}`;

    // Fetch the custom attributes of a user
    return fetch(url)
        .then(async (response) => {
            if (response.status >= 400) {
                return Promise.reject(`Error: Received status code ${response.status}`)
            }

            const data = await response.json()

            return data.custom?.attributes
        })
        .catch((error) => Promise.reject(`Failed to fetch user attributes. Error: ${error.message}`))
}

const parseKeycloakAccessToken = async (accessToken: string): Promise<{ realmId: string, userId: string }> => {
    // Decode the access token
    const decoded = jwtDecode(accessToken)

    // Extract user ID from the 'sub' claim
    const userId = decoded.sub

    // Extract realm ID from the 'iss' claim (e.g., "https://example.com/auth/realms/my-realm")
    const realmId = decoded.iss.split('/').pop()

    return { realmId, userId }
}

const createCredentialOfferUri = async (baseUrl: string, accessToken: string, context: IAgentContext): Promise<IOID4VCIClientCreateOfferUriResponse> => {
    // Parse the access token to get the realm id and user id
    const parsedToken = await parseKeycloakAccessToken(accessToken)
    // Retrieve the custom attributes of a user to be used as credential input
    const credentialDataSupplierInput = await getUserCustomAttributesFromVDX(baseUrl, parsedToken.realmId, parsedToken.userId)

    // Create credential offer uri with credential input
    return context.agent.oid4vciClientCreateOfferUri({ credentialDataSupplierInput: {
        salutation: credentialDataSupplierInput.salutation,
        firstName: credentialDataSupplierInput.firstName,
        lastName: credentialDataSupplierInput.lastName,
        phoneNumber: credentialDataSupplierInput.phoneNumber,
        employeeIdNumber: credentialDataSupplierInput.employeeIdNumber,
        emailAddress: credentialDataSupplierInput.emailAddress,
        jobTitle: credentialDataSupplierInput.jobTitle,
        pcc: credentialDataSupplierInput.pcc,
        iataCode: credentialDataSupplierInput.iataCode,
    }})
}
```

### Installation

```shell
yarn add @sphereon/ssi-sdk.oid4vci-issuer-rest-client
```

### Build

```shell
yarn build
```

### Test

The test command runs:

- `prettier`
- `jest`
- `coverage`

You can also run only a single section of these tests, using for example `yarn test:unit`.

```shell
yarn test
```

### Utility scripts

There are other utility scripts that help with development.

- `yarn fix` - runs `eslint --fix` as well as `prettier` to fix code style.
