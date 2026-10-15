/** Existing attachment boundary consumed by Exchange; ministry handlers remain JavaScript. */
export const GROUP_MESSAGE_ATTACHMENT_MAX_BYTES: number;
export function validateGroupMessageAttachmentMetadata(
  request: Request,
  messageType: string
):
  | {
      error: string;
      status: number;
      messageType?: undefined;
      contentType?: undefined;
      contentLength?: undefined;
      durationSeconds?: undefined;
      ext?: undefined;
    }
  | {
      error?: undefined;
      status?: undefined;
      messageType: string;
      contentType: string;
      contentLength: number;
      durationSeconds: number | null;
      ext: string;
    };
export function storeGroupMessageAttachment(
  bucket: R2Bucket,
  input: {
    parishId: string;
    key: string;
    source: ReadableStream<Uint8Array>;
    contentType: string;
    contentLength: number;
    maxBytes?: number;
  }
): Promise<{ object: R2Object | null; size: number }>;
