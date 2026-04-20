import { useEffect, useRef, useState } from "react";

/** Khóa ổn định: tránh tạo/revoke blob lặp khi `File` là object mới cùng nội dung. */
function fileIdentity(file: File | null): string {
  if (!file) return "";
  return `${file.name}\0${file.size}\0${file.lastModified}`;
}

/**
 * Tạo object URL cho File và revoke khi đổi file (theo identity) / unmount.
 * Revoke được hoãn một frame để tránh GET blob … ERR_FILE_NOT_FOUND khi img vẫn giữ URL cũ.
 */
export function useObjectUrl(file: File | null): string {
  const [url, setUrl] = useState("");
  const fileRef = useRef(file);
  fileRef.current = file;
  const key = fileIdentity(file);

  useEffect(() => {
    if (!key) {
      setUrl("");
      return;
    }
    const f = fileRef.current;
    if (!f) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(f);
    setUrl(next);
    return () => {
      const toRevoke = next;
      requestAnimationFrame(() => {
        URL.revokeObjectURL(toRevoke);
      });
    };
  }, [key]);

  return url;
}
