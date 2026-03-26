export function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export function validateTextPayload(payload: any): void {
  if (!payload.phone) {
    throw new Error('phone is required');
  }
  if (!payload.message) {
    throw new Error('message is required');
  }
}

export function validateMediaPayload(payload: any): void {
  if (!payload.phone) {
    throw new Error('phone is required');
  }
  if (!payload.type) {
    throw new Error('type is required (image, video, document, audio, myaudio, ptt, sticker)');
  }
  if (!payload.file) {
    throw new Error('file is required (URL or base64)');
  }
  const validTypes = ['image', 'video', 'document', 'audio', 'myaudio', 'ptt', 'sticker'];
  if (!validTypes.includes(payload.type)) {
    throw new Error(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
  }
}
