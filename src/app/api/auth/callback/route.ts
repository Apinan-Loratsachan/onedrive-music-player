import { NextRequest, NextResponse } from "next/server";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { env } from "next-runtime-env";

const msalConfig = {
  auth: {
    clientId: env("NEXT_PUBLIC_AZURE_CLIENT_ID") || "",
    clientSecret: env("AZURE_CLIENT_SECRET") || "",
    authority: `https://login.microsoftonline.com/${
      env("AZURE_TENANT_ID") || "common"
    }`,
  },
};

const msalClient = new ConfidentialClientApplication(msalConfig);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL("/?error=" + error, request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL("/?error=no_code", request.url));
    }

    const tokenResponse = await msalClient.acquireTokenByCode({
      code,
      scopes: ["Files.Read", "User.Read"],
      redirectUri:
        env("AZURE_REDIRECT_URI") || "http://localhost:3000/api/auth/callback",
    });

    if (tokenResponse) {
      // Get user profile information using the access token
      let userProfile = null;
      let userPhotoUrl = null;
      try {
        const graphResponse = await fetch(
          "https://graph.microsoft.com/v1.0/me",
          {
            headers: {
              Authorization: `Bearer ${tokenResponse.accessToken}`,
            },
          }
        );

        if (graphResponse.ok) {
          userProfile = await graphResponse.json();
        }

        // Fetch user photo
        try {
          const photoResponse = await fetch(
            "https://graph.microsoft.com/v1.0/me/photo/$value",
            {
              headers: {
                Authorization: `Bearer ${tokenResponse.accessToken}`,
              },
            }
          );

          if (photoResponse.ok) {
            // Convert the photo to a data URL for storage
            const photoBlob = await photoResponse.blob();

            // Check if the image is too large (limit to 5MB to prevent memory issues)
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (photoBlob.size <= maxSize) {
              const photoArrayBuffer = await photoBlob.arrayBuffer();

              // Convert to base64 using a more efficient method
              const uint8Array = new Uint8Array(photoArrayBuffer);
              let binaryString = "";

              // Process in chunks to avoid memory issues
              const chunkSize = 8192; // 8KB chunks
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize);
                for (let j = 0; j < chunk.length; j++) {
                  binaryString += String.fromCharCode(chunk[j]);
                }
              }

              const photoBase64 = btoa(binaryString);

              const mimeType = photoBlob.type || "image/jpeg";
              userPhotoUrl = `data:${mimeType};base64,${photoBase64}`;
            } else {
              console.warn(
                `Photo size ${photoBlob.size} bytes exceeds limit of ${maxSize} bytes, skipping photo`
              );
            }
          }
        } catch (photoError) {
          console.error("Error fetching user photo:", photoError);
        }
      } catch (profileError) {
        console.error("Error fetching user profile:", profileError);
      }

      // Store tokens and user info in cookies
      const response = NextResponse.redirect(new URL("/", request.url));

      response.cookies.set("access_token", tokenResponse.accessToken!, {
        httpOnly: true,
        secure: env("NODE_ENV") === "production",
        sameSite: "lax",
        maxAge: 3600, // 1 hour
      });

      // Store user profile information
      if (userProfile) {
        response.cookies.set(
          "user_profile",
          JSON.stringify({
            displayName: userProfile.displayName || "",
            email: userProfile.mail || userProfile.userPrincipalName || "",
            id: userProfile.id || "",
            photoUrl: userPhotoUrl || null,
          }),
          {
            httpOnly: false, // Allow client-side access
            secure: env("NODE_ENV") === "production",
            sameSite: "lax",
            maxAge: 3600, // 1 hour
          }
        );
      }

      return response;
    }

    return NextResponse.redirect(new URL("/?error=token_failed", request.url));
  } catch (error) {
    console.error("Error in callback:", error);
    return NextResponse.redirect(
      new URL("/?error=callback_failed", request.url)
    );
  }
}
