import type { APIRoute } from 'astro';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { jsonError, jsonResponse, readJson, requireAdmin, serverError } from '@/lib/admin-api';
import { getBlobToken } from '@/lib/env';
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES } from '@/lib/image-upload';

export const prerender = false;

/**
 * Issues short-lived client tokens for Vercel Blob uploads from the venue form.
 * Only token generation is supported (no upload-completed callback), so every
 * request must come from a signed-in Chair.
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const token = getBlobToken();
  if (!token) return jsonError(503, 'Image uploads are not configured.');

  const body = (await readJson(request)) as HandleUploadBody | null;
  if (body?.type !== 'blob.generate-client-token') {
    return jsonError(400, 'Unsupported upload request.');
  }

  try {
    const result = await handleUpload({
      token,
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^venues\/[a-z0-9-]+\.[a-z0-9]{2,5}$/.test(pathname)) {
          throw new Error('Invalid upload path');
        }
        return {
          allowedContentTypes: IMAGE_CONTENT_TYPES,
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 5 * 60 * 1000,
        };
      },
    });
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid upload path') {
      return jsonError(400, 'Invalid file name.');
    }
    return serverError('Image upload token', error);
  }
};
