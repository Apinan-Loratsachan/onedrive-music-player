import { NextRequest, NextResponse } from "next/server";
import { getServerAccessToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const accessToken = await getServerAccessToken();
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");
    const driveId = searchParams.get("driveId");

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 401 }
      );
    }

    if (!fileId) {
      return NextResponse.json(
        { error: "No file ID provided" },
        { status: 400 }
      );
    }

    // Get the download stream for the file (shared uses drives/{driveId})
    const buildUrl = () =>
      driveId
        ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}/content`
        : `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`;
    let downloadResponse = await fetch(buildUrl(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (downloadResponse.status === 401) {
      const refreshed = await getServerAccessToken();
      if (refreshed) {
        downloadResponse = await fetch(buildUrl(), {
          headers: {
            Authorization: `Bearer ${refreshed}`,
          },
        });
      }
    }

    if (!downloadResponse.ok) {
      throw new Error(`Failed to get download URL: ${downloadResponse.status}`);
    }

    // Stream the file content
    const stream = downloadResponse.body;
    if (!stream) {
      throw new Error("No stream available");
    }

    // Get content type from response
    const contentType =
      downloadResponse.headers.get("content-type") || "audio/mpeg";
    const contentLength = downloadResponse.headers.get("content-length");

    // Create response with stream
    const response = new NextResponse(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": contentLength || "",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });

    return response;
  } catch (error) {
    console.error("Error streaming music file:", error);
    return NextResponse.json(
      { error: "Failed to stream music file" },
      { status: 500 }
    );
  }
}
