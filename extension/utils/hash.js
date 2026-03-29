export async function hashImage(url) {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
