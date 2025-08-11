import { PublicClientApplication, Configuration } from "@azure/msal-browser";
import { env } from "next-runtime-env";

const msalConfig: Configuration = {
  auth: {
    clientId: env("NEXT_PUBLIC_AZURE_CLIENT_ID") || "",
    authority: env("NEXT_PUBLIC_AZURE_TENANT_ID")
      ? `https://login.microsoftonline.com/${env(
          "NEXT_PUBLIC_AZURE_TENANT_ID"
        )}`
      : "https://login.microsoftonline.com/common",
    redirectUri: typeof window !== "undefined" ? window.location.origin : "",
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    allowRedirectInIframe: true,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize MSAL
if (
  !msalInstance.getActiveAccount() &&
  msalInstance.getAllAccounts().length > 0
) {
  msalInstance.setActiveAccount(msalInstance.getAllAccounts()[0]);
}
