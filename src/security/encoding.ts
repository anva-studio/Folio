export function utf8Encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/=\s]*$/.test(b64)) {
    throw new Error('Invalid base64 characters');
  }
  const cleaned = b64.replace(/\s+/g, '');
  try {
    const binary = atob(cleaned);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    throw new Error('Malformed base64');
  }
}
