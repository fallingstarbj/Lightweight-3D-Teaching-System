export async function readFileBuffer(filePath: string): Promise<ArrayBuffer> {
  const data = await window.electronAPI.readFile(filePath)
  if (data instanceof ArrayBuffer) return data
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}
