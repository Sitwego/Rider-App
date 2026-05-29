import { BASE_URL } from "~/constants/BASE_URL";

/**
 * Create a profile image URL.
 * @param ulid - The ULID of the user.
 * @param fileId - The file ID of the profile image.
 * @param path - The path segment for the profile image. i.e get-profile-image
 * @returns The complete URL for the profile image.
 */

export function createProfileImageUrl(
  ulid: string,
  fileId: string,
  path: string,
): string {
  const encodedUserId = encodeURIComponent(ulid);
  const encodedFileId = encodeURIComponent(fileId);
  return `${BASE_URL}${path}/${encodedUserId}/${encodedFileId}`;
}
