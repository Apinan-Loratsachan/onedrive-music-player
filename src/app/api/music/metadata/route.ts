import { NextRequest, NextResponse } from "next/server";
import * as mm from "music-metadata";
import { Readable } from "stream";
import { getServerAccessToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const accessToken = await getServerAccessToken();
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

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

    const downloadResponse = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // Read only the first ~20MB to capture ID3v2 (front) metadata and cover art
          //   Range: "bytes=0-20971519",
        },
      }
    );

    if (!downloadResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch file content: ${downloadResponse.status}` },
        { status: 502 }
      );
    }

    const webStream = downloadResponse.body;
    if (!webStream) {
      return NextResponse.json(
        { error: "No stream available from Graph API" },
        { status: 502 }
      );
    }

    const contentType =
      downloadResponse.headers.get("content-type") || undefined;
    const nodeStream = Readable.fromWeb(webStream as any);

    let metadata;
    try {
      metadata = await mm.parseStream(nodeStream as any, {
        mimeType: contentType,
      });
    } catch (err: any) {
      // Consume no more of the stream on parse error
      try {
        nodeStream.destroy();
      } catch {}
      return NextResponse.json(
        { error: `Failed to parse metadata: ${err?.message || String(err)}` },
        { status: 500 }
      );
    } finally {
      try {
        nodeStream.destroy();
      } catch {}
    }

    const common = metadata.common || {};
    const picture =
      Array.isArray(common.picture) && common.picture.length > 0
        ? common.picture[0]
        : undefined;

    let pictureDataUrl: string | null = null;
    if (picture && picture.data) {
      const format = picture.format || "image/jpeg";
      const base64 = Buffer.from(picture.data).toString("base64");
      pictureDataUrl = `data:${format};base64,${base64}`;
    }

    return NextResponse.json({
      title: common.title || null,
      artist:
        common.artist ||
        (Array.isArray(common.artists) ? common.artists.join(", ") : null) ||
        null,
      album: common.album || null,
      year: common.year || null,
      genre: Array.isArray(common.genre)
        ? common.genre
        : common.genre
        ? [common.genre]
        : [],
      track: common.track?.no || null,
      disk: common.disk?.no || null,
      picture: pictureDataUrl,
    });
  } catch (error) {
    console.error("Error extracting music metadata:", error);
    return NextResponse.json(
      { error: "Failed to extract music metadata" },
      { status: 500 }
    );
  }
}
