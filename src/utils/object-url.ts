export function createObjectURL(data: Blob): string {
  return URL.createObjectURL(data);
}

export function revokeObjectURL(url: string) {
  URL.revokeObjectURL(url);
}
