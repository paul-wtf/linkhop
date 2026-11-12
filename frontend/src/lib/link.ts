const LINK = /^(https?:\/\/|spotify:)\S+$/;

export function isLink(text: string): boolean {
  return LINK.test(text);
}
