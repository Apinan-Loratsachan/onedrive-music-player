import { env } from "next-runtime-env";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 401 }
      );
    }

    // First try to get from cookie if available
    const userProfileCookie = request.cookies.get("user_profile");

    if (userProfileCookie) {
      try {
        const userProfile = JSON.parse(userProfileCookie.value);
        return NextResponse.json({
          displayName: userProfile.displayName,
          email: userProfile.email,
          id: userProfile.id,
          photoUrl: userProfile.photoUrl,
        });
      } catch (parseError) {
        console.error("Error parsing user profile cookie:", parseError);
        // Continue to fetch from Graph API
      }
    }

    // If no cookie or invalid cookie, fetch from Microsoft Graph API
    console.log("Fetching user profile from Microsoft Graph API");

    let userProfile = null;
    let userPhotoUrl = null;

    try {
      // Fetch user profile
      const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (graphResponse.ok) {
        userProfile = await graphResponse.json();
      } else {
        console.error("Failed to fetch user profile:", graphResponse.status);
        return NextResponse.json(
          { error: "Failed to fetch user profile from Microsoft Graph" },
          { status: graphResponse.status }
        );
      }

      // Fetch user photo
      try {
        const photoResponse = await fetch(
          "https://graph.microsoft.com/v1.0/me/photo/$value",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
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
        // Photo is optional, continue without it
      }

      // Store the profile in a cookie for future use
      const response = NextResponse.json({
        displayName: userProfile.displayName || "",
        email: userProfile.mail || userProfile.userPrincipalName || "",
        id: userProfile.id || "",
        photoUrl: userPhotoUrl || null,
      });

      // Set the user profile cookie
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

      return response;
    } catch (error) {
      console.error("Error fetching from Microsoft Graph:", error);
      return NextResponse.json(
        { error: "Failed to fetch user profile from Microsoft Graph" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error in user profile API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
