import { useEffect, useState } from "react";

/**
 * Tạo object URL cho File và revoke khi đổi file / unmount.
 */
export function useObjectUrl(file: File | null): string {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return url;
}
