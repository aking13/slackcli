// Parse WebVTT content and extract plain text
export function parseVttToText(vttContent: string): string {
  return vttContent
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith('WEBVTT') &&
        !trimmed.includes('-->') &&
        !/^\d+$/.test(trimmed)
      );
    })
    .map(line => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .join(' ');
}
